import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { loadDebtsState, saveDebtsState, type DebtsState } from '../lib/debtsStore';
import { loadSavingsPlan, saveSavingsPlan, type SavingsPlanState } from '../lib/savingsPlan';

type CloudState<T> = {
  ownerId: string;
  payload: T;
  updatedAt: unknown;
};

export interface PersonalDataSyncResult {
  debts: 'migrated' | 'cloud_exists' | 'empty';
  savings: 'migrated' | 'cloud_exists' | 'empty';
}

/**
 * Copies existing browser data to the signed-in user's private Firestore area.
 * Local data is never deleted. Existing cloud documents are never overwritten.
 */
export async function migratePersonalDataToCloud(uid: string): Promise<PersonalDataSyncResult> {
  if (!uid) throw new Error('No hay un usuario autenticado para sincronizar.');

  const debtsLocal = loadDebtsState(uid);
  const savingsLocal = loadSavingsPlan(uid);

  const [debtsResult, savingsResult] = await Promise.all([
    migrateOne(uid, 'debts', debtsLocal, debtsLocal.debts.length > 0),
    migrateOne(
      uid,
      'savings',
      savingsLocal,
      savingsLocal.goals.length > 0 ||
        savingsLocal.monthlyRule.mode !== 'percentage' ||
        savingsLocal.monthlyRule.targetPercentage !== 20 ||
        savingsLocal.monthlyRule.targetFixedAmount !== 0
    ),
  ]);

  return { debts: debtsResult, savings: savingsResult };
}

async function migrateOne<T>(
  uid: string,
  key: 'debts' | 'savings',
  localPayload: T,
  hasLocalData: boolean
): Promise<'migrated' | 'cloud_exists' | 'empty'> {
  const ref = doc(db, 'users', uid, 'privateData', key);
  const existing = await getDoc(ref);
  if (existing.exists()) return 'cloud_exists';
  if (!hasLocalData) return 'empty';

  await setDoc(ref, {
    ownerId: uid,
    payload: localPayload,
    updatedAt: serverTimestamp(),
    migrationVersion: 1,
  });
  return 'migrated';
}

/** Loads the cloud copy when present; otherwise preserves the browser copy. */
export async function loadDebtsFromCloud(uid: string): Promise<DebtsState> {
  const ref = doc(db, 'users', uid, 'privateData', 'debts');
  const snap = await getDoc(ref);
  if (!snap.exists()) return loadDebtsState(uid);
  const data = snap.data() as CloudState<DebtsState>;
  if (data.ownerId !== uid || !data.payload || !Array.isArray(data.payload.debts)) {
    throw new Error('Los datos de deudas en la nube no superaron la validación.');
  }
  saveDebtsState(uid, data.payload);
  return data.payload;
}

export async function saveDebtsToCloud(uid: string, state: DebtsState): Promise<void> {
  if (!uid) throw new Error('No hay un usuario autenticado.');
  saveDebtsState(uid, state);
  await setDoc(doc(db, 'users', uid, 'privateData', 'debts'), {
    ownerId: uid,
    payload: state,
    updatedAt: serverTimestamp(),
    migrationVersion: 1,
  });
}

export async function loadSavingsFromCloud(uid: string): Promise<SavingsPlanState> {
  const ref = doc(db, 'users', uid, 'privateData', 'savings');
  const snap = await getDoc(ref);
  if (!snap.exists()) return loadSavingsPlan(uid);
  const data = snap.data() as CloudState<SavingsPlanState>;
  if (
    data.ownerId !== uid ||
    !data.payload ||
    !Array.isArray(data.payload.goals) ||
    !data.payload.monthlyRule
  ) {
    throw new Error('El plan de ahorro en la nube no superó la validación.');
  }
  saveSavingsPlan(uid, data.payload);
  return data.payload;
}

export async function saveSavingsToCloud(uid: string, state: SavingsPlanState): Promise<void> {
  if (!uid) throw new Error('No hay un usuario autenticado.');
  saveSavingsPlan(uid, state);
  await setDoc(doc(db, 'users', uid, 'privateData', 'savings'), {
    ownerId: uid,
    payload: state,
    updatedAt: serverTimestamp(),
    migrationVersion: 1,
  });
}
