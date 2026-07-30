'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { formatCurrency, formatShortDate } from '@/lib/utils';

interface DatePoint { date: string; total: number; }
interface StatsChartsProps { byDate: DatePoint[]; period: 'daily' | 'monthly' | 'quarterly' | 'yearly'; total: number; }

function formatAxis(value: string, period: StatsChartsProps['period']) {
  if (period === 'daily') return value.slice(-2);
  return value;
}

export function StatsCharts({ byDate, period, total }: StatsChartsProps) {
  const nonZeroDays = byDate.filter((point) => point.total > 0).length;
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-start justify-between px-4 pb-1 pt-4">
        <div><h2 className="text-[15px] font-semibold text-slate-800">Xu hướng chi tiêu</h2><p className="mt-0.5 text-xs text-slate-400">{nonZeroDays} kỳ có phát sinh chi tiêu</p></div>
        <p className="text-sm font-semibold tabular-nums text-slate-700">{formatCurrency(total)}</p>
      </div>
      <div className="h-[190px] px-1 pb-2 pt-3">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={byDate} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
            <defs><linearGradient id="spending-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#00bc7c" stopOpacity={0.22} /><stop offset="95%" stopColor="#00bc7c" stopOpacity={0} /></linearGradient></defs>
            <CartesianGrid vertical={false} stroke="#edf1f2" strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={(value: string) => formatAxis(value, period)} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} dy={8} minTickGap={period === 'daily' ? 26 : 12} />
            <Tooltip cursor={{ stroke: '#00bc7c', strokeOpacity: 0.25 }} contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '12px' }} formatter={(value) => [formatCurrency(Number(value)), 'Chi tiêu']} labelFormatter={(label) => period === 'daily' ? `Ngày ${formatShortDate(String(label))}` : String(label)} />
            <Area type="monotone" dataKey="total" stroke="#00bc7c" strokeWidth={2.5} fill="url(#spending-fill)" activeDot={{ r: 4, fill: '#00bc7c', stroke: '#fff', strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
