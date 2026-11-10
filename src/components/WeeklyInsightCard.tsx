'use client';

import { useEffect, useState } from 'react';
import { LoaderCircle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/useToast';

interface Insight {
  id: number;
  period_start: string;
  period_end: string;
  content: string;
  created_at: string;
}

export function WeeklyInsightCard() {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    fetch('/api/insights/latest')
      .then(async (response) => response.ok ? await response.json() as Insight | null : null)
      .then((result) => { if (!cancelled) setInsight(result); })
      .catch(() => { if (!cancelled) setInsight(null); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function generateInsight() {
    setIsGenerating(true);
    try {
      const response = await fetch('/api/insights/generate', { method: 'POST' });
      const result = await response.json() as Insight | { error?: string };
      if (!response.ok || !('content' in result)) {
        throw new Error('error' in result ? result.error : 'Không thể tạo phân tích.');
      }
      setInsight(result);
      showToast('Đã cập nhật phân tích tuần', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể tạo phân tích.', 'error');
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-emerald-100 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-emerald-50 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Sparkles className="size-4 text-emerald-600" /> AI nhìn lại tuần
        </h2>
        <Button type="button" variant="ghost" size="sm" disabled={isGenerating} onClick={() => void generateInsight()} className="h-8 rounded-lg px-2 text-xs text-emerald-700">
          {isGenerating ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
          {insight ? 'Phân tích lại' : 'Tạo phân tích'}
        </Button>
      </div>
      <div className="p-4">
        {isLoading ? <p className="text-xs text-slate-400">Đang tải phân tích…</p> : insight ? (
          <>
            <p className="mb-2 text-[11px] text-slate-400">{insight.period_start} – {insight.period_end}</p>
            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{insight.content.replace(/^#{1,6}\s+/gm, '').replace(/\*{1,3}/g, '').replace(/_{1,2}/g, '')}</p>
          </>
        ) : (
          <p className="text-sm leading-6 text-slate-500">Chưa có phân tích tuần. Tạo ngay bằng provider AI đã cấu hình.</p>
        )}
      </div>
    </section>
  );
}
