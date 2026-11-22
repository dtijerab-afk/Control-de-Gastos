import { useMemo, useState } from 'react';
import { Copy, Download, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import {
  exportTransactionsToCsv,
  formatCurrency,
  formatMonthLabel,
  formatShortDate,
  getPaymentMethodLabel,
  getQuincenaRangeLabel,
  mapDateToTargetQuincena,
} from '../lib/financeUtils';
import { createTransaction, deleteTransaction } from '../services/financeService';
import type { QuincenaFilter, QuincenaNumber, Transaction, TransactionType } from '../types/finance';

interface TransactionsViewProps {
  selectedMonth: string;
  selectedQuincena: QuincenaFilter;
  onChangeQuincena: (q: QuincenaFilter) => void;
  onOpenNewTransaction: () => void;
  onEditTransaction: (tx: Transaction) => void;
}

export function TransactionsView({
  selectedMonth,
  selectedQuincena,
  onChangeQuincena,
  onOpenNewTransaction,
  onEditTransaction,
}: TransactionsViewProps) {
  const { user, transactions, categories, currency, loadingData } = useFinance();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [expandedActionId, setExpandedActionId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (tx.monthKey !== selectedMonth) return false;
      if (selectedQuincena !== 'all' && tx.quincena !== selectedQuincena) return false;
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
      if (categoryFilter !== 'all' && tx.categoryId !== categoryFilter) return false;
      if (q) {
        const haystack = `${tx.description} ${tx.categoryName} ${tx.notes}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, selectedMonth, selectedQuincena, typeFilter, categoryFilter, search]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const tx of filtered) {
      if (tx.type === 'ingreso') income += tx.amount;
      else expense += tx.amount;
    }
    return { income, expense, net: income - expense };
  }, [filtered]);

  const handleDelete = async (id: string) => {
    if (!user) return;
    setBusyId(id);
    setFeedback(null);
    try {
      await deleteTransaction(user.uid, id);
      setConfirmDeleteId(null);
      setExpandedActionId((curr) => (curr === id ? null : curr));
    } finally {
      setBusyId(null);
    }
  };

  const handleDuplicateOtherQuincena = async (tx: Transaction) => {
    if (!user) return;
    const existsCat = categories.some((c) => c.id === tx.categoryId);
    if (!existsCat) {
      setFeedback('La categoría original ya no existe; edita el movimiento para reasignarla.');
      return;
    }
    const targetQ: QuincenaNumber = tx.quincena === 1 ? 2 : 1;
    const targetDate = mapDateToTargetQuincena(tx.date, tx.monthKey, targetQ);

    setBusyId(tx.id);
    setFeedback(null);
    try {
      await createTransaction(user.uid, {
        type: tx.type,
        amount: tx.amount,
        description: tx.description,
        categoryId: tx.categoryId,
        categoryName: tx.categoryName,
        date: targetDate,
        quincena: targetQ,
        paymentMethod: tx.paymentMethod,
        notes: tx.notes,
      });
      setExpandedActionId(null);
      setFeedback(
        `Se duplicó "${tx.description}" en la ${targetQ === 1 ? '1ª' : '2ª'} Quincena.`
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleExport = () => {
    const suffix =
      selectedQuincena === 'all' ? selectedMonth : `${selectedMonth}_Q${selectedQuincena}`;
    exportTransactionsToCsv(filtered, currency, `quincena_${suffix}`);
  };

  return (
    <div className="space-y-2 sm:space-y-3.5">
      {/* Filter & Search Bar */}
      <div className="bg-white border border-emerald-950/10 rounded-xl p-2.5 sm:p-4 space-y-2 sm:space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
          {/* Quincena Segmented Filter */}
          <div className="inline-flex items-center gap-0.5 sm:gap-1 p-0.5 sm:p-1 bg-emerald-950/[0.06] rounded-lg w-full sm:w-fit overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => onChangeQuincena('all')}
              className={`flex-1 sm:flex-none px-2 sm:px-3 py-1 sm:py-1.5 text-[13px] sm:text-xs font-bold sm:font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                selectedQuincena === 'all'
                  ? 'bg-white text-[#0B3B24] shadow-xs'
                  : 'text-slate-700 sm:text-slate-600 hover:text-[#0B3B24]'
              }`}
            >
              Todo el mes
            </button>
            <button
              type="button"
              onClick={() => onChangeQuincena(1)}
              className={`flex-1 sm:flex-none px-2 sm:px-3 py-1 sm:py-1.5 text-[13px] sm:text-xs font-bold sm:font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                selectedQuincena === 1
                  ? 'bg-white text-[#0B3B24] shadow-xs'
                  : 'text-slate-700 sm:text-slate-600 hover:text-[#0B3B24]'
              }`}
            >
              1ª Q ({getQuincenaRangeLabel(selectedMonth, 1)})
            </button>
            <button
              type="button"
              onClick={() => onChangeQuincena(2)}
              className={`flex-1 sm:flex-none px-2 sm:px-3 py-1 sm:py-1.5 text-[13px] sm:text-xs font-bold sm:font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                selectedQuincena === 2
                  ? 'bg-white text-[#0B3B24] shadow-xs'
                  : 'text-slate-700 sm:text-slate-600 hover:text-[#0B3B24]'
              }`}
            >
              2ª Q ({getQuincenaRangeLabel(selectedMonth, 2)})
            </button>
          </div>

          <div className="flex items-center justify-between sm:justify-start gap-1.5 sm:gap-2">
            {/* Type Filter */}
            <div className="inline-flex items-center gap-0.5 sm:gap-1 p-0.5 sm:p-1 bg-emerald-950/[0.06] rounded-lg">
              {(
                [
                  { id: 'all', label: 'Todos' },
                  { id: 'ingreso', label: 'Ingresos' },
                  { id: 'gasto', label: 'Gastos' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setTypeFilter(tab.id)}
                  className={`px-2.5 py-1 sm:py-1.5 text-[13px] sm:text-xs font-bold sm:font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    typeFilter === tab.id
                      ? 'bg-white text-[#0B3B24] shadow-xs'
                      : 'text-slate-700 sm:text-slate-600 hover:text-[#0B3B24]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={filtered.length === 0}
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 text-[13px] sm:text-xs font-bold sm:font-medium text-[#0B3B24] bg-[#F3F7F4] border border-emerald-900/15 hover:bg-emerald-50 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5 text-[#12663F]" />
              CSV
            </button>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-1.5 sm:gap-2.5">
          <div className="col-span-7 md:col-span-8 relative">
            <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-900/50 absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              placeholder="Buscar movimiento..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 sm:pl-9 pr-2.5 sm:pr-3 py-1.5 sm:py-2 text-sm font-medium text-slate-900 bg-[#F4F8F5] border border-emerald-950/12 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-[#12663F]"
            />
          </div>

          <div className="col-span-5 md:col-span-4">
            <select
              aria-label="Filtrar por categoría"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-sm font-medium text-slate-900 bg-[#F4F8F5] border border-emerald-950/12 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-[#12663F] truncate"
            >
              <option value="all">Categorías</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name} ({cat.type === 'ingreso' ? 'Ingreso' : 'Gasto'})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Summary Metadata Line (Zero-Pill discipline) */}
        <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-0.5 pt-1.5 sm:pt-2 border-t border-slate-100 text-[13px] sm:text-xs font-bold sm:font-normal text-slate-700 sm:text-slate-600 leading-tight">
          <span>
            {filtered.length} mov. · {formatMonthLabel(selectedMonth)}
          </span>
          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>
          <span className="font-mono tabular-nums text-emerald-700">
            +{formatCurrency(totals.income, currency)}
          </span>
          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>
          <span className="font-mono tabular-nums text-rose-700">
            −{formatCurrency(totals.expense, currency)}
          </span>
          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>
          <span className="font-mono font-bold tabular-nums text-slate-900">
            Neto {totals.net >= 0 ? '+' : '−'}
            {formatCurrency(Math.abs(totals.net), currency)}
          </span>
        </div>
      </div>

      {feedback && (
        <div className="px-3 py-1.5 sm:py-2 text-[13px] sm:text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between">
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="font-bold hover:underline ml-3 shrink-0"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* High-Density Ledger (Ultra-Compact Mobile List + Dense Desktop Table) */}
      <section className="bg-white border border-emerald-950/10 rounded-xl overflow-hidden">
        {loadingData ? (
          <div className="divide-y divide-slate-100">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div key={n} className="px-3 sm:px-4 py-2 flex items-center justify-between">
                <div className="h-3.5 w-48 bg-emerald-950/[0.06] rounded animate-pulse" />
                <div className="h-3.5 w-20 bg-emerald-950/[0.06] rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-7 sm:py-10 text-center">
            <p className="text-base sm:text-sm font-bold text-slate-900">
              No se encontraron movimientos con estos filtros
            </p>
            <p className="text-sm sm:text-xs font-medium sm:font-normal text-slate-600 sm:text-slate-500 mt-1 mb-3.5">
              Ajusta los criterios de búsqueda o registra un nuevo ingreso o gasto.
            </p>
            <button
              type="button"
              onClick={onOpenNewTransaction}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm sm:text-xs font-bold text-white bg-[#12663F] hover:bg-[#0D4F30] rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              Nuevo movimiento
            </button>
          </div>
        ) : (
          <>
            {/* Mobile Ultra-Compact Bold Ledger List */}
            <ul className="sm:hidden divide-y divide-slate-100">
              {filtered.map((tx) => {
                const isConfirming = confirmDeleteId === tx.id;
                const isExpanded = expandedActionId === tx.id || isConfirming;
                const isBusy = busyId === tx.id;

                return (
                  <li
                    key={tx.id}
                    className={`px-2.5 py-1.5 transition-colors ${
                      isExpanded ? 'bg-[#F7FAF8]' : 'active:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {/* Primary tappable row body (opens edit) */}
                      <button
                        type="button"
                        onClick={() => onEditTransaction(tx)}
                        className="flex-1 min-w-0 text-left py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30 rounded"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-[15px] font-bold text-slate-900 truncate leading-tight">
                            {tx.description}
                          </p>
                          <span
                            className={`text-[15px] font-mono font-bold tabular-nums whitespace-nowrap shrink-0 leading-tight ${
                              tx.type === 'ingreso' ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {tx.type === 'ingreso' ? '+' : '−'}
                            {formatCurrency(tx.amount, currency)}
                          </span>
                        </div>
                        <p className="text-[12.5px] font-semibold text-slate-600 truncate leading-tight mt-0.5">
                          {formatShortDate(tx.date)} · {tx.categoryName} ·{' '}
                          {tx.quincena === 1 ? '1ª Q' : '2ª Q'}
                          {tx.notes ? ` · ${tx.notes}` : ''}
                        </p>
                      </button>

                      {/* Compact action menu toggle (keeps row height tight, prevents mis-taps) */}
                      <button
                        type="button"
                        onClick={() => {
                          if (isExpanded) {
                            setExpandedActionId(null);
                            setConfirmDeleteId((curr) => (curr === tx.id ? null : curr));
                          } else {
                            setExpandedActionId(tx.id);
                            setConfirmDeleteId(null);
                          }
                        }}
                        aria-expanded={isExpanded}
                        aria-label={`Acciones para ${tx.description}`}
                        className={`shrink-0 flex items-center justify-center w-8 h-9 -mr-1.5 rounded-md transition-colors ${
                          isExpanded
                            ? 'text-[#0B3B24] bg-emerald-900/10'
                            : 'text-slate-500 active:text-slate-900 active:bg-slate-100'
                        }`}
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Expandable inline action bar */}
                    {isExpanded && (
                      <div className="mt-1.5 pt-1.5 border-t border-emerald-950/10 flex items-center justify-between gap-1.5">
                        {isConfirming ? (
                          <>
                            <span className="text-[13px] font-bold text-rose-800 truncate">
                              ¿Eliminar movimiento?
                            </span>
                            <div className="inline-flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleDelete(tx.id)}
                                className="px-2.5 py-1 text-xs font-bold text-white bg-rose-700 active:bg-rose-800 disabled:opacity-60 rounded-md whitespace-nowrap"
                              >
                                {isBusy ? 'Borrando...' : 'Sí, eliminar'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-1 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-md whitespace-nowrap"
                              >
                                Cancelar
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setExpandedActionId(null);
                                  onEditTransaction(tx);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-slate-800 bg-white border border-slate-200 active:bg-slate-100 rounded-md whitespace-nowrap"
                              >
                                <Pencil className="w-3.5 h-3.5 text-slate-600" />
                                Editar
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleDuplicateOtherQuincena(tx)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-[#0B3B24] bg-white border border-emerald-900/15 active:bg-emerald-50 disabled:opacity-60 rounded-md whitespace-nowrap"
                              >
                                <Copy className="w-3.5 h-3.5 text-[#12663F]" />
                                {isBusy ? 'Copiando...' : `Duplicar ${tx.quincena === 1 ? '2ª' : '1ª'} Q`}
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(tx.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 active:bg-rose-100 rounded-md whitespace-nowrap shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Eliminar
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {/* Desktop High-Density Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-emerald-950/10 bg-[#F4F8F5] text-xs font-semibold text-emerald-950/70">
                    <th className="py-1.5 pl-4 pr-2">Fecha</th>
                    <th className="py-1.5 px-2">Concepto</th>
                    <th className="py-1.5 px-2">Categoría</th>
                    <th className="py-1.5 px-2">Quincena</th>
                    <th className="py-1.5 px-2 text-right">Monto</th>
                    <th className="py-1.5 pl-2 pr-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filtered.map((tx) => {
                    const isConfirming = confirmDeleteId === tx.id;
                    const isBusy = busyId === tx.id;

                    return (
                      <tr key={tx.id} className="hover:bg-slate-50/90 transition-colors">
                        <td className="py-1.5 pl-4 pr-2 text-xs font-mono tabular-nums text-slate-600 whitespace-nowrap">
                          {formatShortDate(tx.date)}
                        </td>
                        <td className="py-1.5 px-2">
                          <p className="font-semibold text-slate-900 leading-tight">{tx.description}</p>
                          <p className="text-[11px] text-slate-500 leading-tight mt-0.5">
                            {getPaymentMethodLabel(tx.paymentMethod)}
                            {tx.notes ? ` · ${tx.notes}` : ''}
                          </p>
                        </td>
                        <td className="py-1.5 px-2 text-xs font-medium text-slate-700 whitespace-nowrap">
                          {tx.categoryName}
                        </td>
                        <td className="py-1.5 px-2 text-xs text-slate-500 whitespace-nowrap">
                          {tx.quincena === 1 ? '1ª Quincena' : '2ª Quincena'}
                        </td>
                        <td
                          className={`py-1.5 px-2 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${
                            tx.type === 'ingreso' ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {tx.type === 'ingreso' ? '+' : '−'}
                          {formatCurrency(tx.amount, currency)}
                        </td>
                        <td className="py-1.5 pl-2 pr-4 text-right whitespace-nowrap">
                          {isConfirming ? (
                            <div className="inline-flex items-center gap-2 text-xs">
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleDelete(tx.id)}
                                className="px-2.5 py-1 font-semibold text-white bg-rose-700 hover:bg-rose-800 rounded-md"
                              >
                                {isBusy ? 'Borrando...' : 'Eliminar'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-1 text-slate-600 hover:text-slate-900"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-0.5">
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleDuplicateOtherQuincena(tx)}
                                title={`Duplicar en ${tx.quincena === 1 ? '2ª' : '1ª'} quincena`}
                                aria-label={`Duplicar en ${tx.quincena === 1 ? '2ª' : '1ª'} quincena`}
                                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onEditTransaction(tx)}
                                title="Editar movimiento"
                                aria-label="Editar movimiento"
                                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(tx.id)}
                                title="Eliminar movimiento"
                                aria-label="Eliminar movimiento"
                                className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-md transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
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
