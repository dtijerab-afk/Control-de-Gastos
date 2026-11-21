import React, { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import {
  getDefaultDateForPeriod,
  getQuincenaFromDate,
  getQuincenaRangeLabel,
  getMonthKeyFromDate,
} from '../lib/financeUtils';
import { createCategory, createTransaction, updateTransaction } from '../services/financeService';
import {
  CATEGORY_COLOR_SWATCHES,
  PAYMENT_METHODS,
  VALIDATION_LIMITS,
  type PaymentMethod,
  type QuincenaFilter,
  type QuincenaNumber,
  type Transaction,
  type TransactionType,
} from '../types/finance';

interface TransactionModalProps {
  open: boolean;
  onClose: () => void;
  editingTransaction: Transaction | null;
  defaultMonthKey: string;
  defaultQuincena: QuincenaFilter;
}

export function TransactionModal({
  open,
  onClose,
  editingTransaction,
  defaultMonthKey,
  defaultQuincena,
}: TransactionModalProps) {
  const { user, categories, currency } = useFinance();

  const [type, setType] = useState<TransactionType>('gasto');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState('');
  const [quincena, setQuincena] = useState<QuincenaNumber>(1);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('debito');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline quick custom category creation
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState(CATEGORY_COLOR_SWATCHES[0].hex);
  const [savingCategory, setSavingCategory] = useState(false);

  const filteredCategories = useMemo(
    () => categories.filter((c) => c.type === type),
    [categories, type]
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    setCreatingCategory(false);
    setNewCatName('');

    if (editingTransaction) {
      setType(editingTransaction.type);
      setAmount(String(editingTransaction.amount));
      setDescription(editingTransaction.description);
      setCategoryId(editingTransaction.categoryId);
      setDate(editingTransaction.date);
      setQuincena(editingTransaction.quincena);
      setPaymentMethod(editingTransaction.paymentMethod);
      setNotes(editingTransaction.notes || '');
    } else {
      const initialDate = getDefaultDateForPeriod(defaultMonthKey, defaultQuincena);
      const initialQ: QuincenaNumber =
        defaultQuincena === 'all' ? getQuincenaFromDate(initialDate) : defaultQuincena;
      setType('gasto');
      setAmount('');
      setDescription('');
      setDate(initialDate);
      setQuincena(initialQ);
      setPaymentMethod('debito');
      setNotes('');
      const firstGasto = categories.find((c) => c.type === 'gasto');
      setCategoryId(firstGasto?.id ?? '');
    }
  }, [open, editingTransaction, defaultMonthKey, defaultQuincena, categories]);

  // Keep categoryId valid when switching between ingreso and gasto
  useEffect(() => {
    if (!open) return;
    if (filteredCategories.length === 0) {
      setCategoryId('');
      return;
    }
    const exists = filteredCategories.some((c) => c.id === categoryId);
    if (!exists) {
      setCategoryId(filteredCategories[0].id);
    }
  }, [open, filteredCategories, categoryId]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open || !user) return null;

  const activeMonthKey = date.length >= 7 ? getMonthKeyFromDate(date) : defaultMonthKey;

  const handleDateChange = (nextDate: string) => {
    setDate(nextDate);
    if (VALIDATION_LIMITS.DATE_PATTERN.test(nextDate)) {
      setQuincena(getQuincenaFromDate(nextDate));
    }
  };

  const handleQuickCreateCategory = async () => {
    if (!newCatName.trim()) {
      setError('Escribe un nombre para la nueva categoría.');
      return;
    }
    setSavingCategory(true);
    setError(null);
    try {
      const createdId = await createCategory(user.uid, {
        name: newCatName.trim(),
        type,
        color: newCatColor,
        monthlyBudget: 0,
      });
      setCategoryId(createdId);
      setNewCatName('');
      setCreatingCategory(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la categoría.');
    } finally {
      setSavingCategory(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsedAmount = Number(amount.replace(',', '.'));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Ingresa un monto mayor a cero.');
      return;
    }
    if (!description.trim()) {
      setError('Ingresa una descripción para este movimiento.');
      return;
    }
    const selectedCategory = filteredCategories.find((c) => c.id === categoryId);
    if (!selectedCategory) {
      setError('Selecciona o crea una categoría antes de guardar.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        type,
        amount: parsedAmount,
        description: description.trim(),
        categoryId: selectedCategory.id,
        categoryName: selectedCategory.name,
        date,
        quincena,
        paymentMethod,
        notes: notes.trim(),
      };

      if (editingTransaction) {
        await updateTransaction(user.uid, editingTransaction.id, payload);
      } else {
        await createTransaction(user.uid, payload);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el movimiento.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tx-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 id="tx-modal-title" className="text-base font-semibold text-slate-900">
            {editingTransaction ? 'Editar movimiento' : 'Registrar movimiento'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ventana"
            className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Type Segmented Control */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Tipo de movimiento
            </label>
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setType('gasto')}
                className={`py-2 px-3 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                  type === 'gasto'
                    ? 'bg-white text-rose-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Gasto (−)
              </button>
              <button
                type="button"
                onClick={() => setType('ingreso')}
                className={`py-2 px-3 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                  type === 'ingreso'
                    ? 'bg-white text-emerald-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Ingreso (+)
              </button>
            </div>
          </div>

          {/* Amount & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="tx-amount" className="block text-xs font-medium text-slate-600 mb-1.5">
                Monto ({currency})
              </label>
              <input
                id="tx-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                max={VALIDATION_LIMITS.AMOUNT_MAX}
                required
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3.5 py-2.5 text-base font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F5132]/25 focus:border-[#0F5132]"
              />
            </div>

            <div>
              <label htmlFor="tx-date" className="block text-xs font-medium text-slate-600 mb-1.5">
                Fecha
              </label>
              <input
                id="tx-date"
                type="date"
                required
                value={date}
                onChange={(e) => handleDateChange(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F5132]/25 focus:border-[#0F5132]"
              />
            </div>
          </div>

          {/* Quincena Selector */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Quincena asignada
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setQuincena(1)}
                className={`px-3 py-2.5 text-left rounded-lg border transition-colors ${
                  quincena === 1
                    ? 'border-[#12663F] bg-emerald-50/70 text-[#0B3B24]'
                    : 'border-slate-200 text-slate-600 hover:border-emerald-900/25'
                }`}
              >
                <span className="block text-xs font-semibold">1ª Quincena</span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  {getQuincenaRangeLabel(activeMonthKey, 1)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setQuincena(2)}
                className={`px-3 py-2.5 text-left rounded-lg border transition-colors ${
                  quincena === 2
                    ? 'border-[#12663F] bg-emerald-50/70 text-[#0B3B24]'
                    : 'border-slate-200 text-slate-600 hover:border-emerald-900/25'
                }`}
              >
                <span className="block text-xs font-semibold">2ª Quincena</span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  {getQuincenaRangeLabel(activeMonthKey, 2)}
                </span>
              </button>
            </div>
          </div>

          {/* Description */}
          <div>
            <label htmlFor="tx-desc" className="block text-xs font-medium text-slate-600 mb-1.5">
              Concepto o descripción
            </label>
            <input
              id="tx-desc"
              type="text"
              required
              maxLength={VALIDATION_LIMITS.DESCRIPTION_MAX}
              placeholder={type === 'ingreso' ? 'Ej. Pago de nómina quincenal' : 'Ej. Despensa semanal'}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F5132]/25 focus:border-[#0F5132]"
            />
          </div>

          {/* Category + Inline Quick Create */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="tx-category" className="block text-xs font-medium text-slate-600">
                Categoría
              </label>
              <button
                type="button"
                onClick={() => setCreatingCategory((prev) => !prev)}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#12663F] hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                {creatingCategory ? 'Cancelar nueva' : 'Nueva categoría'}
              </button>
            </div>

            {creatingCategory ? (
              <div className="p-3.5 bg-[#F4F8F5] border border-emerald-950/12 rounded-lg space-y-3">
                <input
                  type="text"
                  maxLength={VALIDATION_LIMITS.CATEGORY_NAME_MAX}
                  placeholder={`Nombre de categoría de ${type}`}
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#0F5132]"
                />
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {CATEGORY_COLOR_SWATCHES.slice(0, 8).map((swatch) => (
                      <button
                        key={swatch.hex}
                        type="button"
                        onClick={() => setNewCatColor(swatch.hex)}
                        aria-label={`Color ${swatch.name}`}
                        className={`w-6 h-6 rounded-md transition-transform ${
                          newCatColor === swatch.hex
                            ? 'ring-2 ring-offset-1 ring-slate-900 scale-105'
                            : 'hover:scale-105'
                        }`}
                        style={{ backgroundColor: swatch.hex }}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={savingCategory}
                    onClick={handleQuickCreateCategory}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-[#0F5132] hover:bg-[#0B3D26] disabled:opacity-60 rounded-md whitespace-nowrap shrink-0"
                  >
                    {savingCategory ? 'Creando...' : 'Crear y elegir'}
                  </button>
                </div>
              </div>
            ) : (
              <select
                id="tx-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F5132]/25 focus:border-[#0F5132]"
              >
                {filteredCategories.length === 0 ? (
                  <option value="">Sin categorías disponibles — crea una nueva</option>
                ) : (
                  filteredCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))
                )}
              </select>
            )}
          </div>

          {/* Payment Method & Optional Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="tx-method" className="block text-xs font-medium text-slate-600 mb-1.5">
                Método de pago
              </label>
              <select
                id="tx-method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F5132]/25 focus:border-[#0F5132]"
              >
                {PAYMENT_METHODS.map((pm) => (
                  <option key={pm.value} value={pm.value}>
                    {pm.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="tx-notes" className="block text-xs font-medium text-slate-600 mb-1.5">
                Nota breve (opcional)
              </label>
              <input
                id="tx-notes"
                type="text"
                maxLength={VALIDATION_LIMITS.NOTES_MAX}
                placeholder="Referencia o detalle"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F5132]/25 focus:border-[#0F5132]"
              />
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="px-3.5 py-2.5 text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-lg"
            >
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-sm font-semibold text-white bg-[#12663F] hover:bg-[#0D4F30] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
            >
              {saving
                ? 'Guardando...'
                : editingTransaction
                  ? 'Guardar cambios'
                  : 'Guardar movimiento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
