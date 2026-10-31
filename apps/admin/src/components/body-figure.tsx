'use client';

// The drawn body, front and back: what's lit shows in the accent. With `onPart`
// a hovered part names itself and a click is the page's to read; without it the
// body only shows.
// The man and the woman share the parts, so the figure is only a way of looking.
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { BODY_FIGURES, type BodyFigureKind, type BodyView } from '@dmtx/core/body-map';
import { BODY_PART, BODY_PART_LABEL, type BodyPart } from '@dmtx/schemas';
import { cn } from '@/lib/utils';

const VIEWS: { view: BodyView; label: string }[] = [
  { view: 'front', label: 'Frente' },
  { view: 'back', label: 'Espalda' },
];
const FIGURES: { kind: BodyFigureKind; label: string }[] = [
  { kind: 'male', label: 'Hombre' },
  { kind: 'female', label: 'Mujer' },
];

export function BodyFigure({
  lit,
  attention = false,
  hoverGroup,
  describe = (part) => BODY_PART_LABEL[part],
  hint,
  onPart,
  size = 'lg',
}: {
  lit: BodyPart[];
  /** Pulses, to draw the eye when a part must be chosen. */
  attention?: boolean;
  /** What a hovered part darkens with it (by default, only itself). */
  hoverGroup?: (part: BodyPart) => BodyPart[];
  /** What a hovered part is called. */
  describe?: (part: BodyPart) => ReactNode;
  /** Shown under the body while nothing is hovered. */
  hint?: ReactNode;
  onPart?: (part: BodyPart) => void;
  /** `sm` fits a form's side column. */
  size?: 'sm' | 'lg';
}) {
  const [figure, setFigure] = useState<BodyFigureKind>('male');
  const [hovered, setHovered] = useState<BodyPart | null>(null);
  const darkened = !hovered ? [] : hoverGroup ? hoverGroup(hovered) : [hovered];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-4">
        {VIEWS.map(({ view, label }) => {
          const f = BODY_FIGURES[figure][view];
          return (
            <figure key={view} className="m-0">
              <svg viewBox={f.viewBox} role="group" aria-label={label} className={cn('block w-full', size === 'lg' ? 'h-[min(66vh,620px)] min-h-[380px]' : 'h-[240px]')}>
                <path d={f.border} className="fill-none stroke-line-2" strokeWidth={2} />
                {f.base.map((d, i) => (
                  <path key={i} d={d} className="fill-surface stroke-line-2" strokeWidth={2} />
                ))}
                {BODY_PART.map((part) => {
                  const shapes = f.parts[part];
                  if (!shapes) return null;
                  const on = lit.includes(part);
                  return (
                    <g
                      key={part}
                      {...(onPart && {
                        onMouseEnter: () => setHovered(part),
                        onMouseLeave: () => setHovered(null),
                        onFocus: () => setHovered(part),
                        onBlur: () => setHovered(null),
                        role: 'button',
                        'aria-pressed': on,
                        'aria-label': BODY_PART_LABEL[part],
                        tabIndex: 0,
                        onClick: () => onPart(part),
                        onKeyDown: (e: KeyboardEvent) => {
                          if (e.key !== 'Enter' && e.key !== ' ') return;
                          e.preventDefault();
                          onPart(part);
                        },
                      })}
                      className={cn(
                        'outline-none transition-colors',
                        attention && 'motion-safe:animate-pulse',
                        onPart && 'cursor-pointer',
                        darkened.includes(part) ? (on ? 'fill-accent-dark' : 'fill-[#587089]') : on ? 'fill-accent' : 'fill-[#7d93ab]',
                      )}
                    >
                      {shapes.map((d, i) => (
                        <path key={i} d={d} />
                      ))}
                    </g>
                  );
                })}
              </svg>
              <figcaption className="pt-1 text-center font-mono text-[10px] uppercase tracking-[0.1em] text-muted-2">{label}</figcaption>
            </figure>
          );
        })}
      </div>

      <div className={cn('flex items-center gap-4', onPart ? 'justify-between' : 'justify-end')}>
        {onPart && (
          <p className="min-h-5 min-w-0 text-[13px] leading-5 text-ink-3">
            {hovered ? <strong className="font-semibold text-ink">{describe(hovered)}</strong> : hint}
          </p>
        )}
        <div role="group" aria-label="Figura" className="flex shrink-0 overflow-hidden rounded-lg border border-line-2">
          {FIGURES.map(({ kind, label }) => (
            <button
              key={kind}
              type="button"
              aria-pressed={figure === kind}
              onClick={() => setFigure(kind)}
              className={cn('px-2.5 py-1 text-[12px] font-semibold', figure === kind ? 'bg-ink text-surface' : 'bg-surface text-ink-3 hover:text-ink')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
