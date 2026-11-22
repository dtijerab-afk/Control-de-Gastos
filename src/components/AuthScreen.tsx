import { ArrowRight, BarChart3, CalendarRange, FolderKanban } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { BrandLogo } from './BrandLogo';

export function AuthScreen() {
  const { signInWithGoogle, signingIn, authError } = useFinance();

  return (
    <div className="min-h-screen bg-[#F3F7F4] flex flex-col">
      <header className="border-b border-emerald-950/10 bg-[#0B3B24] text-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <BrandLogo size="sm" tone="light" />
          <div className="hidden md:flex items-center gap-6 text-sm text-emerald-100/85">
            <span className="whitespace-nowrap shrink-0">Control quincenal</span>
            <span className="whitespace-nowrap shrink-0">Categorías propias</span>
            <span className="whitespace-nowrap shrink-0">Gráficas mensuales</span>
          </div>
          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={signingIn}
            className="px-4 py-2 text-sm font-semibold text-[#0B3B24] bg-emerald-300 hover:bg-emerald-200 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            {signingIn ? 'Conectando...' : 'Iniciar sesión'}
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center">
        <div className="max-w-6xl w-full mx-auto px-6 py-14 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-12 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center">
            <p className="text-sm font-semibold text-[#12663F] mb-3">
              Finanzas personales diseñadas alrededor de cada quincena
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 leading-tight [text-wrap:balance] mb-5">
              Ordena tus ingresos y gastos quincena por quincena
            </h1>
            <p className="text-base text-slate-600 leading-relaxed max-w-xl mb-8">
              Registra tus movimientos del 1 al 15 y del 16 al cierre de mes, crea categorías a tu
              medida con presupuestos mensuales y consulta gráficas claras de tu flujo y ahorro.
            </p>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-10">
              <button
                type="button"
                onClick={signInWithGoogle}
                disabled={signingIn}
                className="inline-flex items-center justify-center gap-3 px-6 py-3 text-sm font-semibold text-white bg-[#12663F] hover:bg-[#0D4F30] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M21.35 11.1h-9.18v2.98h5.27c-.23 1.48-1.71 4.35-5.27 4.35-3.17 0-5.76-2.63-5.76-5.87s2.59-5.87 5.76-5.87c1.81 0 3.02.77 3.71 1.43l2.53-2.44C16.78 4.18 14.68 3.25 12.17 3.25 7.21 3.25 3.2 7.26 3.2 12.22s4.01 8.97 8.97 8.97c5.18 0 8.61-3.64 8.61-8.77 0-.59-.06-1.04-.14-1.32Z"
                  />
                </svg>
                {signingIn ? 'Iniciando sesión...' : 'Continuar con Google'}
                <ArrowRight className="w-4 h-4 shrink-0" />
              </button>
              <span className="text-xs text-slate-600">
                Tus registros se guardan de forma privada en tu cuenta.
              </span>
            </div>

            {authError && (
              <div
                role="alert"
                className="mb-8 px-4 py-3 text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-lg max-w-xl"
              >
                {authError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-8 border-t border-emerald-950/10">
              <div>
                <CalendarRange className="w-4 h-4 text-[#12663F] mb-2" />
                <h2 className="text-sm font-semibold text-slate-900 mb-1">Ciclo quincenal</h2>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Separa automáticamente 1ª quincena (1–15) y 2ª quincena (16–fin).
                </p>
              </div>
              <div>
                <FolderKanban className="w-4 h-4 text-[#12663F] mb-2" />
                <h2 className="text-sm font-semibold text-slate-900 mb-1">Categorías propias</h2>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Define tus categorías de ingreso y gasto con límites mensuales.
                </p>
              </div>
              <div>
                <BarChart3 className="w-4 h-4 text-[#12663F] mb-2" />
                <h2 className="text-sm font-semibold text-slate-900 mb-1">Gráficas mensuales</h2>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Visualiza ingresos vs. gastos mes a mes y distribución por categoría.
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 flex">
            <div className="w-full bg-white border border-emerald-950/10 rounded-xl p-6 sm:p-8 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-emerald-950/10">
                  <div>
                    <p className="text-xs text-emerald-800/75">Vista previa del libro mensual</p>
                    <p className="text-base font-semibold text-slate-900 mt-0.5">
                      Estructura por quincenas
                    </p>
                  </div>
                  <span className="text-xs font-mono text-emerald-800/80 tabular-nums">Q1 · Q2</span>
                </div>

                <div className="grid grid-cols-2 divide-x divide-emerald-950/10 border-b border-emerald-950/10 py-5">
                  <div className="pr-5">
                    <p className="text-xs text-slate-500">1ª Quincena · días 1–15</p>
                    <p className="text-xl font-mono font-semibold text-emerald-700 tabular-nums mt-1">
                      +$18,500.00
                    </p>
                    <p className="text-xs font-mono text-rose-700 tabular-nums mt-1">
                      −$11,420.00 en gastos
                    </p>
                  </div>
                  <div className="pl-5">
                    <p className="text-xs text-slate-500">2ª Quincena · días 16–30</p>
                    <p className="text-xl font-mono font-semibold text-emerald-700 tabular-nums mt-1">
                      +$18,500.00
                    </p>
                    <p className="text-xs font-mono text-rose-700 tabular-nums mt-1">
                      −$9,880.00 en gastos
                    </p>
                  </div>
                </div>

                <div className="py-5">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
                    <span>Flujo comparativo mensual</span>
                    <span>Ingresos / Gastos</span>
                  </div>
                  <div className="grid grid-cols-6 gap-3 items-end h-32 pt-2">
                    {[
                      { m: 'Jun', inc: 78, exp: 58 },
                      { m: 'Jul', inc: 82, exp: 64 },
                      { m: 'Ago', inc: 80, exp: 55 },
                      { m: 'Sep', inc: 86, exp: 62 },
                      { m: 'Oct', inc: 84, exp: 59 },
                      { m: 'Nov', inc: 92, exp: 54 },
                    ].map((bar) => (
                      <div key={bar.m} className="flex flex-col items-center gap-2 h-full justify-end">
                        <div className="w-full flex items-end justify-center gap-1 h-24">
                          <div
                            className="w-2.5 bg-[#12663F] rounded-t-sm"
                            style={{ height: `${bar.inc}%` }}
                          />
                          <div
                            className="w-2.5 bg-emerald-200 rounded-t-sm"
                            style={{ height: `${bar.exp}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-mono text-slate-500">{bar.m}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-700">Nómina 1ª quincena · 1ª Q</span>
                  <span className="font-mono font-medium text-emerald-700 tabular-nums">
                    +$18,500.00
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-700">Vivienda y renta · 1ª Q</span>
                  <span className="font-mono font-medium text-rose-700 tabular-nums">
                    −$7,500.00
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-700">Supermercado y despensa · 2ª Q</span>
                  <span className="font-mono font-medium text-rose-700 tabular-nums">
                    −$2,340.00
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
