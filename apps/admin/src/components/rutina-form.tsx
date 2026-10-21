'use client';

// Rutina editor. The structure (format, sections, blocks, exercises) is written
// as text in the rutina notation and parsed live by @dmtx/core; everything
// else (name, status, difficulty, media) lives in the header + settings drawer.
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CONTENT_STATUS, DIFFICULTY } from '@dmtx/schemas';
import type { BlockSection, CreateWorkoutInput, Workout, WorkoutFormat, WorkoutKind } from '@dmtx/schemas';
import {
  Catalog,
  formatDistance,
  formatDuration,
  formatHeader,
  loadText,
  parseRutina,
  serializeRutina,
  tempoText,
  toWorkoutInput,
  type CompletionExtra,
  type ParsedBlock,
  type ParsedItem,
  type ParsedRutina,
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
import { toast } from '@/components/ui/toast';
import { RutinaTextEditor, type RutinaEditorApi } from '@/components/rutina-text-editor';
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


const SECTION_TITLE: Record<'warmup' | 'cooldown', string> = {
  warmup: 'Calentamiento',
  cooldown: 'Enfriamiento',
};
const indentOf = (l: string) => l.length - l.trimStart().length;

const PLACEHOLDER = `Calentamiento
  5 min remo suave

AMRAP 12 min
  10 burpees
  15 sentadillas
  plancha 30s

  3 rondas
    10 flexiones de pecho
    descanso 1 min`;

// Complete reference shown in the right column.
type GuideRow = { k: string; v: string };
const GUIDE_SECTIONS: { title: string; rows: GuideRow[] }[] = [
  {
    title: 'Estructura',
    rows: [
      { k: 'AMRAP 12 min', v: 'una parte: su formato y, indentado debajo, su contenido. Puede haber varias partes seguidas' },
      { k: '41 burpees', v: 'un ejercicio por línea: cantidad + nombre' },
      { k: '3 rondas:', v: 'bloque; sus ejercicios van indentados debajo y se cierra con línea en blanco' },
      { k: 'Superserie:', v: 'bloque tipo superserie (admite "Superserie 3 rondas:")' },
      { k: '3 rondas, descanso 1 min:', v: 'descanso al final de cada ronda' },
      { k: 'descanso 90s', v: 'descanso suelto entre ejercicios' },
      { k: 'Calentamiento · Enfriamiento', v: 'secciones opcionales: lo indentado debajo pertenece a ellas; al volver a la columna 0 sigue la rutina' },
      { k: 'Sangría', v: 'como en Python: lo indentado va dentro de la línea de arriba (sección, formato o bloque)' },
      { k: '// nota', v: 'comentario de línea completa' },
    ],
  },
  {
    title: 'Formatos',
    rows: [
      { k: 'AMRAP 12 min', v: 'máximas rondas en el tiempo' },
      { k: 'EMOM 10 min · EMOM 10 x 90s', v: 'cada intervalo un ejercicio; "min 2:" fija el intervalo' },
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
      { k: 'plancha 30s · 1 min · 1:30', v: 'tiempo' },
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
      { k: 'min 2: 10 burpees', v: 'intervalo en EMOM' },
      { k: '// despacio', v: 'nota que ve el usuario' },
    ],
  },
  {
    title: 'Editor',
    rows: [
      { k: 'Sugerencias', v: 'aparecen al escribir y al saltar de línea; Tab acepta, Esc cierra' },
      { k: 'Enter', v: 'en línea vacía solo salta de línea aunque haya sugerencias' },
      { k: 'Nombre de bloque o rutina', v: 'al inicio de línea inserta su contenido completo' },
      { k: 'Guardar bloque', v: 'selecciona dos líneas o más y pulsa la acción que aparece junto a la selección' },
      { k: 'Ejercicio desconocido', v: 'subrayado en rojo; "Crear ejercicio" lo añade al catálogo' },
    ],
  },
];

// ---- Text helpers ----------------------------------------------------------

const SECTION_LINE =
  /^\s*(calentamiento|warm ?-?up|enfriamiento|cool ?-?down|vuelta a la calma|principal|main|rutina|wod)\s*:?\s*$/i;
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const sectionOf = (line: string): BlockSection | null => {
  const m = fold(line).match(SECTION_LINE);
  if (!m) return null;
  const k = m[1]!.replace(/\s+/g, ' ');
  if (k.startsWith('calent') || k.startsWith('warm')) return 'warmup';
  if (k.startsWith('enfri') || k.startsWith('cool') || k.startsWith('vuelta')) return 'cooldown';
  return 'main';
};

/**
 * Replace (or append) a warmup/cooldown section with `body` lines, written
 * Python-style: the title, then the body indented under it.
 */
function replaceSection(text: string, section: 'warmup' | 'cooldown', body: string[]): string {
  const lines = text.replace(/\s+$/, '').split('\n');
  const start = lines.findIndex((l) => sectionOf(l) === section);
  // The existing section's end: an indented section ends on dedent, a flat
  // (legacy, colon style) one at the next header.
  let end = lines.length;
  if (start >= 0) {
    const headIndent = indentOf(lines[start]!);
    const firstContent = lines.slice(start + 1).find((l) => l.trim());
    const indentMode = firstContent != null && indentOf(firstContent) > headIndent;
    for (let k = start + 1; k < lines.length; k += 1) {
      const l = lines[k]!;
      if (!l.trim()) continue;
      const shallow = indentOf(l) <= headIndent;
      if ((sectionOf(l) !== null && shallow) || (indentMode && shallow)) {
        end = k;
        break;
      }
    }
  }
  const block = [SECTION_TITLE[section], ...body.map((l) => (l.trim() ? `  ${l}` : l))];
  if (start >= 0) {
    return [...lines.slice(0, start), ...block, '', ...lines.slice(end)].join('\n').replace(/\n{3,}/g, '\n\n');
  }
  if (section === 'warmup') return [...block, '', ...lines].join('\n');
  return [...lines, '', ...block].join('\n') + '\n';
}

/** A segment's blocks as section body lines (its format header + items). */
function segmentBody(src: Workout, catalog: Catalog): string[] {
  const text = serializeRutina(
    {
      format: src.format ?? 'for_time',
      formatConfig: src.formatConfig,
      blocks: src.blocks.map((b) => ({ ...b, section: 'main' as const })),
    },
    catalog,
  );
  const lines = text.replace(/\s+$/, '').split('\n');
  // Drop the serialized main header when the segment has no format of its own.
  return src.format ? lines : lines.slice(1);
}

/** Initial text for an existing rutina; a new one starts empty (the placeholder shows the way). */
function initialText(workout: Workout | undefined, catalog: Catalog): string {
  if (!workout) return '';
  if (workout.type !== 'structured') return '';
  return serializeRutina(workout, catalog);
}

// ---- Preview model from the parse result -------------------------------------

function pvItem(it: ParsedItem): PvItem {
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
    name: it.match?.name ?? it.rawName ?? '…',
    load: load || null,
    tempo: tempo ? tempo.replace(/-/g, '·') : null,
    perSide: it.perSide,
    note: it.notes,
  };
}
const pvBlock = (b: ParsedBlock): PvBlock => ({
  title: b.label,
  rounds: b.rounds,
  items: b.items.map(pvItem),
});
/** Parts become a header entry followed by their blocks. */
const pvBlocks = (blocks: ParsedBlock[]): PvBlock[] =>
  blocks.flatMap((b) =>
    b.kind === 'part'
      ? [
          { title: null, rounds: null, items: [], part: b.format ? formatHeader(b.format.format, b.format) : 'Parte' },
          ...(b.children ?? []).map(pvBlock),
        ]
      : [pvBlock(b)],
  );

function previewFrom(
  parsed: ParsedRutina,
  type: 'structured' | 'video',
  hasVideo: boolean,
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
    formatLabel: type === 'structured' ? 'Rutina' : 'Video',
    headline: '',
    warmup: section('warmup'),
    main: pvBlocks(parsed.blocks.filter((b) => b.section === 'main')),
    cooldown: section('cooldown'),
  };
}

// ---- Component --------------------------------------------------------------

export function RutinaForm({ workout, kind = 'rutina' }: { workout?: Workout; kind?: WorkoutKind }) {
  const router = useRouter();
  const qc = useQueryClient();
  // A segment is a reusable warmup/cooldown piece: same editor, but no nested
  // warmup/cooldown sections, and it lives under /segmentos.
  const segmentMode = (workout?.kind ?? kind) === 'segment';
  const basePath = segmentMode ? '/segmentos' : '/rutinas';
  const listTitle = segmentMode ? es.segments.title : es.workouts.title;
  const newLabel = segmentMode ? es.segments.new : es.workouts.new;
  const [serverError, setServerError] = useState<string | null>(null);
  const [nameError, setNameError] = useState(false);

  const [name, setName] = useState(workout?.name ?? '');
  const [description, setDescription] = useState(workout?.description ?? '');
  const [difficulty, setDifficulty] = useState(workout?.difficulty ?? 'beginner');
  const [status, setStatus] = useState(workout?.status ?? 'draft');
  const [durationMin, setDurationMin] = useState(
    workout?.estimatedDurationSeconds ? String(Math.round(workout.estimatedDurationSeconds / 60)) : '',
  );
  const [type, setType] = useState<'structured' | 'video'>(workout?.type ?? 'structured');
  // New workouts start in a guided wizard (type → name); existing ones skip
  // straight to the editor. The format is whatever the text says.
  const [wizardStep, setWizardStep] = useState<'type' | 'name' | 'done'>(
    workout ? 'done' : segmentMode ? 'name' : 'type',
  );
  const [thumbnailAssetId, setThumbnailAssetId] = useState<string | null>(workout?.thumbnailAssetId ?? null);
  const [videoAssetId, setVideoAssetId] = useState<string | null>(workout?.videoAssetId ?? null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideQuery, setGuideQuery] = useState('');
  const [snippetModal, setSnippetModal] = useState<{ name: string; text: string } | null>(null);
  const editorApi = useRef<RutinaEditorApi | null>(null);
  const [newExercise, setNewExercise] = useState<{ name: string; difficulty: Workout['difficulty'] } | null>(null);
  // Legacy rutinas may still reference a warmup/cooldown rutina; once loaded it
  // is folded into the text so everything is editable in place.
  const [warmupWorkoutId, setWarmupWorkoutId] = useState<string | null>(workout?.warmupWorkoutId ?? null);
  const [cooldownWorkoutId, setCooldownWorkoutId] = useState<string | null>(workout?.cooldownWorkoutId ?? null);
  const editorHost = useRef<HTMLDivElement>(null);

  const { data: exList } = useQuery({
    queryKey: ['exercises', 'all'],
    queryFn: () => api.exercises.list({ pageSize: 500 }),
  });
  const catalog = useMemo(
    () => new Catalog((exList?.data ?? []).map((e) => ({ id: e.id, name: e.name, aliases: e.aliases }))),
    [exList],
  );
  const catalogReady = !!exList;

  // The rutina text. Seeded once the catalog is available (names come from it).
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (text === null && catalogReady && wizardStep === 'done') {
      setText(initialText(workout, catalog));
    }
  }, [text, catalogReady, wizardStep, workout, catalog]);

  // Variants (RX / Escalada / …): one tab each, after the base tab. Each is a
  // full rutina row linked to this one; loaded (and serialized) once the
  // catalog is ready, saved/created/removed alongside the base on "Guardar".
  type VariantTab = { id: string | null; label: string; text: string };
  const [baseLabel, setBaseLabel] = useState(workout?.variantLabel ?? '');
  const [variants, setVariants] = useState<VariantTab[] | null>(workout?.variants?.length ? null : []);
  const [removedVariantIds, setRemovedVariantIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState(0); // 0 = base, n = variants[n-1]
  const [tabDialog, setTabDialog] = useState<{ mode: 'add' | 'rename'; index: number; label: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<{ index: number; label: string } | null>(null);
  useEffect(() => {
    if (variants !== null || !catalogReady || !workout?.variants?.length) return;
    let cancelled = false;
    Promise.all(workout.variants.map((v) => api.workouts.get(v.id)))
      .then((rows) => {
        if (cancelled) return;
        setVariants(rows.map((w) => ({ id: w.id, label: w.variantLabel ?? '', text: serializeRutina(w, catalog) })));
      })
      .catch((e) => setServerError(e instanceof Error ? e.message : es.app.error));
    return () => {
      cancelled = true;
    };
  }, [variants, catalogReady, workout, catalog]);
  const tabs = variants ?? [];
  const activeVariant = activeTab > 0 ? tabs[activeTab - 1] : undefined;
  const value = activeVariant ? activeVariant.text : (text ?? '');
  const setValue = (v: string) => {
    if (activeTab === 0) setText(v);
    else setVariants((vs) => (vs ?? []).map((t, i) => (i === activeTab - 1 ? { ...t, text: v } : t)));
  };
  const editorReady = text !== null && variants !== null;
  const addVariant = (label: string) => {
    setVariants((vs) => [...(vs ?? []), { id: null, label, text: value }]);
    setActiveTab(tabs.length + 1);
  };
  const removeVariant = (index: number) => {
    const v = tabs[index];
    if (!v) return;
    if (v.id) setRemovedVariantIds((ids) => [...ids, v.id!]);
    setVariants((vs) => (vs ?? []).filter((_, i) => i !== index));
    setActiveTab((t) => (t > index + 1 ? t - 1 : t === index + 1 ? 0 : t));
  };
  const renameTab = (index: number, label: string) => {
    if (index === 0) setBaseLabel(label);
    else setVariants((vs) => (vs ?? []).map((t, i) => (i === index - 1 ? { ...t, label } : t)));
  };
  // Undo/redo buttons follow the editor's history (re-rendered on every change).
  const canUndo = editorApi.current?.canUndo() ?? false;
  const canRedo = editorApi.current?.canRedo() ?? false;

  const parsed = useMemo(() => parseRutina(value, { catalog }), [value, catalog]);
  const format = parsed.main?.format ?? 'for_time';

  const previewModel = useMemo(
    () => previewFrom(parsed, type, type === 'video' && !!videoAssetId),
    [parsed, type, videoAssetId],
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
  const metaLine = [
    type === 'video' ? 'Video' : mainFormats.length ? mainFormats.join(' + ') : FORMAT_LABEL[format],
    durationMin ? `${durationMin} min` : null,
    es.difficulty[difficulty],
  ]
    .filter(Boolean)
    .join(' · ');

  // Legacy warmup/cooldown references fold into the text once loaded.
  const warmupQ = useQuery({
    queryKey: ['workout', warmupWorkoutId],
    queryFn: () => api.workouts.get(warmupWorkoutId!),
    enabled: !!warmupWorkoutId && catalogReady && text !== null,
  });
  const cooldownQ = useQuery({
    queryKey: ['workout', cooldownWorkoutId],
    queryFn: () => api.workouts.get(cooldownWorkoutId!),
    enabled: !!cooldownWorkoutId && catalogReady && text !== null,
  });
  useEffect(() => {
    if (warmupWorkoutId && warmupQ.data) {
      setText((t) => replaceSection(t ?? '', 'warmup', segmentBody(warmupQ.data, catalog)));
      setWarmupWorkoutId(null);
    }
  }, [warmupWorkoutId, warmupQ.data, catalog]);
  useEffect(() => {
    if (cooldownWorkoutId && cooldownQ.data) {
      setText((t) => replaceSection(t ?? '', 'cooldown', segmentBody(cooldownQ.data, catalog)));
      setCooldownWorkoutId(null);
    }
  }, [cooldownWorkoutId, cooldownQ.data, catalog]);


  // ---- Saved blocks + other rutinas as suggestions ---------------------------
  const snippetsQ = useQuery({
    queryKey: ['snippets', 'all'],
    queryFn: () => api.snippets.list({ pageSize: 200 }),
  });
  const rutinasQ = useQuery({
    queryKey: ['workouts', 'suggest'],
    queryFn: () => api.workouts.list({ pageSize: 200 }),
  });
  const extras = useMemo<CompletionExtra[]>(
    () => [
      { kind: 'snippet', items: (snippetsQ.data?.data ?? []).map((sn) => ({ id: sn.id, name: sn.name })) },
      {
        kind: 'rutina',
        items: (rutinasQ.data?.data ?? [])
          .filter((w) => w.id !== workout?.id && w.type === 'structured')
          .map((w) => ({ id: w.id, name: w.name })),
      },
    ],
    [snippetsQ.data, rutinasQ.data, workout?.id],
  );
  const insertBlock = async (kind: 'snippet' | 'rutina', id: string): Promise<string | null> => {
    if (kind === 'snippet') return snippetsQ.data?.data.find((sn) => sn.id === id)?.text ?? null;
    const src = await api.workouts.get(id);
    // Another rutina's main content, without its format header.
    const lines = serializeRutina(
      { format: src.format ?? 'for_time', formatConfig: src.formatConfig, blocks: src.blocks.filter((b) => b.section === 'main') },
      catalog,
    )
      .replace(/\s+$/, '')
      .split('\n');
    return lines.slice(1).join('\n');
  };
  const createSnippet = useMutation({
    mutationFn: (args: { name: string; text: string }) => api.snippets.create(args),
    onSuccess: (sn) => {
      qc.invalidateQueries({ queryKey: ['snippets'] });
      setSnippetModal(null);
      toast(`Bloque guardado: ${sn.name}`);
    },
    onError: (e) => setServerError(e instanceof Error ? e.message : es.app.error),
  });

  // ---- Create a missing exercise straight from a diagnostic -----------------
  const createExercise = useMutation({
    mutationFn: (args: { name: string; difficulty: Workout['difficulty'] }) =>
      api.exercises.create({
        name: args.name,
        difficulty: args.difficulty,
        status: 'draft',
        cues: [],
        aliases: [],
        isUnilateral: false,
        muscles: [],
        equipmentIds: [],
      }),
    onSuccess: (ex) => {
      qc.invalidateQueries({ queryKey: ['exercises'] });
      setNewExercise(null);
      toast(`Ejercicio creado: ${ex.name}`);
    },
    onError: (e) => setServerError(e instanceof Error ? e.message : es.app.error),
  });
  const titleCase = (s: string) => s.trim().replace(/^\p{L}/u, (c) => c.toUpperCase());

  // ---- Save -----------------------------------------------------------------
  // The payload for one tab's text; metadata is shared by base and variants.
  const payloadFor = (tabText: string, variant: { ofId: string; label: string } | null): CreateWorkoutInput => {
    const structured = type === 'structured';
    const structure = structured ? toWorkoutInput(parseRutina(tabText, { catalog })) : null;
    return {
      name,
      description: description || null,
      kind: segmentMode ? 'segment' : 'rutina',
      type,
      format: structure?.format ?? null,
      difficulty,
      estimatedDurationSeconds: durationMin ? Math.max(1, Number(durationMin)) * 60 : null,
      status,
      thumbnailAssetId,
      videoAssetId: structured ? null : videoAssetId,
      formatConfig: structure?.formatConfig ?? null,
      warmupFormat: segmentMode ? null : (structure?.warmupFormat ?? null),
      warmupFormatConfig: segmentMode ? null : (structure?.warmupFormatConfig ?? null),
      cooldownFormat: segmentMode ? null : (structure?.cooldownFormat ?? null),
      cooldownFormatConfig: segmentMode ? null : (structure?.cooldownFormatConfig ?? null),
      warmupWorkoutId: null,
      cooldownWorkoutId: null,
      variantOfId: variant?.ofId ?? null,
      variantLabel: variant ? variant.label : baseLabel.trim() || null,
      blocks: (structure?.blocks ?? []).map((b) => (segmentMode ? { ...b, section: 'main' as const } : b)),
    };
  };
  const save = useMutation({
    mutationFn: async () => {
      const basePayload = payloadFor(text ?? '', null);
      const saved = workout ? await api.workouts.update(workout.id, basePayload) : await api.workouts.create(basePayload);
      // Variants: create the new ones, update the rest, drop the removed.
      const savedVariants: VariantTab[] = [];
      for (const v of tabs) {
        const p = payloadFor(v.text, { ofId: saved.id, label: v.label });
        const row = v.id ? await api.workouts.update(v.id, p) : await api.workouts.create(p);
        savedVariants.push({ id: row.id, label: v.label, text: v.text });
      }
      await Promise.all(removedVariantIds.map((id) => api.workouts.remove(id)));
      return { saved, savedVariants };
    },
    onSuccess: ({ saved, savedVariants }) => {
      setVariants(savedVariants);
      setRemovedVariantIds([]);
      qc.setQueryData(['workout', saved.id], { ...saved, variants: savedVariants.map((v) => ({ id: v.id, label: v.label })) });
      qc.invalidateQueries({ queryKey: ['workouts'] });
      qc.invalidateQueries({ queryKey: ['workout-refs'] });
      toast(segmentMode ? 'Segmento guardado' : 'Rutina guardada');
      if (!workout) router.replace(`${basePath}/${saved.id}`);
    },
    onError: (e) => setServerError(e instanceof Error ? e.message : es.app.error),
  });

  const doSave = () => {
    setServerError(null);
    if (!name.trim()) {
      setNameError(true);
      return;
    }
    setNameError(false);
    if (type === 'structured') {
      const all = [{ label: baseLabel.trim() || 'Principal', text: text ?? '' }, ...tabs];
      for (let i = 0; i < all.length; i += 1) {
        const p = parseRutina(all[i]!.text, { catalog });
        const n = p.diagnostics.filter((d) => d.severity === 'error').length;
        if (n > 0) {
          setActiveTab(i);
          setServerError(
            (n === 1 ? 'Hay 1 línea con error' : `Hay ${n} líneas con error`) +
              (all.length > 1 ? ` en «${all[i]!.label}»` : '') +
              '. Corrígelo antes de guardar.',
          );
          return;
        }
      }
    }
    save.mutate();
  };

  // ---- Create wizard (new workouts only): type → format → name -------------
  const selectType = (t: 'structured' | 'video') => {
    setType(t);
    setWizardStep('name');
  };
  const finishWizard = () => {
    if (!name.trim()) {
      setNameError(true);
      return;
    }
    setNameError(false);
    setWizardStep('done');
  };

  if (wizardStep !== 'done') {
    const stepTotal = segmentMode ? 1 : 2;
    const stepNum = segmentMode ? 1 : wizardStep === 'type' ? 1 : 2;
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between gap-6 border-b border-line bg-surface px-7 py-4">
          <div className="flex items-center gap-2 font-mono text-xs font-medium text-muted">
            <button type="button" onClick={() => router.push(basePath)} className="hover:text-ink-2">
              {listTitle}
            </button>
            <span>/</span>
            <span className="text-ink-2">Nueva</span>
          </div>
          <Button type="button" variant="outline" onClick={() => router.push(basePath)}>
            {es.app.cancel}
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-2xl px-6 py-10">
            <div className="mb-6 font-mono text-[11px] font-semibold uppercase tracking-widest text-muted">
              Paso {stepNum} de {stepTotal}
            </div>

            {wizardStep === 'type' && (
              <>
                <h1 className="mb-1 text-2xl font-bold tracking-tight">¿Qué tipo de rutina?</h1>
                <p className="mb-6 text-sm text-ink-3">Esto no se puede cambiar después.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      { v: 'structured', desc: 'Ejercicios con series, reps, tiempo o distancia.' },
                      { v: 'video', desc: 'Una sola clase en video, sin pasos.' },
                    ] as const
                  ).map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => selectType(o.v)}
                      className="flex flex-col gap-1.5 rounded-xl border border-line-2 bg-surface p-4 text-left hover:border-ink hover:bg-surface-2"
                    >
                      <span className="text-base font-bold">{es.workouts.types[o.v]}</span>
                      <span className="text-[13px] leading-snug text-ink-3">{o.desc}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {wizardStep === 'name' && (
              <>
                {!segmentMode && (
                  <button
                    type="button"
                    onClick={() => setWizardStep('type')}
                    className="mb-4 font-mono text-xs text-muted hover:text-ink-2"
                  >
                    ← Atrás
                  </button>
                )}
                <h1 className="mb-1 text-2xl font-bold tracking-tight">
                  Nombra tu {segmentMode ? 'segmento' : 'rutina'}
                </h1>
                <p className="mb-5 text-sm text-ink-3">
                  {es.workouts.types[type]}
                  {type === 'structured' ? ' · el formato se escribe en la primera línea de cada parte' : ''}
                </p>
                <Input
                  autoFocus
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (nameError) setNameError(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') finishWizard();
                  }}
                  placeholder={newLabel}
                />
                {nameError && (
                  <span className="mt-1.5 block text-xs font-medium text-accent-dark">
                    {es.app.nameRequired}
                  </span>
                )}
                <div className="mt-6">
                  <Button onClick={finishWizard}>Continuar</Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }


  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-start justify-between gap-6 border-b border-line bg-surface px-7 pb-4 pt-5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center gap-2 font-mono text-xs font-medium text-muted">
            <button type="button" onClick={() => router.push(basePath)} className="hover:text-ink-2">
              {listTitle}
            </button>
            <span>/</span>
            <span className="text-ink-2">{workout ? 'Editar' : 'Nueva'}</span>
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
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
              style={{ background: '#fdf0d9', color: '#8a5a12' }}
            >
              {es.status[status]}
            </span>
            <span className="font-mono text-xs font-medium text-muted">{metaLine}</span>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Button type="button" variant="outline" onClick={() => setGuideOpen(true)}>
            Guía
          </Button>
          <Button type="button" variant="outline" onClick={() => setSettingsOpen(true)}>
            Ajustes
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push(basePath)}>
            {es.app.cancel}
          </Button>
          <Button onClick={doSave} disabled={save.isPending || (type === 'structured' && !editorReady)}>
            {save.isPending ? es.app.saving : es.app.save}
          </Button>
        </div>
      </header>

      {serverError && (
        <p className="mx-7 mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-accent-dark">{serverError}</p>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Left: the editor, VS Code style (tab bar · editor · problems) */}
        {type === 'structured' ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
            {/* Tab bar: base + variants (+), undo/redo on the right */}
            <div className="flex h-9 shrink-0 items-stretch border-b border-line bg-surface-2">
              {!segmentMode &&
                [{ id: 'base', label: baseLabel.trim() || 'Principal' }, ...tabs.map((v, i) => ({ id: v.id ?? `new-${i}`, label: v.label }))].map(
                  (t, i) => (
                    <div
                      key={t.id}
                      onClick={() => setActiveTab(i)}
                      onDoubleClick={() => setTabDialog({ mode: 'rename', index: i, label: i === 0 ? baseLabel : t.label })}
                      title={i === 0 ? 'Rutina principal · doble clic para nombrar el nivel' : 'Variante · doble clic para renombrar'}
                      className={cn(
                        'group flex cursor-pointer items-center gap-2 border-r border-line px-4 font-mono text-[12px]',
                        activeTab === i
                          ? 'bg-surface text-ink shadow-[inset_0_-2px_0_var(--color-accent)]'
                          : 'text-ink-3 hover:bg-surface-3 hover:text-ink-2',
                      )}
                    >
                      <span>{t.label || 'Sin nombre'}</span>
                      {i > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmRemove({ index: i - 1, label: t.label });
                          }}
                          className="rounded px-1 text-faint-2 opacity-0 hover:text-accent-dark group-hover:opacity-100"
                          title="Eliminar variante"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ),
                )}
              {!segmentMode && (
                <button
                  type="button"
                  onClick={() => setTabDialog({ mode: 'add', index: tabs.length + 1, label: tabs.length === 0 ? 'Escalada' : '' })}
                  disabled={!editorReady}
                  className="px-3 font-mono text-[14px] text-ink-3 hover:bg-surface-3 hover:text-ink disabled:opacity-40"
                  title="Añadir variante (copia la pestaña activa)"
                >
                  +
                </button>
              )}
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
            </div>
            <div ref={editorHost} className="min-h-0 flex-1">
              {!editorReady ? (
                <div className="px-4 py-10 text-center font-mono text-[12px] text-muted">{es.app.loading}</div>
              ) : (
                <RutinaTextEditor
                  key={activeTab === 0 ? 'base' : (activeVariant?.id ?? `new-${activeTab}`)}
                  value={value}
                  onChange={setValue}
                  catalog={catalog}
                  parsed={parsed}
                  placeholder={PLACEHOLDER}
                  autoFocus={!workout}
                  extras={extras}
                  onInsertBlock={insertBlock}
                  onSaveBlock={(t) => {
                    setServerError(null);
                    setSnippetModal({ name: '', text: t.trim() });
                  }}
                  apiRef={editorApi}
                  onCreateExercise={(n) => setNewExercise({ name: titleCase(n), difficulty: 'beginner' })}
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
              <p className="font-mono text-[11px] text-muted">Mostrando la variante «{activeVariant.label}».</p>
            )}
          </aside>
      </div>

      <Dialog
        open={tabDialog !== null}
        onClose={() => setTabDialog(null)}
        title={tabDialog?.mode === 'add' ? 'Nueva variante' : 'Nombre del nivel'}
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
                  if (tabDialog.mode === 'add') addVariant(tabDialog.label.trim());
                  else renameTab(tabDialog.index, tabDialog.label.trim());
                  setTabDialog(null);
                }
              }}
              placeholder={tabDialog?.mode === 'add' ? 'p. ej. Escalada, Principiante' : 'p. ej. RX'}
            />
            <p className="mt-2 text-[12px] leading-snug text-muted">
              {tabDialog?.mode === 'add'
                ? 'Se crea copiando el contenido de la pestaña activa. En la app el usuario elige el nivel antes de empezar.'
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
        open={confirmRemove !== null}
        onClose={() => setConfirmRemove(null)}
        title="Eliminar variante"
        className="max-w-sm"
      >
        <div className="flex flex-col gap-4 p-5">
          <p className="text-[14px] leading-relaxed text-ink-2">
            ¿Eliminar la variante «{confirmRemove?.label}»? Se borrará al guardar la rutina.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmRemove(null)}>
              {es.app.cancel}
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (confirmRemove) removeVariant(confirmRemove.index);
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

              {!segmentMode && (
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
                  <Input inputMode="numeric" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} />
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
        open={snippetModal !== null}
        onClose={() => setSnippetModal(null)}
        title="Guardar bloque reutilizable"
        className="max-w-lg"
      >
        <div className="flex flex-col gap-4 p-5">
          <div>
            <div className="mb-1.5 text-[13px] font-semibold text-ink-2">Nombre</div>
            <Input
              autoFocus
              value={snippetModal?.name ?? ''}
              onChange={(e) => setSnippetModal((m) => (m ? { ...m, name: e.target.value } : m))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && snippetModal?.name.trim()) createSnippet.mutate(snippetModal);
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
              value={snippetModal?.text ?? ''}
              onChange={(e) => setSnippetModal((m) => (m ? { ...m, text: e.target.value } : m))}
              className="min-h-32 w-full rounded-lg border border-line-2 bg-surface px-3 py-2 font-mono text-[13px] leading-relaxed"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setSnippetModal(null)}>
              {es.app.cancel}
            </Button>
            <Button
              type="button"
              onClick={() => snippetModal && createSnippet.mutate(snippetModal)}
              disabled={createSnippet.isPending || !snippetModal?.name.trim() || !snippetModal?.text.trim()}
            >
              {createSnippet.isPending ? es.app.saving : es.app.save}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={newExercise !== null}
        onClose={() => setNewExercise(null)}
        title="Crear ejercicio"
        className="max-w-md"
      >
        <div className="flex flex-col gap-4 p-5">
          <div>
            <div className="mb-1.5 text-[13px] font-semibold text-ink-2">{es.exercises.fields.name}</div>
            <Input
              autoFocus
              value={newExercise?.name ?? ''}
              onChange={(e) => setNewExercise((m) => (m ? { ...m, name: e.target.value } : m))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newExercise?.name.trim()) createExercise.mutate(newExercise);
              }}
            />
          </div>
          <div>
            <div className="mb-1.5 text-[13px] font-semibold text-ink-2">{es.fields.difficulty}</div>
            <Select
              value={newExercise?.difficulty ?? 'beginner'}
              onChange={(e) =>
                setNewExercise((m) => (m ? { ...m, difficulty: e.target.value as Workout['difficulty'] } : m))
              }
            >
              {DIFFICULTY.map((d) => (
                <option key={d} value={d}>
                  {es.difficulty[d]}
                </option>
              ))}
            </Select>
          </div>
          <p className="text-[12px] leading-snug text-muted">
            Se crea como borrador; completa músculos, equipo y video desde Ejercicios cuando quieras.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setNewExercise(null)}>
              {es.app.cancel}
            </Button>
            <Button
              type="button"
              onClick={() => newExercise && createExercise.mutate(newExercise)}
              disabled={createExercise.isPending || !newExercise?.name.trim()}
            >
              {createExercise.isPending ? es.app.saving : 'Crear'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
