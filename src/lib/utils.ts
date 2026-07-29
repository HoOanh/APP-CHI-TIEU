import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  if (amount === null || amount === undefined || isNaN(amount)) return '0đ';
  return Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ';
}

export function formatDate(date: string): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
}

export function formatShortDate(date: string): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

export function getCurrentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
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
