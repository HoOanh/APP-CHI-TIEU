export type PersonaId =
  | 'speed_tracker'
  | 'budget_discipliner'
  | 'debt_fighter'
  | 'wealth_builder'
  | 'family_shared'
  | 'micro_business';

export type ModuleKey =
  | 'multi_account'
  | 'budget_advanced'
  | 'debt_two_way'
  | 'recurring_reminders'
  | 'cashflow_pro'
  | 'shortcuts_automation'
  | 'shared_ledgers'
  | 'tags_and_reimburse';

export type EnabledModules = Record<ModuleKey, boolean>;

export const ALL_MODULE_KEYS: ModuleKey[] = [
  'multi_account',
  'budget_advanced',
  'debt_two_way',
  'recurring_reminders',
  'cashflow_pro',
  'shortcuts_automation',
  'shared_ledgers',
  'tags_and_reimburse',
];

export const DEFAULT_MODULES: EnabledModules = {
  multi_account: false,
  budget_advanced: false,
  debt_two_way: false,
  recurring_reminders: false,
  cashflow_pro: false,
  shortcuts_automation: true,
  shared_ledgers: false,
  tags_and_reimburse: false,
};

export interface PersonaPreset {
  id: PersonaId;
  title: string;
  subtitle: string;
  badge?: string;
  defaultLanding: '/' | '/chat';
  modules: Partial<EnabledModules>;
  suggestedAccounts: Array<{ name: string; type: 'cash' | 'bank' | 'ewallet' | 'credit_card' | 'savings' }>;
}

export const PERSONA_PRESETS: PersonaPreset[] = [
  {
    id: 'speed_tracker',
    title: 'Ghi siêu tốc hàng ngày',
    subtitle: 'Gọn nhẹ nhất: mở app là ghi bằng chat, giọng nói hoặc Shortcuts.',
    defaultLanding: '/chat',
    modules: {
      shortcuts_automation: true,
    },
    suggestedAccounts: [],
  },
  {
    id: 'budget_discipliner',
    title: 'Siết kỷ luật ngân sách',
    subtitle: 'Chia hũ lương, hạn mức an toàn hôm nay, Rollover & nhắc định kỳ.',
    defaultLanding: '/',
    modules: {
      budget_advanced: true,
      recurring_reminders: true,
      shortcuts_automation: true,
    },
    suggestedAccounts: [
      { name: 'Tài khoản ngân hàng', type: 'bank' },
    ],
  },
  {
    id: 'debt_fighter',
    title: 'Quản lý vay & trả nợ',
    subtitle: 'Theo dõi nợ 2 chiều, tự trừ ví khi trả nợ & mô phỏng lộ trình thoát nợ.',
    defaultLanding: '/',
    modules: {
      multi_account: true,
      debt_two_way: true,
      recurring_reminders: true,
    },
    suggestedAccounts: [
      { name: 'Tài khoản ngân hàng', type: 'bank' },
      { name: 'Thẻ tín dụng', type: 'credit_card' },
    ],
  },
  {
    id: 'wealth_builder',
    title: 'Freelancer & Tích sản',
    subtitle: 'Nhiều ví (Bank, Tiết kiệm), chuyển khoản nội bộ, Cashflow Thu–Chi & Runway.',
    defaultLanding: '/',
    modules: {
      multi_account: true,
      budget_advanced: true,
      debt_two_way: true,
      cashflow_pro: true,
    },
    suggestedAccounts: [
      { name: 'Tài khoản ngân hàng', type: 'bank' },
      { name: 'Quỹ tiết kiệm', type: 'savings' },
      { name: 'Ví điện tử', type: 'ewallet' },
    ],
  },
  {
    id: 'family_shared',
    title: 'Gia đình / Cặp đôi',
    subtitle: 'Quỹ chung minh bạch, nhắc hóa đơn hàng tháng & chia tiền thông minh.',
    badge: 'v2.1',
    defaultLanding: '/',
    modules: {
      multi_account: true,
      budget_advanced: true,
      recurring_reminders: true,
      shared_ledgers: true,
    },
    suggestedAccounts: [
      { name: 'Quỹ chung gia đình', type: 'bank' },
    ],
  },
  {
    id: 'micro_business',
    title: 'Kinh doanh nhỏ / Pro',
    subtitle: 'Tách sổ cá nhân & kinh doanh, gắn #tag hoàn ứng, báo cáo dòng tiền P&L.',
    badge: 'v2.1',
    defaultLanding: '/',
    modules: {
      multi_account: true,
      cashflow_pro: true,
      shared_ledgers: true,
      tags_and_reimburse: true,
    },
    suggestedAccounts: [
      { name: 'Tài khoản kinh doanh', type: 'bank' },
      { name: 'Ví điện tử', type: 'ewallet' },
    ],
  },
];

export const MODULE_METADATA: Array<{
  key: ModuleKey;
  label: string;
  description: string;
  phase?: 'v2.0' | 'v2.1';
}> = [
  {
    key: 'multi_account',
    label: 'Đa ví & Chuyển khoản nội bộ',
    description: 'Quản lý riêng Tiền mặt, Ngân hàng, Ví điện tử, Thẻ tín dụng, Tiết kiệm và chuyển tiền giữa các ví.',
    phase: 'v2.0',
  },
  {
    key: 'budget_advanced',
    label: 'Ngân sách nâng cao (Opt-in)',
    description: 'Hiển thị hạn mức an toàn hôm nay (Safe-to-Spend), tùy chọn Rollover hũ & chia hũ ngày nhận lương.',
    phase: 'v2.0',
  },
  {
    key: 'debt_two_way',
    label: 'Công nợ 2 chiều & Lộ trình trả nợ',
    description: 'Tách biệt khoản đi vay và cho vay, mô phỏng chiến lược trả nợ Avalanche / Snowball.',
    phase: 'v2.0',
  },
  {
    key: 'recurring_reminders',
    label: 'Nhắc lịch định kỳ (Notify-Only)',
    description: 'Nhắc tiền nhà, hóa đơn, trả góp qua Web Push và xác nhận 1 chạm khi phát sinh thực tế.',
    phase: 'v2.0',
  },
  {
    key: 'cashflow_pro',
    label: 'Thống kê Cashflow Thu–Chi–Tích lũy',
    description: 'Biểu đồ đối chiếu Thu vs Chi, tỷ lệ tiết kiệm (%) và số tháng quỹ dự phòng (Runway).',
    phase: 'v2.0',
  },
  {
    key: 'shortcuts_automation',
    label: 'Apple Shortcuts & Tự động hóa',
    description: 'Tạo API key cá nhân để ghi chi tiêu 1 chạm từ phím tắt iPhone/Mac.',
    phase: 'v2.0',
  },
  {
    key: 'shared_ledgers',
    label: 'Đa sổ & Quỹ chung gia đình',
    description: 'Tạo nhiều sổ (Cá nhân, Gia đình, Kinh doanh) và mời thành viên cùng ghi sổ.',
    phase: 'v2.1',
  },
  {
    key: 'tags_and_reimburse',
    label: 'Tag dự án & Hoàn ứng',
    description: 'Gắn #tag cho giao dịch và theo dõi các khoản chi chờ hoàn ứng.',
    phase: 'v2.1',
  },
];

export function isPersonaId(value: unknown): value is PersonaId {
  return typeof value === 'string' && PERSONA_PRESETS.some((preset) => preset.id === value);
}

export function resolveModulesForPersonas(
  personas: PersonaId[],
  overrides?: Partial<EnabledModules>,
): EnabledModules {
  const result: EnabledModules = { ...DEFAULT_MODULES };
  for (const personaId of personas) {
    const preset = PERSONA_PRESETS.find((item) => item.id === personaId);
    if (!preset) continue;
    for (const key of ALL_MODULE_KEYS) {
      if (preset.modules[key]) result[key] = true;
    }
  }
  if (overrides) {
    for (const key of ALL_MODULE_KEYS) {
      if (typeof overrides[key] === 'boolean') {
        result[key] = overrides[key];
      }
    }
  }
  return result;
}

export function parseEnabledModulesJson(
  rawJson: unknown,
  personas: PersonaId[],
): EnabledModules {
  let parsed: Partial<EnabledModules> | undefined;
  if (typeof rawJson === 'string' && rawJson.trim()) {
    try {
      const obj: unknown = JSON.parse(rawJson);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        parsed = obj as Partial<EnabledModules>;
      }
    } catch {
      parsed = undefined;
    }
  }
  return resolveModulesForPersonas(personas, parsed);
}
