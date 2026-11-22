import { getDaysInMonth, getTodayDateStr } from './financeUtils';
import { VALIDATION_LIMITS, type Category, type QuincenaNumber } from '../types/finance';

export type DebtCategory =
  | 'tarjeta_credito'
  | 'prestamo'
  | 'hipoteca'
  | 'vehiculo'
  | 'servicio_cuotas'
  | 'personal'
  | 'otro';

export type DebtPayQuincena = 1 | 2 | 'both';

export interface DebtPayment {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  note: string;
  recordedAsTx: boolean;
}

export interface DebtItem {
  id: string;
  name: string;
  institution: string;
  category: DebtCategory;
  totalAmount: number;
  remainingAmount: number;
  monthlyPayment: number;
  interestRate: number; // annual % optional (0 if unset)
  cutoffDay: number; // 0 = unset, 1..31
  dueDay: number; // 1..31
  nextDueDate: string; // YYYY-MM-DD
  payQuincena: DebtPayQuincena;
  paidMonths: string[]; // YYYY-MM[]
  payments: DebtPayment[];
  color: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface DebtsState {
  debts: DebtItem[];
  updatedAt: string;
}

export type DebtDueStatus = 'paid_off' | 'paid_month' | 'overdue' | 'due_soon' | 'scheduled';

export interface DebtScheduleStatus {
  status: DebtDueStatus;
  daysUntilDue: number;
  dueDateForMonth: string; // YYYY-MM-DD
  paidPct: number;
  paidAmount: number;
  estimatedMonthsLeft: number | null;
}

const STORAGE_PREFIX = 'moneyflow_debts_v1:';

export const DEBT_CATEGORY_OPTIONS: { value: DebtCategory; label: string }[] = [
  { value: 'tarjeta_credito', label: 'Tarjeta de crédito' },
  { value: 'prestamo', label: 'Préstamo bancario' },
  { value: 'vehiculo', label: 'Crédito vehículo' },
  { value: 'hipoteca', label: 'Hipoteca / Vivienda' },
  { value: 'servicio_cuotas', label: 'Compra a cuotas' },
  { value: 'personal', label: 'Préstamo personal' },
  { value: 'otro', label: 'Otra deuda' },
];

export const DEBT_TEMPLATES: {
  name: string;
  institution: string;
  category: DebtCategory;
  dueDay: number;
  cutoffDay: number;
  payQuincena: DebtPayQuincena;
  color: string;
  notes: string;
}[] = [
  {
    name: 'Tarjeta de crédito principal',
    institution: 'Banco principal',
    category: 'tarjeta_credito',
    dueDay: 16,
    cutoffDay: 1,
    payQuincena: 1,
    color: '#BE123C',
    notes: 'Pagar antes de la fecha límite para evitar intereses.',
  },
  {
    name: 'Préstamo bancario',
    institution: 'Banco',
    category: 'prestamo',
    dueDay: 30,
    cutoffDay: 15,
    payQuincena: 2,
    color: '#0369A1',
    notes: 'Cuota mensual fija.',
  },
  {
    name: 'Compra a cuotas',
    institution: 'Comercio / Financiera',
    category: 'servicio_cuotas',
    dueDay: 15,
    cutoffDay: 0,
    payQuincena: 1,
    color: '#B45309',
    notes: 'Cuotas sin interés.',
  },
];

export function getDebtCategoryLabel(cat: DebtCategory): string {
  return DEBT_CATEGORY_OPTIONS.find((c) => c.value === cat)?.label ?? 'Otra deuda';
}

export function buildDueDateForMonth(monthKey: string, dueDay: number): string {
  const [yStr, mStr] = monthKey.split('-');
  const y = Number(yStr) || new Date().getFullYear();
  const m = Number(mStr) || new Date().getMonth() + 1;
  const maxDay = getDaysInMonth(y, m);
  const clampedDay = Math.max(1, Math.min(maxDay, Math.round(dueDay || 15)));
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

export function suggestNextDueDate(dueDay: number, referenceDateStr = getTodayDateStr()): string {
  const [yStr, mStr, dStr] = referenceDateStr.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  const safeDue = Math.max(1, Math.min(31, Math.round(dueDay || 15)));

  const thisMonthMax = getDaysInMonth(y, m);
  const thisMonthDay = Math.min(safeDue, thisMonthMax);

  if (thisMonthDay >= d) {
    return `${yStr}-${mStr}-${String(thisMonthDay).padStart(2, '0')}`;
  }
  const next = new Date(y, m, 1);
  const nextY = next.getFullYear();
  const nextM = next.getMonth() + 1;
  const nextMax = getDaysInMonth(nextY, nextM);
  const nextDay = Math.min(safeDue, nextMax);
  return `${nextY}-${String(nextM).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`;
}

export function diffDaysFromToday(targetDateStr: string, todayStr = getTodayDateStr()): number {
  const [ty, tm, td] = todayStr.split('-').map(Number);
  const [dy, dm, dd] = targetDateStr.split('-').map(Number);
  const todayUtc = Date.UTC(ty, (tm || 1) - 1, td || 1);
  const targetUtc = Date.UTC(dy, (dm || 1) - 1, dd || 1);
  return Math.round((targetUtc - todayUtc) / 86_400_000);
}

export function computeDebtStatus(debt: DebtItem, selectedMonth: string): DebtScheduleStatus {
  const totalBase = Math.max(debt.totalAmount, debt.remainingAmount, 0);
  const paidAmount = Math.max(0, totalBase - debt.remainingAmount);
  const paidPct = totalBase > 0 ? Math.min(100, (paidAmount / totalBase) * 100) : 100;

  const dueDateForMonth =
    debt.nextDueDate && debt.nextDueDate.startsWith(selectedMonth)
      ? debt.nextDueDate
      : buildDueDateForMonth(selectedMonth, debt.dueDay);

  const referenceDueDate =
    debt.nextDueDate && VALIDATION_LIMITS.DATE_PATTERN.test(debt.nextDueDate)
      ? debt.nextDueDate
      : dueDateForMonth;

  const daysUntilDue = diffDaysFromToday(referenceDueDate);
  const estimatedMonthsLeft =
    debt.remainingAmount > 0 && debt.monthlyPayment > 0
      ? Math.ceil(debt.remainingAmount / debt.monthlyPayment)
      : null;

  if (debt.remainingAmount <= 0) {
    return {
      status: 'paid_off',
      daysUntilDue,
      dueDateForMonth: referenceDueDate,
      paidPct: 100,
      paidAmount: totalBase,
      estimatedMonthsLeft: 0,
    };
  }

  if (debt.paidMonths.includes(selectedMonth)) {
    return {
      status: 'paid_month',
      daysUntilDue,
      dueDateForMonth: referenceDueDate,
      paidPct,
      paidAmount,
      estimatedMonthsLeft,
    };
  }

  if (daysUntilDue < 0) {
    return {
      status: 'overdue',
      daysUntilDue,
      dueDateForMonth: referenceDueDate,
      paidPct,
      paidAmount,
      estimatedMonthsLeft,
    };
  }

  if (daysUntilDue <= 5) {
    return {
      status: 'due_soon',
      daysUntilDue,
      dueDateForMonth: referenceDueDate,
      paidPct,
      paidAmount,
      estimatedMonthsLeft,
    };
  }

  return {
    status: 'scheduled',
    daysUntilDue,
    dueDateForMonth: referenceDueDate,
    paidPct,
    paidAmount,
    estimatedMonthsLeft,
  };
}

export function findDefaultDebtPaymentCategory(categories: Category[]): Category | undefined {
  const expenseCats = categories.filter((c) => c.type === 'gasto');
  if (expenseCats.length === 0) return undefined;
  const preferred = expenseCats.find((c) =>
    /deuda|tarjeta|cr[eé]dito|pr[eé]stamo|cuota|banco|vivienda|servicio/i.test(c.name)
  );
  return preferred ?? expenseCats[0];
}

export function getSuggestedQuincenaForDebt(debt: DebtItem): QuincenaNumber {
  if (debt.payQuincena === 1) return 1;
  if (debt.payQuincena === 2) return 2;
  return debt.dueDay >= 15 && debt.dueDay < 30 ? 1 : 2;
}

function sanitizeDebtItem(raw: unknown): DebtItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const d = raw as Record<string, unknown>;
  const name = typeof d.name === 'string' ? d.name.trim().slice(0, 80) : '';
  if (!name) return null;

  const institution = typeof d.institution === 'string' ? d.institution.trim().slice(0, 80) : '';
  const validCategories: DebtCategory[] = [
    'tarjeta_credito',
    'prestamo',
    'hipoteca',
    'vehiculo',
    'servicio_cuotas',
    'personal',
    'otro',
  ];
  const category: DebtCategory = validCategories.includes(d.category as DebtCategory)
    ? (d.category as DebtCategory)
    : 'otro';

  const rawTotal = Number(d.totalAmount ?? 0);
  const rawRemaining = Number(d.remainingAmount ?? rawTotal);
  const remainingAmount =
    Number.isFinite(rawRemaining) && rawRemaining >= 0 && rawRemaining <= VALIDATION_LIMITS.AMOUNT_MAX
      ? Math.round(rawRemaining * 100) / 100
      : 0;
  const totalAmount =
    Number.isFinite(rawTotal) && rawTotal >= remainingAmount && rawTotal <= VALIDATION_LIMITS.AMOUNT_MAX
      ? Math.round(rawTotal * 100) / 100
      : Math.max(remainingAmount, 0);

  const rawMonthly = Number(d.monthlyPayment ?? 0);
  const monthlyPayment =
    Number.isFinite(rawMonthly) && rawMonthly >= 0 && rawMonthly <= VALIDATION_LIMITS.AMOUNT_MAX
      ? Math.round(rawMonthly * 100) / 100
      : 0;

  const rawRate = Number(d.interestRate ?? 0);
  const interestRate =
    Number.isFinite(rawRate) && rawRate >= 0 && rawRate <= 500
      ? Math.round(rawRate * 100) / 100
      : 0;

  const rawCutoff = Number(d.cutoffDay ?? 0);
  const cutoffDay =
    Number.isFinite(rawCutoff) && rawCutoff >= 1 && rawCutoff <= 31 ? Math.round(rawCutoff) : 0;

  const rawDue = Number(d.dueDay ?? 15);
  const dueDay = Number.isFinite(rawDue) && rawDue >= 1 && rawDue <= 31 ? Math.round(rawDue) : 15;

  const nextDueDate =
    typeof d.nextDueDate === 'string' && VALIDATION_LIMITS.DATE_PATTERN.test(d.nextDueDate)
      ? d.nextDueDate
      : suggestNextDueDate(dueDay);

  const payQuincena: DebtPayQuincena =
    d.payQuincena === 1 || d.payQuincena === 2 || d.payQuincena === 'both' ? d.payQuincena : 1;

  const paidMonths: string[] = Array.isArray(d.paidMonths)
    ? d.paidMonths
        .filter(
          (m): m is string => typeof m === 'string' && VALIDATION_LIMITS.MONTH_KEY_PATTERN.test(m)
        )
        .slice(0, 120)
    : [];

  const payments: DebtPayment[] = Array.isArray(d.payments)
    ? d.payments
        .map((p): DebtPayment | null => {
          if (!p || typeof p !== 'object') return null;
          const po = p as Record<string, unknown>;
          const amount = Number(po.amount ?? 0);
          if (!Number.isFinite(amount) || amount <= 0) return null;
          const date =
            typeof po.date === 'string' && VALIDATION_LIMITS.DATE_PATTERN.test(po.date)
              ? po.date
              : getTodayDateStr();
          return {
            id: typeof po.id === 'string' && po.id.trim() ? po.id.trim() : `pay_${Date.now()}`,
            date,
            amount: Math.round(amount * 100) / 100,
            note: typeof po.note === 'string' ? po.note.trim().slice(0, 160) : '',
            recordedAsTx: Boolean(po.recordedAsTx),
          };
        })
        .filter((p): p is DebtPayment => p !== null)
        .slice(0, 200)
    : [];

  const color =
    typeof d.color === 'string' && VALIDATION_LIMITS.HEX_COLOR_PATTERN.test(d.color)
      ? d.color.toUpperCase()
      : '#BE123C';

  const notes = typeof d.notes === 'string' ? d.notes.trim().slice(0, 300) : '';
  const nowIso = new Date().toISOString();

  return {
    id:
      typeof d.id === 'string' && d.id.trim()
        ? d.id.trim().slice(0, 64)
        : `debt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    institution,
    category,
    totalAmount,
    remainingAmount,
    monthlyPayment,
    interestRate,
    cutoffDay,
    dueDay,
    nextDueDate,
    payQuincena,
    paidMonths,
    payments,
    color,
    notes,
    createdAt: typeof d.createdAt === 'string' ? d.createdAt : nowIso,
    updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : nowIso,
  };
}

export function loadDebtsState(uid: string): DebtsState {
  if (!uid) return { debts: [], updatedAt: '' };
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${uid}`);
    if (!raw) return { debts: [], updatedAt: '' };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const debts = Array.isArray(parsed.debts)
      ? parsed.debts.map(sanitizeDebtItem).filter((item): item is DebtItem => item !== null)
      : [];
    return {
      debts,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
    };
  } catch {
    return { debts: [], updatedAt: '' };
  }
}

export function saveDebtsState(uid: string, state: DebtsState): void {
  if (!uid) return;
  try {
    window.localStorage.setItem(
      `${STORAGE_PREFIX}${uid}`,
      JSON.stringify({
        debts: state.debts,
        updatedAt: new Date().toISOString(),
      })
    );
  } catch {
    // Ignore storage quota errors cleanly
  }
}
