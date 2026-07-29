import { GoogleGenerativeAI } from '@google/generative-ai';
import { getDb } from './db';
import { decryptSecret } from './secrets';

// Model priority: highest capability → lowest (fallback on 429)
const MODEL_PRIORITY = [
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash-lite',
];

interface ApiKeyConfig {
  keys: string[];
  currentKeyIndex: number;
}

async function getApiKeys(userId?: number): Promise<ApiKeyConfig> {
  const keys: string[] = [];

  if (userId) {
    const db = await getDb();
    const result = await db.execute({
      sql: `SELECT key, value FROM user_settings
            WHERE user_id = ?
              AND key IN ('gemini_api_key', 'gemini_api_key_2')`,
      args: [userId],
    });
    for (const row of result.rows) {
      const val = decryptSecret(String(row.value));
      if (val && val.length > 10) keys.push(val);
    }
  }

  if (process.env.GEMINI_API_KEY && !keys.includes(process.env.GEMINI_API_KEY)) {
    keys.push(process.env.GEMINI_API_KEY);
  }
  if (process.env.GEMINI_API_KEY_2 && !keys.includes(process.env.GEMINI_API_KEY_2)) {
    keys.push(process.env.GEMINI_API_KEY_2);
  }

  if (keys.length === 0) {
    throw new Error('Gemini API key chưa được cấu hình. Vào Settings để thêm API key.');
  }

  return { keys, currentKeyIndex: 0 };
}

type ContentPart = string | { inlineData: { data: string; mimeType: string } };

async function callGeminiWithFallback(
  parts: ContentPart[],
  userId?: number,
): Promise<string> {
  const config = await getApiKeys(userId);
  const errors: string[] = [];

  for (let keyIdx = 0; keyIdx < config.keys.length; keyIdx++) {
    const apiKey = config.keys[keyIdx];
    const genAI = new GoogleGenerativeAI(apiKey);

    for (const modelName of MODEL_PRIORITY) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(parts);
        const response = await result.response;
        return response.text();
      } catch (err: unknown) {
        const error = err as { status?: number; message?: string };
        const status = error.status || 0;
        const msg = error.message || String(err);

        if (status === 429) {
          console.warn(`[Gemini] Key #${keyIdx + 1}, model ${modelName}: quota exceeded, trying next...`);
          errors.push(`${modelName}@key${keyIdx + 1}: 429 quota exceeded`);
          continue; // try next model
        }
        if (status === 404) {
          console.warn(`[Gemini] Model ${modelName} not found, trying next...`);
          errors.push(`${modelName}: 404 not found`);
          continue; // try next model
        }
        // Other errors (400 bad key, 500, etc.) - try next key
        console.error(`[Gemini] Key #${keyIdx + 1}, model ${modelName}: ${msg}`);
        errors.push(`${modelName}@key${keyIdx + 1}: ${status} ${msg.slice(0, 100)}`);
        break; // break model loop, try next key
      }
    }
  }

  throw new Error(`Tất cả models và API keys đều thất bại:\n${errors.join('\n')}`);
}

function parseJsonResponse(text: string): Record<string, unknown> {
  const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to extract JSON from text
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error('Không thể parse JSON từ AI response');
  }
}

export interface ParsedTransaction {
  amount: number;
  description: string;
  category: string;
  merchant: string;
  date: string;
  type: 'income' | 'expense';
}

export async function analyzeExpenseImage(
  base64Data: string,
  mimeType: string,
  userMessage?: string,
  userId?: number,
): Promise<ParsedTransaction> {
  const prompt = `Phân tích ảnh chụp màn hình giao dịch/chuyển khoản/hóa đơn này và trả về JSON:
- amount: số tiền (số nguyên dương, KHÔNG có dấu phân cách)
- description: mô tả ngắn gọn về giao dịch
- category: phân loại (Ăn uống, Di chuyển, Mua sắm, Giải trí, Hóa đơn, Sức khỏe, Giáo dục, Tiết kiệm, Thu nhập, Khác)
- merchant: tên người nhận/gửi hoặc cửa hàng
- date: ngày giao dịch theo YYYY-MM-DD
- type: "income" nếu là NHẬN TIỀN/tiền vào/cộng tiền/lương/thưởng, "expense" nếu là CHUYỂN KHOẢN/chi tiêu/thanh toán/trừ tiền

QUAN TRỌNG: Phân biệt rõ:
- Nếu ảnh hiển thị "NHẬN TIỀN", "+xxx.xxxđ", "Tiền vào", "Chuyển đến bạn" → type = "income"
- Nếu ảnh hiển thị "CHUYỂN KHOẢN", "-xxx.xxxđ", "Thanh toán", "Chi tiêu" → type = "expense"
${userMessage ? 'Ghi chú từ người dùng: ' + userMessage : ''}
Chỉ trả về JSON hợp lệ, KHÔNG bọc trong markdown.`;

  const text = await callGeminiWithFallback([
    prompt,
    { inlineData: { data: base64Data, mimeType } },
  ], userId);

  const parsed = parseJsonResponse(text);
  return {
    amount: Math.abs(Number(parsed.amount)) || 0,
    description: (parsed.description as string) || '',
    category: (parsed.category as string) || 'Khác',
    merchant: (parsed.merchant as string) || '',
    date: (parsed.date as string) || new Date().toISOString().split('T')[0],
    type: (parsed.type as string) === 'income' ? 'income' : 'expense',
  };
}

export interface ParsedExpenseText {
  amount: number;
  description: string;
  category: string;
  type: 'income' | 'expense';
}

export async function parseExpenseText(
  message: string,
  userId?: number,
): Promise<ParsedExpenseText> {
  const prompt = `Trích xuất thông tin giao dịch từ tin nhắn. Trả về JSON:
- amount: số tiền (số nguyên dương). "k" = x1000, "tr" = x1000000
- description: mô tả giao dịch
- category: phân loại (Ăn uống, Di chuyển, Mua sắm, Giải trí, Hóa đơn, Sức khỏe, Giáo dục, Tiết kiệm, Thu nhập, Khác)
- type: "income" nếu nhận tiền/lương/thưởng/thu nhập, "expense" nếu chi tiêu/mua/trả

Ví dụ:
- "ăn phở 50k" → {"amount":50000,"description":"ăn phở","category":"Ăn uống","type":"expense"}
- "nhận lương 15tr" → {"amount":15000000,"description":"nhận lương","category":"Thu nhập","type":"income"}
- "bán hàng được 500k" → {"amount":500000,"description":"bán hàng","category":"Thu nhập","type":"income"}

Tin nhắn: "${message}"
Chỉ trả về JSON hợp lệ.`;

  const text = await callGeminiWithFallback([prompt], userId);
  const parsed = parseJsonResponse(text);

  return {
    amount: Math.abs(Number(parsed.amount)) || 0,
    description: (parsed.description as string) || message,
    category: (parsed.category as string) || 'Khác',
    type: (parsed.type as string) === 'income' ? 'income' : 'expense',
  };
}

export async function parseDebtPayment(
  message: string,
  debtNames: string[],
  userId?: number,
): Promise<{ debt_name: string; amount: number }> {
  const prompt = `Trích xuất thông tin trả nợ từ tin nhắn. Danh sách nợ: ${debtNames.join(', ')}.
Trả về JSON:
- debt_name: tên khoản nợ tương ứng nhất
- amount: số tiền (số nguyên). "k" = x1000, "tr" = x1000000
Tin nhắn: "${message}"
Chỉ trả về JSON hợp lệ.`;

  const text = await callGeminiWithFallback([prompt], userId);
  const parsed = parseJsonResponse(text);

  return {
    debt_name: (parsed.debt_name as string) || '',
    amount: Math.abs(Number(parsed.amount)) || 0,
  };
}
