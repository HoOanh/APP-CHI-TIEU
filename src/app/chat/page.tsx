'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowLeft,
  CheckCircle2,
  ImagePlus,
  ReceiptText,
  SendHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn, formatCurrency, formatShortDate } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';
import { ManualTransactionDialog } from '@/components/ManualTransactionDialog';
import { DatePicker } from '@/components/ui/date-picker';
import {
  listOfflineQueue,
  onOfflineQueueChange,
  queueOfflineAiNote,
  removeOfflineQueueEntry,
  type OfflineQueueEntry,
  type QueuedAiNote,
} from '@/lib/offline-queue';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
  transactions?: TransactionDraft[];
  offlineNoteId?: string;
}

interface QuickSuggestion {
  label: string;
  amount: number;
  amountText: string;
  categoryName: string;
  categoryColor: string;
  type: 'expense' | 'income';
  prompt: string;
}

interface TransactionDraft {
  id?: string;
  amount: number;
  description: string;
  category_name: string;
  category_id: number | string;
  note?: string;
  merchant?: string;
  expense_date: string;
  type?: 'income' | 'expense';
  category_source?: 'budget_jar' | 'income_category';
  confirmed?: boolean;
}

interface ExpenseBudgetAlert {
  title: string;
  message: string;
  severity: 'warning' | 'danger';
}

interface SavedTransaction extends TransactionDraft {
  budgetAlert?: ExpenseBudgetAlert | null;
}

interface ChatResponse {
  transactions?: TransactionDraft[];
  correction?: boolean;
  error?: string;
}

const quickPrompts = ['Ăn trưa 50k', 'Nhận lương 15tr', 'Cà phê 35k'];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<QuickSuggestion[]>([]);
  const [offlineEntries, setOfflineEntries] = useState<OfflineQueueEntry[]>([]);
  const [activeOfflineNoteId, setActiveOfflineNoteId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();
  const hasDraft = Boolean(input.trim() || imageFiles.length);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    const refreshQueue = () => {
      void listOfflineQueue().then(setOfflineEntries).catch(() => setOfflineEntries([]));
    };
    refreshQueue();
    const removeListener = onOfflineQueueChange(refreshQueue);
    const handleFocus = () => refreshQueue();
    window.addEventListener('online', handleFocus);
    window.addEventListener('focus', handleFocus);
    fetch('/api/expenses/suggestions')
      .then(async (response) => response.ok ? await response.json() as QuickSuggestion[] : [])
      .then(setSuggestions)
      .catch(() => setSuggestions([]));
    return () => {
      removeListener();
      window.removeEventListener('online', handleFocus);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const appendFiles = (files: File[]) => {
    const accepted = files.slice(0, Math.max(0, 8 - imageFiles.length));
    if (!accepted.length) return;
    setImageFiles((current) => [...current, ...accepted]);
    setImagePreviews((current) => [...current, ...accepted.map((file) => URL.createObjectURL(file))]);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    appendFiles(Array.from(event.target.files ?? []));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePaste = (event: React.ClipboardEvent) => {
    const pastedFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (pastedFiles.length) {
      appendFiles(pastedFiles);
      event.preventDefault();
    }
  };

  const removeImage = (index: number) => {
    URL.revokeObjectURL(imagePreviews[index]);
    setImageFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setImagePreviews((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleSend = async () => {
    if (!hasDraft || isLoading) return;
    const currentInput = input.trim();
    const currentImageFiles = imageFiles;
    const currentImagePreviews = imagePreviews;
    const offlineNoteId = activeOfflineNoteId;
    if (!navigator.onLine) {
      if (currentImageFiles.length) {
        showToast('Ảnh cần mạng để phân tích. Ghi chú chữ vẫn lưu được offline.', 'warning');
        return;
      }
      try {
        await queueOfflineAiNote(currentInput);
        setInput('');
        setActiveOfflineNoteId(null);
        showToast('Đã lưu ghi chú trên thiết bị', 'success', 'Kết nối lại để AI phân tích ghi chú này.');
      } catch {
        showToast('Không thể lưu ghi chú offline trên thiết bị này.', 'error');
      }
      return;
    }
    setMessages((current) => [...current, {
      id: crypto.randomUUID(), role: 'user', content: currentInput, images: currentImagePreviews,
    }]);
    setInput('');
    setImageFiles([]);
    setImagePreviews([]);
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('type', 'expense');
      if (currentInput) formData.append('message', currentInput);
      currentImageFiles.forEach((file) => formData.append('images', file));
      const pendingTransactions = getLatestPendingTransactions(messages);
      if (!currentImageFiles.length && pendingTransactions.length && looksLikeCorrection(currentInput)) {
        formData.append('correction_context', JSON.stringify(pendingTransactions.map((transaction) => ({
          amount: transaction.amount,
          description: transaction.description,
          category: transaction.category_name,
          merchant: transaction.merchant,
          date: transaction.expense_date,
          type: transaction.type,
        }))));
      }
      const response = await fetch('/api/chat', { method: 'POST', body: formData });
      const data: ChatResponse = await response.json();
      const transactions = data.transactions ?? [];
      if (!response.ok || !transactions.length) throw new Error(data.error || 'Failed to process message');
      if (data.correction) {
        setMessages((current) => replaceLatestPendingTransactions(current, transactions));
        setMessages((current) => [...current, {
          id: crypto.randomUUID(), role: 'assistant', content: 'Đã cập nhật các giao dịch chờ lưu. Bạn kiểm tra rồi xác nhận nhé.',
        }]);
        return;
      }
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Đã tìm thấy ${transactions.length} giao dịch. Kiểm tra lại trước khi lưu nhé.`,
        transactions,
        offlineNoteId: offlineNoteId || undefined,
      }]);
      setActiveOfflineNoteId(null);
    } catch (error) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : 'Không thể xử lý yêu cầu, vui lòng thử lại.';
      showToast(errorMessage, 'error');
      setMessages((current) => [...current, {
        id: crypto.randomUUID(), role: 'assistant', content: errorMessage,
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const confirmExpense = async (messageId: string, transactionIndex: number) => {
    const sourceMessage = messages.find((item) => item.id === messageId);
    const transaction = sourceMessage?.transactions?.[transactionIndex];
    if (!transaction || transaction.confirmed) return;
    setIsLoading(true);
    try {
      const response = await fetch('/api/expenses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(transaction),
      });
      if (!response.ok) throw new Error('Failed to save transaction');
      const saved: SavedTransaction = await response.json();
      setMessages((current) => current.map((item) => item.id === messageId ? {
        ...item,
        transactions: item.transactions?.map((draft, index) => index === transactionIndex ? { ...saved, confirmed: true } : draft),
      } : item));
      if (saved.budgetAlert) {
        showToast(
          saved.budgetAlert.title,
          saved.budgetAlert.severity === 'danger' ? 'error' : 'warning',
          saved.budgetAlert.message,
        );
      } else {
        showToast('Đã lưu giao dịch', 'success');
      }
      const allTransactionsSaved = sourceMessage?.transactions?.every((draft, index) => draft.confirmed || index === transactionIndex);
      if (sourceMessage?.offlineNoteId && allTransactionsSaved) {
        await removeOfflineQueueEntry(sourceMessage.offlineNoteId);
        setOfflineEntries(await listOfflineQueue());
      }
    } catch (error) {
      console.error(error);
      showToast('Không thể lưu giao dịch, vui lòng thử lại.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const updateTransactionDate = (messageId: string, transactionIndex: number, date: string) => {
    setMessages((current) => current.map((item) => item.id === messageId ? {
      ...item,
      transactions: item.transactions?.map((transaction, index) => index === transactionIndex
        ? { ...transaction, expense_date: date }
        : transaction),
    } : item));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-dvh w-full max-w-6xl flex-col overflow-hidden bg-[#f7f9fb] md:mx-auto md:border-x md:border-slate-200">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="flex min-w-0 items-center">
        <Link href="/" aria-label="Quay lại" className="mr-3 flex size-9 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100">
          <ArrowLeft className="size-5" />
        </Link>
        <div>
          <h1 className="text-[15px] font-semibold tracking-[-0.02em] text-slate-800">Ghi giao dịch</h1>
          <p className="mt-0.5 text-xs text-slate-400">Nhập nhanh hoặc gửi ảnh hoá đơn</p>
        </div>
        </div>
        <ManualTransactionDialog compact />
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        <OfflineNotesPanel
          entries={offlineEntries}
          activeId={activeOfflineNoteId}
          isOnline={typeof navigator !== 'undefined' && navigator.onLine}
          onUse={(entry) => { setInput(entry.message); setActiveOfflineNoteId(entry.id); }}
          onDelete={async (entry) => { await removeOfflineQueueEntry(entry.id); setOfflineEntries(await listOfflineQueue()); }}
        />
        {messages.length === 0 ? (
          <EmptyState suggestions={suggestions} onPrompt={setInput} onImage={() => fileInputRef.current?.click()} />
        ) : (
          <div className="mx-auto max-w-2xl space-y-4">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} isLoading={isLoading} onConfirm={confirmExpense} onDateChange={updateTransactionDate} />
            ))}
            {isLoading ? <ThinkingBubble /> : null}
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      <div className="shrink-0 border-t border-slate-200 bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
        {imagePreviews.length ? (
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
            {imagePreviews.map((preview, index) => (
              <div key={preview} className="relative shrink-0">
                <Image src={preview} alt={`Ảnh giao dịch ${index + 1}`} width={104} height={72} unoptimized className="h-[72px] w-[104px] rounded-xl border border-slate-200 object-cover" />
                <button type="button" onClick={() => removeImage(index)} className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-slate-700 text-white shadow-sm" aria-label="Bỏ ảnh">
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
          <Button type="button" variant="outline" size="icon" className="size-11 shrink-0 rounded-2xl border-slate-200 text-slate-500" onClick={() => fileInputRef.current?.click()}>
            <ImagePlus className="size-5" />
            <span className="sr-only">Thêm ảnh</span>
          </Button>
          <div className="flex min-h-11 flex-1 items-center rounded-2xl border border-slate-200 bg-[#f8fafb] px-3 focus-within:border-[#00bc7c] focus-within:ring-2 focus-within:ring-[#00bc7c]/10">
            <textarea value={input} onChange={(event) => setInput(event.target.value)} onPaste={handlePaste} onKeyDown={handleKeyDown} rows={1} placeholder="Ví dụ: ăn trưa 50k" className="max-h-28 min-h-6 w-full resize-none bg-transparent py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400" />
          </div>
          <Button type="button" size="icon" disabled={!hasDraft || isLoading} onClick={handleSend} className="size-11 shrink-0 rounded-2xl bg-[#00bc7c] shadow-[0_10px_20px_-12px_rgba(0,188,124,0.9)] hover:bg-[#00a970] disabled:bg-slate-100 disabled:text-slate-300 disabled:shadow-none">
            <SendHorizontal className="size-5" />
            <span className="sr-only">Gửi giao dịch</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

function getLatestPendingTransactions(messages: Message[]): TransactionDraft[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const transactions = messages[index].transactions?.filter((transaction) => !transaction.confirmed) ?? [];
    if (transactions.length) return transactions;
  }
  return [];
}

function replaceLatestPendingTransactions(messages: Message[], transactions: TransactionDraft[]): Message[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].transactions?.some((transaction) => !transaction.confirmed)) {
      return messages.map((message, messageIndex) => messageIndex === index ? { ...message, transactions } : message);
    }
  }
  return messages;
}

function looksLikeCorrection(message: string): boolean {
  return /\b(sửa|chỉnh|đổi|cập nhật|giao dịch|món (đầu|cuối)|thứ \d+|đầu tiên|cuối cùng)\b/i.test(message);
}

function EmptyState({ suggestions, onPrompt, onImage }: { suggestions: QuickSuggestion[]; onPrompt: (value: string) => void; onImage: () => void }) {
  return (
    <section className="mx-auto flex min-h-full max-w-sm flex-col justify-center pb-12 text-center">
      <span className="mx-auto flex size-14 items-center justify-center rounded-3xl bg-emerald-50 text-[#00bc7c]">
        <ReceiptText className="size-7" strokeWidth={1.8} />
      </span>
      <h2 className="mt-5 text-lg font-semibold tracking-[-0.03em] text-slate-800">Ghi một giao dịch mới</h2>
      <p className="mx-auto mt-2 max-w-[270px] text-sm leading-6 text-slate-500">Nhập theo cách tự nhiên, hoặc gửi ảnh biên lai để tự động tách giao dịch.</p>
      <div className="mt-7 flex flex-wrap justify-center gap-2">
        {(suggestions.length ? suggestions.map((suggestion) => ({
          id: `${suggestion.label}-${suggestion.amount}-${suggestion.categoryName}`,
          label: `${suggestion.label} · ${suggestion.amountText}đ`,
          prompt: suggestion.prompt,
        })) : quickPrompts.map((prompt) => ({ id: prompt, label: prompt, prompt }))).map((suggestion) => (
          <button key={suggestion.id} type="button" onClick={() => onPrompt(suggestion.prompt)} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-[#00bc7c]/40 hover:text-[#00a970]">{suggestion.label}</button>
        ))}
      </div>
      <button type="button" onClick={onImage} className="mx-auto mt-5 flex items-center gap-2 text-sm font-semibold text-[#00a970]">
        <ImagePlus className="size-4" /> Gửi ảnh giao dịch
      </button>
    </section>
  );
}

function OfflineNotesPanel({ entries, activeId, isOnline, onUse, onDelete }: {
  entries: OfflineQueueEntry[];
  activeId: string | null;
  isOnline: boolean;
  onUse: (entry: QueuedAiNote) => void;
  onDelete: (entry: OfflineQueueEntry) => void | Promise<void>;
}) {
  if (!entries.length) return null;
  return (
    <section className="mx-auto mb-4 max-w-2xl rounded-2xl border border-amber-200 bg-amber-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-amber-900">Ghi chú chờ AI phân tích ({entries.length})</p>
        {!isOnline ? <span className="text-[11px] text-amber-700">Đang offline</span> : null}
      </div>
      <div className="mt-2 space-y-2">
        {entries.map((entry) => {
          const label = entry.kind === 'ai_note'
            ? entry.message
            : `${entry.values.description} · ${formatCurrency(entry.values.amount)} · ${entry.values.expense_date}`;
          return (
            <div key={entry.id} className="flex items-center gap-2 rounded-xl bg-white p-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-slate-700">{label}</p>
                {entry.lastError ? <p className="mt-1 text-[10px] text-rose-600">{entry.lastError}</p> : null}
              </div>
              {entry.kind === 'ai_note' ? (
                <Button type="button" size="sm" disabled={!isOnline || activeId === entry.id} onClick={() => onUse(entry)} className="h-8 rounded-lg bg-[#00bc7c] px-2.5 text-[11px]">
                  {activeId === entry.id ? 'Đã đưa vào ô nhập' : 'Phân tích'}
                </Button>
              ) : (
                <span className="shrink-0 text-[10px] font-medium text-amber-700">Chờ đồng bộ</span>
              )}
              <button type="button" aria-label="Xóa bản ghi offline" onClick={() => void onDelete(entry)} className="px-1 text-xs text-slate-400">Xóa</button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MessageBubble({ message, isLoading, onConfirm, onDateChange }: { message: Message; isLoading: boolean; onConfirm: (messageId: string, transactionIndex: number) => void; onDateChange: (messageId: string, transactionIndex: number, date: string) => void }) {
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex flex-col', isUser ? 'items-end' : 'items-start')}>
      <div className={cn('max-w-[90%] rounded-2xl px-3.5 py-3 text-sm leading-5 shadow-sm', isUser ? 'rounded-br-md bg-[#00bc7c] text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-700')}>
        {message.images?.length ? <div className="mb-2 grid grid-cols-2 gap-1.5">{message.images.map((image, index) => <Image key={image} src={image} alt={`Ảnh giao dịch ${index + 1}`} width={240} height={160} unoptimized className="h-28 w-full rounded-xl object-cover" />)}</div> : null}
        {message.content ? <p className="whitespace-pre-wrap">{message.content}</p> : null}
        {message.transactions?.map((transaction, transactionIndex) => <TransactionCard key={`${message.id}-${transactionIndex}`} transaction={transaction} isLoading={isLoading} onConfirm={() => onConfirm(message.id, transactionIndex)} onDateChange={(date) => onDateChange(message.id, transactionIndex, date)} />)}
      </div>
    </div>
  );
}

function TransactionCard({ transaction, isLoading, onConfirm, onDateChange }: { transaction: TransactionDraft; isLoading: boolean; onConfirm: () => void; onDateChange: (date: string) => void }) {
  const isIncome = transaction.type === 'income';
  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-[#fbfcfc] p-3 text-slate-700">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className={cn('text-lg font-semibold tabular-nums', isIncome ? 'text-[#00a970]' : 'text-[#f15b64]')}>{isIncome ? '+' : '−'}{formatCurrency(transaction.amount)}</p><p className="mt-1 truncate text-sm font-medium">{transaction.description}</p></div>
        <Badge variant="outline" className={cn('shrink-0', transaction.confirmed ? 'border-emerald-100 bg-emerald-50 text-[#00a970]' : 'border-slate-200 bg-white text-slate-500')}><CheckCircle2 className="size-3" />{transaction.confirmed ? 'Đã lưu' : 'Chờ lưu'}</Badge>
      </div>
      <p className="mt-2 text-xs text-slate-400">{transaction.category_name}{transaction.merchant ? ` · ${transaction.merchant}` : ''}</p>
      {!transaction.confirmed ? <div className="mt-2"><DatePicker label="Ngày giao dịch" value={transaction.expense_date} onChange={onDateChange} className="h-9" /></div> : <p className="mt-2 text-xs text-slate-400">{formatShortDate(transaction.expense_date)}</p>}
      <p className="mt-1 text-[11px] font-medium text-[#00a970]">{transaction.category_source === 'budget_jar' ? 'Khớp theo hũ chi tiêu' : 'Khớp theo danh mục thu nhập'}</p>
      {!transaction.confirmed ? <Button onClick={onConfirm} disabled={isLoading} className="mt-3 h-9 w-full rounded-lg bg-[#00bc7c] text-xs hover:bg-[#00a970]">Xác nhận và lưu</Button> : null}
    </div>
  );
}

function ThinkingBubble() {
  return <div className="flex items-center gap-2 self-start rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-3 text-xs text-slate-400"><Sparkles className="size-4 text-[#00bc7c]" /> Đang đọc giao dịch…</div>;
}
