import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
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
  formatShortMonthLabel,
  getRecentMonthKeys,
} from '../lib/financeUtils';

interface AnalyticsViewProps {
  selectedMonth: string;
  onSelectMonth: (monthKey: string) => void;
}

export function AnalyticsView({ selectedMonth, onSelectMonth }: AnalyticsViewProps) {
  const { transactions, categories, currency } = useFinance();
  const [monthsSpan, setMonthsSpan] = useState<6 | 12>(6);

  const categoryMap = useMemo(() => {
    const map = new Map<string, { color: string; monthlyBudget: number; name: string }>();
    for (const c of categories) {
      map.set(c.id, { color: c.color, monthlyBudget: c.monthlyBudget, name: c.name });
    }
    return map;
  }, [categories]);

  const monthlySeries = useMemo(() => {
    const keys = getRecentMonthKeys(selectedMonth, monthsSpan);
    const buckets = new Map<
      string,
      { ingresos: number; gastos: number; q1Gastos: number; q2Gastos: number }
    >();
    for (const k of keys) {
      buckets.set(k, { ingresos: 0, gastos: 0, q1Gastos: 0, q2Gastos: 0 });
    }
    for (const tx of transactions) {
      const b = buckets.get(tx.monthKey);
      if (!b) continue;
      if (tx.type === 'ingreso') {
        b.ingresos += tx.amount;
      } else {
        b.gastos += tx.amount;
        if (tx.quincena === 1) b.q1Gastos += tx.amount;
        else b.q2Gastos += tx.amount;
      }
    }
    return keys.map((monthKey) => {
      const b = buckets.get(monthKey)!;
      const balance = Math.round((b.ingresos - b.gastos) * 100) / 100;
      const savingsRate = b.ingresos > 0 ? Math.round((balance / b.ingresos) * 1000) / 10 : 0;
      return {
        monthKey,
        label: formatShortMonthLabel(monthKey),
        ingresos: Math.round(b.ingresos * 100) / 100,
        gastos: Math.round(b.gastos * 100) / 100,
        balance,
        savingsRate,
        q1Gastos: Math.round(b.q1Gastos * 100) / 100,
        q2Gastos: Math.round(b.q2Gastos * 100) / 100,
      };
    });
  }, [selectedMonth, monthsSpan, transactions]);

  const expenseBreakdown = useMemo(() => {
    const monthExpenses = transactions.filter(
      (t) => t.monthKey === selectedMonth && t.type === 'gasto'
    );
    const total = monthExpenses.reduce((acc, t) => acc + t.amount, 0);
    const byCategory = new Map<string, { id: string; name: string; color: string; amount: number }>();

    for (const tx of monthExpenses) {
      const meta = categoryMap.get(tx.categoryId);
      const existing = byCategory.get(tx.categoryId);
      if (existing) {
        existing.amount += tx.amount;
      } else {
        byCategory.set(tx.categoryId, {
          id: tx.categoryId,
          name: meta?.name ?? tx.categoryName,
          color: meta?.color ?? '#475569',
          amount: tx.amount,
        });
      }
    }

    const items = Array.from(byCategory.values())
      .sort((a, b) => b.amount - a.amount)
      .map((item) => ({
        ...item,
        amount: Math.round(item.amount * 100) / 100,
        percent: total > 0 ? (item.amount / total) * 100 : 0,
      }));

    return { items, total };
  }, [transactions, selectedMonth, categoryMap]);

  const budgetRows = useMemo(() => {
    const gastoCategories = categories.filter((c) => c.type === 'gasto' && c.monthlyBudget > 0);
    const spendByCat = new Map<string, number>();
    for (const tx of transactions) {
      if (tx.monthKey === selectedMonth && tx.type === 'gasto') {
        spendByCat.set(tx.categoryId, (spendByCat.get(tx.categoryId) ?? 0) + tx.amount);
      }
    }
    return gastoCategories
      .map((cat) => {
        const spent = spendByCat.get(cat.id) ?? 0;
        const pct = cat.monthlyBudget > 0 ? (spent / cat.monthlyBudget) * 100 : 0;
        const remaining = cat.monthlyBudget - spent;
        return {
          id: cat.id,
          name: cat.name,
          color: cat.color,
          budget: cat.monthlyBudget,
          spent,
          pct,
          remaining,
        };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [categories, transactions, selectedMonth]);

  return (
    <div className="space-y-6">
      {/* Range Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Gráficas mensuales</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Evolución histórica terminando en {formatMonthLabel(selectedMonth)}
          </p>
        </div>
        <div className="inline-flex items-center gap-1 p-1 bg-emerald-950/[0.06] rounded-lg w-fit">
          <button
            type="button"
            onClick={() => setMonthsSpan(6)}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              monthsSpan === 6
                ? 'bg-white text-[#0B3B24] shadow-xs'
                : 'text-slate-600 hover:text-[#0B3B24]'
            }`}
          >
            Últimos 6 meses
          </button>
          <button
            type="button"
            onClick={() => setMonthsSpan(12)}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              monthsSpan === 12
                ? 'bg-white text-[#0B3B24] shadow-xs'
                : 'text-slate-600 hover:text-[#0B3B24]'
            }`}
          >
            Últimos 12 meses
          </button>
        </div>
      </div>

      {/* Chart 1: Monthly Income vs Expense Bar Chart */}
      <section className="bg-white border border-emerald-950/10 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Ingresos vs. Gastos por mes</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Haz clic en cualquier mes para inspeccionar su desglose
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#15803D]" aria-hidden="true" />
              Ingresos
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-rose-600" aria-hidden="true" />
              Gastos
            </span>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={monthlySeries}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              onClick={(state) => {
                const key = (state as { activePayload?: { payload?: { monthKey?: string } }[] })
                  ?.activePayload?.[0]?.payload?.monthKey;
                if (key) onSelectMonth(key);
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
                width={72}
                tick={{ fill: '#64748B', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                tickFormatter={(v) => formatCompactCurrency(Number(v), currency)}
              />
              <Tooltip
                cursor={{ fill: '#F3F7F4' }}
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const row = payload[0].payload as (typeof monthlySeries)[number];
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
                        Balance: {row.balance >= 0 ? '+' : '−'}
                        {formatCurrency(Math.abs(row.balance), currency)} ({row.savingsRate}%)
                      </p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="ingresos" fill="#15803D" radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="gastos" fill="#E11D48" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Charts 2 & 3: Net Savings Area Chart + Category Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <section className="lg:col-span-7 bg-white border border-emerald-950/10 rounded-xl p-6 flex flex-col">
          <div className="mb-5">
            <h3 className="text-base font-semibold text-slate-900">Balance neto mensual</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Diferencia entre ingresos y gastos totales por mes
            </p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlySeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="netBalanceFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
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
                  width={72}
                  tick={{ fill: '#64748B', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                  tickFormatter={(v) => formatCompactCurrency(Number(v), currency)}
                />
                <ReferenceLine y={0} stroke="#94A3B8" strokeDasharray="4 4" />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const row = payload[0].payload as (typeof monthlySeries)[number];
                    return (
                      <div className="bg-white border border-slate-200 rounded-lg px-3.5 py-2 shadow-sm text-xs">
                        <p className="font-semibold text-slate-900 mb-1">{label}</p>
                        <p
                          className={`font-mono tabular-nums ${
                            row.balance >= 0 ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {row.balance >= 0 ? '+' : '−'}
                          {formatCurrency(Math.abs(row.balance), currency)}
                        </p>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="balance"
                  stroke="#12663F"
                  strokeWidth={2.25}
                  fill="url(#netBalanceFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="lg:col-span-5 bg-white border border-emerald-950/10 rounded-xl p-6 flex flex-col">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-slate-900">Gastos por categoría</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {formatMonthLabel(selectedMonth)} · Total{' '}
              <span className="font-mono tabular-nums text-slate-700">
                {formatCurrency(expenseBreakdown.total, currency)}
              </span>
            </p>
          </div>

          {expenseBreakdown.items.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-12 text-center">
              <p className="text-xs text-slate-500 max-w-xs">
                No hay gastos registrados en {formatMonthLabel(selectedMonth)}.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4 flex-1">
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expenseBreakdown.items}
                      dataKey="amount"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={82}
                      paddingAngle={2}
                    >
                      {expenseBreakdown.items.map((entry) => (
                        <Cell key={entry.id} fill={entry.color} stroke="#FFFFFF" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) return null;
                        const item = payload[0].payload as (typeof expenseBreakdown.items)[number];
                        return (
                          <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm text-xs">
                            <p className="font-semibold text-slate-900">{item.name}</p>
                            <p className="font-mono tabular-nums text-slate-700 mt-0.5">
                              {formatCurrency(item.amount, currency)} ({item.percent.toFixed(1)}%)
                            </p>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                {expenseBreakdown.items.map((item) => (
                  <div
                    key={item.id}
                    className="py-2 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: item.color }}
                        aria-hidden="true"
                      />
                      <span className="text-slate-700 truncate">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 font-mono tabular-nums">
                      <span className="text-slate-400">{item.percent.toFixed(0)}%</span>
                      <span className="font-medium text-slate-900">
                        {formatCurrency(item.amount, currency)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Category Budget Progress (if any budgets configured) */}
      <section className="bg-white border border-emerald-950/10 rounded-xl p-6">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-slate-900">
            Seguimiento de presupuestos mensuales
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Comparación del gasto acumulado en {formatMonthLabel(selectedMonth)} contra tus límites
            por categoría
          </p>
        </div>

        {budgetRows.length === 0 ? (
          <p className="text-xs text-slate-500 py-4">
            Aún no has asignado presupuestos mensuales a tus categorías de gasto. Puedes definirlos
            desde la sección de Categorías.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {budgetRows.map((row) => {
              const overBudget = row.remaining < 0;
              const warning = !overBudget && row.pct >= 85;
              const statusText = overBudget
                ? `Excedido por ${formatCurrency(Math.abs(row.remaining), currency)}`
                : warning
                  ? `Cerca del límite · Restan ${formatCurrency(row.remaining, currency)}`
                  : `Disponible ${formatCurrency(row.remaining, currency)}`;

              return (
                <div key={row.id} className="py-3.5 first:pt-1 last:pb-1 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: row.color }}
                        aria-hidden="true"
                      />
                      <span className="font-medium text-slate-900">{row.name}</span>
                    </div>
                    <div className="font-mono text-xs tabular-nums text-slate-600">
                      <span className="font-semibold text-slate-900">
                        {formatCurrency(row.spent, currency)}
                      </span>{' '}
                      / {formatCurrency(row.budget, currency)} ({Math.round(row.pct)}%)
                    </div>
                  </div>
                  <div className="h-2 w-full bg-emerald-950/[0.07] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        overBudget
                          ? 'bg-rose-600'
                          : warning
                            ? 'bg-amber-600'
                            : 'bg-[#12663F]'
                      }`}
                      style={{ width: `${Math.min(100, row.pct)}%` }}
                    />
                  </div>
                  <p
                    className={`text-xs ${
                      overBudget
                        ? 'text-rose-700 font-medium'
                        : warning
                          ? 'text-amber-700'
                          : 'text-slate-500'
                    }`}
                  >
                    {statusText}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
