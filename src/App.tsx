import { useState } from 'react';
import {
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
import { CategoriesView } from './components/CategoriesView';
import { OverviewView } from './components/OverviewView';
import { TransactionModal } from './components/TransactionModal';
import { TransactionsView } from './components/TransactionsView';
import { useFinance } from './context/FinanceContext';
import {
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
  const { user, authReady, profile, signOutUser } = useFinance();

  const [activeNav, setActiveNav] = useState<NavSection>('resumen');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => getCurrentMonthKey());
  const [selectedQuincena, setSelectedQuincena] = useState<QuincenaFilter>('all');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <span className="text-lg font-bold tracking-tight text-slate-900 font-display">
            Quincena
          </span>
          <p className="text-xs text-slate-500">Cargando tu espacio financiero...</p>
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
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      <div className="h-16 px-6 flex items-center justify-between border-b border-slate-200 shrink-0">
        <button
          type="button"
          onClick={() => handleSelectNav('resumen')}
          className="text-lg font-bold tracking-tight text-slate-900 font-display whitespace-nowrap shrink-0"
        >
          Quincena
        </button>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Cerrar menú"
          className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 rounded-md"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav aria-label="Navegación principal" className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeNav === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelectNav(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                active
                  ? 'bg-emerald-950/[0.06] text-[#0F5132]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-200 space-y-3">
        <div className="px-2">
          <p className="text-sm font-medium text-slate-900 truncate">
            {profile?.displayName || user.displayName || 'Mi cuenta'}
          </p>
          <p className="text-xs text-slate-500 truncate">{user.email}</p>
        </div>
        <button
          type="button"
          onClick={signOutUser}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap"
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          <span>Cerrar sesión</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
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
          <div className="w-64 max-w-[82vw] h-full">{sidebarContent}</div>
        </div>
      )}

      {/* Workspace Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb — Month Navigator — Primary Action */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir menú de navegación"
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="hidden sm:inline text-slate-400 whitespace-nowrap shrink-0">
                Quincena
              </span>
              <span className="hidden sm:inline text-slate-300" aria-hidden="true">
                /
              </span>
              <h1 className="font-semibold text-slate-900 truncate">{activeNavItem.label}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-5 shrink-0">
            {/* Month Switcher */}
            <div className="flex items-center gap-1 border border-slate-200 rounded-lg bg-slate-50/70 p-0.5">
              <button
                type="button"
                onClick={() => setSelectedMonth((m) => shiftMonthKey(m, -1))}
                aria-label="Mes anterior"
                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-md transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 sm:px-3 text-xs sm:text-sm font-medium text-slate-900 whitespace-nowrap min-w-[116px] sm:min-w-[136px] text-center">
                {formatMonthLabel(selectedMonth)}
              </span>
              <button
                type="button"
                onClick={() => setSelectedMonth((m) => shiftMonthKey(m, 1))}
                aria-label="Mes siguiente"
                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-md transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {selectedMonth !== currentMonthKey && (
              <button
                type="button"
                onClick={() => setSelectedMonth(currentMonthKey)}
                className="hidden md:inline-flex text-xs font-medium text-[#0F5132] hover:underline whitespace-nowrap shrink-0"
              >
                Mes actual
              </button>
            )}

            <button
              type="button"
              onClick={handleOpenNew}
              className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-[#0F5132] hover:bg-[#0B3D26] rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Nuevo movimiento</span>
              <span className="sm:hidden">Registrar</span>
            </button>
          </div>
        </header>

        {/* Main Content Viewport */}
        <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          {activeNav === 'resumen' && (
            <OverviewView
              selectedMonth={selectedMonth}
              selectedQuincena={selectedQuincena}
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
              onSelectMonth={setSelectedMonth}
            />
          )}

          {activeNav === 'categorias' && <CategoriesView selectedMonth={selectedMonth} />}
        </main>
      </div>

      <TransactionModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingTx(null);
        }}
        editingTransaction={editingTx}
        defaultMonthKey={selectedMonth}
        defaultQuincena={selectedQuincena}
      />
    </div>
  );
}
