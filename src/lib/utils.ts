import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  if (amount === null || amount === undefined || isNaN(amount)) return '0đ';
  return Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ';
}

function parseIsoDateParts(date: string): [number, number, number] | null {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year
    || check.getUTCMonth() !== month - 1
    || check.getUTCDate() !== day
  ) {
    return null;
  }
  return [year, month, day];
}

export function formatDate(date: string): string {
  if (!date) return '';
  const parts = parseIsoDateParts(date);
  if (parts) {
    return `${String(parts[2]).padStart(2, '0')}/${String(parts[1]).padStart(2, '0')}/${parts[0]}`;
  }
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  return `${d.getUTCDate().toString().padStart(2, '0')}/${(d.getUTCMonth() + 1).toString().padStart(2, '0')}/${d.getUTCFullYear()}`;
}

export function formatShortDate(date: string): string {
  if (!date) return '';
  const parts = parseIsoDateParts(date);
  if (parts) {
    return `${String(parts[2]).padStart(2, '0')}/${String(parts[1]).padStart(2, '0')}`;
  }
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  return `${d.getUTCDate().toString().padStart(2, '0')}/${(d.getUTCMonth() + 1).toString().padStart(2, '0')}`;
}

export function getCurrentMonth(): string {
  return getVietnamToday().slice(0, 7);
}

export function getVietnamToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function formatMoneyInput(value: number | string): string {
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  return new Intl.NumberFormat('vi-VN').format(Number(digits));
}

export function parseMoneyInput(value: string): number {
  const digits = value.replace(/\D/g, '');
  return Number(digits) || 0;
}

export function getMonthLabel(month: string): string {
  if (!month) return '';
  const [year, m] = month.split('-');
  return `Tháng ${parseInt(m)}/${year}`;
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

export function getQuarter(month: string): number {
  if (!month) return 1;
  const m = parseInt(month.split('-')[1], 10);
  return Math.ceil(m / 3);
}

export function getPercentage(current: number, total: number): number {
  if (total === 0) return 0;
  const p = (current / total) * 100;
  return Math.min(p, 100);
}
