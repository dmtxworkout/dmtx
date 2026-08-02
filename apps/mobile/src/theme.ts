/**
 * DMTX mobile palette (dark). Mirrors tailwind.config.js — use these constants
 * where a raw color string is needed (StatusBar, gradients, icon fills) and the
 * Tailwind `className` tokens everywhere else.
 */
export const colors = {
  bg: '#0d0d0f',
  surface: '#16161b',
  surface2: '#1e1e25',
  surface3: '#22222a',
  line: '#26262e',
  line2: '#1a1a20',
  ink: '#f2f2f4',
  ink2: '#b8b8c0',
  ink3: '#8b8b93',
  ink4: '#6d6d75',
  accent: '#d1502a',
  accentHover: '#bd4522',
  success: '#4c9c6b',
  white: '#ffffff',
} as const;

/** Hatched placeholder used wherever media hasn't loaded (matches the comp). */
export const HATCH = 'repeating-linear-gradient(135deg,#1c1c21 0 8px,#232329 8px 16px)';
