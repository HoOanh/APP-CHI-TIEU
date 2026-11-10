'use client';

export interface OfflineTransactionValues {
  amount: number;
  description: string;
  category_id: string | number;
  expense_date: string;
  note: string;
  type: 'expense' | 'income';
}

interface OfflineQueueBase {
  id: string;
  createdAt: string;
  lastError?: string;
}

export interface QueuedTransaction extends OfflineQueueBase {
  kind: 'transaction';
  values: OfflineTransactionValues;
}

export interface QueuedAiNote extends OfflineQueueBase {
  kind: 'ai_note';
  message: string;
}

export type OfflineQueueEntry = QueuedTransaction | QueuedAiNote;

const DATABASE_NAME = 'arc-irobot-offline';
const STORE_NAME = 'pending_entries';
const CHANGE_EVENT = 'arc-irobot-offline-queue-changed';
let databasePromise: Promise<IDBDatabase> | undefined;
let syncPromise: Promise<{ synced: number; failed: number }> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('Thiết bị không hỗ trợ lưu nháp offline.'));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      databasePromise = undefined;
      reject(request.error || new Error('Không thể mở bộ nhớ nháp offline.'));
    };
  });

  return databasePromise;
}

function announceChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT));
}

function createId() {
  return crypto.randomUUID();
}

export async function queueOfflineTransaction(
  values: OfflineTransactionValues,
  requestId = createId(),
): Promise<QueuedTransaction> {
  const entry: QueuedTransaction = {
    id: requestId,
    kind: 'transaction',
    createdAt: new Date().toISOString(),
    values,
  };
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).add(entry);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Không thể lưu giao dịch offline.'));
    transaction.onabort = () => reject(transaction.error || new Error('Đã hủy lưu giao dịch offline.'));
  });
  announceChange();
  return entry;
}

export async function queueOfflineAiNote(message: string): Promise<QueuedAiNote> {
  const entry: QueuedAiNote = {
    id: createId(),
    kind: 'ai_note',
    createdAt: new Date().toISOString(),
    message: message.trim(),
  };
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).add(entry);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Không thể lưu ghi chú offline.'));
    transaction.onabort = () => reject(transaction.error || new Error('Đã hủy lưu ghi chú offline.'));
  });
  announceChange();
  return entry;
}

export async function listOfflineQueue(): Promise<OfflineQueueEntry[]> {
  const database = await openDatabase();
  const entries = await new Promise<OfflineQueueEntry[]>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as OfflineQueueEntry[]);
    request.onerror = () => reject(request.error || new Error('Không thể đọc ghi chú offline.'));
  });
  return entries.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function removeOfflineQueueEntry(id: string): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Không thể xóa ghi chú offline.'));
  });
  announceChange();
}

export function onOfflineQueueChange(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}

export function syncOfflineTransactions() {
  if (syncPromise) return syncPromise;
  syncPromise = syncQueue().finally(() => {
    syncPromise = undefined;
  });
  return syncPromise;
}

async function syncQueue(): Promise<{ synced: number; failed: number }> {
  if (typeof navigator === 'undefined' || !navigator.onLine) return { synced: 0, failed: 0 };
  const entries = await listOfflineQueue();
  let synced = 0;
  let failed = 0;

  for (const entry of entries) {
    if (entry.kind !== 'transaction') continue;
    try {
      const response = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...entry.values, client_request_id: entry.id }),
      });
      if (response.ok) {
        await removeOfflineQueueEntry(entry.id);
        synced += 1;
      } else {
        failed += 1;
        if (response.status === 401) break;
        await setEntryError(entry.id, response.status === 400
          ? 'Danh mục hoặc dữ liệu giao dịch cần kiểm tra.'
          : 'Chưa đồng bộ được. Sẽ thử lại khi có mạng.');
      }
    } catch {
      failed += 1;
      break;
    }
  }

  return { synced, failed };
}

async function setEntryError(id: string, lastError: string) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => {
      const entry = request.result as OfflineQueueEntry | undefined;
      if (entry) store.put({ ...entry, lastError });
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Không thể cập nhật trạng thái đồng bộ.'));
  });
  announceChange();
}
