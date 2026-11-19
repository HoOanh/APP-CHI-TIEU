'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSWRConfig } from 'swr';
import { notifyTransactionsChanged } from '@/lib/transaction-events';
import {
  ArrowLeft,
  Check,
  ImagePlus,
  Landmark,
  LoaderCircle,
  Mic,
  PenLine,
  Square,
  ReceiptText,
  SendHorizontal,
  Sparkles,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn, formatCurrency, formatShortDate } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';
import { useVoiceCapture } from '@/hooks/useVoiceCapture';
import { ManualTransactionDialog } from '@/components/ManualTransactionDialog';
import { QuickEntryAccess } from '@/components/QuickEntryAccess';
import {
  listOfflineQueue,
  onOfflineQueueChange,
  queueOfflineAiNote,
  removeOfflineQueueEntry,
  type OfflineQueueEntry,
  type QueuedAiNote,
} from '@/lib/offline-queue';

interface QaMetric {
  label: string;
  value: string;
  tone?: 'income' | 'expense' | 'neutral';
}

interface DebtReceiptData {
  debt_id: number;
  debt_name: string;
  creditor: string;
  direction: 'payable' | 'receivable';
  amount: number;
  paid_amount: number;
  remaining: number;
  status: 'active' | 'completed';
  account_name: string | null;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
  fastPath?: boolean;
  transactions?: SavedTransaction[];
  budgetAlerts?: { title: string; message: string; severity: 'warning' | 'danger' }[];
  qaMetrics?: QaMetric[];
  receiptData?: DebtReceiptData;
  failedSubmission?: ChatSubmission;
  canEditSubmission?: boolean;
}

interface ChatAccountOption {
  id: number;
  name: string;
  is_default: boolean;
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

interface ChatSubmission {
  id: string;
  text: string;
  files: File[];
  previews: string[];
  offlineNoteId?: string;
}

interface SavedTransaction {
  id: string | number;
  amount: number;
  description: string;
  category_name: string | null;
  category_id: number | string | null;
  account_name?: string | null;
  to_account_name?: string | null;
  note: string | null;
  expense_date: string;
  type: 'income' | 'expense' | 'transfer';
}

interface ChatResponse {
  saved?: boolean;
  intent?: 'expense' | 'income' | 'transfer' | 'debt' | 'question';
  fast_path?: boolean;
  message?: string;
  answer?: string;
  qaMetrics?: QaMetric[];
  receiptData?: DebtReceiptData;
  transactions?: SavedTransaction[];
  budgetAlerts?: { title: string; message: string; severity: 'warning' | 'danger' }[];
  error?: string;
}

const quickPrompts = ['Ăn trưa 50k', 'Nhận lương 15tr', 'Tháng này ăn uống hết bao nhiêu?'];
const debtQuickPrompts = ['Trả nợ tiền nhà 2tr', 'Thu nợ 500k'];

export function TransactionChat({
  embedded = false,
  initialMode = 'auto',
  onBusyChange,
}: {
  embedded?: boolean;
  initialMode?: 'auto' | 'debt';
  onBusyChange?: (busy: boolean) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'auto' | 'debt'>(initialMode);
  const [accounts, setAccounts] = useState<ChatAccountOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<QuickSuggestion[]>([]);
  const [offlineEntries, setOfflineEntries] = useState<OfflineQueueEntry[]>([]);
  const [activeOfflineNoteId, setActiveOfflineNoteId] = useState<string | null>(null);
  const inFlight = useRef(false);
  const { mutate } = useSWRConfig();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();
  const hasDraft = Boolean(input.trim() || imageFiles.length);

  useEffect(() => {
    if (embedded) composerRef.current?.focus();
  }, [embedded]);

  useEffect(() => {
    onBusyChange?.(isLoading);
  }, [isLoading, onBusyChange]);

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
      .then((items) => setSuggestions(items.filter((item) => {
        const letters = item.label.toLocaleLowerCase('vi').match(/\p{L}/gu) ?? [];
        return new Set(letters).size >= 2;
      })))
      .catch(() => setSuggestions([]));
    fetch('/api/accounts')
      .then(async (response) => response.ok ? await response.json() as ChatAccountOption[] : [])
      .then((items) => {
        setAccounts(items);
        const def = items.find((acc) => acc.is_default) ?? items[0];
        if (def) setSelectedAccountId(String(def.id));
      })
      .catch(() => setAccounts([]));
    return () => {
      removeListener();
      window.removeEventListener('online', handleFocus);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const appendFiles = (files: File[]) => {
    const accepted = files.slice(0, Math.max(0, 6 - imageFiles.length));
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

  const refreshData = () => {
    notifyTransactionsChanged();
    void mutate((key) => typeof key === 'string' && key.startsWith('/api/dashboard?'), undefined);
  };

  const submit = async (submission: ChatSubmission) => {
    if (inFlight.current) return;
    const { id, text, files, previews, offlineNoteId } = submission;
    inFlight.current = true;
    setIsLoading(true);
    setMessages((current) => [
      ...current.filter((message) => message.id !== id && message.failedSubmission?.id !== id),
      { id, role: 'user', content: text, images: previews },
    ]);
    let canEditSubmission = false;

    try {
      const formData = new FormData();
      formData.append('type', mode === 'debt' ? 'debt' : 'expense');
      formData.append('mode', mode);
      formData.append('client_request_id', id);
      if (selectedAccountId) formData.append('account_id', selectedAccountId);
      if (text) formData.append('message', text);
      files.forEach((file) => formData.append('images', file));

      const response = await fetch('/api/chat', { method: 'POST', body: formData });
      canEditSubmission = [400, 413, 422].includes(response.status);
      const data: ChatResponse = await response.json().catch(() => ({}));
      if (!response.ok) {
        const fallback = canEditSubmission ? 'Kiểm tra lại nội dung hoặc dung lượng ảnh.' : 'Chưa nhận được kết quả lưu. Hãy thử lại từ tin nhắn này.';
        throw new Error(data.error || fallback);
      }

      if (data.intent === 'question' && data.answer) {
        setMessages((current) => [...current, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.answer || '',
          qaMetrics: data.qaMetrics,
        }]);
        return;
      }

      if (data.intent === 'debt' && data.receiptData) {
        setMessages((current) => [...current, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.message || 'Đã ghi nhận thanh toán công nợ.',
          receiptData: data.receiptData,
        }]);
        refreshData();
        return;
      }

      if (!data.saved || !data.transactions) {
        const fallback = canEditSubmission ? 'Kiểm tra lại nội dung hoặc dung lượng ảnh.' : 'Chưa nhận được kết quả lưu. Hãy thử lại từ tin nhắn này.';
        throw new Error(data.error || fallback);
      }

      const { transactions } = data;
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: 'assistant',
        fastPath: Boolean(data.fast_path),
        content: transactions.length
          ? `Đã lưu ${transactions.length} giao dịch.`
          : 'Tin nhắn này đã được xử lý.',
        transactions,
        budgetAlerts: data.budgetAlerts,
      }]);
      refreshData();
      for (const alert of data.budgetAlerts ?? []) {
        showToast(
          alert.title,
          alert.severity === 'danger' ? 'error' : 'warning',
          alert.message,
          { strobe: alert.severity === 'danger' },
        );
      }
      if (offlineNoteId) {
        await removeOfflineQueueEntry(offlineNoteId).catch((error: unknown) => console.error(error));
      }
    } catch (error) {
      const content = error instanceof Error ? error.message : 'Chưa nhận được kết quả lưu. Hãy thử lại từ tin nhắn này.';
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content,
        failedSubmission: submission,
        canEditSubmission,
      }]);
    } finally {
      inFlight.current = false;
      setIsLoading(false);
    }
  };

  const handleSend = async (voiceText?: string) => {
    if (inFlight.current || (!voiceText && !hasDraft)) return;
    const text = voiceText ?? input.trim();
    const files = voiceText ? [] : imageFiles;
    const offlineNoteId = voiceText ? undefined : activeOfflineNoteId ?? undefined;
    if (!navigator.onLine) {
      if (offlineNoteId) {
        showToast('Kết nối mạng để gửi ghi chú đã chỉnh sửa.', 'warning');
        return;
      }
      if (files.length) {
        showToast('Ảnh cần mạng để phân tích. Ghi chú chữ vẫn lưu được offline.', 'warning');
        return;
      }
      inFlight.current = true;
      setIsLoading(true);
      try {
        await queueOfflineAiNote(text);
        if (!voiceText) setInput((current) => current.trim() === text ? '' : current);
        showToast('Đã lưu ghi chú trên thiết bị', 'success', 'Mở Chat và gửi ghi chú khi có mạng.');
      } catch {
        showToast('Không thể lưu ghi chú offline trên thiết bị này.', 'error');
      } finally {
        inFlight.current = false;
        setIsLoading(false);
      }
      return;
    }

    const submission = {
      id: offlineNoteId ?? crypto.randomUUID(),
      text,
      files,
      previews: voiceText ? [] : imagePreviews,
      offlineNoteId,
    };
    if (!voiceText) {
      setInput('');
      setImageFiles([]);
      setImagePreviews([]);
      setActiveOfflineNoteId(null);
    }
    await submit(submission);
  };

  const {
    listening,
    transcribing,
    speechActive,
    finalTranscript,
    interimTranscript,
    liveTranscript,
    voiceStatus,
    showMobilePermissionHint,
    stopAndSubmitVoice,
    stopAndEditVoice,
    cancelVoice,
    toggleVoice,
  } = useVoiceCapture(
    (text) => void handleSend(text),
    () => composerRef.current?.focus(),
    (captured) => {
      if (captured) {
        setInput((current) => current.trim() ? `${current.trim()} ${captured}` : captured);
      }
      composerRef.current?.focus();
    },
  );

  const handleRetry = (message: Message) => {
    if (!message.failedSubmission || inFlight.current) return;
    if (!navigator.onLine) {
      showToast('Kết nối mạng để thử lại.', 'warning');
      return;
    }
    void submit(message.failedSubmission);
  };

  const handleEditSubmission = (message: Message) => {
    const submission = message.failedSubmission;
    if (!submission || hasDraft || inFlight.current) return;
    setInput(submission.text);
    setImageFiles(submission.files);
    // The original message keeps its preview URLs.
    setImagePreviews(submission.files.map((file) => URL.createObjectURL(file)));
    setActiveOfflineNoteId(submission.offlineNoteId ?? null);
    setMessages((current) => current.filter((item) => item.id !== message.id));
  };

  const updateSavedTransaction = (messageId: string, transaction: SavedTransaction) => {
    setMessages((current) => current.map((message) => message.id === messageId ? {
      ...message,
      transactions: message.transactions?.map((item) => String(item.id) === String(transaction.id) ? transaction : item),
    } : message));
    refreshData();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (!listening) void handleSend();
    }
  };

  return (
    <div className={cn("flex w-full flex-col overflow-hidden bg-[#f7f9fb]", embedded ? (messages.length || listening ? "h-[min(560px,calc(100dvh-2rem))]" : "max-h-[calc(100dvh-2rem)]") : "h-dvh")}>
      <header className={cn("flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 md:px-6", embedded && "pr-12 md:pr-12")}>
        <div className="flex min-w-0 items-center">
        {!embedded && <Link href="/" aria-label="Quay lại" className="mr-3 flex size-9 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100">
          <ArrowLeft className="size-5" />
        </Link>}
        <div>
          <h1 className="text-[15px] font-semibold tracking-[-0.02em] text-slate-800">
            {mode === 'debt' ? 'Trả & Thu nợ AI' : 'Ghi & Hỏi đáp AI'}
          </h1>
          <p className="mt-0.5 hidden text-xs text-slate-500 sm:block">Ghi thu chi, trả nợ, chuyển ví hoặc hỏi số liệu trực tiếp</p>
        </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMode('auto')}
              className={cn(
                'rounded-lg px-2.5 py-1 font-medium transition',
                mode === 'auto' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-700',
              )}
            >
              Tự động
            </button>
            <button
              type="button"
              onClick={() => setMode('debt')}
              className={cn(
                'flex items-center gap-1 rounded-lg px-2.5 py-1 font-medium transition',
                mode === 'debt' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-500 hover:text-slate-700',
              )}
            >
              <Landmark className="size-3" /> Công nợ
            </button>
          </div>
          {accounts.length > 1 ? (
            <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
              <SelectTrigger aria-label="Chọn ví khi chat" className="hidden h-8 w-36 rounded-xl bg-white text-xs sm:flex">
                <Wallet className="mr-1 size-3.5 text-slate-500" />
                <SelectValue placeholder="Ví" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={String(acc.id)}>{acc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <QuickEntryAccess onChatPage={!embedded} />
          <ManualTransactionDialog compact iconOnMobile onSaved={refreshData} />
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        <OfflineNotesPanel
          entries={offlineEntries}
          activeId={activeOfflineNoteId}
          isLoading={isLoading || listening}
          isOnline={typeof navigator !== 'undefined' && navigator.onLine}
          onUse={(entry) => void submit({
            id: entry.id, text: entry.message, files: [], previews: [], offlineNoteId: entry.id,
          })}
          onDelete={async (entry) => { await removeOfflineQueueEntry(entry.id); setOfflineEntries(await listOfflineQueue()); }}
        />
        {messages.length === 0 ? (
          <EmptyState
            compact={embedded}
            debtMode={mode === 'debt'}
            suggestions={suggestions}
            onPrompt={(value) => { setInput(value); composerRef.current?.focus(); }}
            onImage={() => fileInputRef.current?.click()}
          />
        ) : (
          <div className="mx-auto max-w-2xl space-y-4">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onRetry={!isLoading && !listening && message.failedSubmission ? () => handleRetry(message) : undefined}
                onEditSubmission={!isLoading && !listening && !hasDraft && message.canEditSubmission ? () => handleEditSubmission(message) : undefined}
                onSaved={(transaction) => updateSavedTransaction(message.id, transaction)}
              />
            ))}
            {isLoading ? <ThinkingBubble /> : null}
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      {listening ? (
        <VoiceListeningOverlay
          transcribing={transcribing}
          speechActive={speechActive}
          finalTranscript={finalTranscript}
          interimTranscript={interimTranscript}
          liveTranscript={liveTranscript}
          showMobilePermissionHint={showMobilePermissionHint}
          onStopAndSubmit={stopAndSubmitVoice}
          onEdit={stopAndEditVoice}
          onCancel={cancelVoice}
        />
      ) : null}
      </div>

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
        {voiceStatus && !listening ? (
          <p role="status" className="mx-auto mb-2 max-w-3xl rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs leading-relaxed text-amber-900">
            {voiceStatus}
          </p>
        ) : null}
        <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
          <Button type="button" variant="outline" size="icon" className="size-11 shrink-0 rounded-2xl border-slate-200 text-slate-500" onClick={() => fileInputRef.current?.click()}>
            <ImagePlus className="size-5" />
            <span className="sr-only">Thêm ảnh</span>
          </Button>
          <div className="flex min-h-11 flex-1 items-center rounded-2xl border border-slate-200 bg-[#f8fafb] px-3 focus-within:border-[#00bc7c] focus-within:ring-2 focus-within:ring-[#00bc7c]/10">
            <textarea ref={composerRef} aria-label="Nội dung giao dịch" value={input} onChange={(event) => setInput(event.target.value)} onPaste={handlePaste} onKeyDown={handleKeyDown} rows={1} placeholder="Ví dụ: ăn trưa 50k" className="max-h-28 min-h-6 w-full resize-none bg-transparent py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400" />
          </div>
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label={listening ? 'Dừng ghi giọng nói' : 'Ghi bằng giọng nói'}
            aria-pressed={listening}
            title={listening ? 'Dừng ghi giọng nói' : 'Ghi bằng giọng nói'}
            disabled={isLoading}
            onClick={toggleVoice}
            className={cn("size-11 shrink-0 rounded-2xl border-emerald-200 bg-emerald-50 text-emerald-800", listening && "border-rose-200 bg-rose-50 text-rose-700")}
          >
            {listening ? <Square className="size-4 fill-current" aria-hidden /> : <Mic className="size-5" aria-hidden />}
          </Button>
          <Button type="button" size="icon" disabled={!hasDraft || isLoading || listening} onClick={() => void handleSend()} className="size-11 shrink-0 rounded-2xl bg-[#00bc7c] shadow-[0_10px_20px_-12px_rgba(0,188,124,0.9)] hover:bg-[#00a970] disabled:bg-slate-100 disabled:text-slate-300 disabled:shadow-none">
            <SendHorizontal className="size-5" />
            <span className="sr-only">Gửi giao dịch</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ compact, debtMode, suggestions, onPrompt, onImage }: { compact: boolean; debtMode: boolean; suggestions: QuickSuggestion[]; onPrompt: (value: string) => void; onImage: () => void }) {
  const defaultPrompts = debtMode ? debtQuickPrompts : quickPrompts;
  return (
    <section className={cn("mx-auto flex flex-col", compact
      ? "max-w-xl"
      : "min-h-full max-w-md justify-center pb-12 text-center md:justify-start md:pb-0 md:pt-12")}>
      {compact ? <p className="text-sm text-slate-600">Nhập và nhấn Enter, hoặc bấm mic rồi nói. Có thể sửa ngay sau khi lưu.</p> : <>
      <span className="mx-auto flex size-14 items-center justify-center rounded-3xl bg-emerald-50 text-[#00bc7c]">
        {debtMode ? <Landmark className="size-7" strokeWidth={1.8} /> : <ReceiptText className="size-7" strokeWidth={1.8} />}
      </span>
      <h2 className="mt-5 text-lg font-semibold tracking-[-0.03em] text-slate-800">
        {debtMode ? 'Ghi nhận trả nợ & thu nợ' : 'Ghi giao dịch & Hỏi đáp'}
      </h2>
      <p className="mx-auto mt-2 max-w-[300px] text-sm leading-6 text-slate-500">
        {debtMode
          ? 'Nhập số tiền trả/thu nợ hoặc gửi ảnh chuyển khoản, mình sẽ cập nhật công nợ và số dư ví tự động.'
          : 'Nhập chữ, bấm mic, gửi ảnh hoặc hỏi tổng chi/số dư. Giao dịch quen thuộc sẽ lưu tức thì.'}
      </p>
      </>}
      <div className={cn("flex flex-wrap gap-2", compact ? "mt-3" : "mt-5 justify-center")}>
        {(!debtMode && suggestions.length ? suggestions.map((suggestion) => ({
          id: `${suggestion.label}-${suggestion.amount}-${suggestion.categoryName}`,
          label: `${suggestion.label} · ${suggestion.amountText}đ`,
          prompt: suggestion.prompt,
        })) : defaultPrompts.map((prompt) => ({ id: prompt, label: prompt, prompt }))).map((suggestion) => (
          <button key={suggestion.id} type="button" onClick={() => onPrompt(suggestion.prompt)} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-[#00bc7c]/40 hover:text-[#00a970]">{suggestion.label}</button>
        ))}
      </div>
      {!compact && <button type="button" onClick={onImage} className="mx-auto mt-5 flex items-center gap-2 text-sm font-semibold text-[#00a970]">
        <ImagePlus className="size-4" /> Gửi ảnh giao dịch
      </button>}
    </section>
  );
}

function OfflineNotesPanel({ entries, activeId, isLoading, isOnline, onUse, onDelete }: {
  entries: OfflineQueueEntry[];
  activeId: string | null;
  isLoading: boolean;
  isOnline: boolean;
  onUse: (entry: QueuedAiNote) => void;
  onDelete: (entry: OfflineQueueEntry) => void | Promise<void>;
}) {
  if (!entries.length) return null;
  return (
    <section className="mx-auto mb-4 max-w-2xl rounded-2xl border border-amber-200 bg-amber-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-amber-900">Bản ghi chờ gửi ({entries.length})</p>
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
                <Button type="button" size="sm" disabled={!isOnline || isLoading || activeId === entry.id} onClick={() => onUse(entry)} className="h-8 rounded-lg bg-[#00bc7c] px-2.5 text-[11px]">
                  {activeId === entry.id ? 'Đã đưa vào ô nhập' : 'Gửi và lưu'}
                </Button>
              ) : (
                <span className="shrink-0 text-[10px] font-medium text-amber-700">Chờ đồng bộ</span>
              )}
              <button type="button" aria-label="Xóa bản ghi offline" disabled={isLoading || activeId === entry.id} onClick={() => void onDelete(entry)} className="px-1 text-xs text-slate-400">Xóa</button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MessageBubble({ message, onRetry, onEditSubmission, onSaved }: {
  message: Message;
  onRetry?: () => void;
  onEditSubmission?: () => void;
  onSaved: (transaction: SavedTransaction) => void;
}) {
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex flex-col', isUser ? 'items-end' : 'items-start')}>
      <div className={cn('max-w-[90%] rounded-2xl px-3.5 py-3 text-sm leading-5 shadow-sm', isUser ? 'rounded-br-md bg-[#00bc7c] text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-700')}>
        {message.images?.length ? <div className="mb-2 grid grid-cols-2 gap-1.5">{message.images.map((image, index) => <Image key={image} src={image} alt={`Ảnh giao dịch ${index + 1}`} width={240} height={160} unoptimized className="h-28 w-full rounded-xl object-cover" />)}</div> : null}
        {!isUser && message.fastPath ? (
          <div className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-200">
            <Zap className="size-3 text-amber-500" /> Fast-Path 0ms
          </div>
        ) : null}
        {message.content ? <p className="whitespace-pre-wrap">{message.content}</p> : null}
        {message.qaMetrics?.length ? (
          <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
            {message.qaMetrics.map((metric) => (
              <div key={metric.label} className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
                <p className="text-[11px] text-slate-500">{metric.label}</p>
                <p className={cn(
                  'mt-0.5 text-sm font-semibold tabular-nums',
                  metric.tone === 'income' ? 'text-[#00a970]' : metric.tone === 'expense' ? 'text-[#f15b64]' : 'text-slate-800',
                )}>
                  {metric.value}
                </p>
              </div>
            ))}
          </div>
        ) : null}
        {message.receiptData ? (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-slate-700">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                <Landmark className="size-3.5" />
                {message.receiptData.direction === 'receivable' ? 'Biên lai thu nợ' : 'Biên lai trả nợ'}
              </span>
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200">
                {message.receiptData.status === 'completed' ? 'Đã tất toán' : 'Đang theo dõi'}
              </span>
            </div>
            <p className="mt-1.5 text-sm font-semibold text-slate-900">{message.receiptData.debt_name}</p>
            <p className="mt-1 text-base font-bold tabular-nums text-[#00a970]">
              {message.receiptData.direction === 'receivable' ? '+' : '−'}{formatCurrency(message.receiptData.amount)}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Còn lại: <strong>{formatCurrency(message.receiptData.remaining)}</strong>
              {message.receiptData.account_name ? ` · Ví: ${message.receiptData.account_name}` : ''}
            </p>
          </div>
        ) : null}
        {message.transactions?.map((transaction) => <TransactionCard key={transaction.id} transaction={transaction} onSaved={onSaved} />)}
        {message.budgetAlerts?.length ? (
          <div className="mt-3 space-y-2">
            {message.budgetAlerts.map((alert, idx) => (
              <div
                key={idx}
                role="alert"
                className={cn(
                  'rounded-xl p-3 text-xs leading-5',
                  alert.severity === 'danger'
                    ? 'overspend-card-pulse border-2 border-rose-400 bg-rose-600 font-medium text-white shadow-md'
                    : 'border border-amber-300 bg-amber-50 text-amber-900',
                )}
              >
                <p className="font-bold">{alert.title}</p>
                <p className={cn('mt-0.5', alert.severity === 'danger' ? 'text-rose-50' : 'text-amber-800')}>
                  {alert.message}
                </p>
              </div>
            ))}
          </div>
        ) : null}
        {onRetry || onEditSubmission ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {onRetry ? <Button type="button" size="sm" variant="outline" onClick={onRetry}>Thử lại</Button> : null}
            {onEditSubmission ? <Button type="button" size="sm" variant="outline" onClick={onEditSubmission}>Sửa nội dung gửi</Button> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TransactionCard({ transaction, onSaved }: {
  transaction: SavedTransaction;
  onSaved: (transaction: SavedTransaction) => void;
}) {
  const { showToast } = useToast();
  const [ruleSaved, setRuleSaved] = useState(false);
  const [savingRule, setSavingRule] = useState(false);
  const isIncome = transaction.type === 'income';
  const isTransfer = transaction.type === 'transfer';
  const editableTransaction = useMemo(() => ({
    ...transaction,
    id: String(transaction.id),
    date: transaction.expense_date,
  }), [transaction]);

  const handleSaveRule = async () => {
    if (!transaction.category_id || !transaction.description || isTransfer || savingRule || ruleSaved) return;
    setSavingRule(true);
    try {
      const response = await fetch('/api/merchant-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: transaction.description,
          category_id: Number(transaction.category_id),
          type: transaction.type === 'income' ? 'income' : 'expense',
        }),
      });
      if (!response.ok) throw new Error('Không lưu được quy tắc');
      setRuleSaved(true);
      showToast(`Đã ghi nhớ "${transaction.description}" → ${transaction.category_name}`, 'success');
    } catch {
      showToast('Không thể lưu quy tắc Fast-Path', 'error');
    } finally {
      setSavingRule(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-[#fbfcfc] p-3 text-slate-700">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn('text-lg font-semibold tabular-nums', isTransfer ? 'text-sky-700' : isIncome ? 'text-[#00a970]' : 'text-[#f15b64]')}>
            {isTransfer ? '' : isIncome ? '+' : '−'}{formatCurrency(transaction.amount)}
          </p>
          <p className="mt-1 break-words text-sm font-medium">{transaction.description}</p>
        </div>
        <ManualTransactionDialog transaction={editableTransaction} onSaved={(saved) => {
          if (saved) onSaved(saved);
        }} />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          {isTransfer
            ? `${transaction.account_name || 'Ví nguồn'} → ${transaction.to_account_name || 'Ví đích'}`
            : `${transaction.category_name || 'Khác'}${transaction.account_name ? ` (${transaction.account_name})` : ''}`}
          {' · '}
          {formatShortDate(transaction.expense_date)}
        </span>
        {!isTransfer && transaction.category_id ? (
          <button
            type="button"
            disabled={savingRule || ruleSaved}
            onClick={() => void handleSaveRule()}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 transition hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-70"
          >
            {ruleSaved ? <Check className="size-3 text-emerald-600" /> : <Zap className="size-3 text-amber-500" />}
            {ruleSaved ? 'Đã học quy tắc' : 'Luôn phân loại thế này'}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return <div className="flex items-center gap-2 self-start rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-3 text-xs text-slate-400"><Sparkles className="size-4 text-[#00bc7c]" /> Đang nhận diện và lưu giao dịch…</div>;
}

const WAVE_BARS = [
  { delay: '0ms', height: '18px', activeHeight: '30px' },
  { delay: '140ms', height: '26px', activeHeight: '42px' },
  { delay: '280ms', height: '20px', activeHeight: '34px' },
  { delay: '90ms', height: '32px', activeHeight: '48px' },
  { delay: '220ms', height: '22px', activeHeight: '38px' },
  { delay: '340ms', height: '28px', activeHeight: '44px' },
  { delay: '170ms', height: '18px', activeHeight: '30px' },
];

function VoiceListeningOverlay({
  transcribing,
  speechActive,
  finalTranscript,
  interimTranscript,
  liveTranscript,
  showMobilePermissionHint,
  onStopAndSubmit,
  onEdit,
  onCancel,
}: {
  transcribing: boolean;
  speechActive: boolean;
  finalTranscript: string;
  interimTranscript: string;
  liveTranscript: string;
  showMobilePermissionHint: boolean;
  onStopAndSubmit: () => void;
  onEdit: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Đang nghe giọng nói"
      className="absolute inset-0 z-20 flex flex-col items-center overflow-y-auto bg-[#f7f9fb]/95 px-5 py-6 text-center backdrop-blur-md"
    >
      <div className="my-auto flex w-full max-w-md flex-col items-center">
      <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
        <span className="size-2 rounded-full bg-[#00bc7c] animate-pulse" />
        {transcribing ? 'Đang xử lý giọng nói…' : 'Đang lắng nghe · Nói xong bấm tắt để gửi'}
      </div>

      <div className="relative flex size-32 items-center justify-center">
        <span
          aria-hidden
          className={cn(
            'voice-ripple-ring absolute inset-3 rounded-full border-2 border-[#00bc7c]/35 bg-[#00bc7c]/10',
            speechActive && 'border-[#00bc7c]/55 bg-[#00bc7c]/15',
          )}
        />
        <span
          aria-hidden
          style={{ animationDelay: '0.65s' }}
          className={cn(
            'voice-ripple-ring absolute inset-3 rounded-full border-2 border-[#00bc7c]/30 bg-[#00bc7c]/5',
            speechActive && 'border-[#00bc7c]/45',
          )}
        />
        <button
          type="button"
          disabled={transcribing}
          onClick={onStopAndSubmit}
          aria-label="Tắt mic và gửi giao dịch"
          className={cn(
            'relative z-10 flex size-20 items-center justify-center rounded-full bg-[#00bc7c] text-white shadow-[0_16px_36px_-10px_rgba(0,188,124,0.8)] transition-transform active:scale-95 disabled:opacity-75',
            speechActive && 'scale-105 bg-[#00a970]',
          )}
        >
          {transcribing ? <LoaderCircle className="size-8 animate-spin" aria-hidden /> : <Mic className="size-8" aria-hidden />}
        </button>
      </div>

      <div aria-hidden className="mt-4 flex h-12 items-center justify-center gap-1.5">
        {WAVE_BARS.map((bar, index) => (
          <span
            key={index}
            className="voice-wave-bar w-1.5 rounded-full bg-gradient-to-t from-[#00a970] to-[#34d399] transition-[height] duration-200"
            style={{
              height: speechActive ? bar.activeHeight : bar.height,
              animationDelay: bar.delay,
              animationDuration: speechActive ? '0.65s' : '1.25s',
            }}
          />
        ))}
      </div>

      <div className="mt-5 w-full max-w-md rounded-2xl border border-slate-200/90 bg-white px-4 py-4 shadow-sm">
        {liveTranscript ? (
          <p aria-live="polite" className="max-h-32 overflow-y-auto break-words text-base font-medium leading-relaxed text-slate-800 sm:text-lg">
            <span>{finalTranscript}</span>
            {finalTranscript && interimTranscript ? ' ' : null}
            {interimTranscript ? <span className="text-emerald-700/80">{interimTranscript}</span> : null}
            <span aria-hidden className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 bg-[#00bc7c] animate-pulse" />
          </p>
        ) : (
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-600">Hãy nói tên khoản chi/thu và số tiền…</p>
            <p className="text-xs text-slate-400">Ví dụ: “Ăn trưa 50k” hoặc “Đổ xăng 100 nghìn”</p>
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
        <Button type="button" variant="outline" onClick={onCancel} className="h-11 rounded-xl border-slate-200 bg-white px-4 text-slate-600">
          <X className="size-4" /> Hủy
        </Button>
        <Button type="button" variant="outline" disabled={transcribing} onClick={onEdit} className="h-11 rounded-xl border-slate-200 bg-white px-4 text-slate-700">
          <PenLine className="size-4" /> Sửa chữ
        </Button>
        <Button
          type="button"
          disabled={transcribing}
          onClick={onStopAndSubmit}
          className="h-11 rounded-xl bg-[#00bc7c] px-5 font-semibold text-white shadow-[0_12px_24px_-12px_rgba(0,188,124,0.85)] hover:bg-[#00a970]"
        >
          {transcribing ? <LoaderCircle className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}
          {transcribing ? 'Đang gửi…' : 'Tắt mic & gửi'}
        </Button>
      </div>

      {showMobilePermissionHint ? (
        <p className="mt-4 max-w-sm text-[11px] leading-4 text-slate-500">
          Mẹo: Trên điện thoại, chọn <strong>Luôn cho phép</strong> (hoặc Safari: <strong>aA → Cài đặt trang web → Micrô → Cho phép</strong>) để không bị hỏi lại lần sau.
        </p>
      ) : null}
      </div>
    </div>
  );
}
