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
