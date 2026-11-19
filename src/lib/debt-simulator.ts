export type PayoffStrategy = 'avalanche' | 'snowball';

export interface SimulationDebtInput {
  id: string;
  name: string;
  remaining: number;
  interestRateAnnual: number;
}

export interface DebtPayoffResultItem {
  id: string;
  name: string;
  payoffMonthIndex: number;
  payoffMonthLabel: string;
  totalInterestPaid: number;
}

export interface PayoffScheduleRow {
  monthIndex: number;
  monthLabel: string;
  totalPaid: number;
  totalInterest: number;
  remainingTotal: number;
}

export interface DebtSimulationOutput {
  strategy: PayoffStrategy;
  monthlyBudget: number;
  monthsRequired: number;
  debtFreeMonthLabel: string;
  totalPrincipalPaid: number;
  totalInterestPaid: number;
  perDebtPayoff: DebtPayoffResultItem[];
  schedule: PayoffScheduleRow[];
  warning?: string;
}

function addMonthsLabel(startMonth: string, offset: number): string {
  const [y, m] = startMonth.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function sortDebtsForStrategy(debts: Array<{ id: string; name: string; balance: number; rate: number }>, strategy: PayoffStrategy) {
  return [...debts].sort((a, b) => {
    if (strategy === 'avalanche') {
      if (b.rate !== a.rate) return b.rate - a.rate;
      return a.balance - b.balance;
    }
    if (a.balance !== b.balance) return a.balance - b.balance;
    return b.rate - a.rate;
  });
}

export function simulateDebtPayoff(input: {
  debts: SimulationDebtInput[];
  monthlyBudget: number;
  strategy: PayoffStrategy;
  startMonth: string;
}): DebtSimulationOutput {
  const activeDebts = input.debts
    .filter((d) => d.remaining > 0)
    .map((d) => ({
      id: d.id,
      name: d.name,
      balance: d.remaining,
      rate: Math.max(0, d.interestRateAnnual),
      interestPaid: 0,
      payoffMonthIndex: 0,
      payoffMonthLabel: '',
    }));

  if (activeDebts.length === 0 || input.monthlyBudget <= 0) {
    return {
      strategy: input.strategy,
      monthlyBudget: input.monthlyBudget,
      monthsRequired: 0,
      debtFreeMonthLabel: input.startMonth,
      totalPrincipalPaid: 0,
      totalInterestPaid: 0,
      perDebtPayoff: [],
      schedule: [],
    };
  }

  const MAX_MONTHS = 360;
  const totalPrincipal = activeDebts.reduce((sum, d) => sum + d.balance, 0);
  const firstMonthInterest = activeDebts.reduce((sum, d) => sum + (d.balance * d.rate) / 100 / 12, 0);

  if (input.monthlyBudget <= firstMonthInterest) {
    return {
      strategy: input.strategy,
      monthlyBudget: input.monthlyBudget,
      monthsRequired: MAX_MONTHS,
      debtFreeMonthLabel: addMonthsLabel(input.startMonth, MAX_MONTHS),
      totalPrincipalPaid: Math.round(totalPrincipal),
      totalInterestPaid: Math.round(firstMonthInterest * MAX_MONTHS),
      perDebtPayoff: [],
      schedule: [],
      warning: 'Ngân sách hàng tháng nhỏ hơn hoặc bằng tiền lãi phát sinh hàng tháng. Hãy tăng mức trả định kỳ.',
    };
  }

  const schedule: PayoffScheduleRow[] = [];
  let month = 0;

  while (month < MAX_MONTHS && activeDebts.some((d) => d.balance > 0.5)) {
    month += 1;
    const monthLabel = addMonthsLabel(input.startMonth, month);
    let monthInterest = 0;

    for (const d of activeDebts) {
      if (d.balance <= 0) continue;
      const interest = (d.balance * d.rate) / 100 / 12;
      d.balance += interest;
      d.interestPaid += interest;
      monthInterest += interest;
    }

    let available = input.monthlyBudget;
    const ordered = sortDebtsForStrategy(
      activeDebts.filter((d) => d.balance > 0),
      input.strategy,
    );

    let paidThisMonth = 0;
    for (const target of ordered) {
      if (available <= 0) break;
      const payment = Math.min(target.balance, available);
      const state = activeDebts.find((d) => d.id === target.id)!;
      state.balance -= payment;
      available -= payment;
      paidThisMonth += payment;
      if (state.balance <= 0.5) {
        state.balance = 0;
        if (!state.payoffMonthIndex) {
          state.payoffMonthIndex = month;
          state.payoffMonthLabel = monthLabel;
        }
      }
    }

    const remainingTotal = activeDebts.reduce((sum, d) => sum + d.balance, 0);
    if (month <= 36 || remainingTotal <= 0.5) {
      schedule.push({
        monthIndex: month,
        monthLabel,
        totalPaid: Math.round(paidThisMonth),
        totalInterest: Math.round(monthInterest),
        remainingTotal: Math.round(remainingTotal),
      });
    }
  }

  const totalInterestPaid = Math.round(activeDebts.reduce((sum, d) => sum + d.interestPaid, 0));
  return {
    strategy: input.strategy,
    monthlyBudget: input.monthlyBudget,
    monthsRequired: month,
    debtFreeMonthLabel: addMonthsLabel(input.startMonth, month),
    totalPrincipalPaid: Math.round(totalPrincipal),
    totalInterestPaid,
    perDebtPayoff: activeDebts
      .map((d) => ({
        id: d.id,
        name: d.name,
        payoffMonthIndex: d.payoffMonthIndex || month,
        payoffMonthLabel: d.payoffMonthLabel || addMonthsLabel(input.startMonth, month),
        totalInterestPaid: Math.round(d.interestPaid),
      }))
      .sort((a, b) => a.payoffMonthIndex - b.payoffMonthIndex),
    schedule,
  };
}
