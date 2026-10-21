'use client';

// Rutina editor. The structure (format, sections, blocks, exercises) is written
// as text in the rutina notation and parsed live by @dmtx/core; everything
// else (name, status, difficulty, media) lives in the header + settings drawer.
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CONTENT_STATUS, DIFFICULTY } from '@dmtx/schemas';
import type { BlockSection, CreateWorkoutInput, ReusableBlock, Skill, SkillGoal, SkillLevelInput, Workout, WorkoutFormat } from '@dmtx/schemas';
import {
  Catalog,
  formatDistance,
  formatDuration,
  formatHeader,
  goalsFrom,
  loadText,
  parseRutina,
  pluralName,
  serializeRutina,
  tempoText,
  toWorkoutInput,
  type CompletionExtra,
  type ParsedBlock,
  type ParsedItem,
  type ParsedRutina,
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
import {
  RutinaPreview,
  type PvBlock,
  type PvItem,
  type PvModel,
  type PvSection,
} from '@/components/rutina-preview';

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

/** A level's goal as the athlete reads it: "3 Dominadas", "Plancha 60 s", "Sentadilla 5 reps @100 kg". */
export function skillGoalLabel(g: SkillGoal): string {
  if (g.metric === 'reps') return `${g.value} ${pluralName(g.exerciseName, g.value)}`;
  if (g.metric === 'time_seconds') return `${g.exerciseName} ${formatDuration(g.value)}`;
  if (g.metric === 'distance_meters') return `${formatDistance(g.value)} ${g.exerciseName}`;
  return `${g.exerciseName} ${g.reps ? `${g.reps} reps ` : ''}@${g.value} kg`;
}
const PLACEHOLDER = 'Escribe la rutina como en papel, o pulsa + para insertar una plantilla o un bloque reutilizable…';

// Complete reference shown in the right column.
type GuideRow = { k: string; v: string };
const GUIDE_SECTIONS: { title: string; rows: GuideRow[] }[] = [
  {
    title: 'Estructura',
    rows: [
      { k: 'AMRAP 12 min', v: 'una parte: su formato y, indentado debajo, su contenido. Puede haber varias partes seguidas' },
      { k: '41 burpees', v: 'un ejercicio por línea: cantidad + nombre' },
      { k: '3 rondas', v: 'bloque; sus ejercicios van indentados debajo (los dos puntos son opcionales)' },
      { k: 'Superserie', v: 'bloque tipo superserie (admite "Superserie 3 rondas")' },
      { k: '3 rondas, descanso 1 min:', v: 'descanso al final de cada ronda' },
      { k: 'descanso 90s', v: 'descanso suelto entre ejercicios' },
      { k: 'Calentamiento · Enfriamiento', v: 'cada uno tiene su pestaña arriba; se escriben igual que la rutina' },
      { k: 'Sangría', v: 'como en Python: lo indentado va dentro de la línea de arriba (sección, formato o bloque)' },
      { k: '// nota', v: 'comentario de línea completa' },
    ],
  },
  {
    title: 'Formatos',
    rows: [
      { k: 'AMRAP 12 min', v: 'máximas rondas en el tiempo' },
      { k: 'EMOM 10 min · EMOM 10 x 90s · E2MOM 10', v: 'cada intervalo un ejercicio o un grupo "intervalo N:"; rotan hasta acabar' },
      { k: 'Tabata 8 x 20/10', v: 'rondas × trabajo/descanso (los ejercicios no llevan cantidad)' },
      { k: 'For time · For time cap 20 min', v: 'lo más rápido posible, con tope opcional' },
      { k: 'For time 5 rondas', v: 'rondas del total' },
      { k: 'Chipper cap 25 min', v: 'lista completada una vez' },
      { k: 'Fuerza', v: 'series × reps con carga y descanso' },
      { k: 'Circuito 3 rondas descanso 1 min', v: 'vueltas al circuito' },
    ],
  },
  {
    title: 'Cantidades',
    rows: [
      { k: '41 burpees · burpees x41', v: 'repeticiones' },
      { k: 'flexiones 3x5 · 3 series de 5', v: 'series × repeticiones' },
      { k: "plancha 30s · 1 min · 1:30 · 30'' · 12'", v: 'tiempo (\' minutos, \'\' segundos)' },
      { k: '3x45s plancha', v: 'series × tiempo' },
      { k: '400 m carrera · remo 1 km', v: 'distancia' },
      { k: '4x400 m carrera', v: 'series × distancia' },
      { k: 'plancha max · al fallo', v: 'sin cantidad fija' },
    ],
  },
  {
    title: 'Carga',
    rows: [
      { k: '@60 kg · 60 kg', v: 'carga absoluta (kg por defecto)' },
      { k: '@135/95 lb', v: 'hombres / mujeres' },
      { k: '@80%', v: '% del 1RM' },
      { k: '@RPE 8', v: 'esfuerzo percibido' },
      { k: '+20 kg', v: 'añadido al peso corporal' },
      { k: '@corporal', v: 'solo peso corporal' },
    ],
  },
  {
    title: 'Tempo',
    rows: [
      { k: 'tempo 0-3-1-1', v: 'hold arriba · negativa · hold abajo · positiva' },
      { k: 'tempo 0-3-0-X', v: 'X = explosivo' },
      { k: '@0311', v: 'forma corta' },
    ],
  },
  {
    title: 'Modificadores',
    rows: [
      { k: 'c/lado · por lado', v: 'cantidad por cada lado' },
      { k: 'desc 90s', v: 'descanso entre series (Fuerza)' },
      { k: '10 burpees // sin saltar', v: 'nota que ve el usuario; sola en una línea pertenece a lo que tiene encima' },
      { k: '# revisar carga', v: 'comentario interno: no se guarda en la estructura ni lo ve el usuario' },
      { k: 'intervalo 2: 10 burpees', v: 'fija el intervalo de un ejercicio en un EMOM' },
      { k: 'intervalo 2:', v: 'en un EMOM, abre el grupo de ejercicios de ese intervalo (indentados debajo); los intervalos rotan' },
      { k: '// despacio', v: 'nota que ve el usuario' },
    ],
  },
  {
    title: 'Editor',
    rows: [
      { k: 'Sugerencias', v: 'al escribir un ejercicio aparecen nombres y modificadores; Tab acepta, Esc cierra' },
      { k: 'Menú +', v: 'formatos, rondas, descansos, plantillas y bloques; lo insertado trae huecos ⟨así⟩ que se rellenan con Tab' },
      { k: 'Enter', v: 'tras una cabecera indenta; en una línea vacía indentada sube un nivel por pulsación' },
      { k: 'Nombre de bloque o rutina', v: 'al inicio de línea inserta su contenido completo' },
      { k: 'Guardar bloque', v: 'selecciona dos líneas o más y pulsa la acción que aparece junto a la selección' },
      { k: 'Ejercicio desconocido', v: 'subrayado en rojo; "Crear ejercicio" lo añade al catálogo' },
    ],
  },
];

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

/** Initial text: an existing rutina serialized; a new one starts empty (templates are offered in the editor). */
function initialText(workout: Workout | undefined, catalog: Catalog): string {
  if (!workout) return '';
  if (workout.type !== 'structured') return '';
  // The text as it was written (comments included); regenerate only for data without it.
  return workout.sourceText ?? serializeRutina(workout, catalog);
}

// ---- Preview model from the parse result -------------------------------------

function pvItem(it: ParsedItem, inSlot = false): PvItem {
  if (it.kind === 'rest') return { kind: 'rest', seconds: it.workSeconds };
  const sets = it.sets && it.sets > 1 ? it.sets : null;
  let prefix: string | null = null;
  if (it.measure === 'time' && it.workSeconds != null) prefix = formatDuration(it.workSeconds);
  else if (it.measure === 'distance' && it.distanceMeters != null)
    prefix = formatDistance(it.distanceMeters);
  else if (it.reps != null) prefix = String(it.reps);
  if (sets && prefix) prefix = `${sets}×${prefix}`;
  else if (sets) prefix = `${sets} series`;
  const load = loadText(it.loadPrescription).replace(/^@/, '');
  const tempo = tempoText(it.tempoOverride).replace(/^tempo /, '');
  return {
    kind: 'exercise',
    prefix,
    // Counted reps read in plural: "20 Sentadillas" (the catalog keeps the singular).
    name: pluralName(it.match?.name ?? it.rawName ?? '…', it.measure === 'reps' ? it.reps : null),
    load: load || null,
    tempo: tempo ? tempo.replace(/-/g, '·') : null,
    perSide: it.perSide,
    note: it.notes,
    // Items under an "intervalo N:" group already sit under that heading.
    interval: !inSlot && it.intervalIndex != null ? it.intervalIndex + 1 : null,
  };
}
/** Parsed blocks → preview blocks, nesting kept (parts show their header, groups their box). */
const pvBlock = (b: ParsedBlock): PvBlock => ({
  title: b.label,
  rounds: b.rounds,
  note: b.notes,
  loose: b.loose,
  part: b.kind === 'part' ? (b.format ? formatHeader(b.format.format, b.format) : 'Parte') : null,
  // An exercise that did not resolve (typo, half-written) is an error in the
  // editor; the preview shows the rutina as the athlete would get it, without it.
  items: b.items.filter((it) => it.kind !== 'exercise' || it.match).map((it) => pvItem(it, b.type === 'emom')),
  blocks: (b.children ?? []).map(pvBlock),
});
const pvBlocks = (blocks: ParsedBlock[]): PvBlock[] => blocks.map(pvBlock);

function previewFrom(
  parsed: ParsedRutina,
  type: 'structured' | 'video',
  hasVideo: boolean,
  /** A reusable block is one piece of text: no "Rutina" section label over it. */
  blockMode = false,
): PvModel {
  // Parts carry the format headers inside the list, so the section labels are plain.
  const section = (s: 'warmup' | 'cooldown'): PvSection | null => {
    const blocks = parsed.blocks.filter((b) => b.section === s);
    if (!blocks.length) return null;
    return { name: null, formatLabel: null, blocks: pvBlocks(blocks) };
  };
  return {
    type,
    hasVideo,
    formatLabel: blockMode ? '' : type === 'structured' ? 'Rutina' : 'Video',
    headline: '',
    warmup: section('warmup'),
    main: pvBlocks(parsed.blocks.filter((b) => b.section === 'main')),
    cooldown: section('cooldown'),
    goals: goalsFrom(parsed).map(skillGoalLabel),
  };
}

// ---- Component --------------------------------------------------------------

export function RutinaForm({
  workout,
  block,
  skill,
}: {
  workout?: Workout;
  /** A saved block: the same editor on one piece of text (null → a new block). */
  block?: ReusableBlock | null;
  /** A skill: its levels are the tabs, each with an "Objetivo" section (null → a new skill). */
  skill?: Skill | null;
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
  const basePath = blockMode ? '/bloques' : skillMode ? '/habilidades' : '/rutinas';
  const listTitle = blockMode ? es.reusableBlocks.title : skillMode ? es.skills.title : es.workouts.title;
  const newLabel = blockMode ? 'Nuevo bloque' : skillMode ? es.skills.new : es.workouts.new;
  const isNew = blockMode ? !block : skillMode ? !skill : !workout;
  const levelWord = skillMode ? 'nivel' : 'variante';
  const [nameError, setNameError] = useState(false);

  const [name, setName] = useState(workout?.name ?? block?.name ?? skill?.name ?? '');
  const [description, setDescription] = useState(workout?.description ?? skill?.description ?? '');
  const [difficulty, setDifficulty] = useState(workout?.difficulty ?? skill?.difficulty ?? 'beginner');
  const [status, setStatus] = useState(workout?.status ?? skill?.status ?? 'draft');
  const [type, setType] = useState<'structured' | 'video'>(workout?.type ?? 'structured');
  // A new rutina asks for name + type in one dialog, then opens the editor.
  const [createOpen, setCreateOpen] = useState(!workout && !blockMode && !skill);
  const [thumbnailAssetId, setThumbnailAssetId] = useState<string | null>(workout?.thumbnailAssetId ?? skill?.thumbnailAssetId ?? null);
  const [videoAssetId, setVideoAssetId] = useState<string | null>(workout?.videoAssetId ?? null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideQuery, setGuideQuery] = useState('');
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
            : splitSections(initialText(workout, catalog)),
      );
    }
  }, [sections, catalogReady, createOpen, workout, catalog, blockMode, block, skillMode, skill]);

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
  const [confirmRemove, setConfirmRemove] = useState<{ index: number; label: string } | null>(null);
  // The "Versión" dropdown in the tab bar: closes on an outside click or Escape.
  const [versionOpen, setVersionOpen] = useState(false);
  const versionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!versionOpen) return;
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
  const activeSections = activeVariant ? activeVariant.sections : (sections ?? EMPTY_SECTIONS);
  const value = activeSections[activeSection];
  const setValue = (v: string) => {
    if (activeTab === 0) setSections((sc) => ({ ...(sc ?? EMPTY_SECTIONS), [activeSection]: v }));
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

  const guideSections = useMemo(() => {
    const q = fold(guideQuery.trim());
    if (!q) return GUIDE_SECTIONS;
    return GUIDE_SECTIONS.map((sec) => ({
      ...sec,
      rows: sec.rows.filter((r) => fold(r.k).includes(q) || fold(r.v).includes(q) || fold(sec.title).includes(q)),
    })).filter((sec) => sec.rows.length > 0);
  }, [guideQuery]);

  const mainFormats = parsed.blocks
    .filter((b) => b.section === 'main' && b.kind === 'part' && b.format)
    .map((b) => FORMAT_LABEL[b.format!.format]);
  // Estimated on the fly from the text; the API stores the same number on save.
  const estimatedSeconds =
    type === 'video' ? (workout?.videoDurationSeconds ?? null) : estimateDurationSeconds(toWorkoutInput(parsed).blocks);
  const durationLabel = estimatedSeconds ? `${Math.ceil(estimatedSeconds / 60)} min` : null;
  const metaLine = [
    skillMode ? `${tabs.length + 1} nivel${tabs.length ? 'es' : ''}` : type === 'video' ? 'Video' : mainFormats.length ? mainFormats.join(' + ') : FORMAT_LABEL[format],
    skillMode ? null : durationLabel,
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
  };
  const current: Snapshot = {
    name,
    description,
    difficulty,
    status,
    thumbnailAssetId,
    videoAssetId,
    baseLabel,
    sections: sections ?? EMPTY_SECTIONS,
    variants: tabs,
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
    setVideoAssetId(baseline.videoAssetId);
    setBaseLabel(baseline.baseLabel);
    setSections(baseline.sections);
    setVariants(baseline.variants);
    setRemovedVariantIds([]);
    setActiveTab((t) => Math.min(t, baseline.variants.length));
  };
  // Save / discard bar, ⌘S, navigation guard (shared with the exercise form).
  const doSaveRef = useRef<() => void>(() => {});
  const { bar: unsavedBar, guardNav, shake: shakeBar } = useUnsavedChanges({
    dirty,
    saving: save.isPending || saveBlock.isPending || saveSkill.isPending,
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
        {type === 'structured' ? (
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
              {!blockMode && (
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
                    <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-xl border border-line-2 bg-surface p-1 shadow-[0_12px_32px_-10px_rgba(0,0,0,0.25)]">
                      {versionList.map((t, i) => (
                        <div
                          key={t.id}
                          draggable={skillMode && versionList.length > 1}
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
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTab(i);
                              setVersionOpen(false);
                            }}
                            className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
                          >
                            {!skillMode && <span className="w-3 font-mono text-[11px]">{activeTab === i ? '✓' : ''}</span>}
                            <span className="truncate font-semibold">{t.label || 'Sin nombre'}</span>
                            {i === 0 && !skillMode && <span className="font-mono text-[10px] text-muted">base</span>}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setVersionOpen(false);
                              setTabDialog({ mode: 'rename', index: i, label: i === 0 ? baseLabel : t.label });
                            }}
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
                              onClick={() => {
                                setVersionOpen(false);
                                setConfirmRemove({ index: i, label: t.label });
                              }}
                              className="rounded px-1 py-1 text-faint-2 opacity-0 hover:text-accent-dark group-hover:opacity-100"
                              title={`Eliminar ${levelWord}`}
                              aria-label={`Eliminar ${levelWord}`}
                            >
                              ✕
                            </button>
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
                  key={`${activeTab === 0 ? 'base' : (activeVariant?.id ?? `new-${activeTab}`)}-${activeSection}`}
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
            <RutinaPreview model={previewModel} name={name} />
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
              placeholder={blockMode ? 'p. ej. Core express' : skillMode ? 'p. ej. Dominadas' : 'p. ej. Murph'}
            />
          </div>
          {!blockMode && !skillMode && (
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

      <Dialog
        open={confirmRemove !== null}
        onClose={() => setConfirmRemove(null)}
        title={`Eliminar ${levelWord}`}
        className="max-w-sm"
      >
        <div className="flex flex-col gap-4 p-5">
          <p className="text-[14px] leading-relaxed text-ink-2">
            ¿Eliminar {skillMode ? 'el nivel' : 'la variante'} «{confirmRemove?.label}»? Se borrará al guardar{skillMode ? ', con su rutina' : ' la rutina'}.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmRemove(null)}>
              {es.app.cancel}
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (confirmRemove) removeTab(confirmRemove.index);
                setConfirmRemove(null);
              }}
            >
              Eliminar
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Guide drawer */}
      {guideOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setGuideOpen(false)} />
          <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[420px] flex-col border-l border-line bg-surface shadow-[0_0_40px_-10px_rgba(0,0,0,0.35)]">
            <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-4">
              <h3 className="text-[15px] font-bold">Guía de la notación</h3>
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                aria-label="Cerrar"
                className="rounded p-1 text-ink-3 hover:bg-surface-3 hover:text-ink"
              >
                ✕
              </button>
            </div>
            <div className="shrink-0 px-5 pt-4">
              <div className="flex h-9 items-center gap-2 rounded-lg border border-line-2 bg-surface px-2.5">
                <span className="text-muted-2">⌕</span>
                <input
                  autoFocus
                  value={guideQuery}
                  onChange={(e) => setGuideQuery(e.target.value)}
                  placeholder="Buscar (tempo, carga, EMOM…)"
                  className="h-full flex-1 bg-transparent text-[13px] text-ink placeholder:text-muted-2 focus:outline-none"
                />
                {guideQuery && (
                  <button type="button" onClick={() => setGuideQuery('')} className="text-faint-2 hover:text-ink">
                    ✕
                  </button>
                )}
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pb-6 pt-3">
              {guideSections.length === 0 && (
                <p className="text-[12px] text-muted">Nada coincide con «{guideQuery}».</p>
              )}
              {guideSections.map((sec) => (
                <section key={sec.title} className="flex flex-col gap-1.5">
                  <h4 className="mt-2 text-[12px] font-bold uppercase tracking-[0.06em] text-ink-3">{sec.title}</h4>
                  <dl className="flex flex-col gap-1.5 rounded-xl border border-line-2 bg-surface-2/40 p-3">
                    {sec.rows.map((g) => (
                      <div key={g.k} className="flex flex-col gap-0.5">
                        <dt className="font-mono text-[11.5px] font-medium text-ink">{g.k}</dt>
                        <dd className="text-[11px] leading-snug text-muted">{g.v}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          </aside>
        </>
      )}

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

              {!blockMode && !skillMode && (
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
