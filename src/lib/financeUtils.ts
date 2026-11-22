import {
  CURRENCIES,
  PAYMENT_METHODS,
  VALIDATION_LIMITS,
  type CategoryInput,
  type CurrencyCode,
  type PaymentMethod,
  type QuincenaNumber,
  type Transaction,
  type TransactionInput,
} from '../types/finance';

const SPANISH_MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const SPANISH_SHORT_MONTHS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

export function formatCurrency(amount: number, currency: CurrencyCode = 'MXN'): string {
  const entry = CURRENCIES.find((c) => c.code === currency) ?? CURRENCIES[0];
  try {
    return new Intl.NumberFormat(entry.locale, {
      style: 'currency',
      currency: entry.code,
      minimumFractionDigits: currency === 'CLP' || currency === 'COP' ? 0 : 2,
      maximumFractionDigits: currency === 'CLP' || currency === 'COP' ? 0 : 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

export function formatCompactCurrency(amount: number, currency: CurrencyCode = 'MXN'): string {
  const entry = CURRENCIES.find((c) => c.code === currency) ?? CURRENCIES[0];
  try {
    return new Intl.NumberFormat(entry.locale, {
      style: 'currency',
      currency: entry.code,
      notation: Math.abs(amount) >= 10000 ? 'compact' : 'standard',
      maximumFractionDigits: Math.abs(amount) >= 10000 ? 1 : 0,
    }).format(amount);
  } catch {
    return `$${Math.round(amount)}`;
  }
}

export function getTodayDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getCurrentMonthKey(): string {
  return getTodayDateStr().slice(0, 7);
}

export function getMonthKeyFromDate(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/**
 * Payroll quincena schedule:
 * - 1ª Quincena: pago del día 15–16 del mes (cubre del 15 al 29; en febrero hasta el penúltimo día).
 * - 2ª Quincena: pago del día 30 al 1 (cubre el 30/31 y del 1 al 14).
 */
export function getQuincenaFromDate(dateStr: string): QuincenaNumber {
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const lastDay = year && month ? getDaysInMonth(year, month) : 30;
  const secondPayDay = Math.min(30, lastDay);
  return day >= 15 && day < secondPayDay ? 1 : 2;
}

export function getDaysInMonth(year: number, monthOneBased: number): number {
  return new Date(year, monthOneBased, 0).getDate();
}

export function formatMonthLabel(monthKey: string): string {
  const [yearStr, monthStr] = monthKey.split('-');
  const monthIdx = Number(monthStr) - 1;
  const monthName = SPANISH_MONTHS[monthIdx] ?? monthKey;
  return `${monthName} ${yearStr}`;
}

export function formatShortMonthLabel(monthKey: string): string {
  const [yearStr, monthStr] = monthKey.split('-');
  const monthIdx = Number(monthStr) - 1;
  const shortMonth = SPANISH_SHORT_MONTHS[monthIdx] ?? monthStr;
  return `${shortMonth.charAt(0).toUpperCase()}${shortMonth.slice(1)} ${yearStr.slice(2)}`;
}

export function getQuincenaRangeLabel(monthKey: string, quincena: QuincenaNumber): string {
  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const shortMonth = SPANISH_SHORT_MONTHS[month - 1] ?? '';
  if (quincena === 1) {
    return `15–16 ${shortMonth}`;
  }
  const lastDay = getDaysInMonth(year, month);
  const payDay = Math.min(30, lastDay);
  const nextShortMonth = SPANISH_SHORT_MONTHS[month % 12] ?? '';
  return `${payDay}–1 ${nextShortMonth}`;
}

export function formatShortDate(dateStr: string): string {
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const monthIdx = Number(monthStr) - 1;
  const day = Number(dayStr);
  const shortMonth = SPANISH_SHORT_MONTHS[monthIdx] ?? monthStr;
  return `${day} ${shortMonth} ${yearStr}`;
}

export function shiftMonthKey(monthKey: string, deltaMonths: number): string {
  const [yearStr, monthStr] = monthKey.split('-');
  const date = new Date(Number(yearStr), Number(monthStr) - 1 + deltaMonths, 1);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function getRecentMonthKeys(anchorMonthKey: string, count: number): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    keys.push(shiftMonthKey(anchorMonthKey, -i));
  }
  return keys;
}

export function getDefaultDateForPeriod(monthKey: string, quincena: QuincenaNumber | 'all'): string {
  const today = getTodayDateStr();
  if (today.startsWith(monthKey)) {
    const todayQ = getQuincenaFromDate(today);
    if (quincena === 'all' || quincena === todayQ) {
      return today;
    }
  }
  const [yearStr, monthStr] = monthKey.split('-');
  const lastDay = getDaysInMonth(Number(yearStr), Number(monthStr));
  if (quincena === 2) {
    const payDay = Math.min(30, lastDay);
    return `${monthKey}-${String(payDay).padStart(2, '0')}`;
  }
  return `${monthKey}-15`;
}

export function mapDateToTargetQuincena(
  originalDate: string,
  targetMonthKey: string,
  targetQuincena: QuincenaNumber
): string {
  const [yearStr, monthStr] = targetMonthKey.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const lastDay = getDaysInMonth(year, month);
  const secondPayDay = Math.min(30, lastDay);
  const origDay = Number(originalDate.slice(8, 10)) || 15;

  let day: number;
  if (targetQuincena === 1) {
    if (origDay >= 15 && origDay < secondPayDay) {
      day = origDay;
    } else if (origDay >= secondPayDay) {
      day = 15;
    } else if (origDay === 1) {
      day = 16;
    } else {
      day = Math.min(secondPayDay - 1, origDay + 14);
    }
    day = Math.max(15, Math.min(secondPayDay - 1, day));
  } else {
    if (origDay >= secondPayDay || origDay <= 14) {
      day = Math.min(origDay, lastDay);
    } else if (origDay === 15) {
      day = secondPayDay;
    } else if (origDay === 16) {
      day = 1;
    } else {
      day = Math.max(1, Math.min(14, origDay - 15));
    }
  }
  return `${targetMonthKey}-${String(day).padStart(2, '0')}`;
}

export function getPaymentMethodLabel(method: PaymentMethod): string {
  return PAYMENT_METHODS.find((m) => m.value === method)?.label ?? method;
}

export function sanitizeCategoryInput(input: CategoryInput): CategoryInput {
  const name = input.name.trim().slice(0, VALIDATION_LIMITS.CATEGORY_NAME_MAX);
  if (!name) {
    throw new Error('Ingresa un nombre para la categoría.');
  }
  const color = VALIDATION_LIMITS.HEX_COLOR_PATTERN.test(input.color)
    ? input.color.toUpperCase()
    : '#334155';
  const monthlyBudget = Number.isFinite(input.monthlyBudget) && input.monthlyBudget >= 0
    ? Math.min(Math.round(input.monthlyBudget * 100) / 100, VALIDATION_LIMITS.AMOUNT_MAX)
    : 0;

  return {
    name,
    type: input.type === 'ingreso' ? 'ingreso' : 'gasto',
    color,
    monthlyBudget,
  };
}

export function sanitizeTransactionInput(input: TransactionInput): TransactionInput & { monthKey: string } {
  const description = input.description.trim().slice(0, VALIDATION_LIMITS.DESCRIPTION_MAX);
  if (!description) {
    throw new Error('Ingresa una descripción para el movimiento.');
  }
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount > VALIDATION_LIMITS.AMOUNT_MAX) {
    throw new Error('Ingresa un monto válido mayor a cero.');
  }
  if (!VALIDATION_LIMITS.ID_PATTERN.test(input.categoryId) || input.categoryId.length > VALIDATION_LIMITS.ID_MAX) {
    throw new Error('Selecciona una categoría válida.');
  }
  const categoryName = input.categoryName.trim().slice(0, VALIDATION_LIMITS.CATEGORY_NAME_MAX);
  if (!categoryName) {
    throw new Error('Selecciona una categoría válida.');
  }
  if (!VALIDATION_LIMITS.DATE_PATTERN.test(input.date)) {
    throw new Error('Selecciona una fecha válida.');
  }
  const monthKey = getMonthKeyFromDate(input.date);
  if (!VALIDATION_LIMITS.MONTH_KEY_PATTERN.test(monthKey)) {
    throw new Error('La fecha seleccionada no es válida.');
  }
  const quincena: QuincenaNumber = input.quincena === 2 ? 2 : 1;
  const notes = (input.notes ?? '').trim().slice(0, VALIDATION_LIMITS.NOTES_MAX);

  return {
    type: input.type === 'ingreso' ? 'ingreso' : 'gasto',
    amount,
    description,
    categoryId: input.categoryId,
    categoryName,
    date: input.date,
    monthKey,
    quincena,
    paymentMethod: input.paymentMethod,
    notes,
  };
}

export function exportTransactionsToCsv(
  transactions: Transaction[],
  currency: CurrencyCode,
  filePrefix: string
): void {
  const headers = [
    'Fecha',
    'Mes',
    'Quincena',
    'Tipo',
    'Categoría',
    'Descripción',
    'Método de pago',
    `Monto (${currency})`,
    'Notas',
  ];

  const escapeCell = (val: string | number) => {
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows = transactions.map((t) => [
    t.date,
    t.monthKey,
    t.quincena === 1 ? '1ª Quincena' : '2ª Quincena',
    t.type === 'ingreso' ? 'Ingreso' : 'Gasto',
    t.categoryName,
    t.description,
    getPaymentMethodLabel(t.paymentMethod),
    t.type === 'ingreso' ? t.amount.toFixed(2) : (-t.amount).toFixed(2),
    t.notes,
  ]);

  const csvContent =
    '\uFEFF' + [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${filePrefix}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
