import type { Category, Transaction } from '../types/finance';

export type BudgetAlertSeverity = 'warning' | 'exceeded';

export interface BudgetAlertItem {
  id: string;
  scope: 'global' | 'category';
  categoryId?: string;
  label: string;
  spent: number;
  budget: number;
  pct: number;
  remaining: number;
  severity: BudgetAlertSeverity;
}

export const DEFAULT_BUDGET_ALERT_THRESHOLD = 80;
export const BUDGET_ALERT_THRESHOLD_OPTIONS = [75, 80, 85, 90] as const;

const STORAGE_KEY = 'quincena_budget_alert_threshold';

export function loadBudgetAlertThreshold(): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BUDGET_ALERT_THRESHOLD;
    const parsed = Number(raw);
    if (
      BUDGET_ALERT_THRESHOLD_OPTIONS.includes(
        parsed as (typeof BUDGET_ALERT_THRESHOLD_OPTIONS)[number]
      )
    ) {
      return parsed;
    }
  } catch {
    // Ignore storage access errors in restricted iframes
  }
  return DEFAULT_BUDGET_ALERT_THRESHOLD;
}

export function saveBudgetAlertThreshold(thresholdPct: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(thresholdPct));
  } catch {
    // Ignore storage access errors
  }
}

export function computeMonthlyBudgetAlerts(params: {
  monthKey: string;
  transactions: Transaction[];
  categories: Category[];
  globalBudget: number;
  thresholdPct: number;
}): BudgetAlertItem[] {
  const { monthKey, transactions, categories, globalBudget, thresholdPct } = params;
  const alerts: BudgetAlertItem[] = [];

  let monthExpenseTotal = 0;
  const spentByCategory = new Map<string, number>();

  for (const tx of transactions) {
    if (tx.monthKey !== monthKey || tx.type !== 'gasto') continue;
    monthExpenseTotal += tx.amount;
    spentByCategory.set(tx.categoryId, (spentByCategory.get(tx.categoryId) ?? 0) + tx.amount);
  }

  if (globalBudget > 0) {
    const pct = (monthExpenseTotal / globalBudget) * 100;
    const remaining = globalBudget - monthExpenseTotal;
    if (pct >= 100) {
      alerts.push({
        id: `global:${monthKey}:exceeded`,
        scope: 'global',
        label: 'Presupuesto mensual global',
        spent: monthExpenseTotal,
        budget: globalBudget,
        pct,
        remaining,
        severity: 'exceeded',
      });
    } else if (pct >= thresholdPct) {
      alerts.push({
        id: `global:${monthKey}:warning`,
        scope: 'global',
        label: 'Presupuesto mensual global',
        spent: monthExpenseTotal,
        budget: globalBudget,
        pct,
        remaining,
        severity: 'warning',
      });
    }
  }

  const categoryAlerts: BudgetAlertItem[] = [];
  for (const cat of categories) {
    if (cat.type !== 'gasto' || cat.monthlyBudget <= 0) continue;
    const spent = spentByCategory.get(cat.id) ?? 0;
    if (spent <= 0) continue;
    const pct = (spent / cat.monthlyBudget) * 100;
    const remaining = cat.monthlyBudget - spent;
    if (pct >= 100) {
      categoryAlerts.push({
        id: `cat:${cat.id}:${monthKey}:exceeded`,
        scope: 'category',
        categoryId: cat.id,
        label: cat.name,
        spent,
        budget: cat.monthlyBudget,
        pct,
        remaining,
        severity: 'exceeded',
      });
    } else if (pct >= thresholdPct) {
      categoryAlerts.push({
        id: `cat:${cat.id}:${monthKey}:warning`,
        scope: 'category',
        categoryId: cat.id,
        label: cat.name,
        spent,
        budget: cat.monthlyBudget,
        pct,
        remaining,
        severity: 'warning',
      });
    }
  }

  categoryAlerts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'exceeded' ? -1 : 1;
    return b.pct - a.pct;
  });

  return [...alerts, ...categoryAlerts];
}

export function computeProjectedExpenseImpact(params: {
  monthKey: string;
  transactions: Transaction[];
  categories: Category[];
  globalBudget: number;
  thresholdPct: number;
  draftAmount: number;
  draftCategoryId: string;
  editingTransactionId?: string | null;
}): BudgetAlertItem[] {
  const {
    monthKey,
    transactions,
    categories,
    globalBudget,
    thresholdPct,
    draftAmount,
    draftCategoryId,
    editingTransactionId,
  } = params;

  if (!Number.isFinite(draftAmount) || draftAmount <= 0) return [];

  let baseMonthExpenses = 0;
  let baseCategoryExpenses = 0;

  for (const tx of transactions) {
    if (tx.monthKey !== monthKey || tx.type !== 'gasto') continue;
    if (editingTransactionId && tx.id === editingTransactionId) continue;
    baseMonthExpenses += tx.amount;
    if (tx.categoryId === draftCategoryId) {
      baseCategoryExpenses += tx.amount;
    }
  }

  const impacted: BudgetAlertItem[] = [];

  if (globalBudget > 0) {
    const projectedGlobal = baseMonthExpenses + draftAmount;
    const pct = (projectedGlobal / globalBudget) * 100;
    const remaining = globalBudget - projectedGlobal;
    if (pct >= thresholdPct) {
      impacted.push({
        id: `projected:global:${monthKey}`,
        scope: 'global',
        label: 'Presupuesto mensual global',
        spent: projectedGlobal,
        budget: globalBudget,
        pct,
        remaining,
        severity: pct >= 100 ? 'exceeded' : 'warning',
      });
    }
  }

  const cat = categories.find((c) => c.id === draftCategoryId && c.type === 'gasto');
  if (cat && cat.monthlyBudget > 0) {
    const projectedCat = baseCategoryExpenses + draftAmount;
    const pct = (projectedCat / cat.monthlyBudget) * 100;
    const remaining = cat.monthlyBudget - projectedCat;
    if (pct >= thresholdPct) {
      impacted.push({
        id: `projected:cat:${cat.id}:${monthKey}`,
        scope: 'category',
        categoryId: cat.id,
        label: cat.name,
        spent: projectedCat,
        budget: cat.monthlyBudget,
        pct,
        remaining,
        severity: pct >= 100 ? 'exceeded' : 'warning',
      });
    }
  }

  return impacted;
}
