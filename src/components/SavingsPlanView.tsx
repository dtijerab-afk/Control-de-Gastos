import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Pencil,
  PiggyBank,
  Plus,
  SlidersHorizontal,
  Target,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  AreaChart,
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
  getDefaultDateForPeriod,
  getQuincenaFromDate,
  getTodayDateStr,
} from '../lib/financeUtils';
import {
  addMonthsToDateStr,
  buildSavingsProjection,
  computeGoalSchedule,
  computeMonthlySavingsSummary,
  findDefaultSavingsCategory,
  loadSavingsPlan,
  SAVINGS_GOAL_TEMPLATES,
  saveSavingsPlan,
  type MonthlySavingsRule,
  type SavingsGoal,
  type SavingsGoalPriority,
  type SavingsPlanState,
  type SavingsRuleMode,
} from '../lib/savingsPlan';
import { createTransaction } from '../services/financeService';
import {
  CATEGORY_COLOR_SWATCHES,
  VALIDATION_LIMITS,
  type QuincenaNumber,
} from '../types/finance';

interface SavingsPlanViewProps {
  selectedMonth: string;
}

const PCT_PRESETS = [10, 15, 20, 25, 30] as const;

const PRIORITY_LABELS: Record<SavingsGoalPriority, string> = {
  alta: 'Prioridad alta',
  media: 'Prioridad media',
  baja: 'Prioridad baja',
};

export function SavingsPlanView({ selectedMonth }: SavingsPlanViewProps) {
  const { user, transactions, categories, currency, loadingData } = useFinance();

  const [plan, setPlan] = useState<SavingsPlanState>(() =>
    user ? loadSavingsPlan(user.uid) : loadSavingsPlan('')
  );

  // Sync plan when user changes
  useEffect(() => {
    if (!user) return;
    setPlan(loadSavingsPlan(user.uid));
  }, [user]);

  const updatePlan = (updater: (prev: SavingsPlanState) => SavingsPlanState) => {
    setPlan((prev) => {
      const next = updater(prev);
      if (user) saveSavingsPlan(user.uid, next);
      return next;
    });
  };

  // Monthly rule editor state
  const [editingRule, setEditingRule] = useState(false);
  const [ruleMode, setRuleMode] = useState<SavingsRuleMode>('percentage');
  const [rulePct, setRulePct] = useState('20');
  const [ruleFixed, setRuleFixed] = useState('');
  const [ruleError, setRuleError] = useState<string | null>(null);

  // Goal create/edit form state
  const [formOpen, setFormOpen] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalSaved, setGoalSaved] = useState('');
  const [goalDate, setGoalDate] = useState(() => addMonthsToDateStr(getTodayDateStr(), 6));
  const [goalPriority, setGoalPriority] = useState<SavingsGoalPriority>('alta');
  const [goalColor, setGoalColor] = useState('#0F5132');
  const [goalNotes, setGoalNotes] = useState('');
  const [goalError, setGoalError] = useState<string | null>(null);

  // Quick contribution inline state
  const [contributingGoalId, setContributingGoalId] = useState<string | null>(null);
  const [contribAmount, setContribAmount] = useState('');
  const [contribQuincena, setContribQuincena] = useState<QuincenaNumber>(() =>
    getQuincenaFromDate(getTodayDateStr())
  );
  const [contribRecordTx, setContribRecordTx] = useState(true);
  const [contribCategoryId, setContribCategoryId] = useState('');
  const [contribBusy, setContribBusy] = useState(false);
  const [contribError, setContribError] = useState<string | null>(null);

  // Delete confirmation & feedback
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === 'gasto'),
    [categories]
  );

  const defaultSavingsCat = useMemo(
    () => findDefaultSavingsCategory(categories),
    [categories]
  );

  const summary = useMemo(
    () =>
      computeMonthlySavingsSummary({
        monthKey: selectedMonth,
        transactions,
        categories,
        monthlyRule: plan.monthlyRule,
      }),
    [selectedMonth, transactions, categories, plan.monthlyRule]
  );

  const todayStr = getTodayDateStr();

  const goalsWithSchedule = useMemo(() => {
    const priorityRank: Record<SavingsGoalPriority, number> = { alta: 0, media: 1, baja: 2 };
    return plan.goals
      .map((goal) => ({
        goal,
        schedule: computeGoalSchedule(goal, todayStr),
      }))
      .sort((a, b) => {
        if (a.schedule.isCompleted !== b.schedule.isCompleted) {
          return a.schedule.isCompleted ? 1 : -1;
        }
        if (priorityRank[a.goal.priority] !== priorityRank[b.goal.priority]) {
          return priorityRank[a.goal.priority] - priorityRank[b.goal.priority];
        }
        return a.goal.targetDate.localeCompare(b.goal.targetDate);
      });
  }, [plan.goals, todayStr]);

  const goalsTotals = useMemo(() => {
    let totalSaved = 0;
    let totalTarget = 0;
    let totalReqPerQuincena = 0;
    let activeCount = 0;
    let completedCount = 0;

    for (const { goal, schedule } of goalsWithSchedule) {
      totalSaved += goal.savedAmount;
      totalTarget += goal.targetAmount;
      if (schedule.isCompleted) {
        completedCount += 1;
      } else {
        activeCount += 1;
        totalReqPerQuincena += schedule.requiredPerQuincena;
      }
    }

    return {
      totalSaved: Math.round(totalSaved * 100) / 100,
      totalTarget: Math.round(totalTarget * 100) / 100,
      totalReqPerQuincena: Math.round(totalReqPerQuincena * 100) / 100,
      totalReqPerMonth: Math.round(totalReqPerQuincena * 2 * 100) / 100,
      activeCount,
      completedCount,
    };
  }, [goalsWithSchedule]);

  const projectionData = useMemo(() => {
    const plannedMonthly =
      summary.monthlyTargetAmount > 0
        ? summary.monthlyTargetAmount
        : goalsTotals.totalReqPerMonth;
    return buildSavingsProjection({
      startMonthKey: selectedMonth,
      initialSaved: goalsTotals.totalSaved,
      plannedMonthly,
      actualMonthly: summary.effectiveMonthlySaved,
      months: 12,
    });
  }, [
    selectedMonth,
    goalsTotals.totalSaved,
    goalsTotals.totalReqPerMonth,
    summary.monthlyTargetAmount,
    summary.effectiveMonthlySaved,
  ]);

  const openRuleEditor = () => {
    setRuleMode(plan.monthlyRule.mode);
    setRulePct(String(plan.monthlyRule.targetPercentage));
    setRuleFixed(
      plan.monthlyRule.targetFixedAmount > 0 ? String(plan.monthlyRule.targetFixedAmount) : ''
    );
    setRuleError(null);
    setEditingRule(true);
  };

  const handleSaveRule = (e: React.FormEvent) => {
    e.preventDefault();
    setRuleError(null);

    if (ruleMode === 'percentage') {
      const pct = Number(rulePct.replace(',', '.'));
      if (!Number.isFinite(pct) || pct < 1 || pct > 80) {
        setRuleError('Ingresa un porcentaje entre 1% y 80%.');
        return;
      }
      const nextRule: MonthlySavingsRule = {
        ...plan.monthlyRule,
        mode: 'percentage',
        targetPercentage: Math.round(pct),
      };
      updatePlan((prev) => ({ ...prev, monthlyRule: nextRule }));
    } else {
      const fixed = Number(ruleFixed.replace(',', '.'));
      if (!Number.isFinite(fixed) || fixed <= 0 || fixed > VALIDATION_LIMITS.AMOUNT_MAX) {
        setRuleError('Ingresa un monto mensual fijo mayor a cero.');
        return;
      }
      const nextRule: MonthlySavingsRule = {
        ...plan.monthlyRule,
        mode: 'fixed',
        targetFixedAmount: Math.round(fixed * 100) / 100,
      };
      updatePlan((prev) => ({ ...prev, monthlyRule: nextRule }));
    }

    setEditingRule(false);
    setFeedback('Plan de ahorro mensual actualizado.');
  };

  const handleQuickPctSelect = (pct: number) => {
    updatePlan((prev) => ({
      ...prev,
      monthlyRule: {
        ...prev.monthlyRule,
        mode: 'percentage',
        targetPercentage: pct,
      },
    }));
    setEditingRule(false);
  };

  const openNewGoalForm = (template?: (typeof SAVINGS_GOAL_TEMPLATES)[number]) => {
    setEditingGoalId(null);
    setGoalName(template?.name ?? '');
    setGoalTarget(template ? String(template.suggestedTarget) : '');
    setGoalSaved('0');
    setGoalDate(addMonthsToDateStr(todayStr, template?.monthsAhead ?? 6));
    setGoalPriority(template?.priority ?? 'alta');
    setGoalColor(template?.color ?? '#0F5132');
    setGoalNotes(template?.notes ?? '');
    setGoalError(null);
    setFormOpen(true);
  };

  const openEditGoalForm = (goal: SavingsGoal) => {
    setEditingGoalId(goal.id);
    setGoalName(goal.name);
    setGoalTarget(String(goal.targetAmount));
    setGoalSaved(String(goal.savedAmount));
    setGoalDate(goal.targetDate);
    setGoalPriority(goal.priority);
    setGoalColor(goal.color);
    setGoalNotes(goal.notes);
    setGoalError(null);
    setFormOpen(true);
    setContributingGoalId(null);
  };

  const handleSaveGoal = (e: React.FormEvent) => {
    e.preventDefault();
    setGoalError(null);

    const cleanName = goalName.trim().slice(0, 80);
    if (!cleanName) {
      setGoalError('Ingresa un nombre para la meta de ahorro.');
      return;
    }

    const parsedTarget = Math.round(Number(goalTarget.replace(',', '.')) * 100) / 100;
    if (!Number.isFinite(parsedTarget) || parsedTarget <= 0 || parsedTarget > VALIDATION_LIMITS.AMOUNT_MAX) {
      setGoalError('Ingresa un monto objetivo válido mayor a cero.');
      return;
    }

    const parsedSaved =
      goalSaved.trim() === ''
        ? 0
        : Math.round(Number(goalSaved.replace(',', '.')) * 100) / 100;
    if (!Number.isFinite(parsedSaved) || parsedSaved < 0 || parsedSaved > VALIDATION_LIMITS.AMOUNT_MAX) {
      setGoalError('Ingresa un monto ahorrado válido mayor o igual a cero.');
      return;
    }

    if (!VALIDATION_LIMITS.DATE_PATTERN.test(goalDate)) {
      setGoalError('Selecciona una fecha objetivo válida.');
      return;
    }

    if (editingGoalId) {
      updatePlan((prev) => ({
        ...prev,
        goals: prev.goals.map((g) =>
          g.id === editingGoalId
            ? {
                ...g,
                name: cleanName,
                targetAmount: parsedTarget,
                savedAmount: parsedSaved,
                targetDate: goalDate,
                priority: goalPriority,
                color: goalColor,
                notes: goalNotes.trim().slice(0, 200),
              }
            : g
        ),
      }));
      setFeedback(`Meta "${cleanName}" actualizada.`);
    } else {
      const newGoal: SavingsGoal = {
        id: `goal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: cleanName,
        targetAmount: parsedTarget,
        savedAmount: parsedSaved,
        targetDate: goalDate,
        priority: goalPriority,
        color: goalColor,
        notes: goalNotes.trim().slice(0, 200),
        createdAt: new Date().toISOString(),
      };
      updatePlan((prev) => ({
        ...prev,
        goals: [newGoal, ...prev.goals],
      }));
      setFeedback(`Meta "${cleanName}" creada en tu plan de ahorro.`);
    }

    setFormOpen(false);
    setEditingGoalId(null);
  };

  const handleDeleteGoal = (id: string) => {
    const target = plan.goals.find((g) => g.id === id);
    updatePlan((prev) => ({
      ...prev,
      goals: prev.goals.filter((g) => g.id !== id),
    }));
    setConfirmDeleteId(null);
    if (contributingGoalId === id) setContributingGoalId(null);
    if (target) setFeedback(`Se eliminó la meta "${target.name}".`);
  };

  const openContributePanel = (goal: SavingsGoal, suggestedQuincena: number) => {
    setContributingGoalId(goal.id);
    setContribAmount(suggestedQuincena > 0 ? String(suggestedQuincena) : '');
    setContribQuincena(getQuincenaFromDate(todayStr));
    setContribCategoryId(defaultSavingsCat?.id ?? '');
    setContribRecordTx(Boolean(defaultSavingsCat));
    setContribError(null);
    setConfirmDeleteId(null);
  };

  const handleConfirmContribution = async (goal: SavingsGoal) => {
    setContribError(null);
    const parsed = Math.round(Number(contribAmount.replace(',', '.')) * 100) / 100;
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > VALIDATION_LIMITS.AMOUNT_MAX) {
      setContribError('Ingresa un aporte válido mayor a cero.');
      return;
    }

    setContribBusy(true);
    try {
      let syncedToLedger = false;
      if (contribRecordTx && user && contribCategoryId) {
        const matchedCat = expenseCategories.find((c) => c.id === contribCategoryId);
        if (matchedCat) {
          const txDate = getDefaultDateForPeriod(selectedMonth, contribQuincena);
          await createTransaction(user.uid, {
            type: 'gasto',
            amount: parsed,
            description: `Aporte ahorro: ${goal.name}`.slice(0, VALIDATION_LIMITS.DESCRIPTION_MAX),
            categoryId: matchedCat.id,
            categoryName: matchedCat.name,
            date: txDate,
            quincena: contribQuincena,
            paymentMethod: 'transferencia',
            notes: 'Aporte registrado desde Plan de ahorro.',
          });
          syncedToLedger = true;
        }
      }

      updatePlan((prev) => ({
        ...prev,
        goals: prev.goals.map((g) =>
          g.id === goal.id
            ? { ...g, savedAmount: Math.round((g.savedAmount + parsed) * 100) / 100 }
            : g
        ),
      }));

      setContributingGoalId(null);
      setFeedback(
        syncedToLedger
          ? `Aporte de ${formatCurrency(parsed, currency)} sumado a "${goal.name}" y registrado en tus movimientos.`
          : `Aporte de ${formatCurrency(parsed, currency)} sumado a "${goal.name}".`
      );
    } catch (err) {
      setContribError(err instanceof Error ? err.message : 'No se pudo registrar el aporte.');
    } finally {
      setContribBusy(false);
    }
  };

  // 50 / 30 / 20 reference numbers based on selected month's income
  const rule503020 = useMemo(() => {
    const inc = summary.monthIncome;
    return {
      needs: Math.round(inc * 0.5 * 100) / 100,
      wants: Math.round(inc * 0.3 * 100) / 100,
      savings: Math.round(inc * 0.2 * 100) / 100,
    };
  }, [summary.monthIncome]);

  return (
    <div className="space-y-3 sm:space-y-5">
      {/* Feedback banner */}
      {feedback && (
        <div className="px-3 py-2 text-[13px] sm:text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between gap-3">
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="font-bold hover:underline shrink-0"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* 4-Column Unified Savings KPI Strip */}
      <section
        aria-label="Resumen del plan de ahorro"
        className="bg-white border border-emerald-950/10 rounded-xl grid grid-cols-2 lg:grid-cols-4 overflow-hidden"
      >
        <div className="p-3 sm:p-4 lg:p-5 border-b border-r border-emerald-950/10 lg:border-b-0">
          <p className="text-[13px] sm:text-xs font-bold sm:font-medium text-slate-700 sm:text-slate-500">
            Meta mensual
          </p>
          {loadingData ? (
            <div className="h-6 sm:h-7 w-24 bg-slate-100 rounded mt-1.5 animate-pulse" />
          ) : (
            <p className="text-lg sm:text-2xl font-mono font-bold sm:font-semibold text-[#0B3B24] tabular-nums mt-0.5 sm:mt-1 truncate">
              {formatCurrency(summary.monthlyTargetAmount, currency)}
            </p>
          )}
          <p className="text-xs font-semibold sm:font-normal text-slate-600 sm:text-slate-500 mt-0.5 sm:mt-1 truncate">
            {plan.monthlyRule.mode === 'percentage'
              ? `${plan.monthlyRule.targetPercentage}% sobre ingresos`
              : 'Monto fijo mensual'}
          </p>
        </div>

        <div className="p-3 sm:p-4 lg:p-5 border-b lg:border-b-0 lg:border-r border-emerald-950/10">
          <p className="text-[13px] sm:text-xs font-bold sm:font-medium text-slate-700 sm:text-slate-500">
            Por quincena
          </p>
          {loadingData ? (
            <div className="h-6 sm:h-7 w-24 bg-slate-100 rounded mt-1.5 animate-pulse" />
          ) : (
            <p className="text-lg sm:text-2xl font-mono font-bold sm:font-semibold text-emerald-700 tabular-nums mt-0.5 sm:mt-1 truncate">
              {formatCurrency(summary.quincenaTargetAmount, currency)}
            </p>
          )}
          <p className="text-xs font-semibold sm:font-normal text-slate-600 sm:text-slate-500 mt-0.5 sm:mt-1 truncate">
            Apartar en 1ª Q y 2ª Q
          </p>
        </div>

        <div className="p-3 sm:p-4 lg:p-5 border-r border-emerald-950/10">
          <p className="text-[13px] sm:text-xs font-bold sm:font-medium text-slate-700 sm:text-slate-500">
            Ahorro del mes
          </p>
          {loadingData ? (
            <div className="h-6 sm:h-7 w-24 bg-slate-100 rounded mt-1.5 animate-pulse" />
          ) : (
            <p
              className={`text-lg sm:text-2xl font-mono font-bold sm:font-semibold tabular-nums mt-0.5 sm:mt-1 truncate ${
                summary.targetReached ? 'text-emerald-700' : 'text-slate-900'
              }`}
            >
              {formatCurrency(summary.effectiveMonthlySaved, currency)}
            </p>
          )}
          <p className="text-xs font-semibold sm:font-normal text-slate-600 sm:text-slate-500 mt-0.5 sm:mt-1 truncate">
            {summary.monthlyTargetAmount > 0
              ? `${Math.round(summary.progressPct)}% de tu meta`
              : `${summary.savingsRatePct.toFixed(1)}% de ingresos`}
          </p>
        </div>

        <div className="p-3 sm:p-4 lg:p-5">
          <p className="text-[13px] sm:text-xs font-bold sm:font-medium text-slate-700 sm:text-slate-500">
            Total en metas
          </p>
          <p className="text-lg sm:text-2xl font-mono font-bold sm:font-semibold text-slate-900 tabular-nums mt-0.5 sm:mt-1 truncate">
            {formatCurrency(goalsTotals.totalSaved, currency)}
          </p>
          <p className="text-xs font-semibold sm:font-normal text-slate-600 sm:text-slate-500 mt-0.5 sm:mt-1 truncate">
            {goalsTotals.totalTarget > 0
              ? `De ${formatCurrency(goalsTotals.totalTarget, currency)}`
              : 'Sin metas activas'}
          </p>
        </div>
      </section>

      {/* Monthly & Biweekly Plan Configuration Card */}
      <section className="bg-white border border-emerald-950/10 rounded-xl p-3 sm:p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="min-w-0">
            <h2 className="text-base font-bold sm:font-semibold text-slate-900">
              Regla de ahorro · {formatMonthLabel(selectedMonth)}
            </h2>
            <p className="text-[13px] sm:text-xs font-medium sm:font-normal text-slate-600 sm:text-slate-500 mt-0.5">
              Define cuánto apartar cada mes (se divide automáticamente en 1ª y 2ª quincena).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            {!editingRule && (
              <>
                <div className="inline-flex items-center gap-0.5 p-0.5 bg-emerald-950/[0.06] rounded-lg">
                  {PCT_PRESETS.map((pct) => {
                    const active =
                      plan.monthlyRule.mode === 'percentage' &&
                      plan.monthlyRule.targetPercentage === pct;
                    return (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => handleQuickPctSelect(pct)}
                        className={`px-2 py-1 text-xs font-bold rounded-md transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-white text-[#0B3B24] shadow-xs'
                            : 'text-slate-700 hover:text-[#0B3B24]'
                        }`}
                      >
                        {pct}%
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={openRuleEditor}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] sm:text-xs font-bold text-[#0B3B24] bg-[#F3F7F4] border border-emerald-900/15 hover:bg-emerald-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#12663F]" />
                  Personalizar
                </button>
              </>
            )}
          </div>
        </div>

        {editingRule && (
          <form
            onSubmit={handleSaveRule}
            className="pt-3 border-t border-emerald-950/10 space-y-3"
          >
            <div className="inline-flex items-center gap-1 p-1 bg-emerald-950/[0.06] rounded-lg">
              <button
                type="button"
                onClick={() => setRuleMode('percentage')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors whitespace-nowrap ${
                  ruleMode === 'percentage'
                    ? 'bg-white text-[#0B3B24] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Porcentaje de ingresos
              </button>
              <button
                type="button"
                onClick={() => setRuleMode('fixed')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors whitespace-nowrap ${
                  ruleMode === 'fixed'
                    ? 'bg-white text-[#0B3B24] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Monto fijo mensual
              </button>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-end gap-2.5">
              {ruleMode === 'percentage' ? (
                <div className="flex-1 max-w-xs">
                  <label
                    htmlFor="savings-rule-pct"
                    className="block text-sm sm:text-xs font-bold sm:font-medium text-slate-700 mb-1"
                  >
                    Porcentaje a ahorrar (1% – 80%)
                  </label>
                  <input
                    id="savings-rule-pct"
                    type="number"
                    min="1"
                    max="80"
                    step="1"
                    value={rulePct}
                    onChange={(e) => setRulePct(e.target.value)}
                    className="w-full px-3 py-2 text-base sm:text-sm font-mono font-bold tabular-nums text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/25 focus:border-[#12663F]"
                  />
                </div>
              ) : (
                <div className="flex-1 max-w-xs">
                  <label
                    htmlFor="savings-rule-fixed"
                    className="block text-sm sm:text-xs font-bold sm:font-medium text-slate-700 mb-1"
                  >
                    Monto fijo mensual ({currency})
                  </label>
                  <input
                    id="savings-rule-fixed"
                    type="number"
                    inputMode="decimal"
                    min="1"
                    step="0.01"
                    max={VALIDATION_LIMITS.AMOUNT_MAX}
                    placeholder="Ej. 5000.00"
                    value={ruleFixed}
                    onChange={(e) => setRuleFixed(e.target.value)}
                    className="w-full px-3 py-2 text-base sm:text-sm font-mono font-bold tabular-nums text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/25 focus:border-[#12663F]"
                  />
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 text-sm sm:text-xs font-bold text-white bg-[#12663F] hover:bg-[#0D4F30] rounded-lg transition-colors whitespace-nowrap"
                >
                  Guardar plan
                </button>
                <button
                  type="button"
                  onClick={() => setEditingRule(false)}
                  className="px-3 py-2 text-sm sm:text-xs font-bold sm:font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap"
                >
                  Cancelar
                </button>
              </div>
            </div>

            {ruleError && (
              <p role="alert" className="text-xs font-semibold text-rose-700">
                {ruleError}
              </p>
            )}
          </form>
        )}

        {/* Monthly progress bar + Q1/Q2 breakdown */}
        <div className="pt-2.5 border-t border-slate-100 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] sm:text-xs">
            <span className="font-bold text-slate-800 inline-flex items-center gap-1.5">
              {summary.targetReached && (
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              )}
              {summary.monthlyTargetAmount > 0
                ? summary.targetReached
                  ? 'Meta mensual cumplida'
                  : `Faltan ${formatCurrency(summary.remainingToGoal, currency)} para completar tu meta`
                : 'Registra tus ingresos del mes o define un monto fijo para activar el seguimiento'}
            </span>
            <span className="font-mono font-bold tabular-nums text-[#0B3B24]">
              {Math.round(summary.progressPct)}%
            </span>
          </div>

          <div
            className="h-2.5 w-full bg-emerald-950/[0.08] rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={Math.round(summary.progressPct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progreso del plan de ahorro mensual"
          >
            <div
              className={`h-full rounded-full transition-all ${
                summary.targetReached ? 'bg-emerald-600' : 'bg-[#12663F]'
              }`}
              style={{ width: `${Math.min(100, summary.progressPct)}%` }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs font-semibold sm:font-normal text-slate-600">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-mono tabular-nums">
              <span>1ª Q: {formatCurrency(summary.q1Saved, currency)}</span>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span>2ª Q: {formatCurrency(summary.q2Saved, currency)}</span>
              {summary.explicitSavingsLogged > 0 && (
                <>
                  <span aria-hidden="true" className="text-slate-300">
                    ·
                  </span>
                  <span className="text-emerald-700 font-semibold">
                    Aportes en Ahorro: {formatCurrency(summary.explicitSavingsLogged, currency)}
                  </span>
                </>
              )}
            </div>
            <span className="text-[11.5px] text-slate-500">
              Incluye excedente neto + aportes en categoría Ahorro
            </span>
          </div>
        </div>
      </section>

      {/* Savings Goals Section */}
      <section className="bg-white border border-emerald-950/10 rounded-xl overflow-hidden">
        <div className="px-3 sm:px-5 py-3 border-b border-emerald-950/10 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold sm:font-semibold text-slate-900">
              Metas de ahorro ({plan.goals.length})
            </h2>
            <p className="text-[12.5px] sm:text-xs font-medium sm:font-normal text-slate-600 sm:text-slate-500">
              {goalsTotals.activeCount > 0
                ? `Aporte combinado sugerido: ${formatCurrency(goalsTotals.totalReqPerQuincena, currency)} / quincena`
                : 'Crea objetivos concretos con fecha límite y cuota quincenal'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => openNewGoalForm()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 text-[13px] sm:text-xs font-bold text-white bg-[#12663F] hover:bg-[#0D4F30] rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            Nueva meta
          </button>
        </div>

        {/* Inline Create / Edit Goal Form */}
        {formOpen && (
          <form
            onSubmit={handleSaveGoal}
            className="p-3 sm:p-5 bg-[#F7FAF8] border-b border-emerald-950/10 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#0B3B24]">
                {editingGoalId ? 'Editar meta de ahorro' : 'Crear nueva meta de ahorro'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setFormOpen(false);
                  setEditingGoalId(null);
                }}
                className="text-xs font-bold text-slate-600 hover:text-slate-900"
              >
                Cerrar
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              <div className="sm:col-span-2">
                <label
                  htmlFor="goal-name"
                  className="block text-xs font-bold text-slate-700 mb-1"
                >
                  Nombre de la meta
                </label>
                <input
                  id="goal-name"
                  type="text"
                  required
                  maxLength={80}
                  placeholder="Ej. Fondo de emergencia, Vacaciones..."
                  value={goalName}
                  onChange={(e) => setGoalName(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/25 focus:border-[#12663F]"
                />
              </div>

              <div>
                <label
                  htmlFor="goal-target"
                  className="block text-xs font-bold text-slate-700 mb-1"
                >
                  Meta total ({currency})
                </label>
                <input
                  id="goal-target"
                  type="number"
                  inputMode="decimal"
                  required
                  min="1"
                  step="0.01"
                  max={VALIDATION_LIMITS.AMOUNT_MAX}
                  placeholder="30000"
                  value={goalTarget}
                  onChange={(e) => setGoalTarget(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono font-bold tabular-nums text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/25 focus:border-[#12663F]"
                />
              </div>

              <div>
                <label
                  htmlFor="goal-saved"
                  className="block text-xs font-bold text-slate-700 mb-1"
                >
                  Ya ahorrado ({currency})
                </label>
                <input
                  id="goal-saved"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  max={VALIDATION_LIMITS.AMOUNT_MAX}
                  placeholder="0"
                  value={goalSaved}
                  onChange={(e) => setGoalSaved(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono font-bold tabular-nums text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/25 focus:border-[#12663F]"
                />
              </div>

              <div>
                <label
                  htmlFor="goal-date"
                  className="block text-xs font-bold text-slate-700 mb-1"
                >
                  Fecha objetivo
                </label>
                <input
                  id="goal-date"
                  type="date"
                  required
                  value={goalDate}
                  onChange={(e) => setGoalDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/25 focus:border-[#12663F]"
                />
              </div>

              <div>
                <label
                  htmlFor="goal-priority"
                  className="block text-xs font-bold text-slate-700 mb-1"
                >
                  Prioridad
                </label>
                <select
                  id="goal-priority"
                  value={goalPriority}
                  onChange={(e) => setGoalPriority(e.target.value as SavingsGoalPriority)}
                  className="w-full px-3 py-2 text-sm font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/25 focus:border-[#12663F]"
                >
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baja">Baja</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="goal-notes"
                  className="block text-xs font-bold text-slate-700 mb-1"
                >
                  Notas (opcional)
                </label>
                <input
                  id="goal-notes"
                  type="text"
                  maxLength={200}
                  placeholder="Ej. Cuenta de rendimiento, fondo separado..."
                  value={goalNotes}
                  onChange={(e) => setGoalNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/25 focus:border-[#12663F]"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-slate-600 mr-1">Color:</span>
                {CATEGORY_COLOR_SWATCHES.slice(0, 8).map((sw) => (
                  <button
                    key={sw.hex}
                    type="button"
                    aria-label={`Color ${sw.name}`}
                    onClick={() => setGoalColor(sw.hex)}
                    className={`w-6 h-6 rounded-full transition-transform ${
                      goalColor.toUpperCase() === sw.hex.toUpperCase()
                        ? 'ring-2 ring-offset-2 ring-slate-900 scale-105'
                        : 'opacity-80 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: sw.hex }}
                  />
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setFormOpen(false);
                    setEditingGoalId(null);
                  }}
                  className="px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/70 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-[#12663F] hover:bg-[#0D4F30] rounded-lg whitespace-nowrap"
                >
                  {editingGoalId ? 'Guardar cambios' : 'Agregar meta'}
                </button>
              </div>
            </div>

            {goalError && (
              <p role="alert" className="text-xs font-semibold text-rose-700">
                {goalError}
              </p>
            )}
          </form>
        )}

        {/* Empty State with 1-Click Starter Templates */}
        {goalsWithSchedule.length === 0 ? (
          <div className="p-4 sm:p-6 text-center space-y-4">
            <div className="max-w-md mx-auto space-y-1">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#12663F] flex items-center justify-center mx-auto mb-2">
                <PiggyBank className="w-5 h-5" />
              </div>
              <p className="text-base sm:text-sm font-bold text-slate-900">
                Crea tu primera meta de ahorro
              </p>
              <p className="text-[13px] sm:text-xs font-medium sm:font-normal text-slate-600">
                Calculamos automáticamente cuánto apartar cada quincena y mes para lograrla a tiempo.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 max-w-2xl mx-auto text-left">
              {SAVINGS_GOAL_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.name}
                  type="button"
                  onClick={() => openNewGoalForm(tpl)}
                  className="p-3 bg-[#F7FAF8] hover:bg-emerald-50/80 border border-emerald-950/10 rounded-xl transition-colors flex flex-col justify-between gap-1.5"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: tpl.color }}
                    />
                    <span className="text-sm sm:text-xs font-bold text-slate-900 truncate">
                      {tpl.name}
                    </span>
                  </div>
                  <p className="text-xs font-mono font-bold text-[#12663F] tabular-nums">
                    Meta sug.: {formatCurrency(tpl.suggestedTarget, currency)} · {tpl.monthsAhead} meses
                  </p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {goalsWithSchedule.map(({ goal, schedule }) => {
              const isContributing = contributingGoalId === goal.id;
              const isDeleting = confirmDeleteId === goal.id;

              return (
                <li key={goal.id} className="px-3 sm:px-5 py-2.5 sm:py-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: goal.color }}
                        />
                        <h3 className="text-[15px] sm:text-sm font-bold text-slate-900 truncate leading-tight">
                          {goal.name}
                        </h3>
                        {schedule.isCompleted && (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 shrink-0">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Lograda
                          </span>
                        )}
                      </div>
                      <p className="text-[12.5px] sm:text-xs font-semibold sm:font-normal text-slate-600 sm:text-slate-500 mt-0.5 truncate">
                        {PRIORITY_LABELS[goal.priority]} · Objetivo: {formatShortDate(goal.targetDate)}
                        {schedule.isOverdue ? ' · Fecha vencida' : ` · ${schedule.quincenasRemaining} quincenas`}
                        {goal.notes ? ` · ${goal.notes}` : ''}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-[15px] sm:text-sm font-mono font-bold text-slate-900 tabular-nums leading-tight">
                        {formatCurrency(goal.savedAmount, currency)}
                        <span className="text-slate-400 font-normal">
                          {' '}
                          / {formatCurrency(goal.targetAmount, currency)}
                        </span>
                      </p>
                      <p className="text-xs font-mono font-bold text-[#12663F] tabular-nums mt-0.5">
                        {Math.round(schedule.progressPct)}%
                        {!schedule.isCompleted &&
                          ` · ${formatCurrency(schedule.requiredPerQuincena, currency)}/Q`}
                      </p>
                    </div>
                  </div>

                  {/* Compact progress bar */}
                  <div className="h-2 w-full bg-emerald-950/[0.07] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, schedule.progressPct)}%`,
                        backgroundColor: schedule.isCompleted ? '#15803D' : goal.color,
                      }}
                    />
                  </div>

                  {/* Row footer: required cadence + compact actions */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                    <span className="text-xs font-semibold sm:font-normal text-slate-600 font-mono tabular-nums">
                      {schedule.isCompleted
                        ? 'Meta completada al 100%'
                        : `Faltan ${formatCurrency(schedule.remainingAmount, currency)} (${formatCurrency(schedule.requiredPerMonth, currency)}/mes)`}
                    </span>

                    {isDeleting ? (
                      <div className="inline-flex items-center gap-1.5 text-xs">
                        <span className="font-bold text-rose-800">¿Eliminar?</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteGoal(goal.id)}
                          className="px-2.5 py-1 font-bold text-white bg-rose-700 hover:bg-rose-800 rounded-md"
                        >
                          Sí
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1 font-bold text-slate-600 hover:text-slate-900"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            isContributing
                              ? setContributingGoalId(null)
                              : openContributePanel(goal, schedule.requiredPerQuincena)
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-[#0B3B24] bg-emerald-50 hover:bg-emerald-100 border border-emerald-900/15 rounded-md transition-colors whitespace-nowrap"
                        >
                          <Plus className="w-3.5 h-3.5 text-[#12663F]" />
                          Aportar
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditGoalForm(goal)}
                          aria-label={`Editar ${goal.name}`}
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDeleteId(goal.id);
                            setContributingGoalId(null);
                          }}
                          aria-label={`Eliminar ${goal.name}`}
                          className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-md transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Quick inline contribution panel */}
                  {isContributing && (
                    <div className="mt-2 p-3 bg-[#F4F8F5] border border-emerald-950/12 rounded-lg space-y-2.5">
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                        <div className="sm:col-span-4">
                          <label
                            htmlFor={`contrib-amount-${goal.id}`}
                            className="block text-xs font-bold text-slate-700 mb-1"
                          >
                            Monto a aportar ({currency})
                          </label>
                          <input
                            id={`contrib-amount-${goal.id}`}
                            type="number"
                            inputMode="decimal"
                            min="0.01"
                            step="0.01"
                            value={contribAmount}
                            onChange={(e) => setContribAmount(e.target.value)}
                            className="w-full px-3 py-1.5 text-sm font-mono font-bold tabular-nums text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/25 focus:border-[#12663F]"
                          />
                        </div>

                        <div className="sm:col-span-3">
                          <label
                            htmlFor={`contrib-q-${goal.id}`}
                            className="block text-xs font-bold text-slate-700 mb-1"
                          >
                            Quincena
                          </label>
                          <select
                            id={`contrib-q-${goal.id}`}
                            value={contribQuincena}
                            onChange={(e) =>
                              setContribQuincena(Number(e.target.value) as QuincenaNumber)
                            }
                            className="w-full px-2.5 py-1.5 text-sm font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/25 focus:border-[#12663F]"
                          >
                            <option value={1}>1ª Quincena</option>
                            <option value={2}>2ª Quincena</option>
                          </select>
                        </div>

                        <div className="sm:col-span-5 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setContributingGoalId(null)}
                            className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200/70 rounded-lg"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            disabled={contribBusy}
                            onClick={() => handleConfirmContribution(goal)}
                            className="px-3.5 py-1.5 text-xs font-bold text-white bg-[#12663F] hover:bg-[#0D4F30] disabled:opacity-60 rounded-lg whitespace-nowrap"
                          >
                            {contribBusy ? 'Guardando...' : 'Confirmar aporte'}
                          </button>
                        </div>
                      </div>

                      {expenseCategories.length > 0 && (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1.5 border-t border-emerald-950/10 text-xs">
                          <label className="inline-flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={contribRecordTx}
                              onChange={(e) => setContribRecordTx(e.target.checked)}
                              className="rounded border-slate-300 text-[#12663F] focus:ring-emerald-700/30"
                            />
                            Registrar también en mis movimientos
                          </label>
                          {contribRecordTx && (
                            <select
                              aria-label="Categoría del aporte"
                              value={contribCategoryId}
                              onChange={(e) => setContribCategoryId(e.target.value)}
                              className="px-2.5 py-1 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-md"
                            >
                              {expenseCategories.map((cat) => (
                                <option key={cat.id} value={cat.id}>
                                  {cat.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      )}

                      {contribError && (
                        <p role="alert" className="text-xs font-semibold text-rose-700">
                          {contribError}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Analytical Split: 12-Month Savings Projection Chart + 50/30/20 Guide */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 sm:gap-5 items-stretch">
        <section className="lg:col-span-7 bg-white border border-emerald-950/10 rounded-xl p-3.5 sm:p-5 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="text-base font-bold sm:font-semibold text-slate-900">
                Proyección de ahorro (12 meses)
              </h2>
              <p className="text-[12.5px] sm:text-xs font-medium sm:font-normal text-slate-600 sm:text-slate-500">
                Saldo acumulado partiendo de tus metas actuales
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-bold sm:font-normal text-slate-700 shrink-0">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#12663F]" aria-hidden="true" />
                Plan objetivo
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#0D9488]" aria-hidden="true" />
                Ritmo actual
              </span>
            </div>
          </div>

          <div className="h-56 sm:h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={projectionData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="mfSavingsPlanFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#12663F" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#12663F" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="mfSavingsActualFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0D9488" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#0D9488" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2ECE5" />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#475569', fontSize: 11, fontWeight: 600 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  width={64}
                  tick={{ fill: '#475569', fontSize: 11, fontFamily: 'IBM Plex Mono', fontWeight: 600 }}
                  tickFormatter={(v) => formatCompactCurrency(Number(v), currency)}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const row = payload[0].payload as {
                      planAcumulado: number;
                      ritmoActualAcumulado: number;
                    };
                    return (
                      <div className="bg-white border border-emerald-950/15 rounded-lg px-3 py-2 shadow-sm text-xs space-y-1">
                        <p className="font-bold text-slate-900">{label}</p>
                        <p className="font-mono font-semibold tabular-nums text-[#12663F]">
                          Plan objetivo: {formatCurrency(row.planAcumulado, currency)}
                        </p>
                        <p className="font-mono font-semibold tabular-nums text-teal-700">
                          Ritmo actual: {formatCurrency(row.ritmoActualAcumulado, currency)}
                        </p>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="planAcumulado"
                  name="Plan objetivo"
                  stroke="#12663F"
                  strokeWidth={2.5}
                  fill="url(#mfSavingsPlanFill)"
                />
                <Area
                  type="monotone"
                  dataKey="ritmoActualAcumulado"
                  name="Ritmo actual"
                  stroke="#0D9488"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  fill="url(#mfSavingsActualFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="lg:col-span-5 bg-white border border-emerald-950/10 rounded-xl p-3.5 sm:p-5 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold sm:font-semibold text-slate-900">
                  Guía 50 / 30 / 20
                </h2>
                <p className="text-[12.5px] sm:text-xs font-medium sm:font-normal text-slate-600 sm:text-slate-500">
                  Referencia sobre tus ingresos de {formatMonthLabel(selectedMonth)}
                </p>
              </div>
              <TrendingUp className="w-4 h-4 text-[#12663F] shrink-0" />
            </div>

            {summary.monthIncome > 0 ? (
              <div className="divide-y divide-slate-100">
                <div className="py-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-900">Necesidades (50%)</p>
                    <p className="text-xs text-slate-500">Vivienda, despensa, servicios, transporte</p>
                  </div>
                  <span className="text-sm font-mono font-bold text-slate-900 tabular-nums shrink-0">
                    {formatCurrency(rule503020.needs, currency)}
                  </span>
                </div>
                <div className="py-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-900">Estilo de vida (30%)</p>
                    <p className="text-xs text-slate-500">Restaurantes, ocio, compras personales</p>
                  </div>
                  <span className="text-sm font-mono font-bold text-slate-900 tabular-nums shrink-0">
                    {formatCurrency(rule503020.wants, currency)}
                  </span>
                </div>
                <div className="py-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-[#0B3B24]">Ahorro e inversión (20%)</p>
                    <p className="text-xs text-slate-500">
                      {formatCurrency(rule503020.savings / 2, currency)} cada quincena
                    </p>
                  </div>
                  <span className="text-sm font-mono font-bold text-emerald-700 tabular-nums shrink-0">
                    {formatCurrency(rule503020.savings, currency)}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-600 py-3">
                Registra tus ingresos en {formatMonthLabel(selectedMonth)} para calcular tu distribución sugerida 50/30/20 automáticamente.
              </p>
            )}
          </div>

          <div className="pt-3 border-t border-emerald-950/10 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <Target className="w-3.5 h-3.5 text-[#12663F] shrink-0" />
              <span>Cobertura de tus metas activas</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {goalsTotals.activeCount === 0 ? (
                'Cuando agregues metas activas, aquí verás si tu ahorro quincenal planeado es suficiente para cumplirlas a tiempo.'
              ) : summary.quincenaTargetAmount >= goalsTotals.totalReqPerQuincena ? (
                <>
                  Tu ahorro planeado de{' '}
                  <span className="font-mono font-bold text-emerald-700 tabular-nums">
                    {formatCurrency(summary.quincenaTargetAmount, currency)}/Q
                  </span>{' '}
                  cubre los{' '}
                  <span className="font-mono font-bold text-slate-900 tabular-nums">
                    {formatCurrency(goalsTotals.totalReqPerQuincena, currency)}/Q
                  </span>{' '}
                  necesarios para tus {goalsTotals.activeCount}{' '}
                  {goalsTotals.activeCount === 1 ? 'meta activa' : 'metas activas'}.
                </>
              ) : (
                <>
                  Tus metas requieren{' '}
                  <span className="font-mono font-bold text-amber-700 tabular-nums">
                    {formatCurrency(goalsTotals.totalReqPerQuincena, currency)}/Q
                  </span>
                  , frente a tu meta actual de{' '}
                  <span className="font-mono font-bold text-slate-900 tabular-nums">
                    {formatCurrency(summary.quincenaTargetAmount, currency)}/Q
                  </span>
                  . Considera ajustar el plazo o incrementar tu cuota quincenal.
                </>
              )}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
