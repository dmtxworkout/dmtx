'use client';

// The drawn body in a muscle's form: hover a part to name it, click to mark
// what lights up when something works this muscle. The man and the woman share
// the parts, so the figure is only a way of looking.
import { useState } from 'react';
import { BODY_FIGURES, type BodyFigureKind, type BodyView } from '@dmtx/core/body-map';
import { BODY_PART, BODY_PART_LABEL, type BodyPart } from '@dmtx/schemas';
import { cn } from '@/lib/utils';

const VIEWS: { view: BodyView; label: string }[] = [
  { view: 'front', label: 'Frente' },
  { view: 'back', label: 'Espalda' },
];

export function BodyPicker({ value, onChange }: { value: BodyPart[]; onChange: (parts: BodyPart[]) => void }) {
  const [figure, setFigure] = useState<BodyFigureKind>('male');
  const [hovered, setHovered] = useState<BodyPart | null>(null);
  const toggle = (part: BodyPart) => onChange(value.includes(part) ? value.filter((p) => p !== part) : [...value, part]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold text-ink-2">Qué se ilumina en el cuerpo</span>
        <div role="group" aria-label="Figura" className="flex overflow-hidden rounded-lg border border-line-2">
          {(
            [
              ['male', 'Hombre'],
              ['female', 'Mujer'],
            ] as const
          ).map(([kind, label]) => (
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

      <div className="grid grid-cols-2 gap-2">
        {VIEWS.map(({ view, label }) => {
          const f = BODY_FIGURES[figure][view];
          return (
            <figure key={view} className="m-0">
              <svg viewBox={f.viewBox} role="group" aria-label={label} className="block h-[400px] w-full">
                <path d={f.border} className="fill-none stroke-line-2" strokeWidth={2} />
                {f.base.map((d, i) => (
                  <path key={i} d={d} className="fill-surface stroke-line-2" strokeWidth={2} />
                ))}
                {BODY_PART.map((part) => {
                  const shapes = f.parts[part];
                  if (!shapes) return null;
                  const on = value.includes(part);
                  return (
                    <g
                      key={part}
                      role="checkbox"
                      aria-checked={on}
                      aria-label={BODY_PART_LABEL[part]}
                      tabIndex={0}
                      onClick={() => toggle(part)}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        e.preventDefault();
                        toggle(part);
                      }}
                      onMouseEnter={() => setHovered(part)}
                      onMouseLeave={() => setHovered(null)}
                      onFocus={() => setHovered(part)}
                      onBlur={() => setHovered(null)}
                      className={cn(
                        'cursor-pointer outline-none transition-colors',
                        on ? 'fill-accent' : hovered === part ? 'fill-[#587089]' : 'fill-[#7d93ab]',
                      )}
                    >
                      {shapes.map((d, i) => (
                        <path key={i} d={d} />
                      ))}
                    </g>
                  );
                })}
              </svg>
              <figcaption className="text-center font-mono text-[10px] uppercase tracking-[0.1em] text-muted-2">{label}</figcaption>
            </figure>
          );
        })}
      </div>

      <p className="min-h-4 text-[12px] leading-4 text-ink-3">
        {hovered ? (
          <strong className="font-semibold text-ink">{BODY_PART_LABEL[hovered]}</strong>
        ) : value.length ? (
          `Marcado: ${value.map((p) => BODY_PART_LABEL[p]).join(', ')}`
        ) : (
          'Nada marcado: la app no lo dibuja, como un músculo que no se ve desde afuera.'
        )}
      </p>
    </div>
  );
}
