import {
  formatShortMonthLabel,
  getTodayDateStr,
  shiftMonthKey,
} from './financeUtils';
import {
  VALIDATION_LIMITS,
  type Category,
  type Transaction,
} from '../types/finance';

export type SavingsRuleMode = 'percentage' | 'fixed';
export type SavingsGoalPriority = 'alta' | 'media' | 'baja';

export interface MonthlySavingsRule {
  mode: SavingsRuleMode;
  targetPercentage: number; // 1..80
  targetFixedAmount: number; // >= 0
}

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  savedAmount: number;
  targetDate: string; // YYYY-MM-DD
  priority: SavingsGoalPriority;
  color: string;
  notes: string;
  createdAt: string;
}

export interface SavingsPlanState {
  monthlyRule: MonthlySavingsRule;
  goals: SavingsGoal[];
  updatedAt: string;
}

export interface GoalSchedule {
  remainingAmount: number;
  progressPct: number;
  monthsRemaining: number;
  quincenasRemaining: number;
  requiredPerMonth: number;
  requiredPerQuincena: number;
  isCompleted: boolean;
  isOverdue: boolean;
}

export interface MonthlySavingsSummary {
  monthIncome: number;
  monthExpense: number;
  netBalance: number;
  explicitSavingsLogged: number;
  effectiveMonthlySaved: number;
  monthlyTargetAmount: number;
  quincenaTargetAmount: number;
  progressPct: number;
  remainingToGoal: number;
  q1Income: number;
  q1Expense: number;
  q1Saved: number;
  q2Income: number;
  q2Expense: number;
  q2Saved: number;
  savingsRatePct: number;
  targetReached: boolean;
}

export interface SavingsProjectionPoint {
  monthKey: string;
  label: string;
  planAcumulado: number;
  ritmoActualAcumulado: number;
}

const STORAGE_PREFIX = 'moneyflow_savings_plan_v1:';

export const DEFAULT_SAVINGS_PLAN_STATE: SavingsPlanState = {
  monthlyRule: {
    mode: 'percentage',
    targetPercentage: 20,
    targetFixedAmount: 0,
  },
  goals: [],
  updatedAt: '',
};

export const SAVINGS_GOAL_TEMPLATES: {
  name: string;
  suggestedTarget: number;
  monthsAhead: number;
  priority: SavingsGoalPriority;
  color: string;
  notes: string;
}[] = [
  {
    name: 'Fondo de emergencia',
    suggestedTarget: 30000,
    monthsAhead: 12,
    priority: 'alta',
    color: '#0F5132',
    notes: 'Meta recomendada: cubrir de 3 a 6 meses de gastos esenciales.',
  },
  {
    name: 'Vacaciones',
    suggestedTarget: 15000,
    monthsAhead: 8,
    priority: 'media',
    color: '#0D9488',
    notes: 'Vuelos, hospedaje y presupuesto de viaje.',
  },
  {
    name: 'Meta anual / Inversión',
    suggestedTarget: 24000,
    monthsAhead: 12,
    priority: 'alta',
    color: '#4338CA',
    notes: 'Aporte constante quincena a quincena.',
  },
];

export function addMonthsToDateStr(baseDateStr: string, monthsToAdd: number): string {
  const [yStr, mStr, dStr] = baseDateStr.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  const target = new Date(y, m - 1 + monthsToAdd, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const safeDay = Math.min(Number.isFinite(d) ? d : 15, lastDay);
  const yy = target.getFullYear();
  const mm = String(target.getMonth() + 1).padStart(2, '0');
  const dd = String(safeDay).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function sanitizeSavingsPlanState(raw: unknown): SavingsPlanState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      ...DEFAULT_SAVINGS_PLAN_STATE,
      monthlyRule: { ...DEFAULT_SAVINGS_PLAN_STATE.monthlyRule },
      goals: [],
    };
  }

  const obj = raw as Record<string, unknown>;
  const rawRule = (obj.monthlyRule ?? {}) as Record<string, unknown>;
  const mode: SavingsRuleMode = rawRule.mode === 'fixed' ? 'fixed' : 'percentage';
  const pctNum = Number(rawRule.targetPercentage ?? 20);
  const fixedNum = Number(rawRule.targetFixedAmount ?? 0);

  const monthlyRule: MonthlySavingsRule = {
    mode,
    targetPercentage:
      Number.isFinite(pctNum) && pctNum >= 1 && pctNum <= 80 ? Math.round(pctNum) : 20,
    targetFixedAmount:
      Number.isFinite(fixedNum) && fixedNum >= 0 && fixedNum <= VALIDATION_LIMITS.AMOUNT_MAX
        ? Math.round(fixedNum * 100) / 100
        : 0,
  };

  const goals: SavingsGoal[] = [];
  if (Array.isArray(obj.goals)) {
    for (let i = 0; i < obj.goals.length && goals.length < 50; i++) {
      const item = obj.goals[i] as Record<string, unknown>;
      if (!item || typeof item !== 'object') continue;
      const name = typeof item.name === 'string' ? item.name.trim().slice(0, 80) : '';
      const targetAmount = Math.round(Number(item.targetAmount) * 100) / 100;
      const savedAmount = Math.round(Number(item.savedAmount ?? 0) * 100) / 100;
      const targetDate = typeof item.targetDate === 'string' ? item.targetDate.trim() : '';
      if (!name || !Number.isFinite(targetAmount) || targetAmount <= 0) continue;
      if (targetAmount > VALIDATION_LIMITS.AMOUNT_MAX) continue;

      const safeSaved =
        Number.isFinite(savedAmount) && savedAmount >= 0 && savedAmount <= VALIDATION_LIMITS.AMOUNT_MAX
          ? savedAmount
          : 0;
      const priority: SavingsGoalPriority =
        item.priority === 'alta' || item.priority === 'media' || item.priority === 'baja'
          ? item.priority
          : 'media';
      const color =
        typeof item.color === 'string' && VALIDATION_LIMITS.HEX_COLOR_PATTERN.test(item.color)
          ? item.color.toUpperCase()
          : '#0F5132';

      goals.push({
        id:
          typeof item.id === 'string' && item.id.trim()
            ? item.id.trim().slice(0, 64)
            : `goal_${Date.now()}_${i}`,
        name,
        targetAmount,
        savedAmount: safeSaved,
        targetDate: VALIDATION_LIMITS.DATE_PATTERN.test(targetDate)
          ? targetDate
          : addMonthsToDateStr(getTodayDateStr(), 6),
        priority,
        color,
        notes: typeof item.notes === 'string' ? item.notes.trim().slice(0, 200) : '',
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
      });
    }
  }

  return {
    monthlyRule,
    goals,
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : '',
  };
}

export function loadSavingsPlan(uid: string): SavingsPlanState {
  if (!uid) return sanitizeSavingsPlanState(null);
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${uid}`);
    if (!raw) return sanitizeSavingsPlanState(null);
    return sanitizeSavingsPlanState(JSON.parse(raw));
  } catch {
    return sanitizeSavingsPlanState(null);
  }
}

export function saveSavingsPlan(uid: string, state: SavingsPlanState): void {
  if (!uid) return;
  try {
    const payload: SavingsPlanState = {
      ...state,
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(`${STORAGE_PREFIX}${uid}`, JSON.stringify(payload));
  } catch {
    // Ignore storage quota errors cleanly
  }
}

export function isSavingsCategoryName(name: string): boolean {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return (
    normalized.includes('ahorro') ||
    normalized.includes('invers') ||
    normalized.includes('fondo') ||
    normalized.includes('reserva') ||
    normalized.includes('saving')
  );
}

export function findDefaultSavingsCategory(categories: Category[]): Category | null {
  const expenseCategories = categories.filter((c) => c.type === 'gasto');
  return (
    expenseCategories.find((c) => isSavingsCategoryName(c.name)) ??
    expenseCategories[0] ??
    null
  );
}

export function computeGoalSchedule(
  goal: SavingsGoal,
  todayDateStr: string = getTodayDateStr()
): GoalSchedule {
  const remainingAmount = Math.max(0, Math.round((goal.targetAmount - goal.savedAmount) * 100) / 100);
  const progressPct =
    goal.targetAmount > 0 ? Math.min(100, (goal.savedAmount / goal.targetAmount) * 100) : 0;
  const isCompleted = goal.targetAmount > 0 && goal.savedAmount >= goal.targetAmount;
  const isOverdue = !isCompleted && goal.targetDate < todayDateStr;

  const [ty, tm, td] = todayDateStr.split('-').map(Number);
  const [gy, gm, gd] = goal.targetDate.split('-').map(Number);
  const todayMs = new Date(ty, (tm || 1) - 1, td || 1).getTime();
  const goalMs = new Date(gy, (gm || 1) - 1, gd || 1).getTime();
  const diffDays = Math.max(0, Math.ceil((goalMs - todayMs) / (1000 * 60 * 60 * 24)));

  const quincenasRemaining = Math.max(1, Math.ceil(diffDays / 15));
  const monthsRemaining = Math.max(1, Math.ceil(quincenasRemaining / 2));

  return {
    remainingAmount,
    progressPct,
    monthsRemaining,
    quincenasRemaining,
    requiredPerMonth: isCompleted
      ? 0
      : Math.round((remainingAmount / monthsRemaining) * 100) / 100,
    requiredPerQuincena: isCompleted
      ? 0
      : Math.round((remainingAmount / quincenasRemaining) * 100) / 100,
    isCompleted,
    isOverdue,
  };
}

export function computeMonthlySavingsSummary(params: {
  monthKey: string;
  transactions: Transaction[];
  categories: Category[];
  monthlyRule: MonthlySavingsRule;
}): MonthlySavingsSummary {
  const { monthKey, transactions, categories, monthlyRule } = params;

  const savingsCategoryIds = new Set(
    categories
      .filter((c) => c.type === 'gasto' && isSavingsCategoryName(c.name))
      .map((c) => c.id)
  );

  let q1Income = 0;
  let q1Expense = 0;
  let q1ExplicitSavings = 0;
  let q2Income = 0;
  let q2Expense = 0;
  let q2ExplicitSavings = 0;

  for (const tx of transactions) {
    if (tx.monthKey !== monthKey) continue;
    const isExplicitSavings =
      tx.type === 'gasto' &&
      (savingsCategoryIds.has(tx.categoryId) || isSavingsCategoryName(tx.categoryName));

    if (tx.quincena === 1) {
      if (tx.type === 'ingreso') q1Income += tx.amount;
      else {
        q1Expense += tx.amount;
        if (isExplicitSavings) q1ExplicitSavings += tx.amount;
      }
    } else {
      if (tx.type === 'ingreso') q2Income += tx.amount;
      else {
        q2Expense += tx.amount;
        if (isExplicitSavings) q2ExplicitSavings += tx.amount;
      }
    }
  }

  const monthIncome = Math.round((q1Income + q2Income) * 100) / 100;
  const monthExpense = Math.round((q1Expense + q2Expense) * 100) / 100;
  const explicitSavingsLogged = Math.round((q1ExplicitSavings + q2ExplicitSavings) * 100) / 100;
  const netBalance = Math.round((monthIncome - monthExpense) * 100) / 100;

  // Effective savings combines positive cash surplus plus transfers recorded under savings/investment categories
  const effectiveMonthlySaved =
    Math.round((Math.max(0, netBalance) + explicitSavingsLogged) * 100) / 100;
  const q1Saved = Math.round((Math.max(0, q1Income - q1Expense) + q1ExplicitSavings) * 100) / 100;
  const q2Saved = Math.round((Math.max(0, q2Income - q2Expense) + q2ExplicitSavings) * 100) / 100;

  const monthlyTargetAmount =
    monthlyRule.mode === 'fixed'
      ? Math.round(monthlyRule.targetFixedAmount * 100) / 100
      : Math.round(((monthIncome * monthlyRule.targetPercentage) / 100) * 100) / 100;

  const quincenaTargetAmount = Math.round((monthlyTargetAmount / 2) * 100) / 100;
  const progressPct =
    monthlyTargetAmount > 0
      ? Math.min(100, (effectiveMonthlySaved / monthlyTargetAmount) * 100)
      : effectiveMonthlySaved > 0
        ? 100
        : 0;
  const remainingToGoal = Math.max(
    0,
    Math.round((monthlyTargetAmount - effectiveMonthlySaved) * 100) / 100
  );
  const savingsRatePct = monthIncome > 0 ? (effectiveMonthlySaved / monthIncome) * 100 : 0;

  return {
    monthIncome,
    monthExpense,
    netBalance,
    explicitSavingsLogged,
    effectiveMonthlySaved,
    monthlyTargetAmount,
    quincenaTargetAmount,
    progressPct,
    remainingToGoal,
    q1Income,
    q1Expense,
    q1Saved,
    q2Income,
    q2Expense,
    q2Saved,
    savingsRatePct,
    targetReached: monthlyTargetAmount > 0 && effectiveMonthlySaved >= monthlyTargetAmount,
  };
}

export function buildSavingsProjection(params: {
  startMonthKey: string;
  initialSaved: number;
  plannedMonthly: number;
  actualMonthly: number;
  months?: number;
}): SavingsProjectionPoint[] {
  const { startMonthKey, initialSaved, plannedMonthly, actualMonthly, months = 12 } = params;
  const points: SavingsProjectionPoint[] = [];

  for (let i = 0; i <= months; i++) {
    const mk = shiftMonthKey(startMonthKey, i);
    points.push({
      monthKey: mk,
      label: i === 0 ? 'Hoy' : formatShortMonthLabel(mk),
      planAcumulado: Math.round((initialSaved + plannedMonthly * i) * 100) / 100,
      ritmoActualAcumulado: Math.round((initialSaved + actualMonthly * i) * 100) / 100,
    });
  }

  return points;
}
