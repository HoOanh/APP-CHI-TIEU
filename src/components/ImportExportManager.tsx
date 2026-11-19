'use client';

import { useRef, useState } from 'react';
import { Download, FileSpreadsheet, FileUp, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/useToast';
import { formatCurrency } from '@/lib/utils';

interface ParsedCsvRow {
  date: string;
  amount: number;
  description: string;
  type: 'expense' | 'income';
  category_name?: string;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function normalizeDateString(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const dmY = trimmed.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (dmY) {
    return `${dmY[3]}-${dmY[2].padStart(2, '0')}-${dmY[1].padStart(2, '0')}`;
  }
  return null;
}

function parseStatementCsv(text: string): ParsedCsvRow[] {
  const clean = text.replace(/^\uFEFF/, '').trim();
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.toLocaleLowerCase('vi'));
  const dateIdx = headers.findIndex((h) => h.includes('ngày') || h === 'date');
  const descIdx = headers.findIndex((h) => h.includes('mô tả') || h.includes('nội dung') || h.includes('description'));
  const amountIdx = headers.findIndex((h) => h.includes('số tiền') || h === 'amount');
  const typeIdx = headers.findIndex((h) => h.includes('loại') || h === 'type');
  const catIdx = headers.findIndex((h) => h.includes('danh mục') || h === 'category');

  const rows: ParsedCsvRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const dateVal = normalizeDateString(cols[dateIdx >= 0 ? dateIdx : 0] ?? '');
    const rawAmount = Number((cols[amountIdx >= 0 ? amountIdx : cols.length - 1] ?? '').replace(/[^\d.-]/g, ''));
    const description = (cols[descIdx >= 0 ? descIdx : 1] ?? '').trim();
    if (!dateVal || !Number.isFinite(rawAmount) || rawAmount === 0 || !description) continue;

    const rawType = (cols[typeIdx >= 0 ? typeIdx : -1] ?? '').toLocaleLowerCase('vi');
    if (rawType.includes('chuyển ví') || rawType === 'transfer') continue;

    const type: 'expense' | 'income' = rawType.includes('thu') || rawType === 'income' || rawAmount > 0 && typeIdx === -1 && rawType === ''
      ? (rawType.includes('thu') || rawType === 'income' ? 'income' : rawAmount < 0 ? 'expense' : 'expense')
      : 'expense';

    rows.push({
      date: dateVal,
      amount: Math.abs(Math.round(rawAmount)),
      description: description.slice(0, 160),
      type,
      category_name: catIdx >= 0 ? cols[catIdx] : undefined,
    });
  }
  return rows;
}

export function ImportExportManager({ onRestored }: { onRestored?: () => void }) {
  const { showToast } = useToast();
  const csvInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const [csvPreview, setCsvPreview] = useState<ParsedCsvRow[]>([]);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [isRestoringJson, setIsRestoringJson] = useState(false);

  async function handleCsvFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseStatementCsv(text);
    if (!parsed.length) {
      showToast('Không tìm thấy dòng giao dịch hợp lệ trong CSV (cần cột Ngày, Mô tả, Số tiền)', 'error');
      return;
    }
    setCsvPreview(parsed);
    if (csvInputRef.current) csvInputRef.current.value = '';
  }

  async function confirmCsvImport() {
    if (!csvPreview.length) return;
    setIsImportingCsv(true);
    try {
      const response = await fetch('/api/import/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: csvPreview.slice(0, 500), skipDuplicates: true }),
      });
      const data = await response.json() as { importedCount?: number; skippedDuplicates?: number; error?: string };
      if (!response.ok) throw new Error(data.error || 'Import CSV thất bại');
      showToast(
        `Đã import ${data.importedCount ?? 0} giao dịch${data.skippedDuplicates ? ` (bỏ qua ${data.skippedDuplicates} dòng trùng)` : ''}`,
        'success',
      );
      setCsvPreview([]);
      onRestored?.();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Lỗi import CSV', 'error');
    } finally {
      setIsImportingCsv(false);
    }
  }

  async function handleJsonRestoreFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsRestoringJson(true);
    try {
      const rawJson: unknown = JSON.parse(await file.text());
      const response = await fetch('/api/import/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'merge', backup: rawJson }),
      });
      const data = await response.json() as {
        imported?: { expenses?: number; budgets?: number };
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || 'Khôi phục backup thất bại');
      showToast(
        `Đã khôi phục ${data.imported?.expenses ?? 0} giao dịch và ${data.imported?.budgets ?? 0} ngân sách`,
        'success',
      );
      onRestored?.();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'File JSON backup không hợp lệ', 'error');
    } finally {
      setIsRestoringJson(false);
      if (jsonInputRef.current) jsonInputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-4 sm:col-span-full">
      <div className="grid gap-2.5 sm:grid-cols-3">
        <Button
          type="button"
          variant="outline"
          className="h-11 justify-start rounded-xl border-slate-200"
          onClick={() => window.open('/api/export?format=csv', '_blank')}
        >
          <FileSpreadsheet className="size-4 text-[#00a970]" /> Xuất Excel CSV (UTF-8)
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 justify-start rounded-xl border-slate-200"
          onClick={() => csvInputRef.current?.click()}
        >
          <Upload className="size-4 text-sky-600" /> Import sao kê CSV
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isRestoringJson}
          className="h-11 justify-start rounded-xl border-slate-200"
          onClick={() => jsonInputRef.current?.click()}
        >
          <FileUp className="size-4 text-amber-600" /> {isRestoringJson ? 'Đang khôi phục…' : 'Khôi phục Backup JSON'}
        </Button>
        <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvFile} />
        <input ref={jsonInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleJsonRestoreFile} />
      </div>

      {csvPreview.length > 0 ? (
        <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-sky-900">
              Xem trước CSV: tìm thấy {csvPreview.length} giao dịch (tự lọc trùng khi lưu)
            </p>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setCsvPreview([])}>Hủy</Button>
              <Button type="button" size="sm" disabled={isImportingCsv} onClick={() => void confirmCsvImport()} className="rounded-lg">
                <Download className="size-3.5" /> {isImportingCsv ? 'Đang import…' : `Import ${csvPreview.length} dòng`}
              </Button>
            </div>
          </div>
          <div className="mt-2.5 divide-y divide-sky-200/60 rounded-lg bg-white px-3">
            {csvPreview.slice(0, 5).map((row, idx) => (
              <div key={idx} className="flex items-center justify-between gap-3 py-1.5">
                <span className="truncate text-slate-700">{row.date} · {row.description}</span>
                <span className="shrink-0 font-semibold tabular-nums text-slate-900">{formatCurrency(row.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
