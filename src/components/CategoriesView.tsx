import React, { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { formatCurrency, formatMonthLabel } from '../lib/financeUtils';
import {
  createCategory,
  deleteCategory,
  updateCategory,
  updateUserPreferences,
} from '../services/financeService';
import {
  CATEGORY_COLOR_SWATCHES,
  CURRENCIES,
  VALIDATION_LIMITS,
  type Category,
  type CurrencyCode,
  type TransactionType,
} from '../types/finance';

interface CategoriesViewProps {
  selectedMonth: string;
}

export function CategoriesView({ selectedMonth }: CategoriesViewProps) {
  const { user, categories, transactions, currency } = useFinance();
  const [activeType, setActiveType] = useState<TransactionType>('gasto');
  const [formOpen, setFormOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [type, setType] = useState<TransactionType>('gasto');
  const [color, setColor] = useState(CATEGORY_COLOR_SWATCHES[0].hex);
  const [monthlyBudget, setMonthlyBudget] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingCurrency, setSavingCurrency] = useState(false);

  const visibleCategories = useMemo(
    () => categories.filter((c) => c.type === activeType),
    [categories, activeType]
  );

  const statsByCategory = useMemo(() => {
    const map = new Map<string, { monthTotal: number; totalCount: number }>();
    for (const tx of transactions) {
      const current = map.get(tx.categoryId) ?? { monthTotal: 0, totalCount: 0 };
      current.totalCount += 1;
      if (tx.monthKey === selectedMonth) {
        current.monthTotal += tx.amount;
      }
      map.set(tx.categoryId, current);
    }
    return map;
  }, [transactions, selectedMonth]);

  const openCreateForm = () => {
    setEditingCat(null);
    setName('');
    setType(activeType);
    setColor(CATEGORY_COLOR_SWATCHES[0].hex);
    setMonthlyBudget('');
    setFormError(null);
    setFormOpen(true);
  };

  const openEditForm = (cat: Category) => {
    setEditingCat(cat);
    setName(cat.name);
    setType(cat.type);
    setColor(cat.color);
    setMonthlyBudget(cat.monthlyBudget > 0 ? String(cat.monthlyBudget) : '');
    setFormError(null);
    setFormOpen(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFormError(null);

    if (!name.trim()) {
      setFormError('Escribe un nombre para la categoría.');
      return;
    }

    const parsedBudget = monthlyBudget.trim() ? Number(monthlyBudget.replace(',', '.')) : 0;
    if (!Number.isFinite(parsedBudget) || parsedBudget < 0) {
      setFormError('El presupuesto mensual debe ser un número mayor o igual a cero.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        type,
        color,
        monthlyBudget: type === 'gasto' ? parsedBudget : 0,
      };
      if (editingCat) {
        const related = transactions.filter((t) => t.categoryId === editingCat.id);
        await updateCategory(user.uid, editingCat.id, payload, related);
      } else {
        await createCategory(user.uid, payload);
      }
      setActiveType(type);
      setFormOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo guardar la categoría.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (categoryId: string) => {
    if (!user) return;
    setDeletingId(categoryId);
    try {
      await deleteCategory(user.uid, categoryId);
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  const handleCurrencyChange = async (nextCurrency: CurrencyCode) => {
    if (!user) return;
    setSavingCurrency(true);
    try {
      await updateUserPreferences(user.uid, { currency: nextCurrency });
    } finally {
      setSavingCurrency(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg w-fit">
          <button
            type="button"
            onClick={() => setActiveType('gasto')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeType === 'gasto'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Categorías de gasto ({categories.filter((c) => c.type === 'gasto').length})
          </button>
          <button
            type="button"
            onClick={() => setActiveType('ingreso')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeType === 'ingreso'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Categorías de ingreso ({categories.filter((c) => c.type === 'ingreso').length})
          </button>
        </div>

        <button
          type="button"
          onClick={openCreateForm}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0F5132] hover:bg-[#0B3D26] rounded-lg transition-colors whitespace-nowrap shrink-0 w-fit"
        >
          <Plus className="w-3.5 h-3.5" />
          Nueva categoría
        </button>
      </div>

      {/* Category Create / Edit Form Panel */}
      {formOpen && (
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-slate-900">
              {editingCat ? 'Editar categoría' : 'Crear categoría personalizada'}
            </h3>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              aria-label="Cerrar formulario"
              className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSaveCategory} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-5">
                <label htmlFor="cat-name" className="block text-xs font-medium text-slate-600 mb-1.5">
                  Nombre de la categoría
                </label>
                <input
                  id="cat-name"
                  type="text"
                  required
                  maxLength={VALIDATION_LIMITS.CATEGORY_NAME_MAX}
                  placeholder="Ej. Educación, Gimnasio, Bonos"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F5132]/25 focus:border-[#0F5132]"
                />
              </div>

              <div className="md:col-span-3">
                <label htmlFor="cat-type" className="block text-xs font-medium text-slate-600 mb-1.5">
                  Tipo
                </label>
                <select
                  id="cat-type"
                  value={type}
                  onChange={(e) => setType(e.target.value as TransactionType)}
                  className="w-full px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F5132]/25 focus:border-[#0F5132]"
                >
                  <option value="gasto">Gasto</option>
                  <option value="ingreso">Ingreso</option>
                </select>
              </div>

              {type === 'gasto' && (
                <div className="md:col-span-4">
                  <label
                    htmlFor="cat-budget"
                    className="block text-xs font-medium text-slate-600 mb-1.5"
                  >
                    Presupuesto mensual opcional ({currency})
                  </label>
                  <input
                    id="cat-budget"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    max={VALIDATION_LIMITS.AMOUNT_MAX}
                    placeholder="Sin límite"
                    value={monthlyBudget}
                    onChange={(e) => setMonthlyBudget(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F5132]/25 focus:border-[#0F5132]"
                  />
                </div>
              )}
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-600 mb-2">
                Color en gráficas
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                {CATEGORY_COLOR_SWATCHES.map((swatch) => (
                  <button
                    key={swatch.hex}
                    type="button"
                    onClick={() => setColor(swatch.hex)}
                    title={swatch.name}
                    aria-label={`Color ${swatch.name}`}
                    className={`w-7 h-7 rounded-md transition-transform ${
                      color.toUpperCase() === swatch.hex.toUpperCase()
                        ? 'ring-2 ring-offset-2 ring-slate-900 scale-105'
                        : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: swatch.hex }}
                  />
                ))}
              </div>
            </div>

            {formError && (
              <div
                role="alert"
                className="px-3.5 py-2.5 text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-lg"
              >
                {formError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0F5132] hover:bg-[#0B3D26] disabled:opacity-60 rounded-lg whitespace-nowrap"
              >
                {saving ? 'Guardando...' : editingCat ? 'Guardar cambios' : 'Crear categoría'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Categories List */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {activeType === 'gasto' ? 'Categorías de gasto' : 'Categorías de ingreso'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Acumulado mostrado para {formatMonthLabel(selectedMonth)}
            </p>
          </div>
        </div>

        {visibleCategories.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate-900">No hay categorías en esta sección</p>
            <p className="text-xs text-slate-500 mt-1 mb-5">
              Crea una categoría personalizada para organizar tus registros quincenales.
            </p>
            <button
              type="button"
              onClick={openCreateForm}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0F5132] hover:bg-[#0B3D26] rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" />
              Nueva categoría
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visibleCategories.map((cat) => {
              const stats = statsByCategory.get(cat.id) ?? { monthTotal: 0, totalCount: 0 };
              const isConfirming = confirmDeleteId === cat.id;
              const isDeleting = deletingId === cat.id;

              return (
                <div
                  key={cat.id}
                  className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-3.5 h-3.5 rounded-sm shrink-0"
                      style={{ backgroundColor: cat.color }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{cat.name}</p>
                      <p className="text-xs text-slate-500">
                        {stats.totalCount} {stats.totalCount === 1 ? 'movimiento' : 'movimientos'}{' '}
                        registrados
                        {cat.type === 'gasto' && cat.monthlyBudget > 0
                          ? ` · Presupuesto ${formatCurrency(cat.monthlyBudget, currency)}/mes`
                          : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-6">
                    <div className="text-left sm:text-right">
                      <p
                        className={`text-sm font-mono font-semibold tabular-nums ${
                          cat.type === 'ingreso' ? 'text-emerald-700' : 'text-slate-900'
                        }`}
                      >
                        {formatCurrency(stats.monthTotal, currency)}
                      </p>
                      <p className="text-[11px] text-slate-500">este mes</p>
                    </div>

                    {isConfirming ? (
                      <div className="inline-flex items-center gap-2 text-xs">
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={() => handleDelete(cat.id)}
                          className="px-2.5 py-1 font-medium text-white bg-rose-700 hover:bg-rose-800 rounded-md"
                        >
                          {isDeleting ? 'Borrando...' : 'Eliminar'}
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
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditForm(cat)}
                          aria-label={`Editar ${cat.name}`}
                          title="Editar categoría"
                          className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(cat.id)}
                          aria-label={`Eliminar ${cat.name}`}
                          title="Eliminar categoría"
                          className="p-2 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-md transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Workspace Currency Preferences */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Moneda de visualización</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Define la divisa con la que se muestran tus montos y gráficas mensuales.
          </p>
        </div>
        <select
          aria-label="Moneda de visualización"
          value={currency}
          disabled={savingCurrency}
          onChange={(e) => handleCurrencyChange(e.target.value as CurrencyCode)}
          className="px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F5132]/25 focus:border-[#0F5132] w-full sm:w-64"
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
      </section>
    </div>
  );
}
