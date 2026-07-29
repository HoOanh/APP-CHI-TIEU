'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { MonthPicker } from '@/components/MonthPicker';
import { formatCurrency, getCurrentMonth, getPercentage, formatShortDate } from '@/lib/utils';
import { BarChart, Bar, XAxis, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { ChevronLeft, ChevronRight, TrendingDown, Target, LayoutGrid } from 'lucide-react';

interface StatsResponse {
  total: number;
  count: number;
  daily_average: number;
  by_category: {
    category_name: string;
    category_icon: string;
    category_color: string;
    total: number;
    count: number;
  }[];
  by_date: {
    date: string;
    total: number;
  }[];
}

type Period = 'daily' | 'monthly' | 'quarterly' | 'yearly';

export default function StatsPage() {
  const [period, setPeriod] = useState<Period>('daily');
  const [month, setMonth] = useState(getCurrentMonth());
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [data, setData] = useState<StatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      setIsLoading(true);
      const url = `/api/expenses/stats?period=${period}&month=${month}&year=${year}`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setIsLoading(false);
    }
  }, [period, month, year]);

  useEffect(() => {
    // Refetch when the reporting period changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStats();
  }, [fetchStats]);

  const renderYearSelector = () => (
    <div className="flex items-center justify-between bg-card border border-border rounded-xl p-1 w-full max-w-[200px] mx-auto">
      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setYear((Number(year) - 1).toString())}>
        <ChevronLeft className="w-4 h-4" />
      </Button>
      <span className="font-semibold text-sm">Năm {year}</span>
      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setYear((Number(year) + 1).toString())}>
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );

  return (
    <div className="pb-nav max-w-lg mx-auto min-h-screen bg-background text-foreground flex flex-col">
      <div className="p-4 border-b border-border sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <h1 className="text-xl font-bold mb-4 text-center">Thống kê</h1>
        
        <Tabs defaultValue="daily" onValueChange={(val) => setPeriod(val as Period)} className="w-full">
          <TabsList className="grid w-full grid-cols-4 rounded-xl bg-muted/50 p-1">
            <TabsTrigger value="daily" className="rounded-lg text-xs font-medium">Tháng</TabsTrigger>
            <TabsTrigger value="monthly" className="rounded-lg text-xs font-medium">Năm</TabsTrigger>
            <TabsTrigger value="quarterly" className="rounded-lg text-xs font-medium">Quý</TabsTrigger>
            <TabsTrigger value="yearly" className="rounded-lg text-xs font-medium">Tất cả</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="p-4 space-y-6 flex-1">
        <div className="flex justify-center my-2">
          {period === 'daily' ? (
            <MonthPicker month={month} onChange={setMonth} />
          ) : (
            renderYearSelector()
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center p-12 text-muted-foreground text-sm">Đang tải dữ liệu...</div>
        ) : !data ? (
          <div className="text-center p-8 text-muted-foreground">Không có dữ liệu</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Card className="rounded-2xl border-border bg-card shadow-sm">
                <CardContent className="p-4">
                  <div className="w-8 h-8 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mb-3">
                    <TrendingDown className="w-4 h-4" />
                  </div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">Tổng chi tiêu</p>
                  <p className="text-lg font-bold tabular-nums text-rose-500">{formatCurrency(data.total)}</p>
                </CardContent>
              </Card>
              
              <Card className="rounded-2xl border-border bg-card shadow-sm">
                <CardContent className="p-4">
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
                    <Target className="w-4 h-4" />
                  </div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">Trung bình/{period === 'daily' ? 'ngày' : 'tháng'}</p>
                  <p className="text-lg font-bold tabular-nums">{formatCurrency(data.daily_average)}</p>
                </CardContent>
              </Card>
            </div>

            {data.by_date.length > 0 && (
              <Card className="rounded-2xl border-border bg-card shadow-sm">
                <CardHeader className="pb-0">
                  <CardTitle className="text-sm font-medium">Biểu đồ chi tiêu</CardTitle>
                </CardHeader>
                <CardContent className="pt-6 pb-2 px-2">
                  <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.by_date} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                        <XAxis 
                          dataKey="date" 
                          tickFormatter={(val) => period === 'daily' ? formatShortDate(val) : val}
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 10, fill: '#64748b' }}
                          dy={10}
                        />
                        <RechartsTooltip 
                          cursor={{ fill: 'rgba(0, 0, 0, 0.04)' }}
                          contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', color: '#0f172a', fontSize: '12px' }}
                          formatter={(value) => [formatCurrency(Number(value)), 'Chi tiêu']}
                          labelFormatter={(label) => `Ngày ${label}`}
                        />
                        <Bar 
                          dataKey="total" 
                          fill="#00BC7C" 
                          radius={[4, 4, 0, 0]} 
                          barSize={period === 'daily' ? 8 : 24}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {data.by_category.length > 0 && (
              <Card className="rounded-2xl border-border bg-card shadow-sm">
                <CardHeader>
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <LayoutGrid className="w-4 h-4 text-muted-foreground" /> Cơ cấu chi tiêu
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[220px] w-full relative mb-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.by_category}
                          cx="50%"
                          cy="50%"
                          innerRadius={70}
                          outerRadius={90}
                          paddingAngle={3}
                          dataKey="total"
                          stroke="none"
                        >
                          {data.by_category.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.category_color || '#3b82f6'} />
                          ))}
                        </Pie>
                        <RechartsTooltip 
                          contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', color: '#0f172a', fontSize: '12px' }}
                          formatter={(value) => [formatCurrency(Number(value)), '']}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-xs text-muted-foreground font-medium">Tổng cộng</span>
                      <span className="text-lg font-bold text-foreground tabular-nums">{formatCurrency(data.total)}</span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {data.by_category.map((item, i) => {
                      const pct = getPercentage(item.total, data.total);
                      return (
                        <div key={i} className="group">
                          <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center gap-3">
                              <div 
                                className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
                                style={{ backgroundColor: `${item.category_color}20` }}
                              >
                                {item.category_icon}
                              </div>
                              <div>
                                <p className="font-medium text-sm">{item.category_name}</p>
                                <p className="text-xs text-muted-foreground">{item.count} giao dịch</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-sm tabular-nums">{formatCurrency(item.total)}</p>
                              <p className="text-xs text-muted-foreground font-medium tabular-nums">{Math.round(pct)}%</p>
                            </div>
                          </div>
                          <Progress 
                            value={pct} 
                            className="h-1.5 bg-secondary"
                            indicatorColor={`bg-[${item.category_color || '#3b82f6'}]`}
                          />
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
