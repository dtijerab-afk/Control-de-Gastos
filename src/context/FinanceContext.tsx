import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../lib/firebase';
import { ensureUserProfileAndSeedDefaults } from '../services/financeService';
import type { Category, CurrencyCode, Transaction, UserProfile } from '../types/finance';

interface FinanceContextValue {
  user: User | null;
  authReady: boolean;
  profile: UserProfile | null;
  currency: CurrencyCode;
  categories: Category[];
  transactions: Transaction[];
  loadingData: boolean;
  authError: string | null;
  signingIn: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const FinanceContext = createContext<FinanceContextValue | undefined>(undefined);

export function FinanceProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<Error | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
      if (!firebaseUser) {
        setProfile(null);
        setCategories([]);
        setTransactions([]);
        setLoadingData(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady || !user) {
      return;
    }

    let cancelled = false;
    let unsubProfile: (() => void) | null = null;
    let unsubCategories: (() => void) | null = null;
    let unsubTransactions: (() => void) | null = null;

    setLoadingData(true);

    async function initAndSubscribe(activeUser: User) {
      try {
        const ensuredProfile = await ensureUserProfileAndSeedDefaults(activeUser);
        if (cancelled) return;
        setProfile(ensuredProfile);

        let gotCats = false;
        let gotTxs = false;
        const checkDone = () => {
          if (gotCats && gotTxs && !cancelled) {
            setLoadingData(false);
          }
        };

        const profilePath = `users/${activeUser.uid}`;
        unsubProfile = onSnapshot(
          doc(db, 'users', activeUser.uid),
          (snap) => {
            if (snap.exists() && !cancelled) {
              setProfile(snap.data() as UserProfile);
            }
          },
          (error) => {
            try {
              handleFirestoreError(error, OperationType.GET, profilePath);
            } catch (wrapped) {
              if (!cancelled) setFatalError(wrapped as Error);
            }
          }
        );

        const categoriesPath = `users/${activeUser.uid}/categories`;
        const categoriesQuery = query(
          collection(db, 'users', activeUser.uid, 'categories'),
          where('ownerId', '==', activeUser.uid)
        );
        unsubCategories = onSnapshot(
          categoriesQuery,
          (snapshot) => {
            if (cancelled) return;
            const list: Category[] = snapshot.docs
              .map((d) => ({
                id: d.id,
                ...(d.data() as Omit<Category, 'id'>),
              }))
              .sort((a, b) => a.name.localeCompare(b.name, 'es'));
            setCategories(list);
            gotCats = true;
            checkDone();
          },
          (error) => {
            try {
              handleFirestoreError(error, OperationType.LIST, categoriesPath);
            } catch (wrapped) {
              if (!cancelled) setFatalError(wrapped as Error);
            }
          }
        );

        const transactionsPath = `users/${activeUser.uid}/transactions`;
        const transactionsQuery = query(
          collection(db, 'users', activeUser.uid, 'transactions'),
          where('ownerId', '==', activeUser.uid)
        );
        unsubTransactions = onSnapshot(
          transactionsQuery,
          (snapshot) => {
            if (cancelled) return;
            const list: Transaction[] = snapshot.docs
              .map((d) => ({
                id: d.id,
                ...(d.data() as Omit<Transaction, 'id'>),
              }))
              .sort((a, b) => {
                if (a.date !== b.date) return b.date.localeCompare(a.date);
                const aSec = a.createdAt?.seconds ?? 0;
                const bSec = b.createdAt?.seconds ?? 0;
                return bSec - aSec;
              });
            setTransactions(list);
            gotTxs = true;
            checkDone();
          },
          (error) => {
            try {
              handleFirestoreError(error, OperationType.LIST, transactionsPath);
            } catch (wrapped) {
              if (!cancelled) setFatalError(wrapped as Error);
            }
          }
        );
      } catch (err) {
        if (!cancelled) {
          setLoadingData(false);
          setFatalError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    }

    void initAndSubscribe(user);

    return () => {
      cancelled = true;
      unsubProfile?.();
      unsubCategories?.();
      unsubTransactions?.();
    };
  }, [authReady, user]);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code ?? '';
      if (code === 'auth/popup-closed-by-user') {
        setAuthError('Se cerró la ventana de inicio de sesión antes de completar el acceso.');
      } else if (code === 'auth/popup-blocked') {
        setAuthError('Tu navegador bloqueó la ventana emergente. Permite ventanas emergentes e intenta de nuevo.');
      } else if (code === 'auth/unauthorized-domain') {
        setAuthError(
          `El dominio "${window.location.hostname}" no está autorizado en Firebase Authentication. Agrégalo en Firebase Console → Authentication → Settings → Authorized domains.`
        );
      } else {
        setAuthError('No fue posible iniciar sesión con Google. Intenta nuevamente.');
      }
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    await signOut(auth);
  }, []);

  if (fatalError) {
    throw fatalError;
  }

  return (
    <FinanceContext.Provider
      value={{
        user,
        authReady,
        profile,
        currency: profile?.currency ?? 'MXN',
        categories,
        transactions,
        loadingData,
        authError,
        signingIn,
        signInWithGoogle,
        signOutUser,
      }}
    >
      {children}
    </FinanceContext.Provider>
  );
}

export function useFinance(): FinanceContextValue {
  const ctx = useContext(FinanceContext);
  if (!ctx) {
    throw new Error('useFinance must be used within FinanceProvider');
  }
  return ctx;
}
