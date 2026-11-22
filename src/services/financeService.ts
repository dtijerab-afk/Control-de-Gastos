import type { User } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  mapDateToTargetQuincena,
  sanitizeCategoryInput,
  sanitizeTransactionInput,
} from '../lib/financeUtils';
import {
  makeTransactionSignature,
  normalizeCategoryLookupKey,
  type BackupImportReport,
  type QuincenaBackupFile,
} from '../lib/backupUtils';
import {
  DEFAULT_CATEGORIES,
  VALIDATION_LIMITS,
  type Category,
  type CategoryInput,
  type CurrencyCode,
  type QuincenaNumber,
  type Transaction,
  type TransactionInput,
  type UserProfile,
} from '../types/finance';

export async function ensureUserProfileAndSeedDefaults(user: User): Promise<UserProfile> {
  const userPath = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);

  let profileData: UserProfile | null = null;
  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      profileData = snap.data() as UserProfile;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }

  if (!profileData) {
    const safeName = (user.displayName || user.email?.split('@')[0] || 'Usuario')
      .trim()
      .slice(0, VALIDATION_LIMITS.DISPLAY_NAME_MAX);

    const newProfilePayload = {
      uid: user.uid,
      displayName: safeName || 'Usuario',
      currency: 'MXN' as CurrencyCode,
      seededDefaults: false,
      monthlyBudget: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(userRef, newProfilePayload);
      profileData = {
        uid: user.uid,
        displayName: newProfilePayload.displayName,
        currency: newProfilePayload.currency,
        seededDefaults: false,
        monthlyBudget: 0,
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, userPath);
    }
  }

  if (!profileData.seededDefaults) {
    const categoriesPath = `users/${user.uid}/categories`;
    try {
      const batch = writeBatch(db);
      for (const cat of DEFAULT_CATEGORIES) {
        const clean = sanitizeCategoryInput(cat);
        const catRef = doc(collection(db, 'users', user.uid, 'categories'));
        batch.set(catRef, {
          ownerId: user.uid,
          name: clean.name,
          type: clean.type,
          color: clean.color,
          monthlyBudget: clean.monthlyBudget,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      batch.update(userRef, {
        seededDefaults: true,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      profileData = { ...profileData, seededDefaults: true };
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, categoriesPath);
    }
  }

  return profileData;
}

export async function updateUserPreferences(
  uid: string,
  updates: { currency?: CurrencyCode; displayName?: string; monthlyBudget?: number }
): Promise<void> {
  const userPath = `users/${uid}`;
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (updates.currency) {
    payload.currency = updates.currency;
  }
  if (typeof updates.displayName === 'string') {
    const safeName = updates.displayName.trim().slice(0, VALIDATION_LIMITS.DISPLAY_NAME_MAX);
    if (!safeName) {
      throw new Error('El nombre no puede estar vacío.');
    }
    payload.displayName = safeName;
  }
  if (typeof updates.monthlyBudget === 'number') {
    const rounded = Math.round(updates.monthlyBudget * 100) / 100;
    if (!Number.isFinite(rounded) || rounded < 0 || rounded > VALIDATION_LIMITS.AMOUNT_MAX) {
      throw new Error('Ingresa un presupuesto mensual válido mayor o igual a cero.');
    }
    payload.monthlyBudget = rounded;
  }

  try {
    await updateDoc(doc(db, 'users', uid), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, userPath);
  }
}

export async function createCategory(uid: string, input: CategoryInput): Promise<string> {
  const clean = sanitizeCategoryInput(input);
  const path = `users/${uid}/categories`;

  try {
    const docRef = await addDoc(collection(db, 'users', uid, 'categories'), {
      ownerId: uid,
      name: clean.name,
      type: clean.type,
      color: clean.color,
      monthlyBudget: clean.monthlyBudget,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateCategory(
  uid: string,
  categoryId: string,
  input: CategoryInput,
  relatedTransactions?: Transaction[]
): Promise<void> {
  const clean = sanitizeCategoryInput(input);
  const path = `users/${uid}/categories/${categoryId}`;

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', uid, 'categories', categoryId), {
      name: clean.name,
      type: clean.type,
      color: clean.color,
      monthlyBudget: clean.monthlyBudget,
      updatedAt: serverTimestamp(),
    });

    if (relatedTransactions && relatedTransactions.length > 0) {
      const toSync = relatedTransactions.filter((t) => t.categoryName !== clean.name).slice(0, 400);
      for (const tx of toSync) {
        batch.update(doc(db, 'users', uid, 'transactions', tx.id), {
          categoryName: clean.name,
          updatedAt: serverTimestamp(),
        });
      }
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteCategory(uid: string, categoryId: string): Promise<void> {
  const path = `users/${uid}/categories/${categoryId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'categories', categoryId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function createTransaction(uid: string, input: TransactionInput): Promise<string> {
  const clean = sanitizeTransactionInput(input);
  const path = `users/${uid}/transactions`;

  try {
    const docRef = await addDoc(collection(db, 'users', uid, 'transactions'), {
      ownerId: uid,
      type: clean.type,
      amount: clean.amount,
      description: clean.description,
      categoryId: clean.categoryId,
      categoryName: clean.categoryName,
      date: clean.date,
      monthKey: clean.monthKey,
      quincena: clean.quincena,
      paymentMethod: clean.paymentMethod,
      notes: clean.notes,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateTransaction(
  uid: string,
  transactionId: string,
  input: TransactionInput
): Promise<void> {
  const clean = sanitizeTransactionInput(input);
  const path = `users/${uid}/transactions/${transactionId}`;

  try {
    await updateDoc(doc(db, 'users', uid, 'transactions', transactionId), {
      type: clean.type,
      amount: clean.amount,
      description: clean.description,
      categoryId: clean.categoryId,
      categoryName: clean.categoryName,
      date: clean.date,
      monthKey: clean.monthKey,
      quincena: clean.quincena,
      paymentMethod: clean.paymentMethod,
      notes: clean.notes,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteTransaction(uid: string, transactionId: string): Promise<void> {
  const path = `users/${uid}/transactions/${transactionId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'transactions', transactionId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function copyTransactionsToQuincena(
  uid: string,
  sourceTransactions: Transaction[],
  targetMonthKey: string,
  targetQuincena: QuincenaNumber,
  validCategoryIds: Set<string>
): Promise<number> {
  const eligible = sourceTransactions.filter((tx) => validCategoryIds.has(tx.categoryId));
  if (eligible.length === 0) {
    return 0;
  }

  const path = `users/${uid}/transactions`;
  try {
    const batch = writeBatch(db);
    for (const tx of eligible.slice(0, 150)) {
      const targetDate = mapDateToTargetQuincena(tx.date, targetMonthKey, targetQuincena);
      const clean = sanitizeTransactionInput({
        type: tx.type,
        amount: tx.amount,
        description: tx.description,
        categoryId: tx.categoryId,
        categoryName: tx.categoryName,
        date: targetDate,
        quincena: targetQuincena,
        paymentMethod: tx.paymentMethod,
        notes: tx.notes,
      });

      const ref = doc(collection(db, 'users', uid, 'transactions'));
      batch.set(ref, {
        ownerId: uid,
        type: clean.type,
        amount: clean.amount,
        description: clean.description,
        categoryId: clean.categoryId,
        categoryName: clean.categoryName,
        date: clean.date,
        monthKey: clean.monthKey,
        quincena: clean.quincena,
        paymentMethod: clean.paymentMethod,
        notes: clean.notes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
    return Math.min(eligible.length, 150);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function importBackupToFirestore(
  uid: string,
  backup: QuincenaBackupFile,
  existingProfile: UserProfile | null,
  existingCategories: Category[],
  existingTransactions: Transaction[]
): Promise<BackupImportReport> {
  let profileUpdated = false;
  let categoriesCreated = 0;
  let categoriesMatched = 0;
  let categoriesUpdated = 0;
  let transactionsImported = 0;
  let transactionsSkipped = 0;

  // 1. Restore non-destructive profile preferences (currency & global monthly budget)
  const profileUpdates: { currency?: CurrencyCode; monthlyBudget?: number } = {};
  if (backup.profile.currency && backup.profile.currency !== existingProfile?.currency) {
    profileUpdates.currency = backup.profile.currency;
  }
  if (
    backup.profile.monthlyBudget > 0 &&
    backup.profile.monthlyBudget !== (existingProfile?.monthlyBudget ?? 0)
  ) {
    profileUpdates.monthlyBudget = backup.profile.monthlyBudget;
  }
  if (Object.keys(profileUpdates).length > 0) {
    await updateUserPreferences(uid, profileUpdates);
    profileUpdated = true;
  }

  // 2. Remap categories by (type, normalizedName) -> targetCategoryId (preserving existing, never deleting)
  const byKey = new Map<string, Category>();
  for (const cat of existingCategories) {
    byKey.set(normalizeCategoryLookupKey(cat.type, cat.name), cat);
  }

  const categoryIdMap = new Map<string, { id: string; name: string }>();

  for (const srcCat of backup.categories) {
    const key = normalizeCategoryLookupKey(srcCat.type, srcCat.name);
    const existing = byKey.get(key);

    if (existing) {
      categoriesMatched += 1;
      categoryIdMap.set(srcCat.sourceId, { id: existing.id, name: existing.name });

      // Preserve user's category budget/color from backup if existing category has no budget set
      const shouldRestoreBudget =
        srcCat.type === 'gasto' && srcCat.monthlyBudget > 0 && existing.monthlyBudget === 0;
      const shouldRestoreColor = existing.color.toUpperCase() !== srcCat.color.toUpperCase();

      if (shouldRestoreBudget || shouldRestoreColor) {
        await updateCategory(uid, existing.id, {
          name: existing.name,
          type: existing.type,
          color: srcCat.color,
          monthlyBudget: shouldRestoreBudget ? srcCat.monthlyBudget : existing.monthlyBudget,
        });
        categoriesUpdated += 1;
      }
    } else {
      const createdId = await createCategory(uid, {
        name: srcCat.name,
        type: srcCat.type,
        color: srcCat.color,
        monthlyBudget: srcCat.monthlyBudget,
      });
      const createdObj: Category = {
        id: createdId,
        ownerId: uid,
        name: srcCat.name,
        type: srcCat.type,
        color: srcCat.color,
        monthlyBudget: srcCat.monthlyBudget,
      };
      byKey.set(key, createdObj);
      categoryIdMap.set(srcCat.sourceId, { id: createdId, name: srcCat.name });
      categoriesCreated += 1;
    }
  }

  // Ensure any transaction referencing a previously deleted category gets a valid remapped category
  for (const srcTx of backup.transactions) {
    if (categoryIdMap.has(srcTx.sourceCategoryId)) continue;
    const key = normalizeCategoryLookupKey(srcTx.type, srcTx.categoryName);
    const matched = byKey.get(key);
    if (matched) {
      if (srcTx.sourceCategoryId) {
        categoryIdMap.set(srcTx.sourceCategoryId, { id: matched.id, name: matched.name });
      }
      continue;
    }
    const createdId = await createCategory(uid, {
      name: srcTx.categoryName,
      type: srcTx.type,
      color: srcTx.type === 'ingreso' ? '#0F5132' : '#475569',
      monthlyBudget: 0,
    });
    const createdObj: Category = {
      id: createdId,
      ownerId: uid,
      name: srcTx.categoryName,
      type: srcTx.type,
      color: srcTx.type === 'ingreso' ? '#0F5132' : '#475569',
      monthlyBudget: 0,
    };
    byKey.set(key, createdObj);
    if (srcTx.sourceCategoryId) {
      categoryIdMap.set(srcTx.sourceCategoryId, { id: createdId, name: srcTx.categoryName });
    }
    categoriesCreated += 1;
  }

  // 3. Multiset deduplication of existing transactions to allow idempotent re-imports without losing valid duplicates
  const existingCounts = new Map<string, number>();
  for (const tx of existingTransactions) {
    const sig = makeTransactionSignature(tx);
    existingCounts.set(sig, (existingCounts.get(sig) ?? 0) + 1);
  }

  const toCreate: ReturnType<typeof sanitizeTransactionInput>[] = [];
  for (const srcTx of backup.transactions) {
    const remapped =
      (srcTx.sourceCategoryId ? categoryIdMap.get(srcTx.sourceCategoryId) : undefined) ??
      (() => {
        const byName = byKey.get(normalizeCategoryLookupKey(srcTx.type, srcTx.categoryName));
        return byName ? { id: byName.id, name: byName.name } : undefined;
      })();

    if (!remapped) {
      transactionsSkipped += 1;
      continue;
    }

    const candidateSig = makeTransactionSignature({
      date: srcTx.date,
      type: srcTx.type,
      amount: srcTx.amount,
      quincena: srcTx.quincena,
      description: srcTx.description,
      categoryName: remapped.name,
      paymentMethod: srcTx.paymentMethod,
      notes: srcTx.notes,
    });

    const availableExisting = existingCounts.get(candidateSig) ?? 0;
    if (availableExisting > 0) {
      existingCounts.set(candidateSig, availableExisting - 1);
      transactionsSkipped += 1;
      continue;
    }

    const clean = sanitizeTransactionInput({
      type: srcTx.type,
      amount: srcTx.amount,
      description: srcTx.description,
      categoryId: remapped.id,
      categoryName: remapped.name,
      date: srcTx.date,
      quincena: srcTx.quincena,
      paymentMethod: srcTx.paymentMethod,
      notes: srcTx.notes,
    });
    toCreate.push(clean);
  }

  // 4. Write new transactions in safe Firestore batches (<= 400 writes per batch)
  const txPath = `users/${uid}/transactions`;
  const BATCH_SIZE = 400;
  try {
    for (let offset = 0; offset < toCreate.length; offset += BATCH_SIZE) {
      const chunk = toCreate.slice(offset, offset + BATCH_SIZE);
      const batch = writeBatch(db);
      for (const clean of chunk) {
        const ref = doc(collection(db, 'users', uid, 'transactions'));
        batch.set(ref, {
          ownerId: uid,
          type: clean.type,
          amount: clean.amount,
          description: clean.description,
          categoryId: clean.categoryId,
          categoryName: clean.categoryName,
          date: clean.date,
          monthKey: clean.monthKey,
          quincena: clean.quincena,
          paymentMethod: clean.paymentMethod,
          notes: clean.notes,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      transactionsImported += chunk.length;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, txPath);
  }

  return {
    profileUpdated,
    categoriesCreated,
    categoriesMatched,
    categoriesUpdated,
    transactionsImported,
    transactionsSkipped,
  };
}

