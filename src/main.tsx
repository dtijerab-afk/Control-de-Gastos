import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { FinanceProvider } from './context/FinanceContext.tsx';
import { ThemeProvider } from './context/ThemeContext.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <FinanceProvider>
          <App />
        </FinanceProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>
);
