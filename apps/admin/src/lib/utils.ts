import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDateEs(iso: string): string {
  return new Date(iso).toLocaleDateString('es', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatBytes(bytes?: number | null): string {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(i > 0 && n < 10 ? 1 : 0)} ${units[i]}`;
}
