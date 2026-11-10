"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Send, Image as ImageIcon, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/useToast";
import { formatCurrency, cn } from "@/lib/utils";

type Message = {
  id: string;
  role: "user" | "ai";
  content: string;
  isReceipt?: boolean;
  receiptData?: {
    debt_name: string;
    amount: number;
    remaining: number;
  };
};

export default function DebtChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "ai",
      content: "Chào bạn! Gửi ảnh màn hình chuyển khoản hoặc nhắn tin (VD: 'trả tiền nhà 5tr') để mình ghi nhận trả nợ giúp nhé."
    }
  ]);
  const [input, setInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e?: React.FormEvent, file?: File) => {
    if (e) e.preventDefault();
    if (!input.trim() && !file) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: file ? `[Đã gửi ảnh: ${file.name}]` : input,
    };
    
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      if (file) formData.append("image", file);
      if (input) formData.append("message", input);
      formData.append("type", "debt");

      const res = await fetch("/api/chat", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        const aiMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: "ai",
          content: data.message || "Đã ghi nhận thanh toán thành công!",
          isReceipt: !!data.receiptData,
          receiptData: data.receiptData,
        };
        setMessages(prev => [...prev, aiMsg]);
      } else {
        showToast("Không thể xử lý yêu cầu", "error");
        setMessages(prev => [...prev, { id: Date.now().toString(), role: "ai", content: "Xin lỗi, mình không thể xử lý thông tin này. Vui lòng thử lại." }]);
      }
    } catch (error) {
      console.error(error);
      showToast("Lỗi kết nối", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleSubmit(undefined, file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="mx-auto flex h-[100dvh] w-full max-w-6xl flex-col overflow-hidden bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 p-4 border-b border-gray-200 bg-white/90 backdrop-blur-xl z-10 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full h-10 w-10">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold flex items-center gap-2">
            Trả nợ nhanh <Badge variant="secondary" className="bg-[#00BC7C]/20 text-[#00BC7C] text-[10px] rounded-sm px-1.5 py-0">AI</Badge>
          </h1>
        </div>
      </header>

      {/* Messages Area */}
      <div className="mx-auto w-full max-w-4xl flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((msg) => (
          <div key={msg.id} className={cn("flex w-full", msg.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn(
              "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
              msg.role === "user" 
                ? "bg-[#00BC7C] text-white rounded-tr-sm" 
                : "bg-white border border-gray-100 shadow-sm text-foreground rounded-tl-sm"
            )}>
              {msg.role === "ai" && <Sparkles className="w-3 h-3 mb-1 text-[#00BC7C] opacity-70" />}
              <p className="whitespace-pre-wrap">{msg.content}</p>
              
              {/* Receipt Card */}
              {msg.isReceipt && msg.receiptData && (
                <Card className="mt-3 bg-background border-border shadow-sm">
                  <CardContent className="p-3 space-y-2">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Biên lai ghi nhận</div>
                    <div>
                      <p className="text-sm font-semibold">{msg.receiptData.debt_name}</p>
                      <p className="text-lg font-bold text-[#00BC7C] tabular-nums">+{formatCurrency(msg.receiptData.amount)}</p>
                    </div>
                    <div className="text-xs text-muted-foreground pt-2 border-t border-border">
                      Còn lại: <span className="font-medium text-foreground">{formatCurrency(msg.receiptData.remaining)}</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        ))}
        {isSubmitting && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-100 shadow-sm text-muted-foreground rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1">
              <span className="w-1.5 h-1.5 bg-[#00BC7C]/50 rounded-full animate-bounce"></span>
              <span className="w-1.5 h-1.5 bg-[#00BC7C]/50 rounded-full animate-bounce delay-75"></span>
              <span className="w-1.5 h-1.5 bg-[#00BC7C]/50 rounded-full animate-bounce delay-150"></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="shrink-0 border-t border-gray-200 bg-white p-4 mb-safe">
        <div className="mx-auto w-full max-w-4xl">
        <form onSubmit={handleSubmit} className="flex items-end gap-2 relative">
          <input 
            type="file" 
            accept="image/*" 
            className="hidden" 
            ref={fileInputRef}
            onChange={handleFileSelect}
          />
          <Button 
            type="button"
            variant="outline" 
            size="icon" 
            className="h-12 w-12 rounded-xl shrink-0 border-border"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSubmitting}
          >
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
          </Button>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="VD: Trả anh A 2tr..."
            className="min-h-[48px] max-h-[120px] rounded-xl resize-none py-3 px-4 border-border focus-visible:ring-primary/20"
            rows={1}
            disabled={isSubmitting}
          />
          <Button 
            type="submit" 
            size="icon" 
            className="h-12 w-12 rounded-xl shrink-0 bg-[#00BC7C] hover:bg-[#00BC7C]/90 text-white"
            disabled={(!input.trim() && !isSubmitting) || isSubmitting}
          >
            {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </Button>
        </form>
        </div>
      </div>
    </div>
  );
}
