import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Menu,
  Plus,
  X,
} from 'lucide-react';
import { AnalyticsView } from './components/AnalyticsView';
import { AuthScreen } from './components/AuthScreen';
import { BrandLogo } from './components/BrandLogo';
import { BudgetAlertBanner } from './components/BudgetAlertBanner';
import { CategoriesView } from './components/CategoriesView';
import { OverviewView } from './components/OverviewView';
import { TransactionModal } from './components/TransactionModal';
import { TransactionsView } from './components/TransactionsView';
import { useFinance } from './context/FinanceContext';
import {
  computeMonthlyBudgetAlerts,
  loadBudgetAlertThreshold,
  saveBudgetAlertThreshold,
  type BudgetAlertItem,
} from './lib/budgetAlerts';
import {
  formatCurrency,
  formatMonthLabel,
  getCurrentMonthKey,
  shiftMonthKey,
} from './lib/financeUtils';
import type { NavSection, QuincenaFilter, Transaction } from './types/finance';

const NAV_ITEMS: { id: NavSection; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'resumen', label: 'Resumen', icon: LayoutDashboard },
  { id: 'movimientos', label: 'Movimientos', icon: ListOrdered },
  { id: 'graficas', label: 'Gráficas', icon: BarChart3 },
  { id: 'categorias', label: 'Categorías', icon: FolderKanban },
];

export default function App() {
  const { user, authReady, profile, transactions, categories, currency, signOutUser } = useFinance();

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
      <div className="min-h-screen bg-[#F3F7F4] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <BrandLogo size="md" tone="dark" />
          <p className="text-sm font-semibold text-slate-600">Cargando tu espacio financiero...</p>
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

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#0B3B24] text-emerald-50 border-r border-emerald-950/80">
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
          className="lg:hidden p-2 text-emerald-200 hover:text-white rounded-md"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav aria-label="Navegación principal" className="flex-1 px-3 py-3 sm:py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeNav === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelectNav(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-3 lg:py-2.5 text-base lg:text-sm font-bold lg:font-medium rounded-lg transition-colors whitespace-nowrap ${
                active
                  ? 'bg-emerald-400/20 text-white'
                  : 'text-emerald-100/85 hover:text-white hover:bg-white/8'
              }`}
            >
              <Icon className={`w-5 h-5 lg:w-4 lg:h-4 shrink-0 ${active ? 'text-emerald-300' : 'text-emerald-200/75'}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/10 space-y-2.5">
        <div className="px-2">
          <p className="text-base lg:text-sm font-bold lg:font-medium text-white truncate">
            {profile?.displayName || user.displayName || 'Mi cuenta'}
          </p>
          <p className="text-xs text-emerald-200/80 truncate">{user.email}</p>
        </div>
        <button
          type="button"
          onClick={signOutUser}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 lg:py-2 text-sm lg:text-xs font-bold lg:font-medium text-emerald-100/90 hover:text-white hover:bg-white/10 rounded-lg transition-colors whitespace-nowrap"
        >
          <LogOut className="w-4 h-4 lg:w-3.5 lg:h-3.5 shrink-0" />
          <span>Cerrar sesión</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F3F7F4] flex">
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
        {/* Top Bar Contract: Breadcrumb — Month Navigator — Primary Action */}
        <header className="sticky top-0 z-30 h-14 sm:h-16 bg-white border-b border-emerald-950/10 px-3 sm:px-6 lg:px-8 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir menú de navegación"
              className="lg:hidden p-1.5 -ml-1 text-slate-800 hover:text-[#0B3B24] rounded-lg hover:bg-emerald-50 shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => handleSelectNav('resumen')}
              aria-label="Ir al inicio de MoneyFlow"
              className="lg:hidden inline-flex items-center shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30"
            >
              <BrandLogo size="xs" tone="dark" showWordmark={false} />
            </button>
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <span className="hidden sm:inline text-sm font-bold text-[#0B3B24] font-display whitespace-nowrap shrink-0">
                MoneyFlow
              </span>
              <span className="hidden sm:inline text-sm text-emerald-900/25" aria-hidden="true">
                /
              </span>
              <h1 className="text-[15px] sm:text-sm font-bold sm:font-semibold text-slate-900 truncate">
                {activeNavItem.label}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {/* Month Switcher */}
            <div className="flex items-center gap-0.5 sm:gap-1 border border-emerald-900/15 rounded-lg bg-[#F3F7F4] p-0.5">
              <button
                type="button"
                onClick={() => setSelectedMonth((m) => shiftMonthKey(m, -1))}
                aria-label="Mes anterior"
                className="p-1.5 text-emerald-950/80 hover:text-[#0B3B24] hover:bg-white rounded-md transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-1.5 sm:px-3 text-[13px] sm:text-sm font-bold sm:font-medium text-slate-900 whitespace-nowrap min-w-[104px] sm:min-w-[136px] text-center">
                {formatMonthLabel(selectedMonth)}
              </span>
              <button
                type="button"
                onClick={() => setSelectedMonth((m) => shiftMonthKey(m, 1))}
                aria-label="Mes siguiente"
                className="p-1.5 text-emerald-950/80 hover:text-[#0B3B24] hover:bg-white rounded-md transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {selectedMonth !== currentMonthKey && (
              <button
                type="button"
                onClick={() => setSelectedMonth(currentMonthKey)}
                className="hidden md:inline-flex text-xs font-semibold text-[#12663F] hover:underline whitespace-nowrap shrink-0"
              >
                Mes actual
              </button>
            )}

            <button
              type="button"
              onClick={handleOpenNew}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-sm font-bold sm:font-semibold text-white bg-[#12663F] hover:bg-[#0D4F30] rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Nuevo movimiento</span>
              <span className="sm:hidden">Nuevo</span>
            </button>
          </div>
        </header>

        {/* Main Content Viewport */}
        <main className="flex-1 w-full max-w-[1280px] mx-auto px-2.5 sm:px-6 lg:px-8 py-2.5 sm:py-5 lg:py-6">
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
                className="inline-flex items-center gap-1.5 text-[13px] sm:text-xs font-bold text-amber-800 hover:underline"
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
          className={`fixed bottom-3.5 left-3 right-3 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-md z-50 rounded-xl border px-4 py-3 shadow-lg flex items-start justify-between gap-3 ${
            budgetToast.some((a) => a.severity === 'exceeded')
              ? 'bg-rose-50 border-rose-300 text-rose-950'
              : 'bg-amber-50 border-amber-300 text-amber-950'
          }`}
        >
          <div className="flex items-start gap-2.5 min-w-0">
            {budgetToast.some((a) => a.severity === 'exceeded') ? (
              <AlertCircle className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
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
