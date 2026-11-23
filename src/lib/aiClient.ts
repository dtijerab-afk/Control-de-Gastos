import type { Category, CurrencyCode, PaymentMethod, TransactionType } from '../types/finance';

export interface ParsedStatementTransaction {
  date: string;
  description: string;
  amount: number;
  type: TransactionType;
  suggestedCategoryName: string;
  paymentMethod: PaymentMethod;
}

export interface ParsedStatementDebt {
  hasDebtInfo: boolean;
  name: string;
  institution: string;
  totalBalance: number;
  minimumPayment: number;
  dueDate: string;
  cutoffDay: number;
  interestRate: number;
}

export interface ParsedStatementResult {
  bankName: string;
  statementPeriod: string;
  summary: string;
  detectedDebt?: ParsedStatementDebt;
  transactions: ParsedStatementTransaction[];
}

export interface FinancialInsightAction {
  title: string;
  detail: string;
  impactLabel: string;
  area: 'deudas' | 'gastos' | 'ahorro' | 'quincenas';
}

export interface FinancialInsightsResult {
  headline: string;
  healthSummary: string;
  priorityActions: FinancialInsightAction[];
  debtStrategy: string;
  quincenaTip: string;
}

export interface FinancialSnapshotPayload {
  selectedMonth: string;
  currency: CurrencyCode;
  monthIncome: number;
  monthExpense: number;
  netBalance: number;
  q1Income: number;
  q1Expense: number;
  q2Income: number;
  q2Expense: number;
  globalBudget: number;
  topExpenseCategories: { name: string; spent: number; budget: number }[];
  debts: {
    name: string;
    institution: string;
    remainingAmount: number;
    monthlyPayment: number;
    interestRate: number;
    dueDay: number;
    nextDueDate: string;
    status: string;
  }[];
  savingsPlan: {
    monthlyTarget: number;
    effectiveMonthlySaved: number;
    goalsCount: number;
    totalGoalRemaining: number;
  };
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
    reader.readAsDataURL(blob);
  });
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const targetUrl = API_BASE ? `${API_BASE}${url}` : url;
  const res = await fetch(targetUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    if (res.status === 405) {
      throw new Error(
        'Esta URL está en un hosting estático (como GitHub Pages) que no ejecuta el backend /api de análisis. Abre la app desplegada con servidor (Cloud Run / vista previa) o configura la variable VITE_API_BASE_URL en GitHub apuntando a tu servidor.'
      );
    }
    throw new Error(data.error || `Error del servidor (${res.status}).`);
  }
  return data;
}

export async function analyzeStatementWithAi(params: {
  blob: Blob;
  mimeType: string;
  fileName: string;
  currency: CurrencyCode;
  defaultMonthKey: string;
  categories: Category[];
}): Promise<ParsedStatementResult> {
  const fileBase64 = await blobToBase64(params.blob);
  const raw = await postJson<ParsedStatementResult>('/api/ai/parse-statement', {
    fileBase64,
    mimeType: params.mimeType,
    fileName: params.fileName,
    currency: params.currency,
    defaultMonthKey: params.defaultMonthKey,
    categories: params.categories.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
    })),
  });

  const validMethods: PaymentMethod[] = [
    'transferencia',
    'debito',
    'credito',
    'efectivo',
    'otro',
  ];

  const cleanTxs: ParsedStatementTransaction[] = Array.isArray(raw.transactions)
    ? raw.transactions
        .filter((t) => t && typeof t.amount === 'number' && t.amount > 0 && t.description)
        .map((t) => ({
          date:
            typeof t.date === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(t.date)
              ? t.date
              : `${params.defaultMonthKey}-15`,
          description: String(t.description).trim().slice(0, 140),
          amount: Math.round(Math.abs(Number(t.amount)) * 100) / 100,
          type: t.type === 'ingreso' ? 'ingreso' : 'gasto',
          suggestedCategoryName: String(t.suggestedCategoryName || '').trim(),
          paymentMethod: validMethods.includes(t.paymentMethod) ? t.paymentMethod : 'debito',
        }))
    : [];

  return {
    bankName: String(raw.bankName || '').trim(),
    statementPeriod: String(raw.statementPeriod || '').trim(),
    summary: String(raw.summary || '').trim(),
    detectedDebt: raw.detectedDebt?.hasDebtInfo ? raw.detectedDebt : undefined,
    transactions: cleanTxs,
  };
}

export async function fetchFinancialInsights(
  snapshot: FinancialSnapshotPayload
): Promise<FinancialInsightsResult> {
  return postJson<FinancialInsightsResult>('/api/ai/financial-insights', { snapshot });
}

export async function askFinancialAdvisor(params: {
  question: string;
  snapshot: FinancialSnapshotPayload;
  history: { role: 'user' | 'assistant'; text: string }[];
}): Promise<{ answer: string }> {
  return postJson<{ answer: string }>('/api/ai/ask', params);
}
