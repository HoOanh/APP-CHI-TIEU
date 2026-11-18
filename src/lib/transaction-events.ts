const TRANSACTIONS_CHANGED = 'arc-irobot-transactions-changed';

export function notifyTransactionsChanged() {
  window.dispatchEvent(new Event(TRANSACTIONS_CHANGED));
}

export function onTransactionsChanged(refresh: () => void) {
  window.addEventListener(TRANSACTIONS_CHANGED, refresh);
  return () => window.removeEventListener(TRANSACTIONS_CHANGED, refresh);
}
