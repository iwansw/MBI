import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
}

export function formatNumberWithDots(val: number | string) {
  if (val === undefined || val === null || val === '') return '';
  const num = typeof val === 'string' ? val.replace(/\D/g, '') : Math.floor(val).toString();
  if (num === '') return '';
  return new Intl.NumberFormat('id-ID').format(parseInt(num));
}

export function parseDotNumber(val: string) {
  return parseInt(val.replace(/\./g, '')) || 0;
}

export function formatDateTime(date: any) {
  if (!date) return '-';
  
  let d: Date;
  if (typeof date.toDate === 'function') {
    d = date.toDate();
  } else {
    d = new Date(date);
  }

  if (isNaN(d.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Jakarta'
  }).format(d).replace(/\//g, '-');
}
