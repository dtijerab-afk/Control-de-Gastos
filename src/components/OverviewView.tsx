import React, { useMemo, useState } from 'react';
import { ArrowRight, Copy, Pencil, Plus } from 'lucide-react';
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
  onChangeQuincena: (q: QuincenaFilter) => void;
  onSelectMonth: (monthKey: string) => void;
  onNavigate: (section: NavSection) => void;
  onOpenNewTransaction: () => void;
  onEditTransaction: (tx: Transaction) => void;
}

export function OverviewView({
  selectedMonth,
  selectedQuincena,
  onChangeQuincena,
  onSelectMonth,
  onNavigate,
  onOpenNewTransaction,
  onEditTransaction,
}: OverviewViewProps) {
  const { user, profile, transactions, categories, currency, loadingData } = useFinance();
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
  const budgetWarning = globalBudget > 0 && !budgetOver && budgetUsedPct >= 85;
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
    <div className="space-y-6">
      {/* Period Selector Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="inline-flex items-center gap-1 p-1 bg-emerald-950/[0.06] rounded-lg w-fit">
          <button
            type="button"
            onClick={() => {
              onChangeQuincena('all');
              setConfirmingCopy(false);
              setCopyFeedback(null);
            }}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              selectedQuincena === 'all'
                ? 'bg-white text-[#0B3B24] shadow-xs'
                : 'text-slate-600 hover:text-[#0B3B24]'
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
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              selectedQuincena === 1
                ? 'bg-white text-[#0B3B24] shadow-xs'
                : 'text-slate-600 hover:text-[#0B3B24]'
            }`}
          >
            1ª Quincena ({getQuincenaRangeLabel(selectedMonth, 1)})
          </button>
          <button
            type="button"
            onClick={() => {
              onChangeQuincena(2);
              setConfirmingCopy(false);
              setCopyFeedback(null);
            }}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              selectedQuincena === 2
                ? 'bg-white text-[#0B3B24] shadow-xs'
                : 'text-slate-600 hover:text-[#0B3B24]'
            }`}
          >
            2ª Quincena ({getQuincenaRangeLabel(selectedMonth, 2)})
          </button>
        </div>

        {previousQuincenaInfo && previousQuincenaInfo.sourceTxs.length > 0 && (
          <div className="flex items-center gap-2">
            {confirmingCopy ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-600">
                  ¿Copiar {previousQuincenaInfo.sourceTxs.length} mov. de {previousQuincenaInfo.label}?
                </span>
                <button
                  type="button"
                  disabled={copying}
                  onClick={handleCopyPreviousQuincena}
                  className="px-3 py-1.5 font-medium text-white bg-[#12663F] hover:bg-[#0D4F30] disabled:opacity-60 rounded-md whitespace-nowrap"
                >
                  {copying ? 'Copiando...' : 'Confirmar'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingCopy(false)}
                  className="px-2.5 py-1.5 font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingCopy(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#0B3B24] bg-white border border-emerald-900/15 hover:border-emerald-900/30 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Copy className="w-3.5 h-3.5 text-emerald-700" />
                Copiar {previousQuincenaInfo.label}
              </button>
            )}
          </div>
        )}
      </div>

      {copyFeedback && (
        <div className="px-4 py-2.5 text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between">
          <span>{copyFeedback}</span>
          <button
            type="button"
            onClick={() => setCopyFeedback(null)}
            className="font-medium hover:underline ml-4"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* 4-Column Unified KPI Strip (Single elevation, hairline dividers, zero nested cards) */}
      <section
        aria-label="Resumen financiero del periodo"
        className="bg-white border border-emerald-950/10 rounded-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-emerald-950/10"
      >
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Ingresos</p>
          {loadingData ? (
            <div className="h-7 w-32 bg-slate-100 rounded mt-2 animate-pulse" />
          ) : (
            <p className="text-2xl font-mono font-semibold text-emerald-700 tabular-nums mt-1.5">
              +{formatCurrency(kpis.income, currency)}
            </p>
          )}
          <p className="text-xs text-slate-500 mt-1.5">
            {kpis.incomeCount} {kpis.incomeCount === 1 ? 'registro' : 'registros'}
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Gastos</p>
          {loadingData ? (
            <div className="h-7 w-32 bg-slate-100 rounded mt-2 animate-pulse" />
          ) : (
            <p className="text-2xl font-mono font-semibold text-rose-700 tabular-nums mt-1.5">
              −{formatCurrency(kpis.expense, currency)}
            </p>
          )}
          <p className="text-xs text-slate-500 mt-1.5">
            {kpis.expenseCount} {kpis.expenseCount === 1 ? 'registro' : 'registros'}
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Balance neto</p>
          {loadingData ? (
            <div className="h-7 w-32 bg-slate-100 rounded mt-2 animate-pulse" />
          ) : (
            <p
              className={`text-2xl font-mono font-semibold tabular-nums mt-1.5 ${
                kpis.net > 0
                  ? 'text-slate-900'
                  : kpis.net < 0
                    ? 'text-rose-700'
                    : 'text-slate-700'
              }`}
            >
              {kpis.net > 0 ? '+' : kpis.net < 0 ? '−' : ''}
              {formatCurrency(Math.abs(kpis.net), currency)}
            </p>
          )}
          <p className="text-xs text-slate-500 mt-1.5">
            {netStatusLabel} · {formatMonthLabel(selectedMonth)}
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Tasa de ahorro</p>
          {loadingData ? (
            <div className="h-7 w-20 bg-slate-100 rounded mt-2 animate-pulse" />
          ) : (
            <p
              className={`text-2xl font-mono font-semibold tabular-nums mt-1.5 ${
                kpis.savingsRate >= 20
                  ? 'text-emerald-700'
                  : kpis.savingsRate < 0
                    ? 'text-rose-700'
                    : 'text-slate-900'
              }`}
            >
              {kpis.income > 0 ? `${kpis.savingsRate.toFixed(1)}%` : '0.0%'}
            </p>
          )}
          <p className="text-xs text-slate-500 mt-1.5">
            {kpis.income > 0 ? 'Sobre ingresos del periodo' : 'Sin ingresos registrados'}
          </p>
        </div>
      </section>

      {/* Global Monthly Budget Section */}
      <section
        aria-label="Presupuesto mensual global"
        className="bg-white border border-emerald-950/10 rounded-xl p-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Presupuesto mensual global</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Seguimiento de gastos acumulados en {formatMonthLabel(selectedMonth)} respecto a tu
              meta mensual
            </p>
          </div>

          {!editingBudget && (
            <button
              type="button"
              onClick={openBudgetEditor}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#0B3B24] bg-[#F3F7F4] border border-emerald-900/15 hover:bg-emerald-50 rounded-lg transition-colors whitespace-nowrap shrink-0 w-fit"
            >
              <Pencil className="w-3.5 h-3.5 text-[#12663F]" />
              {globalBudget > 0 ? 'Editar meta' : 'Definir meta mensual'}
            </button>
          )}
        </div>

        {editingBudget ? (
          <form onSubmit={handleSaveGlobalBudget} className="mt-5 pt-5 border-t border-emerald-950/10 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1 max-w-xs">
                <label
                  htmlFor="global-monthly-budget"
                  className="block text-xs font-medium text-slate-600 mb-1.5"
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
                  className="w-full px-3.5 py-2 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/25 focus:border-[#12663F]"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={savingBudget}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#12663F] hover:bg-[#0D4F30] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
                >
                  {savingBudget ? 'Guardando...' : 'Guardar meta'}
                </button>
                {globalBudget > 0 && (
                  <button
                    type="button"
                    disabled={savingBudget}
                    onClick={handleClearGlobalBudget}
                    className="px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-lg transition-colors whitespace-nowrap"
                  >
                    Quitar meta
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setEditingBudget(false)}
                  className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap"
                >
                  Cancelar
                </button>
              </div>
            </div>
            {budgetError && (
              <p role="alert" className="text-xs text-rose-700">
                {budgetError}
              </p>
            )}
          </form>
        ) : globalBudget > 0 ? (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 pt-4 border-t border-slate-100">
              <div>
                <p className="text-xs text-slate-500">Gastado en el mes</p>
                <p className="text-lg font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                  {formatCurrency(monthExpenseTotal, currency)}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {budgetUsedPct.toFixed(1)}% de la meta utilizada
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Meta mensual</p>
                <p className="text-lg font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                  {formatCurrency(globalBudget, currency)}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Referencia quincenal: {formatCurrency(globalBudget / 2, currency)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">
                  {budgetOver ? 'Excedido por' : 'Disponible'}
                </p>
                <p
                  className={`text-lg font-mono font-semibold tabular-nums mt-0.5 ${
                    budgetOver
                      ? 'text-rose-700'
                      : budgetWarning
                        ? 'text-amber-700'
                        : 'text-emerald-700'
                  }`}
                >
                  {budgetOver ? '−' : ''}
                  {formatCurrency(Math.abs(budgetRemaining), currency)}
                </p>
                <p
                  className={`text-xs mt-0.5 ${
                    budgetOver
                      ? 'text-rose-700 font-medium'
                      : budgetWarning
                        ? 'text-amber-700'
                        : 'text-slate-500'
                  }`}
                >
                  {budgetOver
                    ? 'Presupuesto mensual superado'
                    : budgetWarning
                      ? 'Cerca del límite mensual'
                      : 'Dentro del presupuesto'}
                </p>
              </div>
            </div>

            <div>
              <div
                className="h-2.5 w-full bg-emerald-950/[0.07] rounded-full overflow-hidden flex"
                role="progressbar"
                aria-valuenow={Math.round(budgetUsedPct)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Porcentaje del presupuesto mensual global gastado"
              >
                {budgetOver ? (
                  <div className="h-full w-full bg-rose-600 transition-all" />
                ) : (
                  <>
                    <div
                      className={`h-full transition-all ${
                        budgetWarning ? 'bg-amber-600' : 'bg-[#12663F]'
                      }`}
                      style={{ width: `${q1BudgetSharePct}%` }}
                    />
                    <div
                      className={`h-full transition-all ${
                        budgetWarning ? 'bg-amber-400' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${q2BudgetSharePct}%` }}
                    />
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 mt-2 text-xs text-slate-500">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono tabular-nums">
                  <span>1ª Q: {formatCurrency(quincenaSummary.q1.expense, currency)}</span>
                  <span aria-hidden="true" className="text-emerald-900/25">
                    ·
                  </span>
                  <span>2ª Q: {formatCurrency(quincenaSummary.q2.expense, currency)}</span>
                </div>
                <span className="font-mono tabular-nums text-slate-700">
                  {Math.round(budgetUsedPct)}% usado
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 pt-4 border-t border-emerald-950/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600">
            <p>
              Aún no has configurado una meta global de gastos mensuales. En{' '}
              {formatMonthLabel(selectedMonth)} llevas{' '}
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {formatCurrency(monthExpenseTotal, currency)}
              </span>{' '}
              en gastos registrados.
            </p>
          </div>
        )}
      </section>

      {/* Main Analytical Split: 6-Month Bar Chart + Q1 vs Q2 Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <section className="lg:col-span-7 bg-white border border-emerald-950/10 rounded-xl p-6 flex flex-col">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Flujo mensual</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Ingresos frente a gastos en los últimos 6 meses
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-600 shrink-0">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#15803D]" aria-hidden="true" />
                Ingresos
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-rose-600/80" aria-hidden="true" />
                Gastos
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={sixMonthData}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                onClick={(state) => {
                  const clickedKey = (state as { activePayload?: { payload?: { monthKey?: string } }[] })
                    ?.activePayload?.[0]?.payload?.monthKey;
                  if (clickedKey) onSelectMonth(clickedKey);
                }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2ECE5" />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748B', fontSize: 12 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  width={68}
                  tick={{ fill: '#64748B', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                  tickFormatter={(v) => formatCompactCurrency(Number(v), currency)}
                />
                <Tooltip
                  cursor={{ fill: '#F3F7F4' }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const row = payload[0].payload as {
                      ingresos: number;
                      gastos: number;
                      balance: number;
                    };
                    return (
                      <div className="bg-white border border-emerald-950/15 rounded-lg px-3.5 py-2.5 shadow-sm text-xs space-y-1">
                        <p className="font-semibold text-slate-900">{label}</p>
                        <p className="font-mono tabular-nums text-emerald-700">
                          Ingresos: +{formatCurrency(row.ingresos, currency)}
                        </p>
                        <p className="font-mono tabular-nums text-rose-700">
                          Gastos: −{formatCurrency(row.gastos, currency)}
                        </p>
                        <p className="font-mono tabular-nums text-slate-900 pt-1 border-t border-slate-100">
                          Neto: {row.balance >= 0 ? '+' : '−'}
                          {formatCurrency(Math.abs(row.balance), currency)}
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="ingresos" name="Ingresos" fill="#15803D" radius={[4, 4, 0, 0]} maxBarSize={26} />
                <Bar dataKey="gastos" name="Gastos" fill="#E11D48" radius={[4, 4, 0, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="lg:col-span-5 bg-white border border-emerald-950/10 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="mb-5">
              <h2 className="text-base font-semibold text-slate-900">Comparativa quincenal</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Desglose de {formatMonthLabel(selectedMonth)} por quincena
              </p>
            </div>

            <div className="divide-y divide-slate-200">
              {([1, 2] as QuincenaNumber[]).map((q) => {
                const stats = q === 1 ? quincenaSummary.q1 : quincenaSummary.q2;
                const ratio =
                  stats.income > 0 ? Math.min(100, Math.round((stats.expense / stats.income) * 100)) : 0;
                const isSelected = selectedQuincena === q;

                return (
                  <div key={q} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div>
                        <button
                          type="button"
                          onClick={() => onChangeQuincena(isSelected ? 'all' : q)}
                          className="text-sm font-semibold text-slate-900 hover:text-[#0F5132] transition-colors text-left"
                        >
                          {q === 1 ? '1ª Quincena' : '2ª Quincena'}
                        </button>
                        <span className="text-xs text-slate-500 ml-2">
                          {getQuincenaRangeLabel(selectedMonth, q)} · {stats.count} mov.
                        </span>
                      </div>
                      <span
                        className={`text-sm font-mono font-semibold tabular-nums ${
                          stats.net >= 0 ? 'text-slate-900' : 'text-rose-700'
                        }`}
                      >
                        {stats.net >= 0 ? '+' : '−'}
                        {formatCurrency(Math.abs(stats.net), currency)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs font-mono tabular-nums mb-2">
                      <span className="text-emerald-700">
                        Ingresos: +{formatCurrency(stats.income, currency)}
                      </span>
                      <span className="text-rose-700">
                        Gastos: −{formatCurrency(stats.expense, currency)}
                      </span>
                    </div>

                    <div className="h-1.5 w-full bg-emerald-950/[0.07] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          stats.expense > stats.income && stats.expense > 0
                            ? 'bg-rose-600'
                            : 'bg-[#12663F]'
                        }`}
                        style={{
                          width: `${stats.income > 0 ? ratio : stats.expense > 0 ? 100 : 0}%`,
                        }}
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1.5">
                      {stats.income > 0
                        ? `Gasto equivalente al ${Math.round((stats.expense / stats.income) * 100)}% del ingreso de esta quincena`
                        : stats.expense > 0
                          ? 'Gastos registrados sin ingresos en esta quincena'
                          : 'Sin movimientos en esta quincena'}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-5 mt-5 border-t border-emerald-950/10 flex items-center justify-between">
            <span className="text-xs text-slate-500">Análisis detallado por categoría</span>
            <button
              type="button"
              onClick={() => onNavigate('graficas')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#12663F] hover:underline whitespace-nowrap"
            >
              Ver gráficas
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </section>
      </div>

      {/* Recent Ledger Table */}
      <section className="bg-white border border-emerald-950/10 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-emerald-950/10 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Movimientos recientes</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {selectedQuincena === 'all'
                ? formatMonthLabel(selectedMonth)
                : `${selectedQuincena === 1 ? '1ª' : '2ª'} Quincena de ${formatMonthLabel(selectedMonth)}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('movimientos')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#12663F] hover:underline whitespace-nowrap shrink-0"
          >
            Ver todos
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {loadingData ? (
          <div className="divide-y divide-slate-100">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="px-6 py-3.5 flex items-center justify-between">
                <div className="h-4 w-56 bg-emerald-950/[0.06] rounded animate-pulse" />
                <div className="h-4 w-24 bg-emerald-950/[0.06] rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : recentTransactions.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate-900">
              Aún no hay movimientos en este periodo
            </p>
            <p className="text-xs text-slate-500 mt-1 mb-5 max-w-md mx-auto">
              Registra tu primer ingreso quincenal o gasto para ver el balance en tiempo real y
              alimentar tus gráficas mensuales.
            </p>
            <button
              type="button"
              onClick={onOpenNewTransaction}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#12663F] hover:bg-[#0D4F30] rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Registrar primer movimiento
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-emerald-950/10 bg-[#F4F8F5] text-xs font-medium text-emerald-950/65">
                  <th className="py-2.5 pl-6 pr-3">Fecha</th>
                  <th className="py-2.5 px-3">Concepto</th>
                  <th className="py-2.5 px-3">Categoría</th>
                  <th className="py-2.5 px-3">Periodo</th>
                  <th className="py-2.5 pl-3 pr-6 text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {recentTransactions.map((tx) => (
                  <tr
                    key={tx.id}
                    onClick={() => onEditTransaction(tx)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="py-3 pl-6 pr-3 text-xs font-mono tabular-nums text-slate-500 whitespace-nowrap">
                      {formatShortDate(tx.date)}
                    </td>
                    <td className="py-3 px-3">
                      <p className="font-medium text-slate-900 truncate max-w-xs">{tx.description}</p>
                      <p className="text-xs text-slate-500">
                        {getPaymentMethodLabel(tx.paymentMethod)}
                        {tx.notes ? ` · ${tx.notes}` : ''}
                      </p>
                    </td>
                    <td className="py-3 px-3 text-xs text-slate-600 whitespace-nowrap">
                      {tx.categoryName}
                    </td>
                    <td className="py-3 px-3 text-xs text-slate-500 whitespace-nowrap">
                      {tx.quincena === 1 ? '1ª Quincena' : '2ª Quincena'}
                    </td>
                    <td
                      className={`py-3 pl-3 pr-6 text-right font-mono font-medium tabular-nums whitespace-nowrap ${
                        tx.type === 'ingreso' ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {tx.type === 'ingreso' ? '+' : '−'}
                      {formatCurrency(tx.amount, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
