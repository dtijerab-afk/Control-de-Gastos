import {
  CURRENCIES,
  PAYMENT_METHODS,
  VALIDATION_LIMITS,
  type Category,
  type CurrencyCode,
  type PaymentMethod,
  type QuincenaNumber,
  type Transaction,
  type TransactionType,
  type UserProfile,
} from '../types/finance';
import { getMonthKeyFromDate, getTodayDateStr } from './financeUtils';

export const BACKUP_SCHEMA_VERSION = 1 as const;
export const MAX_BACKUP_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export interface BackupProfileEntry {
  displayName: string;
  currency: CurrencyCode;
  monthlyBudget: number;
}

export interface BackupCategoryEntry {
  sourceId: string;
  name: string;
  type: TransactionType;
  color: string;
  monthlyBudget: number;
}

export interface BackupTransactionEntry {
  sourceId: string;
  type: TransactionType;
  amount: number;
  description: string;
  sourceCategoryId: string;
  categoryName: string;
  date: string;
  monthKey: string;
  quincena: QuincenaNumber;
  paymentMethod: PaymentMethod;
  notes: string;
}

export interface QuincenaBackupFile {
  app: 'quincena';
  schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  exportedAt: string;
  sourceProjectId: string;
  counts: {
    categories: number;
    transactions: number;
    ingresos: number;
    gastos: number;
  };
  profile: BackupProfileEntry;
  categories: BackupCategoryEntry[];
  transactions: BackupTransactionEntry[];
}

export interface BackupImportReport {
  profileUpdated: boolean;
  categoriesCreated: number;
  categoriesMatched: number;
  categoriesUpdated: number;
  transactionsImported: number;
  transactionsSkipped: number;
}

const VALID_CURRENCY_SET = new Set<string>(CURRENCIES.map((c) => c.code));
const VALID_PAYMENT_SET = new Set<string>(PAYMENT_METHODS.map((p) => p.value));

export function normalizeCategoryLookupKey(type: TransactionType, name: string): string {
  return `${type}::${name.trim().toLowerCase()}`;
}

export function makeTransactionSignature(tx: {
  date: string;
  type: TransactionType;
  amount: number;
  quincena: QuincenaNumber;
  description: string;
  categoryName: string;
  paymentMethod: PaymentMethod;
  notes: string;
}): string {
  return [
    tx.date,
    tx.type,
    (Math.round(tx.amount * 100) / 100).toFixed(2),
    String(tx.quincena),
    tx.description.trim().toLowerCase(),
    tx.categoryName.trim().toLowerCase(),
    tx.paymentMethod,
    (tx.notes ?? '').trim().toLowerCase(),
  ].join('|');
}

export function buildQuincenaBackup(params: {
  profile: UserProfile | null;
  fallbackDisplayName: string;
  currency: CurrencyCode;
  categories: Category[];
  transactions: Transaction[];
  sourceProjectId: string;
}): QuincenaBackupFile {
  const { profile, fallbackDisplayName, currency, categories, transactions, sourceProjectId } =
    params;

  const cleanCategories: BackupCategoryEntry[] = categories.map((cat) => ({
    sourceId: cat.id,
    name: cat.name.trim().slice(0, VALIDATION_LIMITS.CATEGORY_NAME_MAX),
    type: cat.type === 'ingreso' ? 'ingreso' : 'gasto',
    color: VALIDATION_LIMITS.HEX_COLOR_PATTERN.test(cat.color)
      ? cat.color.toUpperCase()
      : '#334155',
    monthlyBudget:
      typeof cat.monthlyBudget === 'number' && Number.isFinite(cat.monthlyBudget) && cat.monthlyBudget >= 0
        ? Math.round(cat.monthlyBudget * 100) / 100
        : 0,
  }));

  const cleanTransactions: BackupTransactionEntry[] = transactions.map((tx) => ({
    sourceId: tx.id,
    type: tx.type === 'ingreso' ? 'ingreso' : 'gasto',
    amount: Math.round(tx.amount * 100) / 100,
    description: tx.description.trim().slice(0, VALIDATION_LIMITS.DESCRIPTION_MAX),
    sourceCategoryId: tx.categoryId,
    categoryName: tx.categoryName.trim().slice(0, VALIDATION_LIMITS.CATEGORY_NAME_MAX),
    date: tx.date,
    monthKey: tx.monthKey || getMonthKeyFromDate(tx.date),
    quincena: tx.quincena === 2 ? 2 : 1,
    paymentMethod: VALID_PAYMENT_SET.has(tx.paymentMethod) ? tx.paymentMethod : 'otro',
    notes: (tx.notes ?? '').trim().slice(0, VALIDATION_LIMITS.NOTES_MAX),
  }));

  const ingresos = cleanTransactions.filter((t) => t.type === 'ingreso').length;
  const gastos = cleanTransactions.length - ingresos;

  return {
    app: 'quincena',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    sourceProjectId,
    counts: {
      categories: cleanCategories.length,
      transactions: cleanTransactions.length,
      ingresos,
      gastos,
    },
    profile: {
      displayName: (profile?.displayName || fallbackDisplayName || 'Usuario')
        .trim()
        .slice(0, VALIDATION_LIMITS.DISPLAY_NAME_MAX),
      currency: profile?.currency ?? currency,
      monthlyBudget:
        typeof profile?.monthlyBudget === 'number' &&
        Number.isFinite(profile.monthlyBudget) &&
        profile.monthlyBudget >= 0
          ? Math.round(profile.monthlyBudget * 100) / 100
          : 0,
    },
    categories: cleanCategories,
    transactions: cleanTransactions,
  };
}

export function downloadQuincenaBackup(backup: QuincenaBackupFile): string {
  const filename = `quincena_respaldo_${getTodayDateStr()}.json`;
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return filename;
}

export function parseAndValidateQuincenaBackup(
  rawText: string
): { ok: true; backup: QuincenaBackupFile } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return {
      ok: false,
      error: 'El archivo seleccionado no es un JSON válido.',
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      error: 'La estructura raíz del archivo de respaldo no es válida.',
    };
  }

  const root = parsed as Record<string, unknown>;
  if (root.app !== 'quincena') {
    return {
      ok: false,
      error: 'Este archivo no corresponde a un respaldo generado por Quincena.',
    };
  }
  if (root.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Versión de respaldo no soportada (${String(root.schemaVersion ?? 'desconocida')}).`,
    };
  }

  // Validate profile
  const rawProfile = root.profile as Record<string, unknown> | undefined;
  if (!rawProfile || typeof rawProfile !== 'object' || Array.isArray(rawProfile)) {
    return {
      ok: false,
      error: 'El respaldo no contiene información válida de perfil.',
    };
  }
  const currency = typeof rawProfile.currency === 'string' && VALID_CURRENCY_SET.has(rawProfile.currency)
    ? (rawProfile.currency as CurrencyCode)
    : null;
  if (!currency) {
    return {
      ok: false,
      error: 'La moneda especificada en el respaldo no es válida.',
    };
  }
  const monthlyBudget = Number(rawProfile.monthlyBudget ?? 0);
  if (!Number.isFinite(monthlyBudget) || monthlyBudget < 0 || monthlyBudget > VALIDATION_LIMITS.AMOUNT_MAX) {
    return {
      ok: false,
      error: 'El presupuesto mensual global del respaldo contiene un valor inválido.',
    };
  }
  const displayName =
    typeof rawProfile.displayName === 'string' && rawProfile.displayName.trim()
      ? rawProfile.displayName.trim().slice(0, VALIDATION_LIMITS.DISPLAY_NAME_MAX)
      : 'Usuario';

  // Validate categories
  if (!Array.isArray(root.categories)) {
    return {
      ok: false,
      error: 'El respaldo no contiene una lista válida de categorías.',
    };
  }

  const categories: BackupCategoryEntry[] = [];
  for (let i = 0; i < root.categories.length; i++) {
    const item = root.categories[i] as Record<string, unknown>;
    if (!item || typeof item !== 'object') {
      return { ok: false, error: `Categoría inválida en la posición ${i + 1}.` };
    }
    const sourceId = typeof item.sourceId === 'string' ? item.sourceId.trim() : '';
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const type = item.type === 'ingreso' || item.type === 'gasto' ? item.type : null;
    const color =
      typeof item.color === 'string' && VALIDATION_LIMITS.HEX_COLOR_PATTERN.test(item.color)
        ? item.color.toUpperCase()
        : '#334155';
    const catBudget = Number(item.monthlyBudget ?? 0);

    if (!name || name.length > VALIDATION_LIMITS.CATEGORY_NAME_MAX || !type) {
      return {
        ok: false,
        error: `La categoría #${i + 1} tiene nombre o tipo inválido.`,
      };
    }
    if (!Number.isFinite(catBudget) || catBudget < 0 || catBudget > VALIDATION_LIMITS.AMOUNT_MAX) {
      return {
        ok: false,
        error: `La categoría "${name}" tiene un presupuesto mensual inválido.`,
      };
    }

    categories.push({
      sourceId: sourceId || `cat_${i}`,
      name,
      type,
      color,
      monthlyBudget: type === 'gasto' ? Math.round(catBudget * 100) / 100 : 0,
    });
  }

  // Validate transactions
  if (!Array.isArray(root.transactions)) {
    return {
      ok: false,
      error: 'El respaldo no contiene una lista válida de movimientos.',
    };
  }

  const transactions: BackupTransactionEntry[] = [];
  for (let i = 0; i < root.transactions.length; i++) {
    const item = root.transactions[i] as Record<string, unknown>;
    if (!item || typeof item !== 'object') {
      return { ok: false, error: `Movimiento inválido en la posición ${i + 1}.` };
    }
    const type = item.type === 'ingreso' || item.type === 'gasto' ? item.type : null;
    const amount = Math.round(Number(item.amount) * 100) / 100;
    const description =
      typeof item.description === 'string'
        ? item.description.trim().slice(0, VALIDATION_LIMITS.DESCRIPTION_MAX)
        : '';
    const categoryName =
      typeof item.categoryName === 'string'
        ? item.categoryName.trim().slice(0, VALIDATION_LIMITS.CATEGORY_NAME_MAX)
        : '';
    const sourceCategoryId =
      typeof item.sourceCategoryId === 'string' ? item.sourceCategoryId.trim() : '';
    const date = typeof item.date === 'string' ? item.date.trim() : '';
    const quincena = item.quincena === 1 || item.quincena === 2 ? item.quincena : null;
    const paymentMethod =
      typeof item.paymentMethod === 'string' && VALID_PAYMENT_SET.has(item.paymentMethod)
        ? (item.paymentMethod as PaymentMethod)
        : 'otro';
    const notes =
      typeof item.notes === 'string' ? item.notes.trim().slice(0, VALIDATION_LIMITS.NOTES_MAX) : '';

    if (!type || !description || !categoryName || !quincena) {
      return {
        ok: false,
        error: `El movimiento #${i + 1} tiene campos obligatorios faltantes o inválidos.`,
      };
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > VALIDATION_LIMITS.AMOUNT_MAX) {
      return {
        ok: false,
        error: `El movimiento "${description}" tiene un monto inválido.`,
      };
    }
    if (!VALIDATION_LIMITS.DATE_PATTERN.test(date)) {
      return {
        ok: false,
        error: `El movimiento "${description}" tiene una fecha inválida (${date}).`,
      };
    }

    const monthKey = getMonthKeyFromDate(date);
    transactions.push({
      sourceId: typeof item.sourceId === 'string' && item.sourceId.trim() ? item.sourceId.trim() : `tx_${i}`,
      type,
      amount,
      description,
      sourceCategoryId,
      categoryName,
      date,
      monthKey,
      quincena,
      paymentMethod,
      notes,
    });
  }

  const ingresos = transactions.filter((t) => t.type === 'ingreso').length;
  const gastos = transactions.length - ingresos;

  return {
    ok: true,
    backup: {
      app: 'quincena',
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: typeof root.exportedAt === 'string' ? root.exportedAt : '',
      sourceProjectId: typeof root.sourceProjectId === 'string' ? root.sourceProjectId : '',
      counts: {
        categories: categories.length,
        transactions: transactions.length,
        ingresos,
        gastos,
      },
      profile: {
        displayName,
        currency,
        monthlyBudget: Math.round(monthlyBudget * 100) / 100,
      },
      categories,
      transactions,
    },
  };
}
