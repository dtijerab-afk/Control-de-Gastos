import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarRange,
  Copy,
  Gauge,
  Pencil,
  Percent,
  Plus,
  ReceiptText,
  Wallet,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useFinance } from '../context/FinanceContext';
import { useTheme } from '../context/ThemeContext';
import {
  formatCompactCurrency,
  formatCurrency,
  formatMonthLabel,
  formatShortDate,
  formatShortMonthLabel,
  getPaymentMethodLabel,
  getQuincenaRangeLabel,
  getRecentMonthKeys,
  shiftMonthKey,
} from '../lib/financeUtils';
import {
  copyTransactionsToQuincena,
  updateUserPreferences,
} from '../services/financeService';
import {
  VALIDATION_LIMITS,
  type NavSection,
  type QuincenaFilter,
  type QuincenaNumber,
  type Transaction,
} from '../types/finance';

interface OverviewViewProps {
  selectedMonth: string;
  selectedQuincena: QuincenaFilter;
  alertThresholdPct: number;
  onChangeQuincena: (q: QuincenaFilter) => void;
  onSelectMonth: (monthKey: string) => void;
  onNavigate: (section: NavSection) => void;
  onOpenNewTransaction: () => void;
  onEditTransaction: (tx: Transaction) => void;
}

export function OverviewView({
  selectedMonth,
  selectedQuincena,
  alertThresholdPct,
  onChangeQuincena,
  onSelectMonth,
  onNavigate,
  onOpenNewTransaction,
  onEditTransaction,
}: OverviewViewProps) {
  const { user, profile, transactions, categories, currency, loadingData } = useFinance();
  const { isDark } = useTheme();
  const [confirmingCopy, setConfirmingCopy] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // Global monthly budget editor state
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);
  const [budgetError, setBudgetError] = useState<string | null>(null);

  const monthTransactions = useMemo(
    () => transactions.filter((t) => t.monthKey === selectedMonth),
    [transactions, selectedMonth]
  );

  const periodTransactions = useMemo(() => {
    if (selectedQuincena === 'all') return monthTransactions;
    return monthTransactions.filter((t) => t.quincena === selectedQuincena);
  }, [monthTransactions, selectedQuincena]);

  const kpis = useMemo(() => {
    let income = 0;
    let expense = 0;
    let incomeCount = 0;
    let expenseCount = 0;

    for (const tx of periodTransactions) {
      if (tx.type === 'ingreso') {
        income += tx.amount;
        incomeCount += 1;
      } else {
        expense += tx.amount;
        expenseCount += 1;
      }
    }

    const net = income - expense;
    const savingsRate = income > 0 ? (net / income) * 100 : 0;
    return { income, expense, net, savingsRate, incomeCount, expenseCount };
  }, [periodTransactions]);

  const quincenaSummary = useMemo(() => {
    const build = (q: QuincenaNumber) => {
      const list = monthTransactions.filter((t) => t.quincena === q);
      const income = list.filter((t) => t.type === 'ingreso').reduce((acc, t) => acc + t.amount, 0);
      const expense = list.filter((t) => t.type === 'gasto').reduce((acc, t) => acc + t.amount, 0);
      return { income, expense, net: income - expense, count: list.length };
    };
    return { q1: build(1), q2: build(2) };
  }, [monthTransactions]);

  // Previous quincena source for quick biweekly copy
  const previousQuincenaInfo = useMemo(() => {
    if (selectedQuincena === 'all') return null;
    const sourceMonth = selectedQuincena === 2 ? selectedMonth : shiftMonthKey(selectedMonth, -1);
    const sourceQ: QuincenaNumber = selectedQuincena === 2 ? 1 : 2;
    const sourceTxs = transactions.filter(
      (t) => t.monthKey === sourceMonth && t.quincena === sourceQ
    );
    return {
      sourceMonth,
      sourceQ,
      sourceTxs,
      label: `${sourceQ === 1 ? '1ª' : '2ª'} Q de ${formatShortMonthLabel(sourceMonth)}`,
    };
  }, [selectedMonth, selectedQuincena, transactions]);

  const sixMonthData = useMemo(() => {
    const keys = getRecentMonthKeys(selectedMonth, 6);
    const map = new Map<string, { ingresos: number; gastos: number }>();
    for (const k of keys) {
      map.set(k, { ingresos: 0, gastos: 0 });
    }
    for (const tx of transactions) {
      const bucket = map.get(tx.monthKey);
      if (!bucket) continue;
      if (tx.type === 'ingreso') bucket.ingresos += tx.amount;
      else bucket.gastos += tx.amount;
    }
    return keys.map((monthKey) => {
      const entry = map.get(monthKey) ?? { ingresos: 0, gastos: 0 };
      return {
        monthKey,
        label: formatShortMonthLabel(monthKey),
        ingresos: Math.round(entry.ingresos * 100) / 100,
        gastos: Math.round(entry.gastos * 100) / 100,
        balance: Math.round((entry.ingresos - entry.gastos) * 100) / 100,
      };
    });
  }, [selectedMonth, transactions]);

  const recentTransactions = useMemo(() => periodTransactions.slice(0, 8), [periodTransactions]);

  const categoryColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) {
      map.set(c.id, c.color);
    }
    return map;
  }, [categories]);

  const handleCopyPreviousQuincena = async () => {
    if (!user || !previousQuincenaInfo || selectedQuincena === 'all') return;
    setCopying(true);
    setCopyFeedback(null);
    try {
      const validIds = new Set(categories.map((c) => c.id));
      const copied = await copyTransactionsToQuincena(
        user.uid,
        previousQuincenaInfo.sourceTxs,
        selectedMonth,
        selectedQuincena,
        validIds
      );
      setCopyFeedback(
        copied > 0
          ? `Se copiaron ${copied} movimientos desde ${previousQuincenaInfo.label}.`
          : 'No había movimientos con categorías activas para copiar.'
      );
      setConfirmingCopy(false);
    } finally {
      setCopying(false);
    }
  };

  const netStatusLabel =
    kpis.net > 0 ? 'Superávit' : kpis.net < 0 ? 'Déficit' : 'Equilibrado';

  const globalBudget = profile?.monthlyBudget ?? 0;
  const monthExpenseTotal = quincenaSummary.q1.expense + quincenaSummary.q2.expense;
  const budgetUsedPct = globalBudget > 0 ? (monthExpenseTotal / globalBudget) * 100 : 0;
  const budgetRemaining = globalBudget - monthExpenseTotal;
  const budgetOver = globalBudget > 0 && budgetRemaining < 0;
  const budgetWarning = globalBudget > 0 && !budgetOver && budgetUsedPct >= alertThresholdPct;
  const q1BudgetSharePct =
    globalBudget > 0 ? Math.min(100, (quincenaSummary.q1.expense / globalBudget) * 100) : 0;
  const q2BudgetSharePct =
    globalBudget > 0
      ? Math.min(Math.max(0, 100 - q1BudgetSharePct), (quincenaSummary.q2.expense / globalBudget) * 100)
      : 0;

  const openBudgetEditor = () => {
    setBudgetInput(globalBudget > 0 ? String(globalBudget) : '');
    setBudgetError(null);
    setEditingBudget(true);
  };

  const handleSaveGlobalBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBudgetError(null);

    const parsed = budgetInput.trim() === '' ? 0 : Number(budgetInput.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > VALIDATION_LIMITS.AMOUNT_MAX) {
      setBudgetError('Ingresa una meta mensual válida mayor o igual a cero.');
      return;
    }

    setSavingBudget(true);
    try {
      await updateUserPreferences(user.uid, { monthlyBudget: parsed });
      setEditingBudget(false);
    } catch (err) {
      setBudgetError(err instanceof Error ? err.message : 'No se pudo guardar el presupuesto.');
    } finally {
      setSavingBudget(false);
    }
  };

  const handleClearGlobalBudget = async () => {
    if (!user) return;
    setSavingBudget(true);
    setBudgetError(null);
    try {
      await updateUserPreferences(user.uid, { monthlyBudget: 0 });
      setEditingBudget(false);
    } catch (err) {
      setBudgetError(err instanceof Error ? err.message : 'No se pudo quitar la meta.');
    } finally {
      setSavingBudget(false);
    }
  };

  return (
    <div className="space-y-3.5 sm:space-y-5">
      {/* Period Selector Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4">
        <div className="grid grid-cols-3 sm:inline-flex items-center gap-1 p-1 bg-white/80 dark:bg-[#0D2118] border border-emerald-950/10 dark:border-emerald-400/15 shadow-xs rounded-xl w-full sm:w-fit">
          <button
            type="button"
            onClick={() => {
              onChangeQuincena('all');
              setConfirmingCopy(false);
              setCopyFeedback(null);
            }}
            className={`px-1.5 sm:px-3 py-1.5 text-[12px] sm:text-xs font-bold sm:font-semibold rounded-lg transition-all whitespace-nowrap text-center ${
              selectedQuincena === 'all'
                ? 'bg-[#0B3B24] dark:bg-[#166E43] text-white shadow-xs'
                : 'text-slate-700 sm:text-slate-600 dark:text-slate-300 hover:text-[#0B3B24] dark:hover:text-emerald-200 hover:bg-emerald-950/[0.04] dark:hover:bg-emerald-400/10'
            }`}
          >
            Todo el mes
          </button>
          <button
            type="button"
            onClick={() => {
              onChangeQuincena(1);
              setConfirmingCopy(false);
              setCopyFeedback(null);
            }}
            className={`px-1.5 sm:px-3 py-1.5 text-[12px] sm:text-xs font-bold sm:font-semibold rounded-lg transition-all whitespace-nowrap text-center ${
              selectedQuincena === 1
                ? 'bg-[#0B3B24] dark:bg-[#166E43] text-white shadow-xs'
                : 'text-slate-700 sm:text-slate-600 dark:text-slate-300 hover:text-[#0B3B24] dark:hover:text-emerald-200 hover:bg-emerald-950/[0.04] dark:hover:bg-emerald-400/10'
            }`}
          >
            <span className="sm:hidden">1ª Q (15–16)</span>
            <span className="hidden sm:inline">
              1ª Quincena ({getQuincenaRangeLabel(selectedMonth, 1)})
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              onChangeQuincena(2);
              setConfirmingCopy(false);
              setCopyFeedback(null);
            }}
            className={`px-1.5 sm:px-3 py-1.5 text-[12px] sm:text-xs font-bold sm:font-semibold rounded-lg transition-all whitespace-nowrap text-center ${
              selectedQuincena === 2
                ? 'bg-[#0B3B24] dark:bg-[#166E43] text-white shadow-xs'
                : 'text-slate-700 sm:text-slate-600 dark:text-slate-300 hover:text-[#0B3B24] dark:hover:text-emerald-200 hover:bg-emerald-950/[0.04] dark:hover:bg-emerald-400/10'
            }`}
          >
            <span className="sm:hidden">2ª Q (30–1)</span>
            <span className="hidden sm:inline">
              2ª Quincena ({getQuincenaRangeLabel(selectedMonth, 2)})
            </span>
          </button>
        </div>

        {previousQuincenaInfo && previousQuincenaInfo.sourceTxs.length > 0 && (
          <div className="flex items-center gap-2">
            {confirmingCopy ? (
              <div className="flex flex-wrap items-center gap-2 text-[13px] sm:text-xs bg-white dark:bg-[#0D2118] px-3 py-1.5 rounded-xl border border-emerald-950/12 dark:border-emerald-400/20 shadow-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  ¿Copiar {previousQuincenaInfo.sourceTxs.length} mov. de {previousQuincenaInfo.label}?
                </span>
                <button
                  type="button"
                  disabled={copying}
                  onClick={handleCopyPreviousQuincena}
                  className="px-3 py-1 font-bold text-white bg-gradient-to-b from-[#167A4B] to-[#0E5534] hover:from-[#12663F] hover:to-[#0A4127] disabled:opacity-60 rounded-lg whitespace-nowrap"
                >
                  {copying ? 'Copiando...' : 'Confirmar'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingCopy(false)}
                  className="px-2 py-1 font-bold sm:font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white whitespace-nowrap"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingCopy(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] sm:text-xs font-bold sm:font-semibold text-[#0B3B24] dark:text-emerald-200 bg-white dark:bg-[#0D2118] border border-emerald-900/15 dark:border-emerald-400/20 hover:border-emerald-800/30 dark:hover:border-emerald-400/40 hover:bg-emerald-50/50 dark:hover:bg-emerald-500/10 rounded-xl shadow-xs transition-all whitespace-nowrap shrink-0"
              >
                <Copy className="w-3.5 h-3.5 text-[#12663F] dark:text-emerald-400" />
                Copiar {previousQuincenaInfo.label}
              </button>
            )}
          </div>
        )}
      </div>

      {copyFeedback && (
        <div className="px-4 py-2.5 text-[13px] sm:text-xs font-semibold text-emerald-900 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/80 dark:border-emerald-400/25 rounded-xl shadow-xs flex items-center justify-between">
          <span>{copyFeedback}</span>
          <button
            type="button"
            onClick={() => setCopyFeedback(null)}
            className="font-bold hover:underline ml-4"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* 4-Column Unified KPI Strip (2x2 compact grid on mobile, 4-col on lg) */}
      <section
        aria-label="Resumen financiero del periodo"
        className="mf-card grid grid-cols-2 lg:grid-cols-4 overflow-hidden"
      >
        <div className="p-3 sm:p-4 lg:p-5 border-b border-r border-emerald-950/[0.08] dark:border-emerald-400/12 lg:border-b-0 bg-gradient-to-b from-emerald-50/40 dark:from-emerald-500/[0.07] to-transparent">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] sm:text-xs font-bold sm:font-semibold text-slate-700 sm:text-slate-500 dark:text-slate-300">
              Ingresos
            </p>
            <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-emerald-100/80 dark:bg-emerald-500/15 border border-emerald-200/70 dark:border-emerald-400/25 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
              <ArrowUpRight className="w-4 h-4" />
            </span>
          </div>
          {loadingData ? (
            <div className="h-6 sm:h-7 w-28 bg-slate-100 dark:bg-emerald-950/60 rounded mt-2 animate-pulse" />
          ) : (
            <p className="text-[15px] min-[400px]:text-base sm:text-2xl font-mono font-bold sm:font-semibold tracking-tight text-emerald-700 dark:text-emerald-400 tabular-nums mt-1 sm:mt-1.5 truncate">
              +{formatCurrency(kpis.income, currency)}
            </p>
          )}
          <p className="text-xs font-semibold sm:font-normal text-slate-600 sm:text-slate-500 dark:text-slate-400 mt-0.5 sm:mt-1">
            {kpis.incomeCount} {kpis.incomeCount === 1 ? 'registro' : 'registros'}
          </p>
        </div>

        <div className="p-3 sm:p-4 lg:p-5 border-b lg:border-b-0 lg:border-r border-emerald-950/[0.08] dark:border-emerald-400/12 bg-gradient-to-b from-rose-50/35 dark:from-rose-500/[0.07] to-transparent">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] sm:text-xs font-bold sm:font-semibold text-slate-700 sm:text-slate-500 dark:text-slate-300">
              Gastos
            </p>
            <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-rose-100/80 dark:bg-rose-500/15 border border-rose-200/70 dark:border-rose-400/25 text-rose-700 dark:text-rose-300 flex items-center justify-center shrink-0">
              <ArrowDownRight className="w-4 h-4" />
            </span>
          </div>
          {loadingData ? (
            <div className="h-6 sm:h-7 w-28 bg-slate-100 dark:bg-emerald-950/60 rounded mt-2 animate-pulse" />
          ) : (
            <p className="text-[15px] min-[400px]:text-base sm:text-2xl font-mono font-bold sm:font-semibold tracking-tight text-rose-700 dark:text-rose-400 tabular-nums mt-1 sm:mt-1.5 truncate">
              −{formatCurrency(kpis.expense, currency)}
            </p>
          )}
          <p className="text-xs font-semibold sm:font-normal text-slate-600 sm:text-slate-500 dark:text-slate-400 mt-0.5 sm:mt-1">
            {kpis.expenseCount} {kpis.expenseCount === 1 ? 'registro' : 'registros'}
          </p>
        </div>

        <div className="p-3 sm:p-4 lg:p-5 border-r border-emerald-950/[0.08] dark:border-emerald-400/12">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] sm:text-xs font-bold sm:font-semibold text-slate-700 sm:text-slate-500 dark:text-slate-300">
              Balance neto
            </p>
            <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-[#EEF6F1] dark:bg-emerald-500/15 border border-emerald-900/10 dark:border-emerald-400/20 text-[#0F5A36] dark:text-emerald-300 flex items-center justify-center shrink-0">
              <Wallet className="w-4 h-4" />
            </span>
          </div>
          {loadingData ? (
            <div className="h-6 sm:h-7 w-28 bg-slate-100 dark:bg-emerald-950/60 rounded mt-2 animate-pulse" />
          ) : (
            <p
              className={`text-[15px] min-[400px]:text-base sm:text-2xl font-mono font-bold sm:font-semibold tracking-tight tabular-nums mt-1 sm:mt-1.5 truncate ${
                kpis.net > 0
                  ? 'text-slate-900 dark:text-slate-100'
                  : kpis.net < 0
                    ? 'text-rose-700 dark:text-rose-400'
                    : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              {kpis.net > 0 ? '+' : kpis.net < 0 ? '−' : ''}
              {formatCurrency(Math.abs(kpis.net), currency)}
            </p>
          )}
          <p className="text-xs font-semibold sm:font-normal text-slate-600 sm:text-slate-500 dark:text-slate-400 mt-0.5 sm:mt-1 truncate">
            {netStatusLabel} · {formatShortMonthLabel(selectedMonth)}
          </p>
        </div>

        <div className="p-3 sm:p-4 lg:p-5 bg-gradient-to-b from-teal-50/30 dark:from-teal-500/[0.06] to-transparent">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] sm:text-xs font-bold sm:font-semibold text-slate-700 sm:text-slate-500 dark:text-slate-300">
              Tasa de ahorro
            </p>
            <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-teal-50 dark:bg-teal-500/15 border border-teal-200/70 dark:border-teal-400/25 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0">
              <Percent className="w-3.5 h-3.5" />
            </span>
          </div>
          {loadingData ? (
            <div className="h-6 sm:h-7 w-16 bg-slate-100 dark:bg-emerald-950/60 rounded mt-2 animate-pulse" />
          ) : (
            <p
              className={`text-lg sm:text-2xl font-mono font-bold sm:font-semibold tabular-nums mt-1 sm:mt-1.5 ${
                kpis.savingsRate >= 20
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : kpis.savingsRate < 0
                    ? 'text-rose-700 dark:text-rose-400'
                    : 'text-slate-900 dark:text-slate-100'
              }`}
            >
              {kpis.income > 0 ? `${kpis.savingsRate.toFixed(1)}%` : '0.0%'}
            </p>
          )}
          <p className="text-xs font-semibold sm:font-normal text-slate-600 sm:text-slate-500 dark:text-slate-400 mt-0.5 sm:mt-1 truncate">
            {kpis.income > 0 ? 'Sobre ingresos' : 'Sin ingresos'}
          </p>
        </div>
      </section>

      {/* Global Monthly Budget Section */}
      <section
        aria-label="Presupuesto mensual global"
        className="mf-card p-3.5 sm:p-5"
      >
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-[#EEF6F1] dark:bg-emerald-500/15 border border-emerald-900/10 dark:border-emerald-400/20 text-[#0F5A36] dark:text-emerald-300 flex items-center justify-center shrink-0">
              <Gauge className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-bold sm:font-semibold text-slate-900 dark:text-slate-100 leading-tight">
                Presupuesto mensual global
              </h2>
              <p className="text-[13px] sm:text-xs font-medium sm:font-normal text-slate-600 sm:text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                Gastos acumulados en {formatMonthLabel(selectedMonth)}
              </p>
            </div>
          </div>

          {!editingBudget && (
            <button
              type="button"
              onClick={openBudgetEditor}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] sm:text-xs font-bold sm:font-semibold text-[#0B3B24] dark:text-emerald-200 bg-[#F3F8F5] dark:bg-[#10291E] border border-emerald-900/15 dark:border-emerald-400/20 hover:bg-emerald-50 dark:hover:bg-emerald-500/15 hover:border-emerald-800/30 rounded-xl transition-all whitespace-nowrap shrink-0"
            >
              <Pencil className="w-3.5 h-3.5 text-[#12663F] dark:text-emerald-400" />
              {globalBudget > 0 ? 'Editar meta' : 'Definir meta'}
            </button>
          )}
        </div>

        {editingBudget ? (
          <form onSubmit={handleSaveGlobalBudget} className="mt-3.5 pt-3.5 border-t border-emerald-950/10 dark:border-emerald-400/15 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1 max-w-xs">
                <label
                  htmlFor="global-monthly-budget"
                  className="block text-sm sm:text-xs font-bold sm:font-medium text-slate-700 sm:text-slate-600 dark:text-slate-300 mb-1"
                >
                  Meta mensual de gastos ({currency})
                </label>
                <input
                  id="global-monthly-budget"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  max={VALIDATION_LIMITS.AMOUNT_MAX}
                  placeholder="Ej. 20000.00"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  className="w-full px-3.5 py-2 text-base sm:text-sm font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100 bg-white dark:bg-[#0D2118] border border-slate-300 dark:border-emerald-400/25 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/25 focus:border-[#12663F] dark:focus:border-emerald-400"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={savingBudget}
                  className="px-4 py-2 text-sm sm:text-xs font-bold text-white bg-[#12663F] hover:bg-[#0D4F30] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
                >
                  {savingBudget ? 'Guardando...' : 'Guardar meta'}
                </button>
                {globalBudget > 0 && (
                  <button
                    type="button"
                    disabled={savingBudget}
                    onClick={handleClearGlobalBudget}
                    className="px-3 py-2 text-sm sm:text-xs font-bold sm:font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/15 rounded-lg transition-colors whitespace-nowrap"
                  >
                    Quitar meta
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setEditingBudget(false)}
                  className="px-3 py-2 text-sm sm:text-xs font-bold sm:font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-emerald-400/10 rounded-lg transition-colors whitespace-nowrap"
                >
                  Cancelar
                </button>
              </div>
            </div>
            {budgetError && (
              <p role="alert" className="text-xs font-semibold text-rose-700 dark:text-rose-400">
                {budgetError}
              </p>
            )}
          </form>
        ) : globalBudget > 0 ? (
          <div className="mt-3.5 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-5 pt-3 border-t border-slate-100 dark:border-emerald-400/12">
              <div>
                <p className="text-[13px] sm:text-xs font-bold sm:font-normal text-slate-700 sm:text-slate-500 dark:text-slate-400">
                  Gastado
                </p>
                <p className="text-base sm:text-lg font-mono font-bold sm:font-semibold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">
                  {formatCurrency(monthExpenseTotal, currency)}
                </p>
                <p className="text-xs font-semibold sm:font-normal text-slate-600 sm:text-slate-500 dark:text-slate-400">
                  {budgetUsedPct.toFixed(1)}% usado
                </p>
              </div>
              <div>
                <p className="text-[13px] sm:text-xs font-bold sm:font-normal text-slate-700 sm:text-slate-500 dark:text-slate-400">
                  Meta mensual
                </p>
                <p className="text-base sm:text-lg font-mono font-bold sm:font-semibold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">
                  {formatCurrency(globalBudget, currency)}
                </p>
                <p className="text-xs font-semibold sm:font-normal text-slate-600 sm:text-slate-500 dark:text-slate-400">
                  Ref. Q: {formatCurrency(globalBudget / 2, currency)}
                </p>
              </div>
              <div className="col-span-2 sm:col-span-1 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-emerald-400/12 flex sm:block items-center justify-between">
                <div>
                  <p className="text-[13px] sm:text-xs font-bold sm:font-normal text-slate-700 sm:text-slate-500 dark:text-slate-400">
                    {budgetOver ? 'Excedido por' : 'Disponible'}
                  </p>
                  <p
                    className={`text-base sm:text-lg font-mono font-bold sm:font-semibold tabular-nums mt-0.5 ${
                      budgetOver
                        ? 'text-rose-700 dark:text-rose-400'
                        : budgetWarning
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {budgetOver ? '−' : ''}
                    {formatCurrency(Math.abs(budgetRemaining), currency)}
                  </p>
                </div>
                <p
                  className={`inline-flex items-center gap-1 text-xs font-bold sm:mt-0.5 ${
                    budgetOver
                      ? 'text-rose-700 dark:text-rose-400'
                      : budgetWarning
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-slate-600 sm:text-slate-500 dark:text-slate-400 sm:font-normal'
                  }`}
                >
                  {budgetOver && <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                  {budgetWarning && <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                  {budgetOver
                    ? 'Superado'
                    : budgetWarning
                      ? `Cerca del límite (≥${alertThresholdPct}%)`
                      : 'Dentro de meta'}
                </p>
              </div>
            </div>

            <div>
              <div
                className="h-3 w-full bg-emerald-950/[0.07] dark:bg-emerald-950/70 ring-1 ring-inset ring-emerald-950/[0.05] dark:ring-emerald-400/15 rounded-full overflow-hidden flex"
                role="progressbar"
                aria-valuenow={Math.round(budgetUsedPct)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Porcentaje del presupuesto mensual global gastado"
              >
                {budgetOver ? (
                  <div className="h-full w-full bg-gradient-to-r from-rose-600 to-rose-500 transition-all" />
                ) : (
                  <>
                    <div
                      className={`h-full transition-all ${
                        budgetWarning
                          ? 'bg-gradient-to-r from-amber-600 to-amber-500'
                          : 'bg-gradient-to-r from-[#0B4A2B] to-[#12663F] dark:from-emerald-600 dark:to-emerald-500'
                      }`}
                      style={{ width: `${q1BudgetSharePct}%` }}
                    />
                    <div
                      className={`h-full transition-all ${
                        budgetWarning
                          ? 'bg-gradient-to-r from-amber-400 to-amber-300'
                          : 'bg-gradient-to-r from-emerald-500 to-emerald-400 dark:from-emerald-400 dark:to-teal-300'
                      }`}
                      style={{ width: `${q2BudgetSharePct}%` }}
                    />
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 mt-2 text-[13px] sm:text-xs font-semibold sm:font-normal text-slate-600 sm:text-slate-500 dark:text-slate-400">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-mono tabular-nums">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${budgetOver ? 'bg-rose-600' : budgetWarning ? 'bg-amber-600' : 'bg-[#0F5A36] dark:bg-emerald-500'}`}
                      aria-hidden="true"
                    />
                    1ª Q: {formatCurrency(quincenaSummary.q1.expense, currency)}
                  </span>
                  <span aria-hidden="true" className="text-emerald-900/25 dark:text-emerald-400/30">
                    ·
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${budgetOver ? 'bg-rose-400' : budgetWarning ? 'bg-amber-400' : 'bg-emerald-500 dark:bg-teal-300'}`}
                      aria-hidden="true"
                    />
                    2ª Q: {formatCurrency(quincenaSummary.q2.expense, currency)}
                  </span>
                </div>
                <span className="font-mono font-bold tabular-nums text-slate-800 dark:text-slate-200">
                  {Math.round(budgetUsedPct)}% usado
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-3 pt-3 border-t border-emerald-950/10 dark:border-emerald-400/15 text-[13px] sm:text-xs font-medium sm:font-normal text-slate-700 sm:text-slate-600 dark:text-slate-300">
            <p>
              Aún no has configurado una meta global de gastos mensuales. En{' '}
              {formatMonthLabel(selectedMonth)} llevas{' '}
              <span className="font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {formatCurrency(monthExpenseTotal, currency)}
              </span>{' '}
              en gastos registrados.
            </p>
          </div>
        )}
      </section>

      {/* Main Analytical Split: 6-Month Bar Chart + Q1 vs Q2 Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 sm:gap-5 items-stretch">
        <section className="lg:col-span-7 mf-card p-3.5 sm:p-5 flex flex-col">
          <div className="flex items-center justify-between gap-3 mb-3.5 sm:mb-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 rounded-xl bg-[#EEF6F1] dark:bg-emerald-500/15 border border-emerald-900/10 dark:border-emerald-400/20 text-[#0F5A36] dark:text-emerald-300 flex items-center justify-center shrink-0">
                <BarChart3 className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-bold sm:font-semibold text-slate-900 dark:text-slate-100 leading-tight">
                  Flujo mensual
                </h2>
                <p className="text-[13px] sm:text-xs font-medium sm:font-normal text-slate-600 sm:text-slate-500 dark:text-slate-400 mt-0.5">
                  Ingresos vs. gastos (6 meses)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-[13px] sm:text-xs font-bold sm:font-medium text-slate-700 sm:text-slate-600 dark:text-slate-300 shrink-0">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#15803D] dark:bg-emerald-400 ring-2 ring-emerald-100 dark:ring-emerald-500/20" aria-hidden="true" />
                Ingresos
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-600 dark:bg-rose-400 ring-2 ring-rose-100 dark:ring-rose-500/20" aria-hidden="true" />
                Gastos
              </span>
            </div>
          </div>

          <div className="h-56 sm:h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={sixMonthData}
                margin={{ top: 6, right: 6, left: 0, bottom: 0 }}
                onClick={(state) => {
                  const clickedKey = (state as { activePayload?: { payload?: { monthKey?: string } }[] })
                    ?.activePayload?.[0]?.payload?.monthKey;
                  if (clickedKey) onSelectMonth(clickedKey);
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke={isDark ? '#183829' : '#E2ECE5'}
                />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: isDark ? '#94A3B8' : '#475569', fontSize: 12, fontWeight: 600 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  width={64}
                  tick={{
                    fill: isDark ? '#94A3B8' : '#475569',
                    fontSize: 11,
                    fontFamily: 'IBM Plex Mono',
                    fontWeight: 600,
                  }}
                  tickFormatter={(v) => formatCompactCurrency(Number(v), currency)}
                />
                <Tooltip
                  cursor={{ fill: isDark ? 'rgba(52, 211, 153, 0.08)' : '#F3F7F4' }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const row = payload[0].payload as {
                      ingresos: number;
                      gastos: number;
                      balance: number;
                    };
                    return (
                      <div className="bg-white dark:bg-[#0D2118] border border-emerald-950/15 dark:border-emerald-400/25 rounded-lg px-3 py-2 shadow-sm text-xs space-y-1">
                        <p className="font-bold text-slate-900 dark:text-slate-100">{label}</p>
                        <p className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                          Ingresos: +{formatCurrency(row.ingresos, currency)}
                        </p>
                        <p className="font-mono font-semibold tabular-nums text-rose-700 dark:text-rose-400">
                          Gastos: −{formatCurrency(row.gastos, currency)}
                        </p>
                        <p className="font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100 pt-1 border-t border-slate-100 dark:border-emerald-400/15">
                          Neto: {row.balance >= 0 ? '+' : '−'}
                          {formatCurrency(Math.abs(row.balance), currency)}
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="ingresos"
                  name="Ingresos"
                  fill={isDark ? '#10B981' : '#15803D'}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={26}
                />
                <Bar
                  dataKey="gastos"
                  name="Gastos"
                  fill={isDark ? '#FB7185' : '#E11D48'}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={26}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="lg:col-span-5 mf-card p-3.5 sm:p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-3.5">
              <span className="w-8 h-8 rounded-xl bg-[#EEF6F1] dark:bg-emerald-500/15 border border-emerald-900/10 dark:border-emerald-400/20 text-[#0F5A36] dark:text-emerald-300 flex items-center justify-center shrink-0">
                <CalendarRange className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-bold sm:font-semibold text-slate-900 dark:text-slate-100 leading-tight">
                  Comparativa quincenal
                </h2>
                <p className="text-[13px] sm:text-xs font-medium sm:font-normal text-slate-600 sm:text-slate-500 dark:text-slate-400 mt-0.5">
                  Desglose de {formatMonthLabel(selectedMonth)}
                </p>
              </div>
            </div>

            <div className="divide-y divide-emerald-950/[0.08] dark:divide-emerald-400/12">
              {([1, 2] as QuincenaNumber[]).map((q) => {
                const stats = q === 1 ? quincenaSummary.q1 : quincenaSummary.q2;
                const ratio =
                  stats.income > 0 ? Math.min(100, Math.round((stats.expense / stats.income) * 100)) : 0;
                const isSelected = selectedQuincena === q;

                return (
                  <div key={q} className="py-2.5 sm:py-3.5 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            q === 1 ? 'bg-[#0F5A36] dark:bg-emerald-400' : 'bg-emerald-500 dark:bg-teal-300'
                          }`}
                          aria-hidden="true"
                        />
                        <button
                          type="button"
                          onClick={() => onChangeQuincena(isSelected ? 'all' : q)}
                          className="text-[15px] sm:text-sm font-bold text-slate-900 dark:text-slate-100 hover:text-[#0F5132] dark:hover:text-emerald-300 transition-colors text-left"
                        >
                          {q === 1 ? '1ª Quincena' : '2ª Quincena'}
                        </button>
                        <span className="text-xs font-semibold sm:font-normal text-slate-600 sm:text-slate-500 dark:text-slate-400 truncate">
                          {getQuincenaRangeLabel(selectedMonth, q)} · {stats.count} mov.
                        </span>
                      </div>
                      <span
                        className={`text-[15px] sm:text-sm font-mono font-bold tabular-nums shrink-0 ${
                          stats.net >= 0
                            ? 'text-slate-900 dark:text-slate-100'
                            : 'text-rose-700 dark:text-rose-400'
                        }`}
                      >
                        {stats.net >= 0 ? '+' : '−'}
                        {formatCurrency(Math.abs(stats.net), currency)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[13px] sm:text-xs font-mono font-bold sm:font-medium tabular-nums mb-1.5">
                      <span className="text-emerald-700 dark:text-emerald-400">
                        +{formatCurrency(stats.income, currency)}
                      </span>
                      <span className="text-rose-700 dark:text-rose-400">
                        −{formatCurrency(stats.expense, currency)}
                      </span>
                    </div>

                    <div className="h-2 w-full bg-emerald-950/[0.07] dark:bg-emerald-950/70 ring-1 ring-inset ring-emerald-950/[0.04] dark:ring-emerald-400/15 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          stats.expense > stats.income && stats.expense > 0
                            ? 'bg-gradient-to-r from-rose-600 to-rose-500'
                            : 'bg-gradient-to-r from-[#0F5A36] to-[#10B981] dark:from-emerald-500 dark:to-teal-400'
                        }`}
                        style={{
                          width: `${stats.income > 0 ? ratio : stats.expense > 0 ? 100 : 0}%`,
                        }}
                      />
                    </div>
                    <p className="text-xs sm:text-[11px] font-semibold sm:font-normal text-slate-600 sm:text-slate-500 dark:text-slate-400 mt-1">
                      {stats.income > 0
                        ? `Gasto del ${Math.round((stats.expense / stats.income) * 100)}% sobre el ingreso`
                        : stats.expense > 0
                          ? 'Gastos registrados sin ingresos'
                          : 'Sin movimientos en esta quincena'}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-3 mt-3 border-t border-emerald-950/10 dark:border-emerald-400/15 flex items-center justify-between">
            <span className="text-[13px] sm:text-xs font-semibold sm:font-normal text-slate-600 sm:text-slate-500 dark:text-slate-400">
              Análisis por categoría
            </span>
            <button
              type="button"
              onClick={() => onNavigate('graficas')}
              className="inline-flex items-center gap-1 text-[13px] sm:text-xs font-bold text-[#12663F] dark:text-emerald-400 hover:underline whitespace-nowrap"
            >
              Ver gráficas
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </section>
      </div>

      {/* Recent Ledger Section (Ultra-compact mobile list + high-density desktop table) */}
      <section className="mf-card overflow-hidden">
        <div className="px-3 py-2.5 sm:px-5 sm:py-3 border-b border-emerald-950/[0.08] dark:border-emerald-400/15 flex items-center justify-between gap-2.5 bg-gradient-to-r from-[#F6FAF7] to-white dark:from-[#0E241A] dark:to-[#0B1D15]">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-white dark:bg-emerald-500/15 border border-emerald-900/12 dark:border-emerald-400/20 shadow-2xs text-[#0F5A36] dark:text-emerald-300 flex items-center justify-center shrink-0">
              <ReceiptText className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-bold sm:font-semibold text-slate-900 dark:text-slate-100 leading-tight">
                Movimientos recientes
              </h2>
              <p className="text-[12.5px] sm:text-xs font-medium sm:font-normal text-slate-600 sm:text-slate-500 dark:text-slate-400 leading-tight mt-0.5 truncate">
                {selectedQuincena === 'all'
                  ? formatMonthLabel(selectedMonth)
                  : `${selectedQuincena === 1 ? '1ª' : '2ª'} Quincena · ${formatMonthLabel(selectedMonth)}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('movimientos')}
            className="inline-flex items-center gap-1 text-[13px] sm:text-xs font-bold text-[#12663F] dark:text-emerald-400 hover:text-[#0B3B24] dark:hover:text-emerald-300 hover:underline whitespace-nowrap shrink-0"
          >
            Ver todos
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {loadingData ? (
          <div className="divide-y divide-slate-100 dark:divide-emerald-400/10">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="px-3 sm:px-4 py-2 flex items-center justify-between">
                <div className="h-3.5 w-44 bg-emerald-950/[0.06] dark:bg-emerald-950/60 rounded animate-pulse" />
                <div className="h-3.5 w-20 bg-emerald-950/[0.06] dark:bg-emerald-950/60 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : recentTransactions.length === 0 ? (
          <div className="px-4 py-7 text-center">
            <p className="text-base sm:text-sm font-bold text-slate-900 dark:text-slate-100">
              Aún no hay movimientos en este periodo
            </p>
            <p className="text-sm sm:text-xs font-medium sm:font-normal text-slate-600 sm:text-slate-500 dark:text-slate-400 mt-1 mb-3.5 max-w-md mx-auto">
              Registra tu primer ingreso quincenal o gasto para ver el balance en tiempo real.
            </p>
            <button
              type="button"
              onClick={onOpenNewTransaction}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm sm:text-xs font-bold text-white bg-gradient-to-b from-[#167A4B] to-[#0E5534] hover:from-[#12663F] hover:to-[#0A4127] shadow-xs shadow-emerald-950/20 rounded-xl transition-all whitespace-nowrap"
            >
              <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              Registrar primer movimiento
            </button>
          </div>
        ) : (
          <>
            {/* Mobile Compact Ledger Rows */}
            <ul className="sm:hidden divide-y divide-emerald-950/[0.06] dark:divide-emerald-400/10">
              {recentTransactions.map((tx) => {
                const catColor = categoryColorMap.get(tx.categoryId);
                return (
                  <li
                    key={tx.id}
                    onClick={() => onEditTransaction(tx)}
                    className="px-2.5 py-1.5 active:bg-emerald-50/50 dark:active:bg-emerald-500/10 cursor-pointer transition-colors flex items-center gap-2"
                  >
                    <span
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
                        tx.type === 'ingreso'
                          ? 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200/70 dark:border-emerald-400/25 text-emerald-700 dark:text-emerald-300'
                          : 'bg-rose-50 dark:bg-rose-500/15 border-rose-200/70 dark:border-rose-400/25 text-rose-700 dark:text-rose-300'
                      }`}
                      aria-hidden="true"
                    >
                      {tx.type === 'ingreso' ? (
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowDownRight className="w-3.5 h-3.5" />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[15px] font-bold text-slate-900 dark:text-slate-100 truncate leading-tight">
                          {tx.description}
                        </p>
                        <span
                          className={`text-[15px] font-mono font-bold tabular-nums whitespace-nowrap shrink-0 leading-tight ${
                            tx.type === 'ingreso'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-rose-700 dark:text-rose-400'
                          }`}
                        >
                          {tx.type === 'ingreso' ? '+' : '−'}
                          {formatCurrency(tx.amount, currency)}
                        </span>
                      </div>
                      <p className="text-[12.5px] font-semibold text-slate-600 dark:text-slate-400 truncate leading-tight mt-0.5 flex items-center gap-1.5">
                        {catColor && (
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: catColor }}
                            aria-hidden="true"
                          />
                        )}
                        <span className="truncate">
                          {formatShortDate(tx.date)} · {tx.categoryName} · {tx.quincena === 1 ? '1ª Q' : '2ª Q'}
                        </span>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Desktop High-Density Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-emerald-950/[0.08] dark:border-emerald-400/15 bg-[#F4F8F5] dark:bg-[#0F261B] text-xs font-semibold text-emerald-950/70 dark:text-emerald-200/80">
                    <th className="py-2 pl-5 pr-2">Fecha</th>
                    <th className="py-2 px-2">Concepto</th>
                    <th className="py-2 px-2">Categoría</th>
                    <th className="py-2 px-2">Periodo</th>
                    <th className="py-2 pl-2 pr-5 text-right">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-950/[0.06] dark:divide-emerald-400/10 text-sm">
                  {recentTransactions.map((tx) => {
                    const catColor = categoryColorMap.get(tx.categoryId);
                    return (
                      <tr
                        key={tx.id}
                        onClick={() => onEditTransaction(tx)}
                        className="hover:bg-[#F5FAF7] dark:hover:bg-emerald-400/[0.06] cursor-pointer transition-colors"
                      >
                        <td className="py-2 pl-5 pr-2 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {formatShortDate(tx.date)}
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
                                tx.type === 'ingreso'
                                  ? 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200/70 dark:border-emerald-400/25 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-rose-50 dark:bg-rose-500/15 border-rose-200/70 dark:border-rose-400/25 text-rose-700 dark:text-rose-300'
                              }`}
                              aria-hidden="true"
                            >
                              {tx.type === 'ingreso' ? (
                                <ArrowUpRight className="w-3.5 h-3.5" />
                              ) : (
                                <ArrowDownRight className="w-3.5 h-3.5" />
                              )}
                            </span>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 dark:text-slate-100 truncate max-w-xs leading-tight">
                                {tx.description}
                              </p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5 truncate max-w-xs">
                                {getPaymentMethodLabel(tx.paymentMethod)}
                                {tx.notes ? ` · ${tx.notes}` : ''}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-2 px-2 text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className="w-2.5 h-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/20 shrink-0"
                              style={{ backgroundColor: catColor ?? '#64748B' }}
                              aria-hidden="true"
                            />
                            {tx.categoryName}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {tx.quincena === 1 ? '1ª Quincena' : '2ª Quincena'}
                        </td>
                        <td
                          className={`py-2 pl-2 pr-5 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${
                            tx.type === 'ingreso'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-rose-700 dark:text-rose-400'
                          }`}
                        >
                          {tx.type === 'ingreso' ? '+' : '−'}
                          {formatCurrency(tx.amount, currency)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
