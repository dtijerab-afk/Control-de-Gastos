import { useState } from 'react';
import { AlertCircle, AlertTriangle, ChevronDown, ChevronUp, X } from 'lucide-react';
import {
  BUDGET_ALERT_THRESHOLD_OPTIONS,
  type BudgetAlertItem,
} from '../lib/budgetAlerts';
import { formatCurrency, formatMonthLabel } from '../lib/financeUtils';
import type { CurrencyCode, NavSection } from '../types/finance';

interface BudgetAlertBannerProps {
  alerts: BudgetAlertItem[];
  selectedMonth: string;
  currency: CurrencyCode;
  thresholdPct: number;
  onChangeThreshold: (nextPct: number) => void;
  onDismissAll: () => void;
  onNavigate: (section: NavSection) => void;
}

export function BudgetAlertBanner({
  alerts,
  selectedMonth,
  currency,
  thresholdPct,
  onChangeThreshold,
  onDismissAll,
  onNavigate,
}: BudgetAlertBannerProps) {
  const [expanded, setExpanded] = useState(false);

  if (alerts.length === 0) return null;

  const hasExceeded = alerts.some((a) => a.severity === 'exceeded');
  const primary = alerts[0];
  const extraCount = alerts.length - 1;

  const containerTone = hasExceeded
    ? 'bg-rose-50 border-rose-200 text-rose-950'
    : 'bg-amber-50 border-amber-200 text-amber-950';

  const iconTone = hasExceeded ? 'text-rose-700' : 'text-amber-700';
  const subTextTone = hasExceeded ? 'text-rose-800' : 'text-amber-900/90';
  const dividerTone = hasExceeded ? 'border-rose-200/80' : 'border-amber-200/80';
  const actionTone = hasExceeded
    ? 'text-rose-800 hover:text-rose-950'
    : 'text-amber-900 hover:text-amber-950';

  const primaryTitle =
    primary.severity === 'exceeded'
      ? primary.scope === 'global'
        ? `Superaste tu presupuesto mensual (${Math.round(primary.pct)}%)`
        : `Presupuesto superado en ${primary.label} (${Math.round(primary.pct)}%)`
      : primary.scope === 'global'
        ? `Cerca de superar tu presupuesto mensual (${Math.round(primary.pct)}%)`
        : `Cerca del límite en ${primary.label} (${Math.round(primary.pct)}%)`;

  const primaryDetail =
    primary.severity === 'exceeded'
      ? `Gastado ${formatCurrency(primary.spent, currency)} de ${formatCurrency(primary.budget, currency)} · Excedido por ${formatCurrency(Math.abs(primary.remaining), currency)}`
      : `Gastado ${formatCurrency(primary.spent, currency)} de ${formatCurrency(primary.budget, currency)} · Restan ${formatCurrency(primary.remaining, currency)}`;

  return (
    <section
      role="status"
      aria-live="polite"
      aria-label={`Alertas de presupuesto de ${formatMonthLabel(selectedMonth)}`}
      className={`mb-3 sm:mb-4 rounded-2xl border px-3.5 py-2.5 sm:px-4 sm:py-3 shadow-xs ${containerTone}`}
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-2.5 min-w-0">
          <span
            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${
              hasExceeded
                ? 'bg-rose-100/90 border-rose-200 text-rose-700'
                : 'bg-amber-100/90 border-amber-200 text-amber-700'
            }`}
          >
            {hasExceeded ? (
              <AlertCircle className={`w-4 h-4 shrink-0 ${iconTone}`} />
            ) : (
              <AlertTriangle className={`w-4 h-4 shrink-0 ${iconTone}`} />
            )}
          </span>
          <div className="min-w-0">
            <p className="text-[15px] sm:text-sm font-bold leading-snug">{primaryTitle}</p>
            <p className={`text-[13px] sm:text-xs font-semibold sm:font-medium font-mono tabular-nums mt-0.5 ${subTextTone}`}>
              {primaryDetail}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onDismissAll}
          aria-label="Ocultar aviso de presupuesto"
          title="Ocultar aviso"
          className={`p-1.5 -mr-1 -mt-0.5 rounded-lg hover:bg-black/5 transition-colors shrink-0 ${actionTone}`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Compact Action & Threshold Row */}
      <div className={`mt-2 pt-2 border-t ${dividerTone} flex flex-wrap items-center justify-between gap-2 text-[13px] sm:text-xs`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {extraCount > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className={`inline-flex items-center gap-1 font-bold hover:underline whitespace-nowrap ${actionTone}`}
            >
              {expanded ? (
                <>
                  Ocultar detalle
                  <ChevronUp className="w-3.5 h-3.5" />
                </>
              ) : (
                <>
                  +{extraCount} {extraCount === 1 ? 'alerta más' : 'alertas más'}
                  <ChevronDown className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => onNavigate(primary.scope === 'global' ? 'resumen' : 'graficas')}
            className={`font-bold hover:underline whitespace-nowrap ${actionTone}`}
          >
            Ver presupuesto
          </button>
        </div>

        <label className="inline-flex items-center gap-1.5 font-semibold whitespace-nowrap">
          <span>Avisar desde</span>
          <select
            aria-label="Porcentaje de aviso de presupuesto"
            value={thresholdPct}
            onChange={(e) => onChangeThreshold(Number(e.target.value))}
            className="bg-white/90 border border-current/20 rounded-md px-1.5 py-0.5 text-[13px] sm:text-xs font-mono font-bold tabular-nums focus:outline-none"
          >
            {BUDGET_ALERT_THRESHOLD_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}%
              </option>
            ))}
          </select>
        </label>
      </div>

      {expanded && extraCount > 0 && (
        <ul className={`mt-2 pt-2 border-t ${dividerTone} divide-y divide-current/10`}>
          {alerts.slice(1).map((item) => {
            const itemOver = item.severity === 'exceeded';
            return (
              <li
                key={item.id}
                className="py-1.5 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[13px] sm:text-xs"
              >
                <span className="font-bold">
                  {item.label} · {itemOver ? 'Superado' : 'Cerca del límite'} ({Math.round(item.pct)}%)
                </span>
                <span className="font-mono font-semibold tabular-nums">
                  {formatCurrency(item.spent, currency)} / {formatCurrency(item.budget, currency)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
