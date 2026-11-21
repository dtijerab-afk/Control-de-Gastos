import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
  isQuotaError: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
      isQuotaError: false,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    const raw = error?.message || 'Ocurrió un error inesperado.';
    const isQuotaError = raw.toLowerCase().includes('quota exceeded');
    let friendlyMessage = raw;

    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.error === 'string') {
        friendlyMessage = parsed.error;
      }
    } catch {
      // Plain error message
    }

    return {
      hasError: true,
      errorMessage: friendlyMessage,
      isQuotaError,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: '', isQuotaError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl p-8">
            <div className="flex items-center gap-3 text-rose-700 mb-4">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h1 className="text-lg font-semibold text-slate-900">
                {this.state.isQuotaError
                  ? 'Límite diario de consultas alcanzado'
                  : 'No pudimos completar la operación'}
              </h1>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed mb-4">
              {this.state.isQuotaError
                ? 'Se alcanzó temporalmente la cuota gratuita diaria de Firestore. La cuota se restablece al día siguiente.'
                : 'Ocurrió un problema al sincronizar tus datos financieros. Puedes recargar para volver a intentarlo.'}
            </p>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-6 text-xs font-mono text-slate-600 break-words">
              {this.state.errorMessage}
            </div>
            <button
              type="button"
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#0F5132] hover:bg-[#0B3D26] rounded-lg transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-4 h-4" />
              Recargar aplicación
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
