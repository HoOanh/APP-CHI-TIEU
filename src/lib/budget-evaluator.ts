export interface BudgetJarInput {
  id: string | number;
  category_name: string;
  month: string;
  budget_amount: number;
  rollover_amount?: number;
  budget_basis?: 'monthly' | 'daily' | string;
  daily_amount?: number;
  daily_limit?: number;
  warning_percent?: number;
  frequency_limit?: number;
  frequency_period?: string;
  spent_amount: number;
  today_spent?: number;
  today_count?: number;
  week_count?: number;
  month_count?: number;
}

export interface EvaluatedBudgetAlert {
  type: 'monthly_budget' | 'daily_limit' | 'frequency';
  title: string;
  message: string;
  severity: 'warning' | 'danger';
}

export interface EvaluatedBudgetSummary {
  effectiveBudget: number;
  effectiveDailyLimit: number;
  remainingMonth: number;
  percentage: number;
  alerts: EvaluatedBudgetAlert[];
  highestAlert: EvaluatedBudgetAlert | null;
}

export interface SafeToSpendSummary {
  totalEffectiveBudget: number;
  totalSpent: number;
  totalBudgetRemaining: number;
  dailySafeToSpend: number;
  dailyConfiguredLimit: number;
  todaySpent: number;
  todayRemaining: number;
  daysLeft: number;
  activeJarsCount: number;
}

function formatNum(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(Math.round(value));
}

export function getMonthDaysRemaining(month: string, todayIso: string): { isCurrentMonth: boolean; daysInMonth: number; daysLeft: number } {
  const [mYear, mMonth] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(mYear, mMonth, 0)).getUTCDate();
  const isCurrentMonth = month === todayIso.slice(0, 7);
  const todayDay = Number(todayIso.slice(8, 10)) || 1;
  const daysLeft = isCurrentMonth ? Math.max(1, daysInMonth - todayDay + 1) : 0;
  return { isCurrentMonth, daysInMonth, daysLeft };
}

export function computeRolloverCarryover(input: {
  budgetAmount: number;
  rolloverAmount?: number;
  spentAmount: number;
  rolloverEnabled: boolean;
  rolloverMode: 'positive_only' | 'all';
}): number {
  if (!input.rolloverEnabled) return 0;
  const effectivePrev = Number(input.budgetAmount) + (Number(input.rolloverAmount) || 0);
  const remaining = effectivePrev - Number(input.spentAmount);
  return input.rolloverMode === 'all' ? Math.round(remaining) : Math.max(0, Math.round(remaining));
}

export function evaluateBudgetJar(budget: BudgetJarInput, todayIso: string): EvaluatedBudgetSummary {
  const baseBudget = Number(budget.budget_amount) || 0;
  const rollover = Number(budget.rollover_amount) || 0;
  const effectiveBudget = Math.max(0, baseBudget + rollover);
  const spentAmount = Number(budget.spent_amount) || 0;
  const todaySpent = Number(budget.today_spent) || 0;
  const rawWarningPercent = Number(budget.warning_percent);
  const warningPercent = Number.isFinite(rawWarningPercent) && rawWarningPercent > 0 ? rawWarningPercent : 101;
  const onlyAlertOnOverspend = warningPercent > 100;
  const effectiveDailyLimit = Number(budget.daily_limit) > 0
    ? Number(budget.daily_limit)
    : budget.budget_basis === 'daily'
      ? Number(budget.daily_amount) || 0
      : 0;
  const freqLimit = Number(budget.frequency_limit) || 0;
  const freqPeriod = String(budget.frequency_period || '');

  const percentage = effectiveBudget > 0 ? (spentAmount / effectiveBudget) * 100 : spentAmount > 0 ? 100 : 0;
  const remainingMonth = effectiveBudget - spentAmount;
  const { isCurrentMonth, daysLeft } = getMonthDaysRemaining(String(budget.month), todayIso);

  const alerts: EvaluatedBudgetAlert[] = [];

  if (spentAmount > effectiveBudget) {
    alerts.push({
      type: 'monthly_budget',
      title: '🚨 Đã vượt ngân sách tháng',
      message: `Đã lố ${formatNum(spentAmount - effectiveBudget)}đ (${formatNum(spentAmount)}đ / ${formatNum(effectiveBudget)}đ). Tạm dừng chi ở hũ này ngay!`,
      severity: 'danger',
    });
  } else if (!onlyAlertOnOverspend && percentage >= 100) {
    alerts.push({
      type: 'monthly_budget',
      title: '🚨 Đã chạm kịch trần 100% ngân sách',
      message: `Đã chạm kịch trần 100% ngân sách tháng (${formatNum(effectiveBudget)}đ).`,
      severity: 'danger',
    });
  } else if (!onlyAlertOnOverspend && percentage >= warningPercent) {
    alerts.push({
      type: 'monthly_budget',
      title: `Đã dùng ${Math.round(percentage)}% ngân sách tháng`,
      message: daysLeft
        ? `Còn ${formatNum(remainingMonth)}đ · nên chi tối đa ${formatNum(Math.round(remainingMonth / daysLeft))}đ/ngày trong ${daysLeft} ngày tới.`
        : `Còn ${formatNum(remainingMonth)}đ trước khi chạm trần ngân sách.`,
      severity: 'warning',
    });
  }

  if (effectiveDailyLimit > 0 && isCurrentMonth) {
    if (todaySpent > effectiveDailyLimit) {
      alerts.push({
        type: 'daily_limit',
        title: '🚨 Chi lố hạn mức ngày hôm nay!',
        message: `Hôm nay đã chi ${formatNum(todaySpent)}đ / định mức ${formatNum(effectiveDailyLimit)}đ/ngày (vượt lố ${formatNum(todaySpent - effectiveDailyLimit)}đ). Dừng chi hũ này trong hôm nay!`,
        severity: 'danger',
      });
    } else if (!onlyAlertOnOverspend && todaySpent === effectiveDailyLimit) {
      alerts.push({
        type: 'daily_limit',
        title: '⚠️ Đã chạm kịch trần chi tiêu hôm nay',
        message: `Hôm nay đã chi hết ${formatNum(todaySpent)}đ / ${formatNum(effectiveDailyLimit)}đ. Chi thêm sẽ bị lố hạn mức ngày!`,
        severity: 'warning',
      });
    } else if (!onlyAlertOnOverspend && warningPercent < 100 && todaySpent >= effectiveDailyLimit * (warningPercent / 100)) {
      alerts.push({
        type: 'daily_limit',
        title: 'Sắp chạm hạn mức ngày hôm nay',
        message: `Hôm nay đã chi ${formatNum(todaySpent)}đ, chỉ còn ${formatNum(effectiveDailyLimit - todaySpent)}đ trong định mức ${formatNum(effectiveDailyLimit)}đ/ngày.`,
        severity: 'warning',
      });
    }
  }

  if (freqLimit > 0 && freqPeriod) {
    const currentCount = freqPeriod === 'day'
      ? Number(budget.today_count) || 0
      : freqPeriod === 'week'
        ? Number(budget.week_count) || 0
        : Number(budget.month_count) || 0;
    const periodLabel = freqPeriod === 'day' ? 'hôm nay' : freqPeriod === 'week' ? 'tuần này' : 'tháng này';
    if (currentCount >= freqLimit) {
      alerts.push({
        type: 'frequency',
        title: 'Đã dùng hết lượt chi',
        message: `${currentCount}/${freqLimit} lần ${periodLabel}. Hãy cân nhắc dời giao dịch tiếp theo.`,
        severity: 'danger',
      });
    } else if (currentCount >= freqLimit - 1) {
      alerts.push({
        type: 'frequency',
        title: 'Còn một lượt chi',
        message: `Đã dùng ${currentCount}/${freqLimit} lần ${periodLabel}.`,
        severity: 'warning',
      });
    }
  }

  const highestAlert = alerts.find((a) => a.severity === 'danger') ?? alerts[0] ?? null;

  return {
    effectiveBudget,
    effectiveDailyLimit,
    remainingMonth,
    percentage,
    alerts,
    highestAlert,
  };
}

export function computeSafeToSpend(budgets: BudgetJarInput[], month: string, todayIso: string): SafeToSpendSummary {
  const { daysInMonth, daysLeft } = getMonthDaysRemaining(month, todayIso);
  const divisor = daysLeft > 0 ? daysLeft : Math.max(1, daysInMonth);
  const dailyJars = budgets.filter((jar) => jar.budget_basis === 'daily');

  let totalEffectiveBudget = 0;
  let totalSpent = 0;
  let totalBudgetRemaining = 0;
  let dailyConfiguredLimit = 0;
  let todaySpent = 0;

  for (const jar of dailyJars) {
    const effective = Math.max(0, (Number(jar.budget_amount) || 0) + (Number(jar.rollover_amount) || 0));
    const spent = Number(jar.spent_amount) || 0;
    const jarDaily = Number(jar.daily_amount) > 0
      ? Number(jar.daily_amount)
      : Number(jar.daily_limit) || 0;
    totalEffectiveBudget += effective;
    totalSpent += spent;
    totalBudgetRemaining += Math.max(0, effective - spent);
    dailyConfiguredLimit += jarDaily;
    todaySpent += Number(jar.today_spent) || 0;
  }

  const todayRemaining = dailyJars.length > 0
    ? Math.max(0, Math.min(totalBudgetRemaining, dailyConfiguredLimit - todaySpent))
    : 0;
  const remainingPace = Math.round(totalBudgetRemaining / divisor);
  const dailySafeToSpend = dailyJars.length > 0
    ? (dailyConfiguredLimit > 0 ? Math.min(dailyConfiguredLimit, remainingPace) : remainingPace)
    : 0;

  return {
    totalEffectiveBudget: Math.round(totalEffectiveBudget),
    totalSpent: Math.round(totalSpent),
    totalBudgetRemaining: Math.round(totalBudgetRemaining),
    dailySafeToSpend,
    dailyConfiguredLimit: Math.round(dailyConfiguredLimit),
    todaySpent: Math.round(todaySpent),
    todayRemaining: Math.round(todayRemaining),
    daysLeft: divisor,
    activeJarsCount: dailyJars.length,
  };
}
