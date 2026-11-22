export type StatementFileKind = 'pdf' | 'image';

export interface BankStatementRecord {
  id: string;
  ownerId: string;
  title: string;
  bankName: string;
  monthKey: string; // YYYY-MM
  debtId: string; // '' if general statement, or linked DebtItem.id
  fileName: string;
  mimeType: string;
  fileKind: StatementFileKind;
  sizeBytes: number;
  notes: string;
  createdAt: string;
  blob: Blob;
}

export interface BankStatementInput {
  ownerId: string;
  title: string;
  bankName: string;
  monthKey: string;
  debtId?: string;
  notes?: string;
  file: File;
}

const DB_NAME = 'moneyflow_bank_statements_v1';
const DB_VERSION = 1;
const STORE_NAME = 'statements';

export const MAX_STATEMENT_FILE_BYTES = 15 * 1024 * 1024; // 15 MB per file

function openStatementsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Tu navegador no soporta almacenamiento local de archivos.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('by_owner', 'ownerId', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('No se pudo abrir la bóveda de extractos.'));
  });
}

export function detectStatementFileKind(file: File): StatementFileKind | null {
  const mime = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();

  if (mime === 'application/pdf' || name.endsWith('.pdf')) {
    return 'pdf';
  }
  if (
    mime.startsWith('image/') ||
    /\.(png|jpe?g|webp|gif|bmp|heic|heif|avif)$/i.test(name)
  ) {
    return 'image';
  }
  return null;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1024) return `${Math.max(0, Math.round(bytes))} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

export async function listBankStatements(ownerId: string): Promise<BankStatementRecord[]> {
  if (!ownerId) return [];
  const db = await openStatementsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('by_owner');
    const req = index.getAll(IDBKeyRange.only(ownerId));

    req.onsuccess = () => {
      const rows = (req.result as BankStatementRecord[]) ?? [];
      rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      resolve(rows);
    };
    req.onerror = () =>
      reject(req.error ?? new Error('No se pudieron cargar los extractos guardados.'));
    tx.oncomplete = () => db.close();
  });
}

export async function saveBankStatement(input: BankStatementInput): Promise<BankStatementRecord> {
  const kind = detectStatementFileKind(input.file);
  if (!kind) {
    throw new Error(
      `El archivo "${input.file.name}" no es compatible. Sube archivos PDF o fotos (JPG, PNG, WEBP).`
    );
  }
  if (input.file.size > MAX_STATEMENT_FILE_BYTES) {
    throw new Error(
      `El archivo "${input.file.name}" supera el límite de 15 MB (${formatFileSize(input.file.size)}).`
    );
  }

  const cleanFileName = input.file.name.trim().slice(0, 140) || 'extracto';
  const defaultTitle = cleanFileName.replace(/\.[^.]+$/, '').slice(0, 90) || 'Extracto bancario';
  const title = input.title.trim().slice(0, 90) || defaultTitle;
  const bankName = input.bankName.trim().slice(0, 70) || 'Banco';
  const notes = (input.notes ?? '').trim().slice(0, 240);
  const mimeType =
    input.file.type || (kind === 'pdf' ? 'application/pdf' : 'image/jpeg');

  const record: BankStatementRecord = {
    id: `stmt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ownerId: input.ownerId,
    title,
    bankName,
    monthKey: input.monthKey,
    debtId: (input.debtId ?? '').trim(),
    fileName: cleanFileName,
    mimeType,
    fileKind: kind,
    sizeBytes: input.file.size,
    notes,
    createdAt: new Date().toISOString(),
    blob: input.file,
  };

  const db = await openStatementsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(record);

    req.onsuccess = () => resolve(record);
    req.onerror = () =>
      reject(req.error ?? new Error('No se pudo guardar el extracto en el dispositivo.'));
    tx.oncomplete = () => db.close();
  });
}

export async function deleteBankStatement(statementId: string): Promise<void> {
  const db = await openStatementsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(statementId);

    req.onsuccess = () => resolve();
    req.onerror = () =>
      reject(req.error ?? new Error('No se pudo eliminar el extracto.'));
    tx.oncomplete = () => db.close();
  });
}

export async function unlinkDebtFromStatements(ownerId: string, debtId: string): Promise<void> {
  if (!ownerId || !debtId) return;
  const rows = await listBankStatements(ownerId);
  const affected = rows.filter((r) => r.debtId === debtId);
  if (affected.length === 0) return;

  const db = await openStatementsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const row of affected) {
      store.put({ ...row, debtId: '' });
    }
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('No se pudieron desvincular los extractos.'));
    };
  });
}
