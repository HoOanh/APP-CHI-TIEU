export interface Category {
  id: number;
  name: string;
  icon: string;
  color: string;
  created_at: string;
}

export interface Expense {
  id: number;
  amount: number;
  description: string;
  note: string;
  category_id: number;
  category_name?: string;
  category_icon?: string;
  category_color?: string;
  expense_date: string;
  created_at: string;
}

export interface BudgetJar {
  id: number;
  category_id: number;
  category_name?: string;
  category_icon?: string;
  category_color?: string;
  month: string;
  budget_amount: number;
  spent_amount?: number;
  warning_percent: number;
  created_at: string;
}

export interface Debt {
  id: number;
  name: string;
  creditor: string;
  total_amount: number;
  paid_amount?: number;
  remaining_amount?: number;
  interest_rate: number;
  start_date: string;
  due_date: string;
  note: string;
  status: 'active' | 'completed';
  created_at: string;
}

export interface DebtJar {
  id: number;
  debt_id: number;
  month: string;
  planned_amount: number;
  actual_paid?: number;
  created_at: string;
}

export interface DebtPayment {
  id: number;
  debt_id: number;
  amount: number;
  payment_date: string;
  note: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  imageUrl?: string;
  receipt?: {
    amount: number;
    description: string;
    category: string;
    merchant: string;
    date: string;
  };
  debtPayment?: {
    debt_name: string;
    amount: number;
    date: string;
  };
  timestamp: string;
  status?: 'pending' | 'success' | 'error';
}

export interface ExpenseStats {
  total: number;
  count: number;
  by_category: { category_name: string; category_icon: string; category_color: string; total: number; count: number }[];
  by_date: { date: string; total: number }[];
  daily_average: number;
}

export interface Settings {
  gemini_api_key: string;
}
