import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FolderKanban,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Menu,
  Moon,
  PiggyBank,
  Plus,
  Sun,
  X,
} from 'lucide-react';
import { AiAdvisorView } from './components/AiAdvisorView';
import { AnalyticsView } from './components/AnalyticsView';
import { AuthScreen } from './components/AuthScreen';
import { BrandLogo } from './components/BrandLogo';
import { BudgetAlertBanner } from './components/BudgetAlertBanner';
import { CategoriesView } from './components/CategoriesView';
import { DebtsView } from './components/DebtsView';
import { OverviewView } from './components/OverviewView';
import { SavingsPlanView } from './components/SavingsPlanView';
import { TransactionModal } from './components/TransactionModal';
import { TransactionsView } from './components/TransactionsView';
import { useFinance } from './context/FinanceContext';
import { useTheme } from './context/ThemeContext';
import {
  computeMonthlyBudgetAlerts,
  loadBudgetAlertThreshold,
  saveBudgetAlertThreshold,
  type BudgetAlertItem,
} from './lib/budgetAlerts';
import {
  formatCurrency,
  formatMonthLabel,
  formatShortMonthLabel,
  getCurrentMonthKey,
  shiftMonthKey,
} from './lib/financeUtils';
import type { NavSection, QuincenaFilter, Transaction } from './types/finance';

const NAV_ITEMS: { id: NavSection; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'resumen', label: 'Resumen', icon: LayoutDashboard },
  { id: 'movimientos', label: 'Movimientos', icon: ListOrdered },
  { id: 'deudas', label: 'Deudas y extractos', icon: CreditCard },
  { id: 'ahorro', label: 'Plan de ahorro', icon: PiggyBank },
  { id: 'ia', label: 'Análisis IA', icon: BrainCircuit },
  { id: 'graficas', label: 'Gráficas', icon: BarChart3 },
  { id: 'categorias', label: 'Categorías', icon: FolderKanban },
];

export default function App() {
  const { user, authReady, profile, transactions, categories, currency, signOutUser } = useFinance();
  const { isDark, toggleTheme } = useTheme();

  const [activeNav, setActiveNav] = useState<NavSection>('resumen');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => getCurrentMonthKey());
  const [selectedQuincena, setSelectedQuincena] = useState<QuincenaFilter>('all');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  const [alertThresholdPct, setAlertThresholdPct] = useState<number>(() =>
    loadBudgetAlertThreshold()
  );
  const [dismissedAlertIds, setDismissedAlertIds] = useState<string[]>([]);
  const [budgetToast, setBudgetToast] = useState<BudgetAlertItem[] | null>(null);

  const monthBudgetAlerts = useMemo(
    () =>
      computeMonthlyBudgetAlerts({
        monthKey: selectedMonth,
        transactions,
        categories,
        globalBudget: profile?.monthlyBudget ?? 0,
        thresholdPct: alertThresholdPct,
      }),
    [selectedMonth, transactions, categories, profile?.monthlyBudget, alertThresholdPct]
  );

  const visibleBudgetAlerts = useMemo(
    () => monthBudgetAlerts.filter((a) => !dismissedAlertIds.includes(a.id)),
    [monthBudgetAlerts, dismissedAlertIds]
  );

  const hiddenAlertCount = monthBudgetAlerts.length - visibleBudgetAlerts.length;

  useEffect(() => {
    if (!budgetToast) return;
    const timer = window.setTimeout(() => setBudgetToast(null), 7000);
    return () => window.clearTimeout(timer);
  }, [budgetToast]);

  const handleChangeAlertThreshold = (nextPct: number) => {
    setAlertThresholdPct(nextPct);
    saveBudgetAlertThreshold(nextPct);
    setDismissedAlertIds([]);
  };

  const handleDismissCurrentAlerts = () => {
    setDismissedAlertIds((prev) => {
      const next = new Set(prev);
      for (const item of monthBudgetAlerts) {
        next.add(item.id);
      }
      return Array.from(next);
    });
  };

  const handleBudgetAlertTriggered = (triggered: BudgetAlertItem[]) => {
    setBudgetToast(triggered);
    // Re-surface dismissed alerts when a newly recorded expense hits a budget threshold
    setDismissedAlertIds([]);
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#EEF5F0] dark:bg-[#06130D] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <BrandLogo size="md" tone={isDark ? 'light' : 'dark'} />
          <p className="text-sm font-semibold text-slate-600 dark:text-emerald-100/75">
            Cargando tu espacio financiero...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  const currentMonthKey = getCurrentMonthKey();
  const activeNavItem = NAV_ITEMS.find((i) => i.id === activeNav) ?? NAV_ITEMS[0];

  const handleOpenNew = () => {
    setEditingTx(null);
    setModalOpen(true);
  };

  const handleEditTx = (tx: Transaction) => {
    setEditingTx(tx);
    setModalOpen(true);
  };

  const handleSelectNav = (section: NavSection) => {
    setActiveNav(section);
    setMobileMenuOpen(false);
  };

  const userDisplayName = profile?.displayName || user.displayName || 'Mi cuenta';
  const userInitial = userDisplayName.trim().charAt(0).toUpperCase() || 'M';

  const sidebarContent = (
    <div className="flex flex-col h-full bg-gradient-to-b from-[#072B1A] via-[#0B3B24] to-[#082D1C] text-emerald-50 border-r border-emerald-950/90 shadow-xl lg:shadow-none">
      <div className="h-14 sm:h-16 px-4 sm:px-5 flex items-center justify-between border-b border-white/10 shrink-0">
        <button
          type="button"
          onClick={() => handleSelectNav('resumen')}
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60 rounded-lg"
        >
          <BrandLogo size="sm" tone="light" />
        </button>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Cerrar menú"
          className="lg:hidden p-2 text-emerald-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav aria-label="Navegación principal" className="flex-1 px-3 py-3.5 sm:py-4 space-y-1.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeNav === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelectNav(item.id)}
              className={`w-full flex items-center gap-3 px-2.5 py-2.5 lg:py-2 text-base lg:text-sm font-bold lg:font-semibold rounded-xl transition-all whitespace-nowrap ${
                active
                  ? 'bg-white/[0.12] text-white ring-1 ring-emerald-300/25 shadow-xs'
                  : 'text-emerald-100/80 hover:text-white hover:bg-white/[0.07]'
              }`}
            >
              <span
                className={`w-8 h-8 lg:w-7 lg:h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                  active
                    ? 'bg-emerald-400/25 text-emerald-200'
                    : 'bg-white/[0.06] text-emerald-200/75'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-3.5 border-t border-white/10 space-y-2 bg-black/15">
        <div className="flex items-center gap-2.5 px-1.5 pb-1">
          <span
            aria-hidden="true"
            className="w-9 h-9 rounded-xl bg-emerald-400/20 ring-1 ring-emerald-300/30 text-emerald-100 font-display font-bold text-sm flex items-center justify-center shrink-0"
          >
            {userInitial}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate leading-tight">
              {userDisplayName}
            </p>
            <p className="text-xs text-emerald-200/75 truncate mt-0.5">{user.email}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-bold text-emerald-100/90 hover:text-white bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 rounded-xl transition-colors whitespace-nowrap"
        >
          <span className="inline-flex items-center gap-2">
            {isDark ? (
              <Sun className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
            )}
            <span>{isDark ? 'Modo claro' : 'Modo oscuro'}</span>
          </span>
          <span
            aria-hidden="true"
            className={`w-8 h-4.5 rounded-full p-0.5 transition-colors flex items-center ${
              isDark ? 'bg-emerald-400/35 justify-end' : 'bg-white/15 justify-start'
            }`}
          >
            <span className="w-3.5 h-3.5 rounded-full bg-white shadow-xs" />
          </span>
        </button>
        <button
          type="button"
          onClick={signOutUser}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-emerald-100/90 hover:text-white bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 rounded-xl transition-colors whitespace-nowrap"
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          <span>Cerrar sesión</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex">
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden flex bg-slate-900/40"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMobileMenuOpen(false);
          }}
        >
          <div className="w-72 max-w-[84vw] h-full">{sidebarContent}</div>
        </div>
      )}

      {/* Workspace Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Menu/Breadcrumb — Month Navigator — Theme Toggle — Primary Action */}
        <header className="sticky top-0 z-30 h-14 sm:h-16 bg-white/92 dark:bg-[#091A12]/92 backdrop-blur-md border-b border-emerald-950/[0.09] dark:border-emerald-400/12 shadow-[0_1px_4px_rgba(11,59,36,0.04)] dark:shadow-[0_1px_8px_rgba(0,0,0,0.45)] px-2.5 sm:px-6 lg:px-8 flex items-center justify-between gap-1.5 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 shrink-0 sm:min-w-0 sm:shrink">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir menú de navegación"
              className="lg:hidden w-9 h-9 flex items-center justify-center text-[#0B3B24] dark:text-emerald-100 hover:text-[#0B3B24] dark:hover:text-white rounded-xl bg-[#F2F7F4] dark:bg-[#0F261B] hover:bg-emerald-50 dark:hover:bg-[#153425] border border-emerald-900/15 dark:border-emerald-400/20 transition-colors shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => handleSelectNav('resumen')}
              aria-label="Ir al inicio de MoneyFlow"
              className="hidden sm:inline-flex lg:hidden items-center shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30"
            >
              <BrandLogo size="xs" tone={isDark ? 'light' : 'dark'} showWordmark={false} />
            </button>
            <div className="hidden sm:flex items-center gap-1.5 sm:gap-2 min-w-0">
              <span className="text-sm font-bold text-[#0B3B24] dark:text-emerald-300 font-display whitespace-nowrap shrink-0">
                MoneyFlow
              </span>
              <span className="text-sm text-emerald-900/25 dark:text-emerald-400/30" aria-hidden="true">
                /
              </span>
              <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                {activeNavItem.label}
              </h1>
            </div>
          </div>

          <div className="flex items-center justify-end gap-1.5 sm:gap-3 flex-1 sm:flex-none min-w-0">
            {/* Month Switcher */}
            <div className="flex items-center justify-between gap-0.5 sm:gap-1 border border-emerald-900/15 dark:border-emerald-400/20 rounded-xl bg-[#F2F7F4] dark:bg-[#0F261B] p-0.5 shadow-[inset_0_1px_2px_rgba(11,59,36,0.04)] flex-1 sm:flex-none max-w-[172px] sm:max-w-none min-w-0">
              <button
                type="button"
                onClick={() => setSelectedMonth((m) => shiftMonthKey(m, -1))}
                aria-label="Mes anterior"
                className="p-1.5 text-emerald-950/80 dark:text-emerald-200/80 hover:text-[#0B3B24] dark:hover:text-white hover:bg-white dark:hover:bg-white/10 hover:shadow-xs rounded-lg transition-all shrink-0"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-1 sm:px-3 text-[13px] sm:text-sm font-bold sm:font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap sm:min-w-[136px] text-center truncate">
                <span className="sm:hidden">{formatShortMonthLabel(selectedMonth)}</span>
                <span className="hidden sm:inline">{formatMonthLabel(selectedMonth)}</span>
              </span>
              <button
                type="button"
                onClick={() => setSelectedMonth((m) => shiftMonthKey(m, 1))}
                aria-label="Mes siguiente"
                className="p-1.5 text-emerald-950/80 dark:text-emerald-200/80 hover:text-[#0B3B24] dark:hover:text-white hover:bg-white dark:hover:bg-white/10 hover:shadow-xs rounded-lg transition-all shrink-0"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {selectedMonth !== currentMonthKey && (
              <button
                type="button"
                onClick={() => setSelectedMonth(currentMonthKey)}
                className="hidden md:inline-flex text-xs font-bold text-[#12663F] dark:text-emerald-400 hover:text-[#0B3B24] dark:hover:text-emerald-300 hover:underline whitespace-nowrap shrink-0"
              >
                Mes actual
              </button>
            )}

            {/* Quick Light / Dark Mode Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              title={isDark ? 'Modo claro' : 'Modo oscuro'}
              className="w-9 h-9 sm:w-auto sm:h-auto sm:p-2 flex items-center justify-center rounded-xl border border-emerald-900/15 dark:border-emerald-400/20 bg-[#F2F7F4] dark:bg-[#0F261B] text-[#0B3B24] dark:text-amber-300 hover:bg-emerald-50 dark:hover:bg-[#153425] transition-all shrink-0"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={handleOpenNew}
              className="inline-flex items-center justify-center gap-1 sm:gap-2 px-2.5 sm:px-4 h-9 sm:h-auto sm:py-2 text-[13px] sm:text-sm font-bold sm:font-semibold text-white bg-gradient-to-b from-[#157548] to-[#0F5A36] hover:from-[#12663F] hover:to-[#0B472A] dark:from-emerald-500 dark:to-emerald-600 dark:hover:from-emerald-400 dark:hover:to-emerald-500 dark:text-[#041A10] active:scale-[0.98] rounded-xl shadow-[0_1px_2px_rgba(11,59,36,0.22),0_4px_10px_rgba(18,102,63,0.18)] transition-all whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Nuevo movimiento</span>
              <span className="sm:hidden">Nuevo</span>
            </button>
          </div>
        </header>

        {/* Main Content Viewport */}
        <main className="flex-1 w-full max-w-[1280px] mx-auto px-2.5 sm:px-6 lg:px-8 py-2.5 sm:py-5 lg:py-6">
          {/* Compact Mobile Context Row */}
          <div className="sm:hidden flex items-center justify-between gap-2 mb-2.5 px-0.5">
            <div className="flex items-center gap-2 min-w-0">
              <BrandLogo size="xs" tone={isDark ? 'light' : 'dark'} showWordmark={false} />
              <h1 className="text-[15px] font-bold text-[#0B3B24] dark:text-emerald-100 font-display truncate">
                {activeNavItem.label}
              </h1>
            </div>
            {selectedMonth !== currentMonthKey && (
              <button
                type="button"
                onClick={() => setSelectedMonth(currentMonthKey)}
                className="text-xs font-bold text-[#12663F] dark:text-emerald-400 hover:underline whitespace-nowrap shrink-0"
              >
                Mes actual
              </button>
            )}
          </div>
          <BudgetAlertBanner
            alerts={visibleBudgetAlerts}
            selectedMonth={selectedMonth}
            currency={currency}
            thresholdPct={alertThresholdPct}
            onChangeThreshold={handleChangeAlertThreshold}
            onDismissAll={handleDismissCurrentAlerts}
            onNavigate={setActiveNav}
          />

          {visibleBudgetAlerts.length === 0 && hiddenAlertCount > 0 && (
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setDismissedAlertIds([])}
                className="inline-flex items-center gap-1.5 text-[13px] sm:text-xs font-bold text-amber-800 dark:text-amber-300 hover:underline"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Mostrar {hiddenAlertCount}{' '}
                {hiddenAlertCount === 1 ? 'alerta de presupuesto' : 'alertas de presupuesto'}
              </button>
            </div>
          )}

          {activeNav === 'resumen' && (
            <OverviewView
              selectedMonth={selectedMonth}
              selectedQuincena={selectedQuincena}
              alertThresholdPct={alertThresholdPct}
              onChangeQuincena={setSelectedQuincena}
              onSelectMonth={setSelectedMonth}
              onNavigate={setActiveNav}
              onOpenNewTransaction={handleOpenNew}
              onEditTransaction={handleEditTx}
            />
          )}

          {activeNav === 'movimientos' && (
            <TransactionsView
              selectedMonth={selectedMonth}
              selectedQuincena={selectedQuincena}
              onChangeQuincena={setSelectedQuincena}
              onOpenNewTransaction={handleOpenNew}
              onEditTransaction={handleEditTx}
            />
          )}

          {activeNav === 'deudas' && <DebtsView selectedMonth={selectedMonth} />}

          {activeNav === 'ahorro' && (
            <SavingsPlanView selectedMonth={selectedMonth} />
          )}

          {activeNav === 'ia' && (
            <AiAdvisorView selectedMonth={selectedMonth} onNavigate={setActiveNav} />
          )}

          {activeNav === 'graficas' && (
            <AnalyticsView
              selectedMonth={selectedMonth}
              alertThresholdPct={alertThresholdPct}
              onSelectMonth={setSelectedMonth}
            />
          )}

          {activeNav === 'categorias' && (
            <CategoriesView
              selectedMonth={selectedMonth}
              alertThresholdPct={alertThresholdPct}
            />
          )}
        </main>
      </div>

      {/* Transient Budget Alert Toast after Saving an Expense */}
      {budgetToast && budgetToast.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-3.5 left-3 right-3 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-md z-50 rounded-2xl border px-4 py-3 shadow-xl flex items-start justify-between gap-3 ${
            budgetToast.some((a) => a.severity === 'exceeded')
              ? 'bg-rose-50 dark:bg-rose-950/90 border-rose-300 dark:border-rose-500/40 text-rose-950 dark:text-rose-100'
              : 'bg-amber-50 dark:bg-amber-950/90 border-amber-300 dark:border-amber-500/40 text-amber-950 dark:text-amber-100'
          }`}
        >
          <div className="flex items-start gap-2.5 min-w-0">
            {budgetToast.some((a) => a.severity === 'exceeded') ? (
              <AlertCircle className="w-5 h-5 text-rose-700 dark:text-rose-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-bold leading-snug">
                {budgetToast[0].severity === 'exceeded'
                  ? `Aviso: presupuesto superado (${Math.round(budgetToast[0].pct)}%)`
                  : `Aviso: cerca del límite (${Math.round(budgetToast[0].pct)}%)`}
              </p>
              <p className="text-[13px] sm:text-xs font-semibold font-mono tabular-nums">
                {budgetToast[0].label}: {formatCurrency(budgetToast[0].spent, currency)} /{' '}
                {formatCurrency(budgetToast[0].budget, currency)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setBudgetToast(null)}
            aria-label="Cerrar notificación"
            className="p-1 text-current/75 hover:text-current rounded-md shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <TransactionModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingTx(null);
        }}
        editingTransaction={editingTx}
        defaultMonthKey={selectedMonth}
        defaultQuincena={selectedQuincena}
        alertThresholdPct={alertThresholdPct}
        onBudgetAlertTriggered={handleBudgetAlertTriggered}
      />
    </div>
  );
}
