import { findChatTransactionDate } from './chat-transaction-text';
import { GoogleGenAI, type Part } from '@google/genai';
import { getDb } from './db';
import { decryptSecret } from './secrets';
import { callConfiguredAi, type AiInputImage } from './ai-provider';
import { getVietnamToday } from './utils';

// Stable, production Gemini Developer API models. Keep the model IDs explicit
// instead of relying on preview aliases that can disappear without notice.
const MODEL_PRIORITY = [
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-2.5-flash',
] as const;

const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS_PER_MODEL = 2;

async function getApiKeys(userId?: number): Promise<string[]> {
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
    throw new Error('AI chưa được cấu hình. Vào Cài đặt để thêm provider, API key và model.');
  }

  return keys;
}

type ContentPart = string | Part;

function getErrorDetails(error: unknown): { status: number; message: string } {
  if (error instanceof Error) {
    const status = 'status' in error && typeof error.status === 'number'
      ? error.status
      : 0;
    return { status, message: error.message };
  }

  return { status: 0, message: String(error) };
}

function retryDelayMs(attempt: number): number {
  return 250 * 2 ** (attempt - 1) + Math.floor(Math.random() * 100);
}

async function callGeminiWithFallback(
  parts: ContentPart[],
  userId?: number,
): Promise<string> {
  if (userId) {
    const prompt = parts.find((part): part is string => typeof part === 'string') || '';
    const images: AiInputImage[] = parts.flatMap((part) => {
      if (typeof part !== 'object' || !('inlineData' in part) || !part.inlineData) return [];
      const base64Data = part.inlineData.data;
      const mimeType = part.inlineData.mimeType;
      return typeof base64Data === 'string' && typeof mimeType === 'string'
        ? [{ base64Data, mimeType }]
        : [];
    });
    const configuredResponse = await callConfiguredAi(userId, prompt, images);
    if (configuredResponse !== null) return configuredResponse;
  }

  const apiKeys = await getApiKeys(userId);
  const errors: string[] = [];

  keyLoop: for (let keyIdx = 0; keyIdx < apiKeys.length; keyIdx++) {
    const apiKey = apiKeys[keyIdx];
    const genAI = new GoogleGenAI({ apiKey });

    for (const modelName of MODEL_PRIORITY) {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_MODEL; attempt++) {
        try {
          const response = await genAI.models.generateContent({
            model: modelName,
            contents: parts,
          });
          if (response.text) return response.text;

          throw new Error('Gemini không trả về nội dung văn bản.');
        } catch (error: unknown) {
          const { status, message } = getErrorDetails(error);
          const errorSummary = `${modelName}@key${keyIdx + 1}: ${status || 'unknown'} ${message.slice(0, 100)}`;

          if (TRANSIENT_STATUS_CODES.has(status)) {
            errors.push(errorSummary);
            if (attempt < MAX_ATTEMPTS_PER_MODEL) {
              console.warn(
                `[Gemini] ${errorSummary}; retrying (${attempt + 1}/${MAX_ATTEMPTS_PER_MODEL})...`,
              );
              await new Promise<void>((resolve) => {
                setTimeout(resolve, retryDelayMs(attempt));
              });
              continue;
            }

            console.warn(`[Gemini] ${errorSummary}; trying next model...`);
            break;
          }

          if (status === 404) {
            console.warn(`[Gemini] ${errorSummary}; trying next model...`);
            errors.push(errorSummary);
            break;
          }

          // Invalid credentials or malformed requests are not model-specific.
          console.error(`[Gemini] ${errorSummary}`);
          errors.push(errorSummary);
          continue keyLoop;
        }
      }
    }
  }

  throw new Error(`Tất cả models và API keys đều thất bại:\n${errors.join('\n')}`);
}

export async function generateTextWithConfiguredAi(userId: number, prompt: string) {
  return callGeminiWithFallback([prompt], userId);
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

function parseJsonArrayResponse(text: string): Record<string, unknown>[] {
  const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
  try {
    const parsed: unknown = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { transactions?: unknown }).transactions)
    ) {
      return (parsed as { transactions: Record<string, unknown>[] }).transactions;
    }
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed: unknown = JSON.parse(match[0]);
      if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
    }
  }
  throw new Error('Không thể parse danh sách giao dịch từ AI response');
}

export interface ParsedTransaction {
  amount: number;
  description: string;
  category: string;
  merchant: string;
  note?: string;
  date: string;
  type: 'income' | 'expense';
}

export interface TransactionImage {
  base64Data: string;
  mimeType: string;
}

export interface TransactionCategoryPolicy {
  expenseCategories: string[];
  preferredExpenseCategories: string[];
  unclassifiedExpense: string;
  incomeCategories: string[];
}

export interface PendingTransactionForCorrection {
  amount: number;
  description: string;
  category: string;
  merchant?: string;
  date: string;
  type: 'income' | 'expense';
}

function normalizeTransaction(
  parsed: Record<string, unknown>,
  fallbackDescription = '',
): ParsedTransaction {
  return {
    amount: Math.abs(Number(parsed.amount)) || 0,
    description: String(parsed.description || fallbackDescription),
    category: String(parsed.category || 'Khác'),
    merchant: String(parsed.merchant || ''),
    note: typeof parsed.note === 'string' ? parsed.note.trim() : '',
    date: isValidIsoDate(parsed.date) ? parsed.date : getVietnamToday(),
    type: parsed.type === 'income' ? 'income' : 'expense',
  };
}

function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function resolveMentionedDate(message: string): string | null {
  return findChatTransactionDate(message, getVietnamToday())?.date ?? null;
}

export async function analyzeTransactions(
  images: TransactionImage[],
  userMessage: string,
  categoryPolicy: TransactionCategoryPolicy,
  historyContext: string,
  userId?: number,
): Promise<ParsedTransaction[]> {
  const expenseCategoryList = categoryPolicy.expenseCategories.join(', ') || '(chưa có hũ chi tiêu)';
  const incomeCategoryList = categoryPolicy.incomeCategories.join(', ') || '(chưa có danh mục)';
  const today = getVietnamToday();
  const prompt = `Bạn là bộ máy bóc tách giao dịch tài chính tiếng Việt.
Đọc TOÀN BỘ ảnh và nội dung người dùng, tìm TẤT CẢ giao dịch riêng biệt. Một ảnh có thể chứa nhiều dòng giao dịch; nhiều ảnh phải được xử lý đầy đủ.

Trả về một JSON array. Mỗi phần tử:
- amount: số nguyên dương, không dấu phân cách
- description: tên khoản thu/chi ngắn gọn, bỏ số tiền và ngày tháng
- note: ghi chú riêng nếu có, bỏ trống nếu chỉ lặp thông tin đã tách
- category: chọn CHÍNH XÁC theo quy tắc danh mục bên dưới
- merchant: người/cửa hàng liên quan, có thể rỗng
- date: YYYY-MM-DD
- type: "income" hoặc "expense"

Quy tắc bắt buộc khi phân loại:
1. Nếu type = "expense", category phải thuộc: ${expenseCategoryList}. Hũ ngân sách hiện có: ${categoryPolicy.preferredExpenseCategories.join(', ') || '(chưa có)'}. Chỉ ưu tiên hũ khi đúng mục đích khoản chi. Dùng "${categoryPolicy.unclassifiedExpense}" nếu không đủ căn cứ phân loại.
2. Nếu type = "income", category PHẢI là một danh mục thu nhập phù hợp trong: ${incomeCategoryList}.
3. Dùng merchant, description và note/nội dung người dùng để đối chiếu lịch sử trước; ví dụ giao dịch/ghi chú tương tự phải theo danh mục lịch sử nếu danh mục đó được phép ở (1) hoặc (2).
4. Tuyệt đối không bịa danh mục mới, không chọn theo cảm tính và không dùng danh mục thu nhập cho khoản chi.
Không tự suy diễn "chuyển khoản" là Mua sắm nếu note cho biết mục đích khác.
Ngày hiện tại theo múi giờ Việt Nam (Asia/Ho_Chi_Minh) là ${today}. Nếu nội dung nói "hôm nay" hoặc không nêu ngày thì dùng chính xác ${today}. Ngày viết theo tiếng Việt d/M, dd/MM hoặc "ngày d tháng M" là ngày/tháng; nếu thiếu năm thì dùng năm hiện tại ${today.slice(0, 4)}.
Chỉ ghi giao dịch thực có số tiền thể hiện rõ; không suy đoán số tiền còn thiếu. Trả [] nếu không nhận diện được giao dịch.
Không gộp nhiều giao dịch thành một. Loại bỏ các dòng chỉ là số dư, tổng cộng, phí đã nằm trong tổng hoặc giao dịch trùng giữa các ảnh.

Lịch sử tham chiếu:
${historyContext || 'Chưa có lịch sử.'}

Nội dung người dùng: ${userMessage || '(không có)'}
Chỉ trả JSON array hợp lệ.`;

  const parts: ContentPart[] = [
    prompt,
    ...images.map((image) => ({
      inlineData: { data: image.base64Data, mimeType: image.mimeType },
    })),
  ];
  const text = await callGeminiWithFallback(parts, userId);
  const explicitDate = resolveMentionedDate(userMessage);
  return parseJsonArrayResponse(text)
    .map((item) => normalizeTransaction(item, userMessage))
    .map((item) => explicitDate ? { ...item, date: explicitDate } : item)
    .filter((item) => item.amount > 0);
}

export async function parseTransactionsText(
  message: string,
  categoryPolicy: TransactionCategoryPolicy,
  historyContext: string,
  userId?: number,
): Promise<ParsedTransaction[]> {
  const today = getVietnamToday();
  const prompt = `Tách TẤT CẢ giao dịch trong nội dung sau thành JSON array.
Mỗi phần tử gồm amount (số nguyên dương; k/nghìn/ngàn=1000, tr/triệu=1000000, bốn mươi lăm nghìn=45000), description, category, merchant, note, date (YYYY-MM-DD), type ("income"|"expense").
Mô tả chỉ ghi tên khoản thu/chi, bỏ số tiền và ngày. note chỉ ghi thông tin bổ sung rõ ràng, không chép lại câu nhập. Ví dụ "ăn tối ngày 17/11 100k" có amount 100000, description "ăn tối", note rỗng và date là ngày 17/11 trong năm hiện tại.
Quy tắc danh mục BẮT BUỘC:
- type = "expense": chọn danh mục chi phù hợp trong: ${categoryPolicy.expenseCategories.join(', ')}. Hũ ngân sách hiện có: ${categoryPolicy.preferredExpenseCategories.join(', ') || '(chưa có)'}. Ưu tiên hũ nếu đúng mục đích khoản chi. Dùng "${categoryPolicy.unclassifiedExpense}" nếu chưa rõ danh mục.
- type = "income": chỉ chọn một danh mục thu nhập phù hợp: ${categoryPolicy.incomeCategories.join(', ') || '(chưa có danh mục)'}.
Phân loại dựa trên mô tả/note trước, sau đó đối chiếu lịch sử tương tự. Không tự tạo danh mục hoặc chọn danh mục ngoài danh sách:
${historyContext || 'Chưa có lịch sử.'}
Ngày hiện tại theo múi giờ Việt Nam (Asia/Ho_Chi_Minh) là ${today}. Nếu nội dung nói "hôm nay" hoặc không nêu ngày thì dùng chính xác ${today}. Ngày d/M, dd/MM hoặc "ngày d tháng M" được hiểu là ngày/tháng; nếu thiếu năm thì dùng năm ${today.slice(0, 4)}.
Chỉ bóc tách khoản thu/chi thực có số tiền được nêu rõ. Không tự suy đoán số tiền, không coi ngày tháng hoặc số lượng là số tiền.
Nếu nội dung chỉ là câu hỏi, dự định, yêu cầu chỉnh sửa/xóa giao dịch cũ hoặc không có khoản đủ dữ liệu, trả [].
Một câu có nhiều giao dịch thì dùng ngày riêng của từng khoản và không gộp các khoản. Nội dung: "${message}"
Chỉ trả JSON array hợp lệ.`;
  const text = await callGeminiWithFallback([prompt], userId);
  const transactions = parseJsonArrayResponse(text);
  const explicitDate = transactions.length === 1 ? resolveMentionedDate(message) : null;
  return transactions
    .map((item) => normalizeTransaction(item, message))
    .map((item) => explicitDate ? { ...item, date: explicitDate } : item)
    .filter((item) => item.amount > 0);
}

export async function correctPendingTransactions(
  message: string,
  pendingTransactions: PendingTransactionForCorrection[],
  categoryPolicy: TransactionCategoryPolicy,
  historyContext: string,
  userId?: number,
): Promise<ParsedTransaction[]> {
  const today = getVietnamToday();
  const prompt = `Bạn đang chỉnh sửa các giao dịch CHỜ LƯU theo phản hồi của người dùng.
Trả về JSON array gồm TOÀN BỘ giao dịch bên dưới, theo ĐÚNG THỨ TỰ. Không tạo giao dịch mới.

Yêu cầu chỉnh sửa: "${message}"
Giao dịch chờ lưu (đánh số từ 1):
${JSON.stringify(pendingTransactions)}

Quy tắc bắt buộc:
- Áp dụng yêu cầu như "giao dịch đầu", "giao dịch thứ 2", "món cuối" vào đúng vị trí tương ứng.
- Giữ nguyên amount, date, description, merchant và type, trừ khi yêu cầu nói rõ cần đổi trường đó.
- Nếu người dùng chỉ nói mục đích như "là tiền ăn", hãy đổi category của giao dịch được nhắc tới sang hũ phù hợp, không thay đổi số tiền.
- type = "expense" chọn danh mục chi trong: ${categoryPolicy.expenseCategories.join(', ')}.
- type = "income" chỉ được chọn danh mục: ${categoryPolicy.incomeCategories.join(', ') || '(chưa có danh mục)'}.
- Không tự tạo danh mục. Nếu yêu cầu không thể áp dụng, giữ nguyên giao dịch đó.
Ngày hiện tại theo múi giờ Việt Nam (Asia/Ho_Chi_Minh) là ${today}. Chỉ đổi ngày nếu nội dung yêu cầu rõ; "hôm nay" là ${today}. Ngày d/M hoặc dd/MM được hiểu là ngày/tháng.
Lịch sử tham chiếu:
${historyContext || 'Chưa có lịch sử.'}
Mỗi phần tử gồm amount, description, category, merchant, date (YYYY-MM-DD), type ("income" | "expense"). Chỉ trả JSON array hợp lệ.`;

  const text = await callGeminiWithFallback([prompt], userId);
  const explicitDate = resolveMentionedDate(message);
  return parseJsonArrayResponse(text)
    .map((item) => normalizeTransaction(item))
    .map((item) => explicitDate ? { ...item, date: explicitDate } : item)
    .filter((item) => item.amount > 0);
}

export async function analyzeExpenseImage(
  base64Data: string,
  mimeType: string,
  userMessage?: string,
  userId?: number,
): Promise<ParsedTransaction> {
  const today = getVietnamToday();
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
Ngày hiện tại theo múi giờ Việt Nam (Asia/Ho_Chi_Minh) là ${today}. Nếu người dùng nói "hôm nay" hoặc ảnh không có ngày thì dùng ${today}. Ngày d/M hoặc dd/MM trong nội dung người dùng được hiểu là ngày/tháng.
${userMessage ? 'Ghi chú từ người dùng: ' + userMessage : ''}
Chỉ trả về JSON hợp lệ, KHÔNG bọc trong markdown.`;

  const text = await callGeminiWithFallback([
    prompt,
    { inlineData: { data: base64Data, mimeType } },
  ], userId);

  const parsed = parseJsonResponse(text);
  const explicitDate = resolveMentionedDate(userMessage || '');
  return {
    amount: Math.abs(Number(parsed.amount)) || 0,
    description: (parsed.description as string) || '',
    category: (parsed.category as string) || 'Khác',
    merchant: (parsed.merchant as string) || '',
    date: explicitDate || (isValidIsoDate(parsed.date) ? parsed.date : today),
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
