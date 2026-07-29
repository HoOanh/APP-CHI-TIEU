'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, ImageIcon, Send, X, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatShortDate } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  image?: string;
  expenseData?: {
    id?: string;
    amount: number;
    description: string;
    category_name: string;
    category_icon?: string;
    category_id: number | string;
    note?: string;
    merchant?: string;
    expense_date: string;
    type?: 'income' | 'expense';
    confirmed?: boolean;
  };
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Chào bạn! Mình là AI Ghi nhận chi tiêu. Hãy gõ chi tiết khoản chi hoặc dán ảnh hóa đơn, biên lai để mình giúp bạn ghi nhận nhé.',
    }
  ]);
  const [input, setInput] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const url = URL.createObjectURL(file);
      setImagePreview(url);
    }
    // reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          setImageFile(file);
          setImagePreview(URL.createObjectURL(file));
          e.preventDefault();
        }
      }
    }
  };

  const removeImage = () => {
    setImageFile(null);
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    setImagePreview(null);
  };

  const handleSend = async () => {
    if (!input.trim() && !imageFile) return;

    const currentInput = input.trim();
    const currentImageFile = imageFile;
    const currentImagePreview = imagePreview;

    const userMsgId = Date.now().toString();
    const newUserMsg: Message = {
      id: userMsgId,
      role: 'user',
      content: currentInput,
      image: currentImagePreview || undefined,
    };

    setMessages((prev) => [...prev, newUserMsg]);
    setInput('');
    removeImage();
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('type', 'expense');
      if (currentInput) formData.append('message', currentInput);
      if (currentImageFile) formData.append('image', currentImageFile);

      const res = await fetch('/api/chat', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Failed to process message');
      }

      const data = await res.json();
      
      const assistantMsg: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'Mình đã đọc được giao dịch này. Bạn kiểm tra lại rồi xác nhận nhé.',
        expenseData: data,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (error) {
      console.error(error);
      showToast('Không thể xử lý yêu cầu, vui lòng thử lại.', 'error');
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: 'Xin lỗi, có lỗi xảy ra khi xử lý thông tin. Bạn có thể thử lại không?',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const confirmExpense = async (messageId: string) => {
    const message = messages.find((item) => item.id === messageId);
    if (!message?.expenseData || message.expenseData.confirmed) return;

    setIsLoading(true);
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message.expenseData),
      });
      if (!res.ok) throw new Error('Failed to save transaction');

      const saved = await res.json();
      setMessages((current) =>
        current.map((item) =>
          item.id === messageId
            ? {
                ...item,
                content: saved.type === 'income'
                  ? 'Đã ghi nhận khoản thu nhập!'
                  : 'Đã ghi nhận chi tiêu thành công!',
                expenseData: { ...saved, confirmed: true },
              }
            : item,
        ),
      );
      showToast('Đã lưu giao dịch');
    } catch (error) {
      console.error(error);
      showToast('Không thể lưu giao dịch, vui lòng thử lại.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-[calc(100dvh-4rem)] max-w-4xl flex-col overflow-hidden bg-background md:h-[calc(100dvh-4rem)] md:px-6">
      {/* Header */}
      <header className="z-10 flex flex-none items-center justify-between border-b border-border bg-white/90 px-4 py-3 backdrop-blur-xl md:rounded-t-2xl">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" className="rounded-full h-8 w-8">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold">Ghi nhận chi tiêu</h1>
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-[#00BC7C]/20 text-[#00BC7C] hover:bg-[#00BC7C]/30">AI</Badge>
            </div>
            <span className="text-xs text-muted-foreground">Trợ lý ảo thông minh</span>
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-5 md:bg-muted/20 md:px-8">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col chat-bubble-animate ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`px-4 py-3 max-w-[85%] ${
                msg.role === 'user'
                  ? 'bg-[#00BC7C] text-white rounded-2xl rounded-br-sm ml-auto max-w-[80%]'
                  : 'bg-white border border-gray-100 shadow-sm rounded-2xl rounded-bl-sm mr-auto'
              }`}
            >
              {msg.image && (
                <div className="mb-2">
                  <Image
                    src={msg.image}
                    alt="Ảnh người dùng tải lên"
                    width={480}
                    height={320}
                    unoptimized
                    className="max-h-48 max-w-full rounded-xl bg-black/10 object-contain"
                  />
                </div>
              )}
              {msg.content && <div className="text-sm whitespace-pre-wrap">{msg.content}</div>}
              
              {/* Receipt Card */}
              {msg.expenseData && (
                <div className="mt-3 bg-background border border-border rounded-xl p-3 flex flex-col gap-2">
                  <div className="flex justify-between items-start">
                    <span className={`font-bold tabular-nums text-lg ${msg.expenseData.type === 'income' ? 'text-[#00BC7C]' : 'text-[#FE5A61]'}`}>
                      {msg.expenseData.type === 'income' ? '+' : '-'}{formatCurrency(msg.expenseData.amount)}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-xs flex items-center gap-1 ${
                        msg.expenseData.type === 'income'
                          ? 'bg-[#00BC7C]/10 text-[#00BC7C] border-[#00BC7C]/20'
                          : 'bg-[#FE5A61]/10 text-[#FE5A61] border-[#FE5A61]/20'
                      }`}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      {msg.expenseData.confirmed
                        ? msg.expenseData.type === 'income'
                          ? 'Thu nhập đã ghi nhận'
                          : 'Chi tiêu đã ghi nhận'
                        : 'Chờ xác nhận'}
                    </Badge>
                  </div>
                  <div className="text-sm font-medium">{msg.expenseData.description}</div>
                  
                  <div className="flex items-center gap-2 mt-1">
                    {msg.expenseData.category_name && (
                      <Badge variant="secondary" className="text-xs font-normal">
                        {msg.expenseData.category_icon} {msg.expenseData.category_name}
                      </Badge>
                    )}
                    {msg.expenseData.expense_date && (
                      <span className="text-xs text-muted-foreground flex items-center">
                        {formatShortDate(msg.expenseData.expense_date)}
                      </span>
                    )}
                  </div>
                  {msg.expenseData.merchant && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Tại: {msg.expenseData.merchant}
                    </div>
                  )}
                  {!msg.expenseData.confirmed && (
                    <Button
                      className="mt-2 w-full rounded-xl bg-[#00BC7C] hover:bg-[#00A86F]"
                      disabled={isLoading}
                      onClick={() => confirmExpense(msg.id)}
                    >
                      Xác nhận và lưu
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex flex-col items-start chat-bubble-animate">
            <div className="px-4 py-3 bg-white border border-gray-100 shadow-sm rounded-2xl rounded-bl-sm mr-auto min-w-[60px] flex items-center justify-center gap-1 h-[44px]">
              <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse [animation-delay:-0.3s]"></div>
              <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse [animation-delay:-0.15s]"></div>
              <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse"></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Input Area */}
      <div className="z-10 flex flex-none flex-col gap-2 border-t border-gray-200 bg-white p-3 pb-6 md:rounded-b-2xl md:pb-3">
        {imagePreview && (
          <div className="relative inline-block w-fit mb-1">
            <Image
              src={imagePreview}
              alt="Xem trước ảnh giao dịch"
              width={96}
              height={64}
              unoptimized
              className="h-16 rounded-md border border-border object-cover"
            />
            <button 
              onClick={removeImage}
              className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5 shadow-sm"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        
        <div className="flex items-end gap-2">
          <input 
            type="file" 
            accept="image/*" 
            className="hidden" 
            ref={fileInputRef}
            onChange={handleFileSelect}
          />
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-10 w-10 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImageIcon className="h-5 w-5" />
          </Button>
          
          <div className="flex-1 min-h-[40px] bg-background border border-border rounded-2xl flex items-center px-3 py-1 transition-all duration-200 focus-within:ring-1 focus-within:ring-ring focus-within:border-ring">
            <textarea
              className="w-full bg-transparent border-none focus:outline-none resize-none min-h-[20px] max-h-[120px] py-1.5 text-sm"
              placeholder="Nhập hoặc dán ảnh..."
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
              onPaste={handlePaste}
              onKeyDown={handleKeyDown}
            />
          </div>

          <Button 
            size="icon" 
            className={`h-10 w-10 shrink-0 rounded-full transition-all duration-200 ${
              input.trim() || imageFile ? 'bg-[#00BC7C] text-white opacity-100 scale-100' : 'bg-muted text-muted-foreground opacity-50 scale-95'
            }`}
            onClick={handleSend}
            disabled={(!input.trim() && !imageFile) || isLoading}
          >
            <Send className="h-4 w-4 ml-0.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
