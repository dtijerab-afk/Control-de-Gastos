import React, { useMemo, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, Download, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import {
  buildQuincenaBackup,
  downloadQuincenaBackup,
  MAX_BACKUP_FILE_BYTES,
  parseAndValidateQuincenaBackup,
  type BackupImportReport,
  type QuincenaBackupFile,
} from '../lib/backupUtils';
import { db } from '../lib/firebase';
import { formatCurrency, formatMonthLabel } from '../lib/financeUtils';
import { loadSavingsPlan, saveSavingsPlan } from '../lib/savingsPlan';
import {
  createCategory,
  deleteCategory,
  importBackupToFirestore,
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
  alertThresholdPct: number;
}

export function CategoriesView({ selectedMonth, alertThresholdPct }: CategoriesViewProps) {
  const { user, profile, categories, transactions, currency } = useFinance();
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

  // Backup export & import state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [exportSummary, setExportSummary] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<{
    fileName: string;
    backup: QuincenaBackupFile;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<BackupImportReport | null>(null);

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

  const handleExportBackup = () => {
    if (!user) return;
    setImportError(null);
    const sourceProjectId = String(db.app.options.projectId ?? '');
    const savingsPlan = loadSavingsPlan(user.uid);
    const backup = buildQuincenaBackup({
      profile,
      fallbackDisplayName: user.displayName || user.email?.split('@')[0] || 'Usuario',
      currency,
      categories,
      transactions,
      sourceProjectId,
      savingsPlan,
    });
    const filename = downloadQuincenaBackup(backup);
    setExportSummary(
      `Respaldo "${filename}" descargado: ${backup.counts.categories} categorías, ${backup.counts.transactions} movimientos (${backup.counts.ingresos} ingresos y ${backup.counts.gastos} gastos), moneda ${backup.profile.currency} y presupuesto global ${formatCurrency(backup.profile.monthlyBudget, backup.profile.currency)}.`
    );
  };

  const handleSelectImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImportError(null);
    setImportReport(null);
    setPendingImport(null);

    if (file.size > MAX_BACKUP_FILE_BYTES) {
      setImportError('El archivo supera el límite máximo permitido de 10 MB.');
      return;
    }

    try {
      const text = await file.text();
      const result = parseAndValidateQuincenaBackup(text);
      if (!result.ok) {
        setImportError(result.error);
        return;
      }
      setPendingImport({ fileName: file.name, backup: result.backup });
    } catch {
      setImportError('No se pudo leer el archivo seleccionado.');
    }
  };

  const handleConfirmImport = async () => {
    if (!user || !pendingImport) return;
    setImporting(true);
    setImportError(null);
    try {
      const report = await importBackupToFirestore(
        user.uid,
        pendingImport.backup,
        profile,
        categories,
        transactions
      );
      if (pendingImport.backup.savingsPlan) {
        saveSavingsPlan(user.uid, pendingImport.backup.savingsPlan);
      }
      setImportReport(report);
      setPendingImport(null);
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : 'No se pudo completar la importación del respaldo.'
      );
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-3.5 sm:space-y-5">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4">
        <div className="inline-flex items-center gap-1 p-1 bg-emerald-950/[0.06] rounded-lg w-full sm:w-fit">
          <button
            type="button"
            onClick={() => setActiveType('gasto')}
            className={`flex-1 sm:flex-none px-3 py-1.5 text-[13px] sm:text-xs font-bold sm:font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeType === 'gasto'
                ? 'bg-white text-[#0B3B24] shadow-xs'
                : 'text-slate-700 sm:text-slate-600 hover:text-[#0B3B24]'
            }`}
          >
            Gastos ({categories.filter((c) => c.type === 'gasto').length})
          </button>
          <button
            type="button"
            onClick={() => setActiveType('ingreso')}
            className={`flex-1 sm:flex-none px-3 py-1.5 text-[13px] sm:text-xs font-bold sm:font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeType === 'ingreso'
                ? 'bg-white text-[#0B3B24] shadow-xs'
                : 'text-slate-700 sm:text-slate-600 hover:text-[#0B3B24]'
            }`}
          >
            Ingresos ({categories.filter((c) => c.type === 'ingreso').length})
          </button>
        </div>

        <button
          type="button"
          onClick={openCreateForm}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm sm:text-xs font-bold text-white bg-[#12663F] hover:bg-[#0D4F30] rounded-lg transition-colors whitespace-nowrap shrink-0 w-full sm:w-fit"
        >
          <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
          Nueva categoría
        </button>
      </div>

      {/* Category Create / Edit Form Panel */}
      {formOpen && (
        <section className="bg-white border border-emerald-950/10 rounded-xl p-3.5 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-slate-900">
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

          <form onSubmit={handleSaveCategory} className="space-y-3.5">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-5">
                <label htmlFor="cat-name" className="block text-sm sm:text-xs font-bold sm:font-medium text-slate-700 sm:text-slate-600 mb-1">
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
                  className="w-full px-3.5 py-2 text-base sm:text-sm font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F5132]/25 focus:border-[#0F5132]"
                />
              </div>

              <div className="md:col-span-3">
                <label htmlFor="cat-type" className="block text-sm sm:text-xs font-bold sm:font-medium text-slate-700 sm:text-slate-600 mb-1">
                  Tipo
                </label>
                <select
                  id="cat-type"
                  value={type}
                  onChange={(e) => setType(e.target.value as TransactionType)}
                  className="w-full px-3.5 py-2 text-base sm:text-sm font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F5132]/25 focus:border-[#0F5132]"
                >
                  <option value="gasto">Gasto</option>
                  <option value="ingreso">Ingreso</option>
                </select>
              </div>

              {type === 'gasto' && (
                <div className="md:col-span-4">
                  <label
                    htmlFor="cat-budget"
                    className="block text-sm sm:text-xs font-bold sm:font-medium text-slate-700 sm:text-slate-600 mb-1"
                  >
                    Presupuesto mensual ({currency})
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
                    className="w-full px-3.5 py-2 text-base sm:text-sm font-mono font-bold tabular-nums text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F5132]/25 focus:border-[#0F5132]"
                  />
                </div>
              )}
            </div>

            <div>
              <span className="block text-sm sm:text-xs font-bold sm:font-medium text-slate-700 sm:text-slate-600 mb-1.5">
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
                className="px-3.5 py-2 text-sm font-semibold text-rose-800 bg-rose-50 border border-rose-200 rounded-lg"
              >
                {formError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="px-4 py-2 text-sm sm:text-xs font-bold sm:font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm sm:text-xs font-bold text-white bg-[#12663F] hover:bg-[#0D4F30] disabled:opacity-60 rounded-lg whitespace-nowrap"
              >
                {saving ? 'Guardando...' : editingCat ? 'Guardar cambios' : 'Crear categoría'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Categories List (Ultra-compact single-row alignment on mobile & desktop) */}
      <section className="bg-white border border-emerald-950/10 rounded-xl overflow-hidden">
        <div className="px-3.5 py-2.5 sm:px-5 sm:py-3 border-b border-emerald-950/10 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold sm:font-semibold text-slate-900">
              {activeType === 'gasto' ? 'Categorías de gasto' : 'Categorías de ingreso'}
            </h2>
            <p className="text-[13px] sm:text-xs font-medium sm:font-normal text-slate-600 sm:text-slate-500">
              Acumulado en {formatMonthLabel(selectedMonth)}
            </p>
          </div>
        </div>

        {visibleCategories.length === 0 ? (
          <div className="px-4 py-9 text-center">
            <p className="text-base sm:text-sm font-bold text-slate-900">
              No hay categorías en esta sección
            </p>
            <p className="text-sm sm:text-xs font-medium sm:font-normal text-slate-600 sm:text-slate-500 mt-1 mb-4">
              Crea una categoría personalizada para organizar tus registros quincenales.
            </p>
            <button
              type="button"
              onClick={openCreateForm}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm sm:text-xs font-bold text-white bg-[#0F5132] hover:bg-[#0B3D26] rounded-lg"
            >
              <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              Nueva categoría
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visibleCategories.map((cat) => {
              const stats = statsByCategory.get(cat.id) ?? { monthTotal: 0, totalCount: 0 };
              const isConfirming = confirmDeleteId === cat.id;
              const isDeleting = deletingId === cat.id;
              const hasBudget = cat.type === 'gasto' && cat.monthlyBudget > 0;
              const budgetPct = hasBudget ? (stats.monthTotal / cat.monthlyBudget) * 100 : 0;
              const isOver = hasBudget && budgetPct >= 100;
              const isNear = hasBudget && !isOver && budgetPct >= alertThresholdPct;

              return (
                <div
                  key={cat.id}
                  className="px-3.5 py-2 sm:px-5 sm:py-2.5 flex items-center justify-between gap-2.5 hover:bg-slate-50/70 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-3 h-3 rounded-xs shrink-0"
                      style={{ backgroundColor: cat.color }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="text-[15px] sm:text-sm font-bold sm:font-semibold text-slate-900 truncate leading-snug">
                        {cat.name}
                      </p>
                      <p className="text-[13px] sm:text-xs font-semibold sm:font-normal text-slate-600 sm:text-slate-500 truncate leading-tight">
                        <span>{stats.totalCount} mov.</span>
                        {hasBudget && (
                          <>
                            <span> · Meta {formatCurrency(cat.monthlyBudget, currency)}</span>
                            {isOver && (
                              <span className="inline-flex items-center gap-0.5 text-rose-700 font-bold ml-1.5">
                                <AlertCircle className="w-3 h-3 shrink-0" />
                                {Math.round(budgetPct)}%
                              </span>
                            )}
                            {isNear && (
                              <span className="inline-flex items-center gap-0.5 text-amber-700 font-bold ml-1.5">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                {Math.round(budgetPct)}%
                              </span>
                            )}
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                    <div className="text-right">
                      <p
                        className={`text-[15px] sm:text-sm font-mono font-bold sm:font-semibold tabular-nums leading-snug ${
                          cat.type === 'ingreso'
                            ? 'text-emerald-700'
                            : isOver
                              ? 'text-rose-700'
                              : isNear
                                ? 'text-amber-700'
                                : 'text-slate-900'
                        }`}
                      >
                        {formatCurrency(stats.monthTotal, currency)}
                      </p>
                      <p className="text-[11px] font-semibold sm:font-normal text-slate-500 leading-tight">
                        este mes
                      </p>
                    </div>

                    {isConfirming ? (
                      <div className="inline-flex items-center gap-1.5 text-xs">
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={() => handleDelete(cat.id)}
                          className="px-2.5 py-1 font-bold text-white bg-rose-700 hover:bg-rose-800 rounded-md"
                        >
                          {isDeleting ? '...' : 'Eliminar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-1.5 py-1 font-bold sm:font-normal text-slate-600 hover:text-slate-900"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-0.5 -mr-1">
                        <button
                          type="button"
                          onClick={() => openEditForm(cat)}
                          aria-label={`Editar ${cat.name}`}
                          title="Editar categoría"
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                        >
                          <Pencil className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(cat.id)}
                          aria-label={`Eliminar ${cat.name}`}
                          title="Eliminar categoría"
                          className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-md transition-colors"
                        >
                          <Trash2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
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
      <section className="bg-white border border-emerald-950/10 rounded-xl p-3.5 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base sm:text-sm font-bold sm:font-semibold text-slate-900">
            Moneda de visualización
          </h3>
          <p className="text-[13px] sm:text-xs font-medium sm:font-normal text-slate-600 sm:text-slate-500 mt-0.5">
            Define la divisa con la que se muestran tus montos y gráficas mensuales.
          </p>
        </div>
        <select
          aria-label="Moneda de visualización"
          value={currency}
          disabled={savingCurrency}
          onChange={(e) => handleCurrencyChange(e.target.value as CurrencyCode)}
          className="px-3.5 py-2 text-base sm:text-sm font-semibold sm:font-normal text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F5132]/25 focus:border-[#0F5132] w-full sm:w-64"
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
      </section>

      {/* Backup & Migration Section (JSON Export / Validated Import with UID & Category Remapping) */}
      <section
        aria-label="Respaldo y migración de datos"
        className="bg-white border border-emerald-950/10 rounded-xl p-3.5 sm:p-5 space-y-3"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-base sm:text-sm font-bold sm:font-semibold text-slate-900">
              Respaldo completo (JSON)
            </h3>
            <p className="text-[13px] sm:text-xs font-medium sm:font-normal text-slate-600 sm:text-slate-500 mt-0.5">
              Exporta tu perfil, moneda, presupuesto mensual global, categorías personalizadas y
              todos tus movimientos, o importa un respaldo previo sin sobrescribir ni duplicar
              registros.
            </p>
            <p className="text-[13px] sm:text-xs font-semibold sm:font-normal text-slate-700 sm:text-slate-600 mt-1.5 font-mono tabular-nums">
              {categories.length} {categories.length === 1 ? 'categoría' : 'categorías'} ·{' '}
              {transactions.length} {transactions.length === 1 ? 'movimiento' : 'movimientos'} ·
              Meta {formatCurrency(profile?.monthlyBudget ?? 0, currency)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportBackup}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-sm sm:text-xs font-bold text-white bg-[#12663F] hover:bg-[#0D4F30] rounded-lg transition-colors whitespace-nowrap"
            >
              <Download className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              Exportar respaldo JSON
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleSelectImportFile}
              className="hidden"
            />
            <button
              type="button"
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-sm sm:text-xs font-bold sm:font-medium text-[#0B3B24] bg-[#F3F7F4] border border-emerald-900/15 hover:bg-emerald-50 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
            >
              <Upload className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#12663F]" />
              Importar respaldo JSON
            </button>
          </div>
        </div>

        {exportSummary && (
          <div className="px-3.5 py-2.5 text-[13px] sm:text-xs font-semibold sm:font-normal text-emerald-950 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start justify-between gap-3">
            <span>{exportSummary}</span>
            <button
              type="button"
              onClick={() => setExportSummary(null)}
              className="font-bold hover:underline shrink-0"
            >
              Cerrar
            </button>
          </div>
        )}

        {importError && (
          <div
            role="alert"
            className="px-3.5 py-2.5 text-[13px] sm:text-xs font-semibold text-rose-800 bg-rose-50 border border-rose-200 rounded-lg flex items-start justify-between gap-3"
          >
            <span>{importError}</span>
            <button
              type="button"
              onClick={() => setImportError(null)}
              className="font-bold hover:underline shrink-0"
            >
              Cerrar
            </button>
          </div>
        )}

        {pendingImport && (
          <div className="p-3.5 bg-[#F4F8F5] border border-emerald-950/15 rounded-lg space-y-2.5">
            <div>
              <p className="text-sm sm:text-xs font-bold text-slate-900">
                Vista previa del respaldo: {pendingImport.fileName}
              </p>
              <p className="text-[13px] sm:text-xs font-semibold sm:font-normal text-slate-700 sm:text-slate-600 mt-1 font-mono tabular-nums">
                {pendingImport.backup.counts.categories} categorías ·{' '}
                {pendingImport.backup.counts.transactions} movimientos (
                {pendingImport.backup.counts.ingresos} ingresos /{' '}
                {pendingImport.backup.counts.gastos} gastos) · Moneda{' '}
                {pendingImport.backup.profile.currency} · Meta global{' '}
                {formatCurrency(
                  pendingImport.backup.profile.monthlyBudget,
                  pendingImport.backup.profile.currency
                )}
              </p>
              <p className="text-[13px] sm:text-xs text-slate-600 sm:text-slate-500 mt-1">
                Los registros se asociarán automáticamente a tu cuenta actual (UID y categorías
                remapeadas). No se eliminará ningún dato existente y se omitirán duplicados.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={importing}
                onClick={handleConfirmImport}
                className="px-4 py-2 text-sm sm:text-xs font-bold text-white bg-[#12663F] hover:bg-[#0D4F30] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
              >
                {importing ? 'Importando respaldo...' : 'Confirmar importación'}
              </button>
              <button
                type="button"
                disabled={importing}
                onClick={() => setPendingImport(null)}
                className="px-3 py-2 text-sm sm:text-xs font-bold sm:font-medium text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-colors whitespace-nowrap"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {importReport && (
          <div className="px-3.5 py-2.5 text-[13px] sm:text-xs text-emerald-950 bg-emerald-50 border border-emerald-200 rounded-lg space-y-1">
            <div className="flex items-center justify-between gap-3">
              <p className="font-bold">Importación completada correctamente</p>
              <button
                type="button"
                onClick={() => setImportReport(null)}
                className="font-bold hover:underline"
              >
                Cerrar
              </button>
            </div>
            <p className="font-mono font-semibold sm:font-normal tabular-nums">
              Categorías creadas: {importReport.categoriesCreated} · Emparejadas:{' '}
              {importReport.categoriesMatched} · Movimientos importados:{' '}
              {importReport.transactionsImported} · Duplicados omitidos:{' '}
              {importReport.transactionsSkipped}
              {importReport.profileUpdated ? ' · Preferencias actualizadas' : ''}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
