'use client';

// Rutina editor. The structure (format, sections, blocks, exercises) is written
// as text in the rutina notation and parsed live by @dmtx/core; everything
// else (name, status, difficulty, media) lives in the header + settings drawer.
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CONTENT_STATUS, DIFFICULTY } from '@dmtx/schemas';
import type { BlockSection, CreateWorkoutInput, Program, ProgramDayInput, ReusableBlock, Skill, SkillLevelInput, Workout, WorkoutFormat } from '@dmtx/schemas';
import {
  Catalog,
  goalsFrom,
  parseRutina,
  serializeRutina,
  toWorkoutInput,
  type CompletionExtra,
  estimateDurationSeconds,
  joinSections,
  splitSections,
  type SectionTexts,
} from '@dmtx/core';
import { api } from '@/lib/api';
import { es } from '@/i18n/es';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { MonoLabel } from '@/components/ui/mono-label';
import { MediaField } from '@/components/media-field';
import { ExerciseForm } from '@/components/exercise-form';
import { useUnsavedChanges } from '@/components/unsaved-changes';
import { toast } from '@/components/ui/toast';
import { RutinaTextEditor, type InsertGroup, type InsertKind, type RutinaEditorApi } from '@/components/rutina-text-editor';
import { RutinaPreview, previewFrom } from '@/components/rutina-preview';
import { RutinaGuide } from '@/components/rutina-guide';

const FORMAT_LABEL: Record<WorkoutFormat, string> = {
  amrap: 'AMRAP',
  emom: 'EMOM',
  tabata: 'Tabata',
  strength: 'Fuerza',
  chipper: 'Chipper',
  for_time: 'Por tiempo',
  circuit: 'Circuito',
};


const SECTION_TAB: Record<BlockSection, string> = { main: 'Rutina', warmup: 'Calentamiento', cooldown: 'Enfriamiento', goal: 'Objetivo' };
const EMPTY_SECTIONS: SectionTexts = { warmup: '', main: '', cooldown: '', goal: '' };
const GOAL_PLACEHOLDER = 'Las marcas que desbloquean el siguiente nivel, una por línea:\n3 Dominadas\nPlancha 60s\nSentadilla 5x5 @100 kg';

const PLACEHOLDER = 'Escribe la rutina como en papel, o pulsa + para insertar una plantilla o un bloque reutilizable…';

// ---- Text helpers ----------------------------------------------------------

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Templates are snippets: each ${…} is a placeholder the editor highlights and
// Tab jumps between, so nothing comes pre-filled (no made-up exercises or times).
type Template = { id: string; title: string; desc: string; text: string };
const TEMPLATES: Template[] = [
  {
    id: 'amrap',
    title: 'AMRAP clásico',
    desc: 'Máximas rondas de un circuito en un tiempo.',
    text: `AMRAP \${minutos} min
  \${reps} \${ejercicio}
  \${reps 2} \${ejercicio 2}
  \${reps 3} \${ejercicio 3}
`,
  },
  {
    id: 'emom',
    title: 'EMOM por intervalos',
    desc: 'Cada intervalo un grupo de trabajo distinto, rotando.',
    text: `EMOM \${intervalos} x \${segundos}s
  intervalo 1:
    \${reps} \${ejercicio}
  intervalo 2:
    \${reps 2} \${ejercicio 2}
`,
  },
  {
    id: 'fuerza',
    title: 'Fuerza',
    desc: 'Series × reps con carga, tempo y descanso.',
    text: `Fuerza
  \${ejercicio} \${series}x\${reps} @\${carga} desc \${descanso}
  \${ejercicio 2} \${series 2}x\${reps 2}
`,
  },
  {
    id: 'partes',
    title: 'For time con partes',
    desc: 'Varias partes seguidas, cada una con su formato.',
    text: `For time cap \${minutos} min
  \${rondas} rondas
    \${reps} \${ejercicio}
    \${reps 2} \${ejercicio 2}

AMRAP \${minutos 2} min
  \${reps 3} \${ejercicio 3}
`,
  },
  {
    id: 'tabata',
    title: 'Tabata',
    desc: 'Trabajo y descanso fijos, los ejercicios rotan.',
    text: `Tabata \${rondas} x \${trabajo}/\${descanso}
  \${ejercicio}
  \${ejercicio 2}
`,
  },
];

// ---- Programs: a calendar in weeks, every day a rutina of its own -----------

type DayState = {
  id: string | null;
  isRestDay: boolean;
  type: 'structured' | 'video';
  sections: SectionTexts;
  videoAssetId: string | null;
};
const emptyDay = (): DayState => ({ id: null, isRestDay: false, type: 'structured', sections: { ...EMPTY_SECTIONS }, videoAssetId: null });
const copyDay = (d: DayState): DayState => ({ ...d, id: null, sections: { ...d.sections } });
const dayHasContent = (d: DayState) => (d.type === 'video' ? !!d.videoAssetId : !!joinSections(d.sections).trim());
const dayLabel = (i: number) => `${es.programs.day} ${i + 1}`;
// Programs are written in whole weeks that start on Monday.
const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const WEEKDAY_INITIALS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const HATCH = 'repeating-linear-gradient(135deg,#f0ece4 0 5px,#e6e1d7 5px 10px)';

/**
 * One bar for the program's calendar: a "Semana N" dropdown (switch week,
 * duplicate or remove one, add an empty one) and the seven days of that week
 * as cells — click selects the day the editor shows, drag moves a day within
 * the week. A dot marks a day with content; hatched cells are rest days.
 */
function WeekStrip({
  days,
  active,
  onSelect,
  onMove,
  onAddWeek,
  onDuplicateWeek,
  onRemoveWeek,
}: {
  days: DayState[];
  active: number;
  onSelect: (i: number) => void;
  onMove: (from: number, to: number) => void;
  onAddWeek: () => void;
  onDuplicateWeek: (week: number) => void;
  onRemoveWeek: (week: number) => void;
}) {
  const weeks = Math.ceil(days.length / 7);
  const week = Math.floor(active / 7);
  const dragFrom = useRef<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmWeek, setConfirmWeek] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) {
      setConfirmWeek(null);
      return;
    }
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const weekHasContent = (w: number) => days.slice(w * 7, w * 7 + 7).some((d) => d.isRestDay || dayHasContent(d));
  return (
    <div className="flex items-center gap-1.5">
      <div ref={menuRef} className="relative mr-1">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-md px-2 font-mono text-[11px] hover:bg-surface-3',
            open ? 'bg-surface-3 text-ink' : 'text-ink-2',
          )}
          title="Semana del programa"
        >
          <span className="font-semibold text-ink">
            {es.programs.week} {week + 1}
          </span>
          <span className="text-muted">de {weeks}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-3">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {open && (
          <div className="absolute left-0 top-full z-20 mt-1 w-80 rounded-xl border border-line-2 bg-surface p-1 shadow-[0_12px_32px_-10px_rgba(0,0,0,0.25)]">
            {Array.from({ length: weeks }).map((_, w) => (
              <div
                key={w}
                className={cn(
                  'group flex items-center gap-1 rounded-lg pl-2.5 pr-1 text-[13px]',
                  week === w ? 'bg-accent-tint text-accent-dark' : 'text-ink-2 hover:bg-surface-2',
                )}
              >
                {confirmWeek === w ? (
                  <>
                    <span className="min-w-0 flex-1 truncate py-1.5 text-[13px] text-ink-2">
                      ¿Eliminar la semana {w + 1}{weekHasContent(w) ? ' y sus días' : ''}?
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmWeek(null);
                        setOpen(false);
                        onRemoveWeek(w);
                      }}
                      className="rounded-md bg-accent-dark px-2 py-1 text-[12px] font-semibold text-white hover:opacity-90"
                    >
                      Eliminar
                    </button>
                    <button type="button" onClick={() => setConfirmWeek(null)} className="rounded px-1.5 py-1 text-[13px] text-faint-2 hover:text-ink" aria-label="Cancelar">
                      ✕
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(w * 7);
                        setOpen(false);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
                    >
                      <span className="truncate font-semibold">
                        {es.programs.week} {w + 1}
                      </span>
                      <span className="font-mono text-[10px] text-muted">
                        {es.programs.day.toLowerCase()}s {w * 7 + 1}–{w * 7 + 7}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onDuplicateWeek(w);
                        setOpen(false);
                      }}
                      className="rounded px-1.5 py-1 text-[11px] font-semibold text-faint-2 opacity-0 hover:bg-surface-3 hover:text-ink group-hover:opacity-100"
                      title="Inserta una copia de esta semana a continuación"
                    >
                      Duplicar
                    </button>
                    {weeks > 1 && (
                      <button
                        type="button"
                        onClick={() => setConfirmWeek(w)}
                        className="rounded px-1 py-1 text-faint-2 opacity-0 hover:text-accent-dark group-hover:opacity-100"
                        title="Eliminar la semana"
                        aria-label="Eliminar semana"
                      >
                        ✕
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
            <div className="my-1 h-px bg-line-3" />
            <button
              type="button"
              onClick={() => {
                onAddWeek();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] font-semibold text-accent-dark hover:bg-accent-tint"
            >
              <span className="w-3 text-center">+</span>
              {es.programs.newWeek}
            </button>
            <p className="px-2.5 pb-1 pt-1.5 text-[11px] leading-snug text-muted">
              Siete días por semana. «Duplicar» inserta una copia de la semana justo después; la nueva empieza vacía.
            </p>
          </div>
        )}
      </div>
      {Array.from({ length: 7 }).map((_, j) => {
        const i = week * 7 + j;
        const d = days[i];
        if (!d) return null;
        const has = dayHasContent(d);
        const isActive = active === i;
        return (
          <button
            key={i}
            type="button"
            draggable
            onClick={() => onSelect(i)}
            onDragStart={(e) => {
              dragFrom.current = i;
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
              if (dragFrom.current === null) return;
              e.preventDefault();
              setOver((o) => (o === i ? o : i));
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragFrom.current !== null) onMove(dragFrom.current, i);
              dragFrom.current = null;
              setOver(null);
            }}
            onDragEnd={() => {
              dragFrom.current = null;
              setOver(null);
            }}
            title={`${WEEKDAYS[j]} · ${dayLabel(i)}${d.isRestDay ? ` · ${es.programs.restDay}` : ''}`}
            className={cn(
              'flex h-9 w-11 shrink-0 flex-col items-center justify-center rounded-md border font-mono text-[11px] leading-none',
              isActive
                ? 'border-accent bg-accent-tint font-semibold text-accent-dark'
                : d.isRestDay
                  ? 'border-line-2 text-muted hover:border-line-3'
                  : has
                    ? 'border-line-2 bg-surface text-ink hover:border-line-3'
                    : 'border-dashed border-line-2 bg-surface text-faint-2 hover:text-ink-2',
              over === i && dragFrom.current !== i && 'ring-2 ring-accent/40',
            )}
            style={d.isRestDay && !isActive ? { background: HATCH } : undefined}
          >
            <span className={cn('mb-0.5 text-[9px]', isActive ? 'text-accent-dark/70' : 'text-faint-2')}>{WEEKDAY_INITIALS[j]}</span>
            <span className="flex items-center gap-1">
              {i + 1}
              {has && !d.isRestDay && <span className={cn('h-1.5 w-1.5 rounded-full', d.type === 'video' ? 'bg-[#0451a5]' : 'bg-accent')} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Initial text: an existing rutina serialized; a new one starts empty (templates are offered in the editor). */
function initialText(workout: Workout | undefined, catalog: Catalog): string {
  if (!workout) return '';
  if (workout.type !== 'structured') return '';
  // The text as it was written (comments included); regenerate only for data without it.
  return workout.sourceText ?? serializeRutina(workout, catalog);
}

// ---- Component --------------------------------------------------------------

export function RutinaForm({
  workout,
  block,
  skill,
  program,
}: {
  workout?: Workout;
  /** A saved block: the same editor on one piece of text (null → a new block). */
  block?: ReusableBlock | null;
  /** A skill: its levels are the tabs, each with an "Objetivo" section (null → a new skill). */
  skill?: Skill | null;
  /** A program: weeks of days, each day a rutina picked from the strip above the editor (null → a new program). */
  program?: Program | null;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  // A saved block ("bloque reutilizable") is plain rutina text with a name: the
  // same editor and preview, one tab (no warmup/cooldown), no versions,
  // settings or status.
  const blockMode = block !== undefined;
  // A skill ("habilidad") is a rutina per level: the version tabs become the
  // levels, each one with an extra "Objetivo" section whose lines are the
  // marks that unlock the next level.
  const skillMode = skill !== undefined;
  // A program ("programa") is a calendar in whole weeks: every day is a rutina
  // of its own (structured or a video) or a rest day, chosen from the week
  // strip above the editor. Each day's rutina is saved as a workout owned by
  // the program.
  const programMode = program !== undefined;
  const basePath = blockMode ? '/bloques' : skillMode ? '/habilidades' : programMode ? '/programas' : '/rutinas';
  const listTitle = blockMode ? es.reusableBlocks.title : skillMode ? es.skills.title : programMode ? es.programs.title : es.workouts.title;
  const newLabel = blockMode ? 'Nuevo bloque' : skillMode ? es.skills.new : programMode ? es.programs.new : es.workouts.new;
  const isNew = blockMode ? !block : skillMode ? !skill : programMode ? !program : !workout;
  const levelWord = skillMode ? 'nivel' : 'variante';
  const [nameError, setNameError] = useState(false);

  const [name, setName] = useState(workout?.name ?? block?.name ?? skill?.name ?? program?.name ?? '');
  const [description, setDescription] = useState(workout?.description ?? skill?.description ?? program?.description ?? '');
  const [difficulty, setDifficulty] = useState(workout?.difficulty ?? skill?.difficulty ?? program?.difficulty ?? 'beginner');
  const [status, setStatus] = useState(workout?.status ?? skill?.status ?? program?.status ?? 'draft');
  const [typeState, setType] = useState<'structured' | 'video'>(workout?.type ?? 'structured');
  // A new rutina asks for name + type in one dialog, then opens the editor.
  const [createOpen, setCreateOpen] = useState(!workout && !blockMode && !skill && !program);
  const [thumbnailAssetId, setThumbnailAssetId] = useState<string | null>(
    workout?.thumbnailAssetId ?? skill?.thumbnailAssetId ?? program?.thumbnailAssetId ?? null,
  );
  const [videoAssetIdState, setVideoAssetIdState] = useState<string | null>(workout?.videoAssetId ?? null);
  // Program days: a new program starts with one empty week.
  const [days, setDays] = useState<DayState[]>(() =>
    programMode
      ? program?.days.length
        ? (() => {
            const loaded = program.days.map((d) => ({
              id: d.id,
              isRestDay: d.isRestDay,
              type: d.type,
              sections: splitSections(d.sourceText),
              videoAssetId: d.videoAssetId,
            }));
            // Always whole weeks: pad the last one with empty days.
            const pad = (7 - (loaded.length % 7)) % 7;
            return [...loaded, ...Array.from({ length: pad }, emptyDay)];
          })()
        : Array.from({ length: 7 }, emptyDay)
      : [],
  );
  const [activeDay, setActiveDay] = useState(0);
  const activeDayState: DayState | undefined = programMode ? days[activeDay] : undefined;
  const setDay = (i: number, patch: Partial<DayState>) => setDays((ds) => ds.map((d, k) => (k === i ? { ...d, ...patch } : d)));
  const moveDay = (from: number, to: number) => {
    if (from === to) return;
    setDays((ds) => {
      const next = [...ds];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved!);
      return next;
    });
    setActiveDay(to);
  };
  const addWeek = () => {
    setDays((ds) => [...ds, ...Array.from({ length: 7 }, emptyDay)]);
    setActiveDay(days.length);
  };
  const duplicateWeek = (w: number) =>
    setDays((ds) => [...ds.slice(0, (w + 1) * 7), ...ds.slice(w * 7, (w + 1) * 7).map(copyDay), ...ds.slice((w + 1) * 7)]);
  const removeWeek = (w: number) => {
    setDays((ds) => ds.filter((_, i) => Math.floor(i / 7) !== w));
    setActiveDay((a) => (Math.floor(a / 7) === w ? Math.max(0, w * 7 - 7) : a > w * 7 ? a - 7 : a));
  };
  // In program mode the type and the video belong to the active day.
  const type = activeDayState ? activeDayState.type : typeState;
  const videoAssetId = activeDayState ? activeDayState.videoAssetId : videoAssetIdState;
  const setVideoAssetId = (id: string | null) => (programMode ? setDay(activeDay, { videoAssetId: id }) : setVideoAssetIdState(id));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [blockModal, setBlockModal] = useState<{ name: string; text: string } | null>(null);
  const editorApi = useRef<RutinaEditorApi | null>(null);
  // A missing exercise is created from the editor with the full exercise form;
  // a recognised one is edited the same way (hover card or Cmd/Ctrl+click).
  const [newExercise, setNewExercise] = useState<{ name: string } | null>(null);
  const [editExerciseId, setEditExerciseId] = useState<string | null>(null);
  const editExerciseQ = useQuery({
    queryKey: ['exercise', editExerciseId],
    queryFn: () => api.exercises.get(editExerciseId!),
    enabled: !!editExerciseId,
  });
  const editorHost = useRef<HTMLDivElement>(null);

  const { data: exList } = useQuery({
    queryKey: ['exercises', 'all'],
    queryFn: () => api.exercises.list({ pageSize: 500, archived: 'all' }),
  });
  const catalog = useMemo(
    () => new Catalog((exList?.data ?? []).map((e) => ({ id: e.id, name: e.name, aliases: e.aliases, archived: !!e.archivedAt }))),
    [exList],
  );
  const catalogReady = !!exList;

  // The rutina text, one piece per section (each section is a tab). Seeded once
  // the catalog is available (names come from it).
  const [sections, setSections] = useState<SectionTexts | null>(null);
  const [activeSection, setActiveSection] = useState<BlockSection>('main');
  useEffect(() => {
    if (sections === null && catalogReady && !createOpen) {
      setSections(
        blockMode
          ? { ...EMPTY_SECTIONS, main: block?.text ?? '' }
          : skillMode
            ? splitSections(skill?.levels[0]?.sourceText ?? '')
            : programMode
              ? { ...EMPTY_SECTIONS }
              : splitSections(initialText(workout, catalog)),
      );
    }
  }, [sections, catalogReady, createOpen, workout, catalog, blockMode, block, skillMode, skill, programMode]);

  // Variants (RX / Escalada / …): versions of the whole rutina, switched from
  // the tab bar. Each is a full rutina row linked to this one; loaded once the
  // catalog is ready, saved/created/removed alongside the base on "Guardar".
  type VariantTab = { id: string | null; label: string; sections: SectionTexts };
  const [baseLabel, setBaseLabel] = useState(workout?.variantLabel ?? skill?.levels[0]?.name ?? (skillMode ? 'Nivel 1' : ''));
  // In skill mode the base tab is level 1 (this is its id); the "variants" are the other levels.
  const [baseLevelId, setBaseLevelId] = useState<string | null>(skill?.levels[0]?.id ?? null);
  const [variants, setVariants] = useState<VariantTab[] | null>(
    skillMode
      ? (skill?.levels ?? []).slice(1).map((l) => ({ id: l.id, label: l.name, sections: splitSections(l.sourceText) }))
      : workout?.variants?.length
        ? null
        : [],
  );
  const [removedVariantIds, setRemovedVariantIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState(0); // 0 = base, n = variants[n-1]
  const [tabDialog, setTabDialog] = useState<{ mode: 'add' | 'rename'; index: number; label: string } | null>(null);
  // Renaming and deleting happen in the row itself: Enter / ✓ saves, Escape / ✕ cancels.
  const [renaming, setRenaming] = useState<{ index: number; label: string } | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState<number | null>(null);
  const commitRename = () => {
    if (!renaming) return;
    renameTab(renaming.index, renaming.label.trim());
    setRenaming(null);
  };
  // The "Versión" dropdown in the tab bar: closes on an outside click or Escape.
  const [versionOpen, setVersionOpen] = useState(false);
  const versionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!versionOpen) {
      setRenaming(null);
      setConfirmingRemove(null);
      return;
    }
    const onDown = (e: MouseEvent) => {
      if (!versionRef.current?.contains(e.target as Node)) setVersionOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVersionOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [versionOpen]);
  useEffect(() => {
    if (variants !== null || !catalogReady || !workout?.variants?.length) return;
    let cancelled = false;
    Promise.all(workout.variants.map((v) => api.workouts.get(v.id)))
      .then((rows) => {
        if (cancelled) return;
        setVariants(
          rows.map((w) => ({
            id: w.id,
            label: w.variantLabel ?? '',
            sections: splitSections(w.sourceText ?? serializeRutina(w, catalog)),
          })),
        );
      })
      .catch((e) => toast(e instanceof Error ? e.message : es.app.error, 'error'));
    return () => {
      cancelled = true;
    };
  }, [variants, catalogReady, workout, catalog]);
  const tabs = variants ?? [];
  const versionList = [
    { id: 'base', label: baseLabel.trim() || (skillMode ? 'Nivel 1' : 'Principal') },
    ...tabs.map((v, i) => ({ id: v.id ?? `new-${i}`, label: v.label })),
  ];
  const activeVariant = activeTab > 0 ? tabs[activeTab - 1] : undefined;
  const activeSections = activeDayState ? activeDayState.sections : activeVariant ? activeVariant.sections : (sections ?? EMPTY_SECTIONS);
  const value = activeSections[activeSection];
  const setValue = (v: string) => {
    if (programMode) setDays((ds) => ds.map((d, i) => (i === activeDay ? { ...d, sections: { ...d.sections, [activeSection]: v } } : d)));
    else if (activeTab === 0) setSections((sc) => ({ ...(sc ?? EMPTY_SECTIONS), [activeSection]: v }));
    else
      setVariants((vs) =>
        (vs ?? []).map((t, i) => (i === activeTab - 1 ? { ...t, sections: { ...t.sections, [activeSection]: v } } : t)),
      );
  };
  /** Replace an exercise name (as a whole word, accents and case ignored) in every section of every version; returns the lines changed. */
  const renameInTexts = (oldName: string, newName: string): number => {
    let changed = 0;
    const target = fold(oldName.trim());
    const isWord = (ch: string | undefined) => !!ch && /[\p{L}\p{N}]/u.test(ch);
    const renameLine = (line: string): string => {
      // Walk the folded line for the name; splice the raw line at the same offsets
      // (folding keeps the length, since it only strips combining marks per char).
      const folded = [...line].map((ch) => fold(ch) || ch);
      const raw = [...line];
      let out = '';
      let i = 0;
      let hit = false;
      while (i < raw.length) {
        const slice = folded.slice(i, i + [...target].length).join('');
        if (slice === target && !isWord(folded[i - 1]) && !isWord(folded[i + [...target].length])) {
          out += newName;
          i += [...target].length;
          hit = true;
        } else {
          out += raw[i];
          i += 1;
        }
      }
      if (hit) changed += 1;
      return out;
    };
    const renameSections = (sc: SectionTexts): SectionTexts => {
      const next = { ...sc };
      for (const key of Object.keys(next) as (keyof SectionTexts)[]) {
        next[key] = next[key].split('\n').map(renameLine).join('\n');
      }
      return next;
    };
    // Computed from the current values (not inside the state updaters, which
    // React runs later) so the count is known right away for the toast.
    if (sections) setSections(renameSections(sections));
    if (variants) setVariants(variants.map((v) => ({ ...v, sections: renameSections(v.sections) })));
    if (programMode) setDays(days.map((d) => ({ ...d, sections: renameSections(d.sections) })));
    return changed;
  };
  // The whole rutina (all sections) of the active version, as one document.
  const doc = useMemo(() => joinSections(activeSections), [activeSections]);
  const editorReady = sections !== null && variants !== null;
  const addVariant = (label: string) => {
    setVariants((vs) => [...(vs ?? []), { id: null, label, sections: { ...activeSections } }]);
    setActiveTab(tabs.length + 1);
  };
  const removeVariant = (index: number) => {
    const v = tabs[index];
    if (!v) return;
    if (v.id) setRemovedVariantIds((ids) => [...ids, v.id!]);
    setVariants((vs) => (vs ?? []).filter((_, i) => i !== index));
    setActiveTab((t) => (t > index + 1 ? t - 1 : t === index + 1 ? 0 : t));
  };
  /** Remove a tab of the version list (0 = base). In skill mode level 1 can go too: the next level takes its place. */
  const removeTab = (i: number) => {
    if (i > 0) return removeVariant(i - 1);
    const next = tabs[0];
    if (!next) return;
    setBaseLabel(next.label);
    setBaseLevelId(next.id);
    setSections(next.sections);
    setVariants((vs) => (vs ?? []).slice(1));
    setActiveTab(0);
  };
  /** Levels are ordered: drop the tab at `from` so it lands at `to` (both in the version list). */
  const moveTab = (from: number, to: number) => {
    if (from === to) return;
    const all = [{ id: baseLevelId, label: baseLabel, sections: sections ?? EMPTY_SECTIONS }, ...tabs];
    const [moved] = all.splice(from, 1);
    all.splice(to, 0, moved!);
    setBaseLabel(all[0]!.label);
    setBaseLevelId(all[0]!.id);
    setSections(all[0]!.sections);
    setVariants(all.slice(1));
    setActiveTab(to);
  };
  // Drag and drop in the level list (native HTML5: the list is short). The
  // source index lives in a ref: dragover fires before any re-render.
  const dragFromRef = useRef<number | null>(null);
  const [dragFrom, setDragFromState] = useState<number | null>(null);
  const setDragFrom = (i: number | null) => {
    dragFromRef.current = i;
    setDragFromState(i);
  };
  const [dragOver, setDragOver] = useState<number | null>(null);
  const renameTab = (index: number, label: string) => {
    if (index === 0) setBaseLabel(label);
    else setVariants((vs) => (vs ?? []).map((t, i) => (i === index - 1 ? { ...t, label } : t)));
  };
  // Undo/redo buttons follow the editor's history (re-rendered on every change).
  const canUndo = editorApi.current?.canUndo() ?? false;
  const canRedo = editorApi.current?.canRedo() ?? false;

  // Preview, duration and saving read the whole document; the editor's
  // diagnostics follow the active tab alone (its line numbers).
  const parsed = useMemo(() => parseRutina(doc, { catalog }), [doc, catalog]);
  const parsedTab = useMemo(() => parseRutina(value, { catalog }), [value, catalog]);
  const format = parsed.main?.format ?? 'for_time';

  const previewModel = useMemo(
    () => previewFrom(parsed, type, type === 'video' && !!videoAssetId, blockMode),
    [parsed, type, videoAssetId, blockMode],
  );


  const mainFormats = parsed.blocks
    .filter((b) => b.section === 'main' && b.kind === 'part' && b.format)
    .map((b) => FORMAT_LABEL[b.format!.format]);
  // Estimated on the fly from the text; the API stores the same number on save.
  const estimatedSeconds =
    type === 'video' ? (workout?.videoDurationSeconds ?? null) : estimateDurationSeconds(toWorkoutInput(parsed).blocks);
  const durationLabel = estimatedSeconds ? `${Math.ceil(estimatedSeconds / 60)} min` : null;
  const weekCount = Math.ceil(days.length / 7);
  const metaLine = [
    skillMode
      ? `${tabs.length + 1} nivel${tabs.length ? 'es' : ''}`
      : programMode
        ? `${weekCount} semana${weekCount === 1 ? '' : 's'}`
        : type === 'video'
          ? 'Video'
          : mainFormats.length
            ? mainFormats.join(' + ')
            : FORMAT_LABEL[format],
    skillMode || programMode ? null : durationLabel,
    es.difficulty[difficulty],
  ]
    .filter(Boolean)
    .join(' · ');

  // ---- Saved blocks + other rutinas as suggestions ---------------------------
  const blocksQ = useQuery({
    queryKey: ['reusable-blocks', 'all'],
    queryFn: () => api.reusableBlocks.list({ pageSize: 200 }),
  });
  const rutinasQ = useQuery({
    queryKey: ['workouts', 'suggest'],
    queryFn: () => api.workouts.list({ pageSize: 200 }),
  });
  const extras = useMemo<CompletionExtra[]>(
    () => [
      { kind: 'template', items: TEMPLATES.map((t) => ({ id: t.id, name: t.title })) },
      { kind: 'block', items: (blocksQ.data?.data ?? []).map((sn) => ({ id: sn.id, name: sn.name })) },
      {
        kind: 'rutina',
        items: (rutinasQ.data?.data ?? [])
          .filter((w) => w.id !== workout?.id && w.type === 'structured')
          .map((w) => ({ id: w.id, name: w.name })),
      },
    ],
    [blocksQ.data, rutinasQ.data, workout?.id],
  );
  // The "+" menu in the gutter: the same things, grouped and described.
  const inserts = useMemo<InsertGroup[]>(
    () => [
      { kind: 'template', title: 'Plantillas', items: TEMPLATES.map((t) => ({ id: t.id, title: t.title, desc: t.desc })) },
      {
        kind: 'block',
        title: 'Bloques reutilizables',
        items: (blocksQ.data?.data ?? []).map((sn) => ({ id: sn.id, title: sn.name })),
      },
      {
        kind: 'rutina',
        title: 'Rutinas',
        items: (rutinasQ.data?.data ?? [])
          .filter((w) => w.id !== workout?.id && w.type === 'structured')
          .map((w) => ({ id: w.id, title: w.name })),
      },
    ],
    [blocksQ.data, rutinasQ.data, workout?.id],
  );
  const insertBlock = async (kind: InsertKind, id: string): Promise<string | null> => {
    if (kind === 'template') return TEMPLATES.find((t) => t.id === id)?.text ?? null;
    if (kind === 'block') return blocksQ.data?.data.find((sn) => sn.id === id)?.text ?? null;
    const src = await api.workouts.get(id);
    // Another rutina's main section, as written (its parts included).
    return serializeRutina({ blocks: src.blocks.filter((b) => b.section === 'main') }, catalog).replace(/\s+$/, '');
  };
  const createBlock = useMutation({
    mutationFn: (args: { name: string; text: string }) => api.reusableBlocks.create(args),
    onSuccess: (sn) => {
      qc.invalidateQueries({ queryKey: ['reusable-blocks'] });
      setBlockModal(null);
      toast(`Bloque reutilizable: ${sn.name}`);
    },
    onError: (e) => toast(e instanceof Error ? e.message : es.app.error, 'error'),
  });

  const titleCase = (s: string) => s.trim().replace(/^\p{L}/u, (c) => c.toUpperCase());

  // ---- Save -----------------------------------------------------------------
  // The payload for one version's sections; metadata is shared by base and variants.
  const payloadFor = (secs: SectionTexts, variant: { ofId: string; label: string } | null): CreateWorkoutInput => {
    const structured = type === 'structured';
    const tabText = joinSections(secs);
    const structure = structured ? toWorkoutInput(parseRutina(tabText, { catalog })) : null;
    return {
      name,
      description: description || null,
      type,
      format: structure?.format ?? null,
      sourceText: structured ? tabText : null,
      difficulty,
      status,
      thumbnailAssetId,
      videoAssetId: structured ? null : videoAssetId,
      variantOfId: variant?.ofId ?? null,
      variantLabel: variant ? variant.label : baseLabel.trim() || null,
      blocks: structure?.blocks ?? [],
    };
  };
  const saveBlock = useMutation({
    mutationFn: async () => {
      const input = { name: name.trim(), text: (sections ?? EMPTY_SECTIONS).main.replace(/\s+$/, '') + '\n' };
      return block ? api.reusableBlocks.update(block.id, input) : api.reusableBlocks.create(input);
    },
    onSuccess: (saved) => {
      setBaseline({ ...currentRef.current });
      qc.setQueryData(['reusable-block', saved.id], saved);
      qc.invalidateQueries({ queryKey: ['reusable-blocks'] });
      toast('Bloque reutilizable');
      if (!block) router.replace(`/bloques/${saved.id}`);
    },
    onError: (e) => toast(e instanceof Error ? e.message : es.app.error, 'error'),
  });
  // A skill: every tab is a level with its own rutina (text + structure) and
  // the goals parsed from its "Objetivo" section.
  const levelPayload = (id: string | null, label: string, secs: SectionTexts, index: number): SkillLevelInput => {
    const text = joinSections(secs);
    const parsed = parseRutina(text, { catalog });
    const structure = toWorkoutInput(parsed);
    return {
      id: id ?? undefined,
      name: label.trim() || `Nivel ${index + 1}`,
      sourceText: text,
      format: structure.format,
      blocks: structure.blocks,
      unlockGoals: goalsFrom(parsed),
    };
  };
  const saveSkill = useMutation({
    mutationFn: async () => {
      const levels = [
        levelPayload(baseLevelId, baseLabel, sections ?? EMPTY_SECTIONS, 0),
        ...tabs.map((t, i) => levelPayload(t.id, t.label, t.sections, i + 1)),
      ];
      const input = { name: name.trim(), description: description || null, difficulty, status, thumbnailAssetId, levels };
      return skill ? api.skills.update(skill.id, input) : api.skills.create(input);
    },
    onSuccess: (saved) => {
      // The server assigns ids to new levels; keep the texts as edited.
      const first = saved.levels[0];
      setBaseLevelId(first?.id ?? null);
      const rest = saved.levels.slice(1).map((l, i) => ({ id: l.id, label: l.name, sections: tabs[i]?.sections ?? splitSections(l.sourceText) }));
      setVariants(rest);
      setRemovedVariantIds([]);
      setBaseline({ ...currentRef.current, variants: rest });
      qc.setQueryData(['skill', saved.id], saved);
      qc.invalidateQueries({ queryKey: ['skills'] });
      qc.invalidateQueries({ queryKey: ['workouts'] });
      toast('Habilidad guardada');
      if (!skill) router.replace(`${basePath}/${saved.id}`);
    },
    onError: (e) => toast(e instanceof Error ? e.message : es.app.error, 'error'),
  });
  // A program: every day is a rutina (text + structure, or a video) owned by it.
  const dayPayload = (d: DayState): ProgramDayInput => {
    const structured = d.type === 'structured';
    const text = joinSections(d.sections);
    const structure = structured && !d.isRestDay ? toWorkoutInput(parseRutina(text, { catalog })) : null;
    return {
      id: d.id ?? undefined,
      isRestDay: d.isRestDay,
      type: d.type,
      sourceText: structured ? text : null,
      format: structure?.format ?? null,
      blocks: structure?.blocks ?? [],
      videoAssetId: structured ? null : d.videoAssetId,
    };
  };
  const saveProgram = useMutation({
    mutationFn: async () => {
      const input = { name: name.trim(), description: description || null, difficulty, status, thumbnailAssetId, days: days.map(dayPayload) };
      return program ? api.programs.update(program.id, input) : api.programs.create(input);
    },
    onSuccess: (saved) => {
      // The server assigns ids to new days; keep the texts as edited.
      const next = days.map((d, i) => ({ ...d, id: saved.days[i]?.id ?? d.id }));
      setDays(next);
      setBaseline({ ...currentRef.current, days: next });
      qc.setQueryData(['program', saved.id], saved);
      qc.invalidateQueries({ queryKey: ['programs'] });
      qc.invalidateQueries({ queryKey: ['workouts'] });
      toast('Programa guardado');
      if (!program) router.replace(`${basePath}/${saved.id}`);
    },
    onError: (e) => toast(e instanceof Error ? e.message : es.app.error, 'error'),
  });
  const save = useMutation({
    mutationFn: async () => {
      const basePayload = payloadFor(sections ?? EMPTY_SECTIONS, null);
      const saved = workout ? await api.workouts.update(workout.id, basePayload) : await api.workouts.create(basePayload);
      // Variants: create the new ones, update the rest, drop the removed.
      const savedVariants: VariantTab[] = [];
      for (const v of tabs) {
        const p = payloadFor(v.sections, { ofId: saved.id, label: v.label });
        const row = v.id ? await api.workouts.update(v.id, p) : await api.workouts.create(p);
        savedVariants.push({ id: row.id, label: v.label, sections: v.sections });
      }
      await Promise.all(removedVariantIds.map((id) => api.workouts.remove(id)));
      return { saved, savedVariants };
    },
    onSuccess: ({ saved, savedVariants }) => {
      setVariants(savedVariants);
      setRemovedVariantIds([]);
      setBaseline({ ...current, variants: savedVariants });
      qc.setQueryData(['workout', saved.id], { ...saved, variants: savedVariants.map((v) => ({ id: v.id, label: v.label })) });
      qc.invalidateQueries({ queryKey: ['workouts'] });
      qc.invalidateQueries({ queryKey: ['workout-refs'] });
      toast('Rutina guardada');
      if (!workout) router.replace(`${basePath}/${saved.id}`);
    },
    onError: (e) => toast(e instanceof Error ? e.message : es.app.error, 'error'),
  });

  // ---- Unsaved changes (Shopify-style bar) ----------------------------------
  // Everything "Guardar" sends, as one comparable snapshot. The baseline is
  // taken once the editor is ready and again after each successful save.
  type Snapshot = {
    name: string;
    description: string;
    difficulty: typeof difficulty;
    status: typeof status;
    thumbnailAssetId: string | null;
    videoAssetId: string | null;
    baseLabel: string;
    sections: SectionTexts;
    variants: VariantTab[];
    days: DayState[];
  };
  const current: Snapshot = {
    name,
    description,
    difficulty,
    status,
    thumbnailAssetId,
    videoAssetId: videoAssetIdState,
    baseLabel,
    sections: sections ?? EMPTY_SECTIONS,
    variants: tabs,
    days,
  };
  const [baseline, setBaseline] = useState<Snapshot | null>(null);
  const currentRef = useRef(current);
  currentRef.current = current;
  useEffect(() => {
    if (baseline === null && editorReady) setBaseline(currentRef.current);
  }, [baseline, editorReady]);
  const dirty = baseline !== null && (JSON.stringify(current) !== JSON.stringify(baseline) || removedVariantIds.length > 0);
  const discard = () => {
    if (isNew) {
      router.push(basePath);
      return;
    }
    if (!baseline) return;
    setName(baseline.name);
    setDescription(baseline.description);
    setDifficulty(baseline.difficulty);
    setStatus(baseline.status);
    setThumbnailAssetId(baseline.thumbnailAssetId);
    setVideoAssetIdState(baseline.videoAssetId);
    setBaseLabel(baseline.baseLabel);
    setSections(baseline.sections);
    setVariants(baseline.variants);
    setDays(baseline.days);
    setRemovedVariantIds([]);
    setActiveTab((t) => Math.min(t, baseline.variants.length));
    setActiveDay((d) => Math.min(d, Math.max(0, baseline.days.length - 1)));
  };
  // Save / discard bar, ⌘S, navigation guard (shared with the exercise form).
  const doSaveRef = useRef<() => void>(() => {});
  const { bar: unsavedBar, guardNav, shake: shakeBar } = useUnsavedChanges({
    dirty,
    saving: save.isPending || saveBlock.isPending || saveSkill.isPending || saveProgram.isPending,
    onSave: () => doSaveRef.current(),
    onDiscard: discard,
    canSave: type !== 'structured' || editorReady,
  });

  const doSave = () => {
    if (!name.trim()) {
      setNameError(true);
      return;
    }
    setNameError(false);
    if (programMode) {
      for (let i = 0; i < days.length; i += 1) {
        const d = days[i]!;
        if (d.isRestDay) continue;
        if (d.type === 'structured') {
          const p = parseRutina(joinSections(d.sections), { catalog });
          const errors = p.diagnostics.filter((x) => x.severity === 'error');
          if (errors.length) {
            setActiveDay(i);
            setActiveSection(p.lines[errors[0]!.line]?.section ?? 'main');
            toast(`${errors.length === 1 ? 'Hay 1 línea con error' : `Hay ${errors.length} líneas con error`} en «${dayLabel(i)}». Corrígelo antes de guardar.`, 'error');
            shakeBar();
            return;
          }
        }
        // A published program can't have a day with nothing in it: write it or make it a rest day.
        if (status === 'published' && !dayHasContent(d)) {
          setActiveDay(i);
          toast(`«${dayLabel(i)}» está vacío. Escribe su rutina, elige un video o márcalo como descanso antes de publicar.`, 'error');
          shakeBar();
          return;
        }
      }
      saveProgram.mutate();
      return;
    }
    if (type === 'structured') {
      const all = [{ label: baseLabel.trim() || (skillMode ? 'Nivel 1' : 'Principal'), sections: sections ?? EMPTY_SECTIONS }, ...tabs];
      for (let i = 0; i < all.length; i += 1) {
        const p = parseRutina(joinSections(all[i]!.sections), { catalog });
        const errors = p.diagnostics.filter((d) => d.severity === 'error');
        const n = errors.length;
        if (n > 0) {
          setActiveTab(i);
          setActiveSection(p.lines[errors[0]!.line]?.section ?? 'main');
          // Not saved: a toast says why and the bar shakes, like a blocked navigation.
          toast(
            (n === 1 ? 'Hay 1 línea con error' : `Hay ${n} líneas con error`) +
              (all.length > 1 ? ` en «${all[i]!.label}»` : '') +
              '. Corrígelo antes de guardar.',
            'error',
          );
          shakeBar();
          return;
        }
      }
    }
    if (skillMode) {
      // Every level but the last needs a way to unlock the next one.
      const all = [{ label: baseLabel, sections: sections ?? EMPTY_SECTIONS }, ...tabs];
      for (let i = 0; i < all.length - 1; i += 1) {
        const goals = goalsFrom(parseRutina(joinSections(all[i]!.sections), { catalog }));
        if (!goals.length) {
          setActiveTab(i);
          setActiveSection('goal');
          toast(`El nivel «${all[i]!.label || `Nivel ${i + 1}`}» no tiene objetivo: nadie podría pasar al siguiente. Escríbelo en su pestaña Objetivo.`, 'error');
          shakeBar();
          return;
        }
      }
    }
    if (blockMode) saveBlock.mutate();
    else if (skillMode) saveSkill.mutate();
    else save.mutate();
  };
  doSaveRef.current = doSave;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {unsavedBar}
      {/* Header */}
      <header className="flex items-start justify-between gap-6 border-b border-line bg-surface px-7 pb-4 pt-5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center gap-2 font-mono text-xs font-medium text-muted">
            <button type="button" onClick={() => guardNav(() => router.push(basePath))} className="hover:text-ink-2">
              {listTitle}
            </button>
            <span>/</span>
            <span className="text-ink-2">{isNew ? (blockMode ? 'Nuevo' : 'Nueva') : 'Editar'}</span>
          </div>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (nameError) setNameError(false);
            }}
            placeholder={newLabel}
            className={cn(
              'w-full max-w-2xl bg-transparent text-[26px] font-bold tracking-[-0.02em] focus:outline-none',
              nameError ? 'placeholder:text-accent-dark' : 'placeholder:text-faint',
            )}
          />
          {nameError && (
            <span className="text-xs font-medium text-accent-dark">{es.app.nameRequired}</span>
          )}
          <div className="flex items-center gap-2">
            {blockMode ? (
              <span className="font-mono text-xs font-medium text-muted">
                Bloque reutilizable · aparece como sugerencia al escribir su nombre
              </span>
            ) : (
              <>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                  style={{ background: '#fdf0d9', color: '#8a5a12' }}
                >
                  {es.status[status]}
                </span>
                <span className="font-mono text-xs font-medium text-muted">{metaLine}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Button type="button" variant="outline" onClick={() => setGuideOpen(true)}>
            Guía
          </Button>
          {!blockMode && (
            <Button type="button" variant="outline" onClick={() => setSettingsOpen(true)}>
              Ajustes
            </Button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Left: the editor, VS Code style (tab bar · editor · problems) */}
        {programMode && activeDayState ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
            <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface-2/60 px-3 py-1.5">
              <WeekStrip
                days={days}
                active={activeDay}
                onSelect={setActiveDay}
                onMove={moveDay}
                onAddWeek={addWeek}
                onDuplicateWeek={duplicateWeek}
                onRemoveWeek={removeWeek}
              />
              <span className="hidden h-5 w-px bg-line-2 sm:block" />
              {/* What the day is */}
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="shrink-0 font-mono text-[11px] text-ink-2">
                  <span className="font-semibold">{dayLabel(activeDay)}</span> · {WEEKDAYS[activeDay % 7]}
                </span>
                <span className="flex-1" />
                <div className="flex shrink-0 items-center rounded-md border border-line-2 bg-surface p-0.5 font-mono text-[11px]">
                  {(
                    [
                      { id: 'structured', label: es.workouts.types.structured, on: !activeDayState.isRestDay && activeDayState.type === 'structured' },
                      { id: 'video', label: es.workouts.types.video, on: !activeDayState.isRestDay && activeDayState.type === 'video' },
                      { id: 'rest', label: es.programs.restDay, on: activeDayState.isRestDay },
                    ] as const
                  ).map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setDay(activeDay, o.id === 'rest' ? { isRestDay: true } : { isRestDay: false, type: o.id })}
                      className={cn('rounded px-2 py-1', o.on ? 'bg-ink text-white' : 'text-ink-3 hover:text-ink')}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {activeDayState.isRestDay ? (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 text-center" style={{ background: HATCH }}>
                <span className="text-[15px] font-bold text-ink-2">Día de descanso</span>
                <p className="text-[12px] text-muted">El usuario verá «Descanso» en este día.</p>
              </div>
            ) : type === 'structured' ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
            {/* Tab bar: base + variants (+), undo/redo on the right */}
            <div className="flex h-9 shrink-0 items-stretch border-b border-line bg-surface-2">
              {(blockMode ? (['main'] as const) : skillMode ? (['main', 'warmup', 'cooldown', 'goal'] as const) : (['main', 'warmup', 'cooldown'] as const)).map((sec) => {
                const empty = !activeSections[sec].trim();
                return (
                  <div
                    key={sec}
                    onClick={() => setActiveSection(sec)}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 border-r border-line px-4 font-mono text-[12px]',
                      activeSection === sec
                        ? 'bg-surface text-ink shadow-[inset_0_-2px_0_var(--color-accent)]'
                        : empty
                          ? 'text-faint-2 hover:bg-surface-3 hover:text-ink-2'
                          : 'text-ink-3 hover:bg-surface-3 hover:text-ink-2',
                    )}
                  >
                    {blockMode ? 'Bloque' : SECTION_TAB[sec]}
                  </div>
                );
              })}
              <span className="flex-1" />
              <div className="flex items-center gap-0.5 px-2">
                <button
                  type="button"
                  onClick={() => editorApi.current?.undo()}
                  disabled={!canUndo}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-3 hover:bg-surface-3 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
                  title="Deshacer (⌘Z / Ctrl+Z)"
                  aria-label="Deshacer"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7v6h6" />
                    <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => editorApi.current?.redo()}
                  disabled={!canRedo}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-3 hover:bg-surface-3 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
                  title="Rehacer (⇧⌘Z / Ctrl+Y)"
                  aria-label="Rehacer"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 7v6h-6" />
                    <path d="M3 17a9 9 0 0 1 15-6.7L21 13" />
                  </svg>
                </button>
              </div>
              {!blockMode && !programMode && (
                <div ref={versionRef} className="relative mr-2 flex items-center border-l border-line pl-2">
                  <button
                    type="button"
                    onClick={() => setVersionOpen((o) => !o)}
                    disabled={!editorReady}
                    className={cn(
                      'inline-flex h-7 items-center gap-1.5 rounded-md px-2 font-mono text-[11px] hover:bg-surface-3 disabled:opacity-40',
                      versionOpen ? 'bg-surface-3 text-ink' : 'text-ink-2',
                    )}
                    title={skillMode ? 'Nivel de la habilidad' : 'Versión de la rutina (sus tres pestañas)'}
                  >
                    {!skillMode && <span className="text-muted">Versión</span>}
                    <span className="font-semibold text-ink">{versionList[activeTab]?.label || 'Sin nombre'}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-3">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  {versionOpen && (
                    <div className="absolute right-0 top-full z-20 mt-1 w-80 rounded-xl border border-line-2 bg-surface p-1 shadow-[0_12px_32px_-10px_rgba(0,0,0,0.25)]">
                      {versionList.map((t, i) => (
                        <div
                          key={t.id}
                          draggable={skillMode && versionList.length > 1 && renaming?.index !== i}
                          onDragStart={(e) => {
                            setDragFrom(i);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragOver={(e) => {
                            if (dragFromRef.current === null) return;
                            e.preventDefault();
                            setDragOver((o) => (o === i ? o : i));
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (dragFromRef.current !== null) moveTab(dragFromRef.current, i);
                            setDragFrom(null);
                            setDragOver(null);
                          }}
                          onDragEnd={() => {
                            setDragFrom(null);
                            setDragOver(null);
                          }}
                          className={cn(
                            'group flex items-center gap-1 rounded-lg pl-1.5 pr-1 text-[13px]',
                            activeTab === i ? 'bg-accent-tint text-accent-dark' : 'text-ink-2 hover:bg-surface-2',
                            dragFrom === i && 'opacity-40',
                            dragOver === i && dragFrom !== null && dragFrom !== i && (dragFrom < i ? 'shadow-[inset_0_-2px_0_var(--color-accent)]' : 'shadow-[inset_0_2px_0_var(--color-accent)]'),
                          )}
                        >
                          {skillMode && (
                            <span className="cursor-grab select-none px-0.5 font-mono text-[12px] leading-none text-faint-2 active:cursor-grabbing" title="Arrastra para reordenar" aria-hidden>
                              ⋮⋮
                            </span>
                          )}
                          {renaming?.index === i ? (
                            <>
                              <input
                                autoFocus
                                value={renaming.label}
                                onChange={(e) => setRenaming({ index: i, label: e.target.value })}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    commitRename();
                                  } else if (e.key === 'Escape') {
                                    e.stopPropagation();
                                    setRenaming(null);
                                  }
                                }}
                                placeholder={skillMode ? 'Nombre del nivel' : i === 0 ? 'Principal' : 'Nombre'}
                                className="my-1 h-7 min-w-0 flex-1 rounded-md border border-accent bg-surface px-2 text-[13px] font-semibold text-ink focus:outline-none"
                              />
                              <button type="button" onClick={commitRename} className="rounded px-1.5 py-1 text-[13px] font-bold text-accent-dark hover:bg-accent-tint" title="Guardar (Enter)" aria-label="Guardar nombre">
                                ✓
                              </button>
                              <button type="button" onClick={() => setRenaming(null)} className="rounded px-1.5 py-1 text-[13px] text-faint-2 hover:text-ink" title="Cancelar (Esc)" aria-label="Cancelar">
                                ✕
                              </button>
                            </>
                          ) : confirmingRemove === i ? (
                            <>
                              <span className="min-w-0 flex-1 truncate py-1.5 text-[13px] text-ink-2">¿Eliminar «{t.label || 'Sin nombre'}»?</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmingRemove(null);
                                  removeTab(i);
                                }}
                                className="rounded-md bg-accent-dark px-2 py-1 text-[12px] font-semibold text-white hover:opacity-90"
                              >
                                Eliminar
                              </button>
                              <button type="button" onClick={() => setConfirmingRemove(null)} className="rounded px-1.5 py-1 text-[13px] text-faint-2 hover:text-ink" title="Cancelar" aria-label="Cancelar">
                                ✕
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab(i);
                                  setVersionOpen(false);
                                }}
                                onDoubleClick={() => setRenaming({ index: i, label: i === 0 ? baseLabel : t.label })}
                                className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
                              >
                                {!skillMode && <span className="w-3 font-mono text-[11px]">{activeTab === i ? '✓' : ''}</span>}
                                <span className="truncate font-semibold">{t.label || 'Sin nombre'}</span>
                                {i === 0 && !skillMode && <span className="font-mono text-[10px] text-muted">base</span>}
                              </button>
                              <button
                                type="button"
                                onClick={() => setRenaming({ index: i, label: i === 0 ? baseLabel : t.label })}
                                className="rounded px-1 py-1 text-faint-2 opacity-0 hover:text-ink group-hover:opacity-100"
                                title={i === 0 && !skillMode ? 'Nombrar el nivel de la versión principal' : 'Renombrar'}
                                aria-label="Renombrar"
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M12 20h9" />
                                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                </svg>
                              </button>
                              {(i > 0 || (skillMode && versionList.length > 1)) && (
                                <button
                                  type="button"
                                  onClick={() => setConfirmingRemove(i)}
                                  className="rounded px-1 py-1 text-faint-2 opacity-0 hover:text-accent-dark group-hover:opacity-100"
                                  title={`Eliminar ${levelWord}`}
                                  aria-label={`Eliminar ${levelWord}`}
                                >
                                  ✕
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                      <div className="my-1 h-px bg-line-3" />
                      <button
                        type="button"
                        onClick={() => {
                          setVersionOpen(false);
                          setTabDialog({
                            mode: 'add',
                            index: tabs.length + 1,
                            label: skillMode ? `Nivel ${tabs.length + 2}` : tabs.length === 0 ? 'Escalada' : '',
                          });
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] font-semibold text-accent-dark hover:bg-accent-tint"
                      >
                        <span className="w-3 text-center">+</span>
                        {skillMode ? 'Nuevo nivel' : 'Nueva variante'}
                      </button>
                      <p className="px-2.5 pb-1 pt-1.5 text-[11px] leading-snug text-muted">
                        {skillMode
                          ? 'Cada nivel es una rutina con su objetivo. El nuevo copia el nivel activo; arrastra para reordenar.'
                          : 'Una versión es la rutina entera: sus tres pestañas. La nueva copia la versión activa.'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div ref={editorHost} className="min-h-0 flex-1">
              {!editorReady ? (
                <div className="px-4 py-10 text-center font-mono text-[12px] text-muted">{es.app.loading}</div>
              ) : (
                <RutinaTextEditor
                  key={`${programMode ? `day-${activeDay}` : activeTab === 0 ? 'base' : (activeVariant?.id ?? `new-${activeTab}`)}-${activeSection}`}
                  value={value}
                  onChange={setValue}
                  onlyExercises={activeSection === 'goal'}
                  catalog={catalog}
                  parsed={parsedTab}
                  placeholder={activeSection === 'goal' ? GOAL_PLACEHOLDER : PLACEHOLDER}
                  autoFocus={isNew}
                  extras={extras}
                  inserts={inserts}
                  onInsertBlock={insertBlock}
                  onSaveBlock={
                    blockMode
                      ? undefined
                      : (t) => {
                          setBlockModal({ name: '', text: t.trim() });
                        }
                  }
                  apiRef={editorApi}
                  onCreateExercise={(n) => setNewExercise({ name: titleCase(n) })}
                  onEditExercise={setEditExerciseId}
                  className="h-full"
                />
              )}
            </div>
          </div>
            ) : (
          <div className="flex min-w-0 flex-1 flex-col gap-3.5 overflow-y-auto px-7 py-5">
            <h2 className="mb-3 text-[15px] font-bold">{es.workouts.video}</h2>
            <div className="max-w-xl">
              <MediaField kind="video" label={es.workouts.video} value={videoAssetId} onChange={setVideoAssetId} />
            </div>
          </div>

            )}
          </div>
        ) : type === 'structured' ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
            {/* Tab bar: base + variants (+), undo/redo on the right */}
            <div className="flex h-9 shrink-0 items-stretch border-b border-line bg-surface-2">
              {(blockMode ? (['main'] as const) : skillMode ? (['main', 'warmup', 'cooldown', 'goal'] as const) : (['main', 'warmup', 'cooldown'] as const)).map((sec) => {
                const empty = !activeSections[sec].trim();
                return (
                  <div
                    key={sec}
                    onClick={() => setActiveSection(sec)}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 border-r border-line px-4 font-mono text-[12px]',
                      activeSection === sec
                        ? 'bg-surface text-ink shadow-[inset_0_-2px_0_var(--color-accent)]'
                        : empty
                          ? 'text-faint-2 hover:bg-surface-3 hover:text-ink-2'
                          : 'text-ink-3 hover:bg-surface-3 hover:text-ink-2',
                    )}
                  >
                    {blockMode ? 'Bloque' : SECTION_TAB[sec]}
                  </div>
                );
              })}
              <span className="flex-1" />
              <div className="flex items-center gap-0.5 px-2">
                <button
                  type="button"
                  onClick={() => editorApi.current?.undo()}
                  disabled={!canUndo}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-3 hover:bg-surface-3 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
                  title="Deshacer (⌘Z / Ctrl+Z)"
                  aria-label="Deshacer"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7v6h6" />
                    <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => editorApi.current?.redo()}
                  disabled={!canRedo}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-3 hover:bg-surface-3 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
                  title="Rehacer (⇧⌘Z / Ctrl+Y)"
                  aria-label="Rehacer"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 7v6h-6" />
                    <path d="M3 17a9 9 0 0 1 15-6.7L21 13" />
                  </svg>
                </button>
              </div>
              {!blockMode && !programMode && (
                <div ref={versionRef} className="relative mr-2 flex items-center border-l border-line pl-2">
                  <button
                    type="button"
                    onClick={() => setVersionOpen((o) => !o)}
                    disabled={!editorReady}
                    className={cn(
                      'inline-flex h-7 items-center gap-1.5 rounded-md px-2 font-mono text-[11px] hover:bg-surface-3 disabled:opacity-40',
                      versionOpen ? 'bg-surface-3 text-ink' : 'text-ink-2',
                    )}
                    title={skillMode ? 'Nivel de la habilidad' : 'Versión de la rutina (sus tres pestañas)'}
                  >
                    {!skillMode && <span className="text-muted">Versión</span>}
                    <span className="font-semibold text-ink">{versionList[activeTab]?.label || 'Sin nombre'}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-3">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  {versionOpen && (
                    <div className="absolute right-0 top-full z-20 mt-1 w-80 rounded-xl border border-line-2 bg-surface p-1 shadow-[0_12px_32px_-10px_rgba(0,0,0,0.25)]">
                      {versionList.map((t, i) => (
                        <div
                          key={t.id}
                          draggable={skillMode && versionList.length > 1 && renaming?.index !== i}
                          onDragStart={(e) => {
                            setDragFrom(i);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragOver={(e) => {
                            if (dragFromRef.current === null) return;
                            e.preventDefault();
                            setDragOver((o) => (o === i ? o : i));
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (dragFromRef.current !== null) moveTab(dragFromRef.current, i);
                            setDragFrom(null);
                            setDragOver(null);
                          }}
                          onDragEnd={() => {
                            setDragFrom(null);
                            setDragOver(null);
                          }}
                          className={cn(
                            'group flex items-center gap-1 rounded-lg pl-1.5 pr-1 text-[13px]',
                            activeTab === i ? 'bg-accent-tint text-accent-dark' : 'text-ink-2 hover:bg-surface-2',
                            dragFrom === i && 'opacity-40',
                            dragOver === i && dragFrom !== null && dragFrom !== i && (dragFrom < i ? 'shadow-[inset_0_-2px_0_var(--color-accent)]' : 'shadow-[inset_0_2px_0_var(--color-accent)]'),
                          )}
                        >
                          {skillMode && (
                            <span className="cursor-grab select-none px-0.5 font-mono text-[12px] leading-none text-faint-2 active:cursor-grabbing" title="Arrastra para reordenar" aria-hidden>
                              ⋮⋮
                            </span>
                          )}
                          {renaming?.index === i ? (
                            <>
                              <input
                                autoFocus
                                value={renaming.label}
                                onChange={(e) => setRenaming({ index: i, label: e.target.value })}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    commitRename();
                                  } else if (e.key === 'Escape') {
                                    e.stopPropagation();
                                    setRenaming(null);
                                  }
                                }}
                                placeholder={skillMode ? 'Nombre del nivel' : i === 0 ? 'Principal' : 'Nombre'}
                                className="my-1 h-7 min-w-0 flex-1 rounded-md border border-accent bg-surface px-2 text-[13px] font-semibold text-ink focus:outline-none"
                              />
                              <button type="button" onClick={commitRename} className="rounded px-1.5 py-1 text-[13px] font-bold text-accent-dark hover:bg-accent-tint" title="Guardar (Enter)" aria-label="Guardar nombre">
                                ✓
                              </button>
                              <button type="button" onClick={() => setRenaming(null)} className="rounded px-1.5 py-1 text-[13px] text-faint-2 hover:text-ink" title="Cancelar (Esc)" aria-label="Cancelar">
                                ✕
                              </button>
                            </>
                          ) : confirmingRemove === i ? (
                            <>
                              <span className="min-w-0 flex-1 truncate py-1.5 text-[13px] text-ink-2">¿Eliminar «{t.label || 'Sin nombre'}»?</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmingRemove(null);
                                  removeTab(i);
                                }}
                                className="rounded-md bg-accent-dark px-2 py-1 text-[12px] font-semibold text-white hover:opacity-90"
                              >
                                Eliminar
                              </button>
                              <button type="button" onClick={() => setConfirmingRemove(null)} className="rounded px-1.5 py-1 text-[13px] text-faint-2 hover:text-ink" title="Cancelar" aria-label="Cancelar">
                                ✕
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab(i);
                                  setVersionOpen(false);
                                }}
                                onDoubleClick={() => setRenaming({ index: i, label: i === 0 ? baseLabel : t.label })}
                                className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
                              >
                                {!skillMode && <span className="w-3 font-mono text-[11px]">{activeTab === i ? '✓' : ''}</span>}
                                <span className="truncate font-semibold">{t.label || 'Sin nombre'}</span>
                                {i === 0 && !skillMode && <span className="font-mono text-[10px] text-muted">base</span>}
                              </button>
                              <button
                                type="button"
                                onClick={() => setRenaming({ index: i, label: i === 0 ? baseLabel : t.label })}
                                className="rounded px-1 py-1 text-faint-2 opacity-0 hover:text-ink group-hover:opacity-100"
                                title={i === 0 && !skillMode ? 'Nombrar el nivel de la versión principal' : 'Renombrar'}
                                aria-label="Renombrar"
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M12 20h9" />
                                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                </svg>
                              </button>
                              {(i > 0 || (skillMode && versionList.length > 1)) && (
                                <button
                                  type="button"
                                  onClick={() => setConfirmingRemove(i)}
                                  className="rounded px-1 py-1 text-faint-2 opacity-0 hover:text-accent-dark group-hover:opacity-100"
                                  title={`Eliminar ${levelWord}`}
                                  aria-label={`Eliminar ${levelWord}`}
                                >
                                  ✕
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                      <div className="my-1 h-px bg-line-3" />
                      <button
                        type="button"
                        onClick={() => {
                          setVersionOpen(false);
                          setTabDialog({
                            mode: 'add',
                            index: tabs.length + 1,
                            label: skillMode ? `Nivel ${tabs.length + 2}` : tabs.length === 0 ? 'Escalada' : '',
                          });
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] font-semibold text-accent-dark hover:bg-accent-tint"
                      >
                        <span className="w-3 text-center">+</span>
                        {skillMode ? 'Nuevo nivel' : 'Nueva variante'}
                      </button>
                      <p className="px-2.5 pb-1 pt-1.5 text-[11px] leading-snug text-muted">
                        {skillMode
                          ? 'Cada nivel es una rutina con su objetivo. El nuevo copia el nivel activo; arrastra para reordenar.'
                          : 'Una versión es la rutina entera: sus tres pestañas. La nueva copia la versión activa.'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div ref={editorHost} className="min-h-0 flex-1">
              {!editorReady ? (
                <div className="px-4 py-10 text-center font-mono text-[12px] text-muted">{es.app.loading}</div>
              ) : (
                <RutinaTextEditor
                  key={`${programMode ? `day-${activeDay}` : activeTab === 0 ? 'base' : (activeVariant?.id ?? `new-${activeTab}`)}-${activeSection}`}
                  value={value}
                  onChange={setValue}
                  onlyExercises={activeSection === 'goal'}
                  catalog={catalog}
                  parsed={parsedTab}
                  placeholder={activeSection === 'goal' ? GOAL_PLACEHOLDER : PLACEHOLDER}
                  autoFocus={isNew}
                  extras={extras}
                  inserts={inserts}
                  onInsertBlock={insertBlock}
                  onSaveBlock={
                    blockMode
                      ? undefined
                      : (t) => {
                          setBlockModal({ name: '', text: t.trim() });
                        }
                  }
                  apiRef={editorApi}
                  onCreateExercise={(n) => setNewExercise({ name: titleCase(n) })}
                  onEditExercise={setEditExerciseId}
                  className="h-full"
                />
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col gap-3.5 overflow-y-auto px-7 py-5">
            <h2 className="mb-3 text-[15px] font-bold">{es.workouts.video}</h2>
            <div className="max-w-xl">
              <MediaField kind="video" label={es.workouts.video} value={videoAssetId} onChange={setVideoAssetId} />
            </div>
          </div>

        )}
          {/* Right: live athlete-facing preview */}
          <aside className="flex w-full shrink-0 flex-col gap-3 overflow-y-auto border-t border-line bg-surface px-[22px] py-[22px] lg:w-[360px] lg:border-l lg:border-t-0">
            <RutinaPreview model={previewModel} name={programMode ? dayLabel(activeDay) : name} />
            {programMode && (
              <p className="font-mono text-[11px] text-muted">
                {es.programs.week} {Math.floor(activeDay / 7) + 1} · {WEEKDAYS[activeDay % 7]} · {es.programs.day} {activeDay + 1} de «{name || newLabel}».
              </p>
            )}
            {activeTab > 0 && activeVariant && (
              <p className="font-mono text-[11px] text-muted">Mostrando {skillMode ? 'el nivel' : 'la variante'} «{activeVariant.label}».</p>
            )}
          </aside>
      </div>

      <Dialog
        open={tabDialog !== null}
        onClose={() => setTabDialog(null)}
        title={tabDialog?.mode === 'add' ? (skillMode ? 'Nuevo nivel' : 'Nueva variante') : skillMode ? 'Nombre del nivel' : 'Nombre del nivel'}
        className="max-w-sm"
      >
        <div className="flex flex-col gap-4 p-5">
          <div>
            <div className="mb-1.5 text-[13px] font-semibold text-ink-2">Nombre</div>
            <Input
              autoFocus
              value={tabDialog?.label ?? ''}
              onChange={(e) => setTabDialog((d) => (d ? { ...d, label: e.target.value } : d))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tabDialog && (tabDialog.mode === 'rename' || tabDialog.label.trim())) {
                  // The editor that opens next must not receive this Enter as a line break.
                  e.preventDefault();
                  if (tabDialog.mode === 'add') addVariant(tabDialog.label.trim());
                  else renameTab(tabDialog.index, tabDialog.label.trim());
                  setTabDialog(null);
                }
              }}
              placeholder={skillMode ? 'p. ej. Negativas, Primera dominada' : tabDialog?.mode === 'add' ? 'p. ej. Escalada, Principiante' : 'p. ej. RX'}
            />
            <p className="mt-2 text-[12px] leading-snug text-muted">
              {skillMode
                ? 'Así verá el usuario este nivel en la app.'
                : tabDialog?.mode === 'add'
                  ? 'Se crea copiando la versión activa (sus tres pestañas). En la app el usuario elige el nivel antes de empezar.'
                  : 'Así verá el usuario este nivel en la app. Déjalo vacío para "Principal".'}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setTabDialog(null)}>
              {es.app.cancel}
            </Button>
            <Button
              type="button"
              disabled={tabDialog?.mode === 'add' && !tabDialog.label.trim()}
              onClick={() => {
                if (!tabDialog) return;
                if (tabDialog.mode === 'add') addVariant(tabDialog.label.trim());
                else renameTab(tabDialog.index, tabDialog.label.trim());
                setTabDialog(null);
              }}
            >
              {tabDialog?.mode === 'add' ? 'Crear' : es.app.save}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={createOpen}
        onClose={() => router.push(basePath)}
        title={newLabel}
        className="max-w-md"
      >
        <div className="flex flex-col gap-4 p-5">
          <div>
            <div className="mb-1.5 text-[13px] font-semibold text-ink-2">{es.exercises.fields.name}</div>
            <Input
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim()) setCreateOpen(false);
              }}
              placeholder={blockMode ? 'p. ej. Core express' : skillMode ? 'p. ej. Dominadas' : programMode ? 'p. ej. Fuerza en 4 semanas' : 'p. ej. Murph'}
            />
          </div>
          {!blockMode && !skillMode && !programMode && (
            <div>
              <div className="mb-1.5 text-[13px] font-semibold text-ink-2">{es.workouts.type}</div>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { v: 'structured', desc: 'Ejercicios escritos en el editor' },
                    { v: 'video', desc: 'Una sola clase en video' },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setType(o.v)}
                    className={cn(
                      'flex flex-col gap-0.5 rounded-lg border px-3 py-2.5 text-left',
                      type === o.v ? 'border-accent bg-accent-tint/40' : 'border-line-2 bg-surface hover:bg-surface-2',
                    )}
                  >
                    <span className="text-[13px] font-bold text-ink">{es.workouts.types[o.v]}</span>
                    <span className="text-[11px] leading-snug text-ink-3">{o.desc}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted">El tipo no se puede cambiar después.</p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push(basePath)}>
              {es.app.cancel}
            </Button>
            <Button type="button" disabled={!name.trim()} onClick={() => setCreateOpen(false)}>
              Crear
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Guide drawer */}
      <RutinaGuide open={guideOpen} onClose={() => setGuideOpen(false)} skillMode={skillMode} programMode={programMode} />

      {/* Settings drawer */}
      {settingsOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setSettingsOpen(false)} />
          <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[380px] flex-col overflow-y-auto border-l border-line bg-surface shadow-[0_0_40px_-10px_rgba(0,0,0,0.35)]">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-5 py-4">
              <h3 className="text-[15px] font-bold">Ajustes</h3>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                aria-label="Cerrar"
                className="rounded p-1 text-ink-3 hover:bg-surface-3 hover:text-ink"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-col gap-[22px] p-5">
              <div className="flex flex-col gap-3">
                <div>
                  <div className="mb-1.5 text-[13px] font-semibold text-ink-2">{es.fields.status}</div>
                  <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                    {CONTENT_STATUS.map((s) => (
                      <option key={s} value={s}>
                        {es.status[s]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <div className="mb-1.5 text-[13px] font-semibold text-ink-2">{es.fields.description}</div>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="min-h-16 w-full rounded-lg border border-line-2 bg-surface px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {!blockMode && !skillMode && !programMode && (
                <div className="flex flex-col gap-2.5">
                  <MonoLabel>{es.workouts.type}</MonoLabel>
                  <div className="rounded-lg border border-line-2 bg-surface-2 px-3 py-2.5 text-xs font-semibold text-ink-2">
                    {es.workouts.types[type]}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="mb-1.5 text-[13px] font-semibold text-ink-2">{es.fields.difficulty}</div>
                  <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}>
                    {DIFFICULTY.map((d) => (
                      <option key={d} value={d}>
                        {es.difficulty[d]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <div className="mb-1.5 text-[13px] font-semibold text-ink-2">{es.workouts.duration}</div>
                  <div className="flex h-10 items-center rounded-lg border border-line bg-surface-2 px-3 font-mono text-[13px] text-ink-2">
                    {durationLabel ?? '—'}
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-ink-3">Se calcula sola a partir del texto.</p>
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                <MonoLabel>{es.fields.thumbnail}</MonoLabel>
                <MediaField kind="image" label={es.fields.thumbnail} value={thumbnailAssetId} onChange={setThumbnailAssetId} />
              </div>
            </div>
          </aside>
        </>
      )}

      <Dialog
        open={blockModal !== null}
        onClose={() => setBlockModal(null)}
        title="Guardar bloque reutilizable"
        className="max-w-lg"
      >
        <div className="flex flex-col gap-4 p-5">
          <div>
            <div className="mb-1.5 text-[13px] font-semibold text-ink-2">Nombre</div>
            <Input
              autoFocus
              value={blockModal?.name ?? ''}
              onChange={(e) => setBlockModal((m) => (m ? { ...m, name: e.target.value } : m))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && blockModal?.name.trim()) createBlock.mutate(blockModal);
              }}
              placeholder="p. ej. Core express"
            />
            <p className="mt-1.5 text-[12px] leading-snug text-muted">
              Escribe este nombre al inicio de una línea y el bloque aparecerá como sugerencia.
            </p>
          </div>
          <div>
            <div className="mb-1.5 text-[13px] font-semibold text-ink-2">Contenido</div>
            <textarea
              value={blockModal?.text ?? ''}
              onChange={(e) => setBlockModal((m) => (m ? { ...m, text: e.target.value } : m))}
              className="min-h-32 w-full rounded-lg border border-line-2 bg-surface px-3 py-2 font-mono text-[13px] leading-relaxed"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setBlockModal(null)}>
              {es.app.cancel}
            </Button>
            <Button
              type="button"
              onClick={() => blockModal && createBlock.mutate(blockModal)}
              disabled={createBlock.isPending || !blockModal?.name.trim() || !blockModal?.text.trim()}
            >
              {createBlock.isPending ? es.app.saving : es.app.save}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={editExerciseId !== null} onClose={() => setEditExerciseId(null)} title="Editar ejercicio" className="max-w-3xl">
        {editExerciseId && !editExerciseQ.data && <div className="p-8 text-center text-sm text-muted">{es.app.loading}</div>}
        {editExerciseId && editExerciseQ.data && (
          <ExerciseForm
            key={editExerciseQ.data.id}
            embedded
            exercise={editExerciseQ.data}
            onCancel={() => setEditExerciseId(null)}
            onSaved={(saved) => {
              const previous = editExerciseQ.data!;
              setEditExerciseId(null);
              qc.invalidateQueries({ queryKey: ['exercises'] });
              if (saved.name.trim() === previous.name.trim()) {
                toast(`Ejercicio guardado: ${saved.name}`);
                return;
              }
              // Renamed: the text still says the old name everywhere. Rewrite it in
              // every section of every version, and keep the old name as an alias so
              // other rutinas that use it keep resolving.
              const n = renameInTexts(previous.name, saved.name);
              const aliases = saved.aliases.map(fold);
              if (!aliases.includes(fold(previous.name))) {
                api.exercises
                  .update(saved.id, { aliases: [...saved.aliases, previous.name] })
                  .then(() => qc.invalidateQueries({ queryKey: ['exercises'] }))
                  .catch(() => undefined);
              }
              toast(n ? `Renombrado en ${n} línea${n === 1 ? '' : 's'} · «${previous.name}» queda como alias` : `Ejercicio guardado: ${saved.name}`);
            }}
          />
        )}
      </Dialog>

      <Dialog
        open={newExercise !== null}
        onClose={() => setNewExercise(null)}
        title="Crear ejercicio"
        className="max-w-3xl"
      >
        {newExercise && (
          <ExerciseForm
            embedded
            initialName={newExercise.name}
            onCancel={() => setNewExercise(null)}
            onSaved={(ex) => {
              setNewExercise(null);
              toast(`Ejercicio creado: ${ex.name}`);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}
