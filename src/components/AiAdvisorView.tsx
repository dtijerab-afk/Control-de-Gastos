import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  FileText,
  PiggyBank,
  RefreshCw,
  Send,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import {
  askFinancialAdvisor,
  fetchFinancialInsights,
  type FinancialInsightsResult,
  type FinancialSnapshotPayload,
} from '../lib/aiClient';
import { computeDebtStatus, loadDebtsState } from '../lib/debtsStore';
import { formatCurrency, formatMonthLabel } from '../lib/financeUtils';
import { computeMonthlySavingsSummary, loadSavingsPlan } from '../lib/savingsPlan';
import type { NavSection } from '../types/finance';

interface AiAdvisorViewProps {
  selectedMonth: string;
  onNavigate: (section: NavSection) => void;
}

interface QaMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

const QUICK_QUESTIONS = [
  '¿Cómo puedo reducir mis deudas más rápido con mis ingresos actuales?',
  '¿En qué categoría estoy gastando de más este mes?',
  '¿Cómo reparto mejor mis pagos entre la 1ª quincena (15–16) y la 2ª (30–1)?',
  '¿Voy a buen ritmo con mi plan de ahorro este mes?',
] as const;

export function AiAdvisorView({ selectedMonth, onNavigate }: AiAdvisorViewProps) {
  const { user, profile, transactions, categories, currency } = useFinance();

  const [insights, setInsights] = useState<FinancialInsightsResult | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  const [messages, setMessages] = useState<QaMessage[]>([]);
  const [questionInput, setQuestionInput] = useState('');
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  const snapshot = useMemo<FinancialSnapshotPayload>(() => {
    const monthTxs = transactions.filter((t) => t.monthKey === selectedMonth);
    let monthIncome = 0;
    let monthExpense = 0;
    let q1Income = 0;
    let q1Expense = 0;
    let q2Income = 0;
    let q2Expense = 0;

    const spentByCat = new Map<string, { name: string; spent: number; budget: number }>();
    const budgetMap = new Map<string, number>();
    for (const c of categories) {
      budgetMap.set(c.id, c.monthlyBudget);
    }

    for (const tx of monthTxs) {
      if (tx.type === 'ingreso') {
        monthIncome += tx.amount;
        if (tx.quincena === 1) q1Income += tx.amount;
        else q2Income += tx.amount;
      } else {
        monthExpense += tx.amount;
        if (tx.quincena === 1) q1Expense += tx.amount;
        else q2Expense += tx.amount;
        const prev = spentByCat.get(tx.categoryId);
        spentByCat.set(tx.categoryId, {
          name: tx.categoryName,
          spent: (prev?.spent ?? 0) + tx.amount,
          budget: budgetMap.get(tx.categoryId) ?? 0,
        });
      }
    }

    const topExpenseCategories = Array.from(spentByCat.values())
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 8)
      .map((item) => ({
        name: item.name,
        spent: Math.round(item.spent * 100) / 100,
        budget: Math.round(item.budget * 100) / 100,
      }));

    const debtsState = user ? loadDebtsState(user.uid) : { debts: [], updatedAt: '' };
    const debts = debtsState.debts
      .filter((d) => d.remainingAmount > 0)
      .map((d) => {
        const st = computeDebtStatus(d, selectedMonth);
        return {
          name: d.name,
          institution: d.institution,
          remainingAmount: d.remainingAmount,
          monthlyPayment: d.monthlyPayment,
          interestRate: d.interestRate,
          dueDay: d.dueDay,
          nextDueDate: st.dueDateForMonth,
          status: st.status,
        };
      });

    const savingsPlan = user ? loadSavingsPlan(user.uid) : loadSavingsPlan('');
    const savingsSummary = computeMonthlySavingsSummary({
      monthKey: selectedMonth,
      transactions,
      categories,
      monthlyRule: savingsPlan.monthlyRule,
    });
    const totalGoalRemaining = savingsPlan.goals.reduce(
      (acc, g) => acc + Math.max(0, g.targetAmount - g.savedAmount),
      0
    );

    return {
      selectedMonth,
      currency,
      monthIncome: Math.round(monthIncome * 100) / 100,
      monthExpense: Math.round(monthExpense * 100) / 100,
      netBalance: Math.round((monthIncome - monthExpense) * 100) / 100,
      q1Income: Math.round(q1Income * 100) / 100,
      q1Expense: Math.round(q1Expense * 100) / 100,
      q2Income: Math.round(q2Income * 100) / 100,
      q2Expense: Math.round(q2Expense * 100) / 100,
      globalBudget: profile?.monthlyBudget ?? 0,
      topExpenseCategories,
      debts,
      savingsPlan: {
        monthlyTarget: Math.round(savingsSummary.monthlyTargetAmount * 100) / 100,
        effectiveMonthlySaved: Math.round(savingsSummary.effectiveMonthlySaved * 100) / 100,
        goalsCount: savingsPlan.goals.length,
        totalGoalRemaining: Math.round(totalGoalRemaining * 100) / 100,
      },
    };
  }, [user, profile?.monthlyBudget, selectedMonth, transactions, categories, currency]);

  const totalDebtRemaining = useMemo(
    () => snapshot.debts.reduce((acc, d) => acc + d.remainingAmount, 0),
    [snapshot.debts]
  );

  const handleGenerateInsights = async () => {
    setLoadingInsights(true);
    setInsightsError(null);
    try {
      const result = await fetchFinancialInsights(snapshot);
      setInsights(result);
    } catch (err) {
      setInsightsError(
        err instanceof Error ? err.message : 'No se pudo generar el diagnóstico financiero.'
      );
    } finally {
      setLoadingInsights(false);
    }
  };

  const handleAsk = async (rawQuestion: string) => {
    const q = rawQuestion.trim();
    if (!q || asking) return;
    setAskError(null);
    setQuestionInput('');

    const userMsg: QaMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: q,
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setAsking(true);

    try {
      const res = await askFinancialAdvisor({
        question: q,
        snapshot,
        history: messages.map((m) => ({ role: m.role, text: m.text })),
      });
      setMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: 'assistant',
          text: res.answer || 'No se recibió respuesta del asesor.',
        },
      ]);
    } catch (err) {
      setAskError(err instanceof Error ? err.message : 'No se pudo completar la consulta.');
    } finally {
      setAsking(false);
    }
  };

  const handleSubmitQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    void handleAsk(questionInput);
  };

  const areaIcon = (area: string) => {
    if (area === 'deudas') return CreditCard;
    if (area === 'ahorro') return PiggyBank;
    if (area === 'quincenas') return CalendarClock;
    return Wallet;
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Real Data Context Strip */}
      <section className="mf-card grid grid-cols-2 lg:grid-cols-4 overflow-hidden">
        <div className="p-3 sm:p-4 border-b border-r border-emerald-950/[0.08] dark:border-emerald-400/12 lg:border-b-0">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Periodo analizado
          </p>
          <p className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 mt-1 truncate">
            {formatMonthLabel(selectedMonth)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums truncate">
            Balance {snapshot.netBalance >= 0 ? '+' : '−'}
            {formatCurrency(Math.abs(snapshot.netBalance), currency)}
          </p>
        </div>

        <div className="p-3 sm:p-4 border-b lg:border-b-0 lg:border-r border-emerald-950/[0.08] dark:border-emerald-400/12">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Flujo del mes
          </p>
          <p className="text-[15px] sm:text-lg font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums mt-1 truncate">
            +{formatCurrency(snapshot.monthIncome, currency)}
          </p>
          <p className="text-xs text-rose-700 dark:text-rose-400 mt-0.5 font-mono tabular-nums truncate">
            Gastos −{formatCurrency(snapshot.monthExpense, currency)}
          </p>
        </div>

        <div className="p-3 sm:p-4 border-r border-emerald-950/[0.08] dark:border-emerald-400/12">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Deudas activas
          </p>
          <p className="text-[15px] sm:text-lg font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-1 truncate">
            {formatCurrency(totalDebtRemaining, currency)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {snapshot.debts.length} {snapshot.debts.length === 1 ? 'compromiso' : 'compromisos'}
          </p>
        </div>

        <div className="p-3 sm:p-4">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Meta de ahorro mensual
          </p>
          <p className="text-[15px] sm:text-lg font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-1 truncate">
            {formatCurrency(snapshot.savingsPlan.monthlyTarget, currency)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums truncate">
            Logrado {formatCurrency(snapshot.savingsPlan.effectiveMonthlySaved, currency)}
          </p>
        </div>
      </section>

      {/* Diagnóstico Inteligente del Mes */}
      <section className="mf-card overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-emerald-950/[0.08] dark:border-emerald-400/12 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-[#EEF6F1] dark:bg-emerald-500/15 border border-emerald-900/10 dark:border-emerald-400/20 text-[#0F5A36] dark:text-emerald-300 flex items-center justify-center shrink-0">
              <BrainCircuit className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 font-display leading-tight">
                Análisis financiero
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Analiza tus quincenas (15–16 y 30–1), presupuestos, deudas y plan de ahorro de{' '}
                {formatMonthLabel(selectedMonth)}.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={loadingInsights}
            onClick={handleGenerateInsights}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-white bg-gradient-to-b from-[#157548] to-[#0F5A36] hover:from-[#12663F] hover:to-[#0B472A] dark:from-emerald-500 dark:to-emerald-600 dark:text-[#041A10] disabled:opacity-60 rounded-xl shadow-xs transition-all whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingInsights ? 'animate-spin' : ''}`} />
            {loadingInsights
              ? 'Analizando...'
              : insights
                ? 'Actualizar diagnóstico'
                : 'Generar diagnóstico'}
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {insightsError && (
            <div className="px-3.5 py-2.5 text-xs font-semibold text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-500/30 rounded-xl flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{insightsError}</span>
            </div>
          )}

          {!insights && !loadingInsights && (
            <div className="py-5 text-center space-y-2">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                Obtén un plan de acción basado en tus números reales
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg mx-auto leading-relaxed">
                Presiona <span className="font-semibold">Generar diagnóstico</span> para evaluar tu
                balance mensual, detectar fugas de gasto, ordenar el pago de tus deudas y equilibrar
                ambas quincenas.
              </p>
            </div>
          )}

          {loadingInsights && (
            <div className="space-y-3 py-2">
              <div className="h-5 w-2/3 bg-emerald-950/[0.06] dark:bg-emerald-400/10 rounded animate-pulse" />
              <div className="h-4 w-full bg-emerald-950/[0.06] dark:bg-emerald-400/10 rounded animate-pulse" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div className="h-24 bg-emerald-950/[0.05] dark:bg-emerald-400/[0.08] rounded-xl animate-pulse" />
                <div className="h-24 bg-emerald-950/[0.05] dark:bg-emerald-400/[0.08] rounded-xl animate-pulse" />
              </div>
            </div>
          )}

          {insights && !loadingInsights && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#F4F9F5] dark:bg-[#0D2118] border border-emerald-900/10 dark:border-emerald-400/15 space-y-1.5">
                <p className="text-sm sm:text-base font-bold text-[#0B3B24] dark:text-emerald-200 font-display">
                  {insights.headline}
                </p>
                <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  {insights.healthSummary}
                </p>
              </div>

              {Array.isArray(insights.priorityActions) && insights.priorityActions.length > 0 && (
                <div className="space-y-2.5">
                  <h3 className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    Acciones prioritarias recomendadas
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {insights.priorityActions.map((act, idx) => {
                      const Icon = areaIcon(act.area);
                      return (
                        <div
                          key={`${act.title}-${idx}`}
                          className="p-3.5 rounded-xl bg-white dark:bg-[#0D2118] border border-emerald-950/[0.08] dark:border-emerald-400/15 space-y-1.5"
                        >
                          <div className="flex items-start gap-2.5">
                            <span className="w-7 h-7 rounded-lg bg-[#EEF6F1] dark:bg-emerald-500/15 text-[#0F5A36] dark:text-emerald-300 flex items-center justify-center shrink-0 mt-0.5">
                              <Icon className="w-3.5 h-3.5" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug">
                                {act.title}
                              </p>
                              {act.impactLabel && (
                                <p className="text-[11px] font-bold text-[#12663F] dark:text-emerald-400 mt-0.5">
                                  {act.impactLabel}
                                </p>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed pl-9">
                            {act.detail}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {insights.debtStrategy && (
                  <div className="p-3.5 rounded-xl bg-white dark:bg-[#0D2118] border border-emerald-950/[0.08] dark:border-emerald-400/15 space-y-1">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-100">
                      <TrendingUp className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                      <span>Estrategia de deudas</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {insights.debtStrategy}
                    </p>
                  </div>
                )}

                {insights.quincenaTip && (
                  <div className="p-3.5 rounded-xl bg-white dark:bg-[#0D2118] border border-emerald-950/[0.08] dark:border-emerald-400/15 space-y-1">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-100">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                      <span>Balance entre quincenas (15–16 y 30–1)</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {insights.quincenaTip}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Shortcut to PDF / Photo Bank Statement AI Reader */}
      <section className="mf-card px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-9 h-9 rounded-xl bg-[#EEF6F1] dark:bg-emerald-500/15 border border-emerald-900/10 dark:border-emerald-400/20 text-[#0F5A36] dark:text-emerald-300 flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Lectura automática de extractos bancarios (PDF y fotos)
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Sube un extracto o toma una foto en Deudas y extractos para extraer movimientos y
              fechas de pago automáticamente en un clic.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('deudas')}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold text-[#0B3B24] dark:text-emerald-200 bg-[#F2F7F4] dark:bg-[#0F261B] hover:bg-emerald-100/80 dark:hover:bg-emerald-500/15 border border-emerald-900/15 dark:border-emerald-400/20 rounded-xl transition-colors whitespace-nowrap shrink-0"
        >
          <span>Ir a extractos</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </section>

      {/* Contextual Financial Q&A */}
      <section className="mf-card overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-emerald-950/[0.08] dark:border-emerald-400/12">
          <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 font-display">
            Consulta sobre tus finanzas
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Pregunta sobre tus gastos, quincenas, presupuestos o deudas del mes seleccionado.
          </p>
        </div>

        <div className="p-4 sm:p-5 space-y-3.5">
          {messages.length === 0 && (
            <div className="flex flex-wrap gap-2">
              {QUICK_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={asking}
                  onClick={() => void handleAsk(q)}
                  className="text-left px-3 py-2 text-xs font-semibold text-[#0B3B24] dark:text-emerald-200 bg-[#F4F8F5] dark:bg-[#0D2118] hover:bg-emerald-100/70 dark:hover:bg-emerald-500/15 border border-emerald-900/12 dark:border-emerald-400/20 rounded-xl transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {messages.length > 0 && (
            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[88%] sm:max-w-[78%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed whitespace-pre-line ${
                      m.role === 'user'
                        ? 'bg-[#0B3B24] dark:bg-[#166E43] text-white'
                        : 'bg-[#F4F8F5] dark:bg-[#0D2118] border border-emerald-950/[0.08] dark:border-emerald-400/15 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              {asking && (
                <div className="flex justify-start">
                  <div className="rounded-2xl px-3.5 py-2.5 text-xs text-slate-500 dark:text-slate-400 bg-[#F4F8F5] dark:bg-[#0D2118] border border-emerald-950/[0.08] dark:border-emerald-400/15">
                    Analizando tus datos...
                  </div>
                </div>
              )}
            </div>
          )}

          {askError && (
            <div className="px-3.5 py-2 text-xs font-semibold text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-500/30 rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{askError}</span>
            </div>
          )}

          <form onSubmit={handleSubmitQuestion} className="flex items-center gap-2">
            <input
              type="text"
              maxLength={400}
              value={questionInput}
              onChange={(e) => setQuestionInput(e.target.value)}
              placeholder="Ej. ¿Cuánto puedo abonar extra a mi tarjeta esta quincena?"
              className="flex-1 px-3.5 py-2.5 text-sm bg-[#F6FAF7] dark:bg-[#0D2118] border border-emerald-900/15 dark:border-emerald-400/20 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
            />
            <button
              type="submit"
              disabled={asking || !questionInput.trim()}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-gradient-to-b from-[#157548] to-[#0F5A36] hover:from-[#12663F] hover:to-[#0B472A] dark:from-emerald-500 dark:to-emerald-600 dark:text-[#041A10] disabled:opacity-50 rounded-xl shadow-xs transition-all whitespace-nowrap shrink-0"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Consultar</span>
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
