import { useState } from 'react';
import { flattenBlocks } from '../../../lib/blocks';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Button, Loading, Thumb } from '../../../components/ui';
import { BodyMap } from '../../../components/body-map';
import { useTrackActivity } from '../../../lib/activity';
import { DownloadButton } from '../../../components/download-button';
import { api } from '../../../lib/api';
import { sectionVideos, useDownload } from '../../../lib/downloads';
import { difficultyLabel, es, formatLabel } from '../../../i18n';
import { durationLabel, loadLabel, mmss, pluralName, targetLabel, tempoDash } from '../../../lib/format';
import { useUnits } from '../../../lib/units-context';
import type { Units } from '../../../lib/units';
import type { WorkoutBlock, WorkoutItem } from '../../../lib/types';

function itemSub(item: WorkoutItem, units: Units): string {
  const tempo = item.tempoOverride ?? item.exercise?.defaultTempo ?? null;
  const parts: string[] = [];
  if (tempo) parts.push(`Tempo ${tempoDash(tempo)}`);
  const load = loadLabel(item.loadPrescription, units.weight);
  if (load) parts.push(load);
  if (item.perSide) parts.push('bilateral');
  return parts.join(' · ');
}

// Group a section's blocks into display units, matching the admin Vista previa:
// consecutive loose exercises collapse into one tight run; a "real" block
// (multiple exercises or >1 round) stands apart with a rounds header.
type PvUnit = { rounds: number | null; loose: boolean; items: WorkoutItem[] };
function unitsFor(blocks: WorkoutBlock[]): PvUnit[] {
  const units: PvUnit[] = [];
  for (const b of blocks) {
    if (b.items.length === 0) continue;
    const isBlock = b.items.length > 1 || (b.rounds != null && b.rounds > 1);
    if (isBlock) {
      units.push({ rounds: b.rounds, loose: false, items: [...b.items] });
    } else {
      const last = units[units.length - 1];
      if (last && last.loose) last.items.push(...b.items);
      else units.push({ rounds: null, loose: true, items: [...b.items] });
    }
  }
  return units;
}

// Compact timing summary after the format name, e.g. "5:00 × 5" (EMOM).
function formatHeadline(format: string | null, cfg: unknown): string {
  if (!format || !cfg || typeof cfg !== 'object') return '';
  const c = cfg as Record<string, unknown>;
  const n = (k: string) => {
    const v = Number(c[k]);
    return Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
  };
  const dur = (s: number) => (s % 60 === 0 ? `${s / 60} min` : mmss(s));
  const join = (...p: string[]) => p.filter(Boolean).join(' · ');
  switch (format) {
    case 'amrap':
      return n('totalSeconds') ? dur(n('totalSeconds')) : '';
    case 'emom':
      return [n('intervalSeconds') ? mmss(n('intervalSeconds')) : '', n('rounds') ? `× ${n('rounds')}` : '']
        .filter(Boolean)
        .join(' ');
    case 'tabata':
      return [n('rounds') ? `${n('rounds')} ×` : '', n('workSeconds') || n('restSeconds') ? `${n('workSeconds')}s/${n('restSeconds')}s` : '']
        .filter(Boolean)
        .join(' ');
    case 'chipper':
      return n('timeCapSeconds') ? `límite ${dur(n('timeCapSeconds'))}` : '';
    case 'for_time':
      return join(n('rounds') ? `${n('rounds')} rondas` : '', n('timeCapSeconds') ? `límite ${dur(n('timeCapSeconds'))}` : '');
    case 'circuit':
      return join(n('rounds') ? `${n('rounds')} rondas` : '', n('restBetweenRoundsSeconds') ? `desc ${n('restBetweenRoundsSeconds')}s` : '');
    default:
      return '';
  }
}

export default function RutinaDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { units } = useUnits();
  const q = useQuery({ queryKey: ['workout', id], queryFn: () => api.workout(id) });
  useTrackActivity('view_workout', id);
  // Saved for offline use: the page opens from the copy kept with the download when the API cannot be reached.
  const download = useDownload(id);
  const offlineCopy = download?.status === 'done' ? download.workout : undefined;
  // Variants (RX / Escalada / …): the base page offers a level; the chosen
  // variant's content replaces the base's below and is what gets played.
  const [variantId, setVariantId] = useState<string | null>(null);
  const vq = useQuery({
    queryKey: ['workout', variantId],
    queryFn: () => api.workout(variantId!),
    enabled: !!variantId,
  });

  const loaded = q.data ?? offlineCopy;
  if (q.isLoading && !loaded) return <Loading />;
  if (!loaded) {
    return (
      <View className="flex-1 items-center justify-center bg-bg px-8">
        <Text className="text-center font-sans text-[15px] text-ink-3">{es.common.error}</Text>
      </View>
    );
  }

  const base = loaded;
  const w = variantId && vq.data ? vq.data : base;
  const levels = base.variants.length
    ? [{ id: base.id, label: base.variantLabel || 'Principal' }, ...base.variants]
    : [];
  const playId = variantId ?? id;
  const stats = [
    // Written and on video: the user picks the class or the guided mode when starting.
    { k: 'Formato', v: [w.isGuided ? formatLabel(w.format) || 'Guiada' : null, w.hasVideo ? 'Video' : null].filter(Boolean).join(' o ') || '—' },
    { k: 'Duración', v: w.estimatedDurationSeconds ? mmss(w.estimatedDurationSeconds) : '—' },
    { k: 'Nivel', v: difficultyLabel(w.difficulty, true) || '—' },
    ...(w.muscles.length ? [{ k: 'Trabaja', v: w.muscles.join(', ') }] : []),
    { k: 'Equipo', v: w.equipment.length ? w.equipment.join(', ') : 'Sin equipo' },
  ];

  // Warmup → main → cooldown, each grouped like the admin Vista previa.
  // Each section lists its parts (a format + its blocks) and its loose blocks.
  const partsOf = (section: 'warmup' | 'main' | 'cooldown', base: string) => {
    const blocks = w.blocks.filter((b) => (b.section ?? 'main') === section);
    const out: { key: string; label: string; units: PvUnit[] }[] = [];
    let loose: WorkoutBlock[] = [];
    const flush = () => {
      if (loose.length) out.push({ key: `${section}-l${out.length}`, label: base, units: unitsFor(loose) });
      loose = [];
    };
    blocks.forEach((b) => {
      if (b.kind === 'part') {
        flush();
        const h = formatHeadline(b.format, b.formatConfig);
        out.push({
          key: b.id,
          label: `${base === 'Rutina' ? '' : `${base} · `}${formatLabel(b.format)}${h ? ` ${h}` : ''}`,
          units: unitsFor(flattenBlocks(b.blocks)),
        });
      } else loose.push(...flattenBlocks([b]));
    });
    flush();
    return out;
  };
  // A section that is a video shows as one row; text sections list their parts.
  type Sec = { key: string; label: string; units: PvUnit[]; video?: { seconds: number | null } };
  const videoSec = (section: 'warmup' | 'main' | 'cooldown', label: string, url: string | null, seconds: number | null): Sec[] =>
    url || (section === 'main' && w.hasVideo) ? [{ key: `video-${section}`, label, units: [], video: { seconds } }] : [];
  const allSections: Sec[] = [
    ...videoSec('warmup', 'Calentamiento', w.warmupVideoUrl, w.warmupVideoDurationSeconds),
    ...partsOf('warmup', 'Calentamiento'),
    ...videoSec('main', 'Rutina', w.videoUrl, w.videoDurationSeconds),
    ...partsOf('main', 'Rutina'),
    ...videoSec('cooldown', 'Estiramiento', w.cooldownVideoUrl, w.cooldownVideoDurationSeconds),
    ...partsOf('cooldown', 'Estiramiento'),
  ];
  const sections = allSections.filter((s) => s.units.length > 0 || s.video);

  return (
    <View className="flex-1 bg-bg">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-32">
        {/* Hero */}
        <View className="relative" style={{ height: 300 }}>
          <Thumb uri={w.thumbnailUrl} className="absolute inset-0 h-full w-full" radius={0} />
          <View className="absolute inset-0 bg-black/40" />
          <View className="absolute inset-x-0 bottom-0 h-32 bg-bg/80" />
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            className="absolute left-5 h-10 w-10 items-center justify-center rounded-full bg-black/60"
            style={{ top: insets.top + 6 }}
          >
            <Text className="text-[17px] text-ink">←</Text>
          </Pressable>
          <View className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-7 -translate-y-7 items-center justify-center rounded-full bg-ink/90">
            <Text className="text-[20px] text-bg">▶</Text>
          </View>
          {w.isGuided && (w.format || w.estimatedDurationSeconds) ? (
            <View className="absolute bottom-3.5 left-5 self-start rounded bg-accent px-2 py-1">
              <Text className="font-mono-semibold text-[10px] uppercase tracking-wider text-white">
                {/* With a video too, the duration is the class's, not the format's: show the format alone. */}
                {[formatLabel(w.format), w.estimatedDurationSeconds && !w.hasVideo ? mmss(w.estimatedDurationSeconds) : '']
                  .filter(Boolean)
                  .join(' ')}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Body */}
        <View className="gap-4 px-5 pt-3">
          <Text className="font-extrabold text-[26px] leading-tight tracking-tight text-ink">
            {base.name}
          </Text>

          <View className="flex-row border-y border-line-2">
            {stats.map((s) => (
              <View key={s.k} className="flex-1 gap-1 py-3">
                <Text className="font-mono-medium text-[9px] uppercase tracking-widest text-ink-3">
                  {s.k}
                </Text>
                <Text className="font-bold text-[17px] tracking-tight text-ink">{s.v}</Text>
              </View>
            ))}
          </View>

          {base.description ? (
            <Text className="font-sans text-[14px] leading-6 text-ink-2">{base.description}</Text>
          ) : null}

          {w.bodyParts?.primary.length || w.bodyParts?.secondary.length ? (
            <BodyMap primary={w.bodyParts.primary} secondary={w.bodyParts.secondary} />
          ) : null}

          {levels.length > 0 ? (
            <View className="gap-2">
              <Text className="font-mono-semibold text-[10px] uppercase tracking-widest text-ink-3">Nivel</Text>
              <View className="flex-row flex-wrap gap-2">
                {levels.map((lv) => {
                  const on = (variantId ?? base.id) === lv.id;
                  return (
                    <Pressable
                      key={lv.id}
                      onPress={() => setVariantId(lv.id === base.id ? null : lv.id)}
                      className={`rounded-full border px-3.5 py-2 ${on ? 'border-accent bg-accent' : 'border-line-2 bg-surface-2'}`}
                    >
                      <Text className={`font-mono-semibold text-[12px] uppercase tracking-wider ${on ? 'text-white' : 'text-ink-2'}`}>
                        {lv.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* Blocks — grouped by section (calentamiento · rutina · enfriamiento) */}
          <View className="gap-5 pt-1">
            {sections.map((sec) => (
              <View key={sec.key} className="gap-2.5">
                <Text className="font-mono-semibold text-[10px] uppercase tracking-widest text-ink-3">
                  {sec.label}
                </Text>
                {sec.video ? (
                  <View className="flex-row items-center gap-3">
                    <View className="h-9 w-[58px] items-center justify-center rounded-[7px] bg-surface-2">
                      <Text className="text-[13px] text-ink">▶</Text>
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text className="font-semibold text-[14px] text-ink">Clase en video</Text>
                      <Text className="font-mono text-[10px] text-ink-3">
                        {w.videoPending && !sec.video.seconds ? 'El video se está preparando' : durationLabel(sec.video.seconds)}
                      </Text>
                    </View>
                  </View>
                ) : null}
                {sec.units.map((u, ui) => (
                  <View key={ui} className="gap-2">
                    {u.rounds != null && u.rounds > 1 ? (
                      <Text className="font-mono-medium text-[10px] uppercase tracking-wider text-accent">
                        {u.rounds} rondas
                      </Text>
                    ) : null}
                    {u.items.map((it) =>
                      it.kind === 'rest' ? (
                        <View key={it.id} className="flex-row items-center gap-3">
                          <View className="h-9 w-[58px]" />
                          <Text className="flex-1 font-mono-semibold text-[11px] uppercase tracking-wider text-ink-3">
                            Descanso
                          </Text>
                          <Text className="font-mono-semibold text-[13px] text-ink-3">
                            {it.workSeconds != null
                              ? it.workSeconds >= 60
                                ? mmss(it.workSeconds)
                                : `${it.workSeconds} s`
                              : ''}
                          </Text>
                        </View>
                      ) : (
                        <View key={it.id} className="flex-row items-center gap-3">
                          <Thumb uri={it.exercise?.thumbnailUrl} className="h-9 w-[58px]" radius={7} />
                          <View className="min-w-0 flex-1">
                            <Text numberOfLines={1} className="font-semibold text-[14px] text-ink">
                              {pluralName(it.exercise?.name ?? 'Ejercicio', it.measure === 'reps' ? it.reps : null)}
                            </Text>
                            {itemSub(it, units) ? (
                              <Text numberOfLines={1} className="font-mono text-[10px] text-ink-3">
                                {itemSub(it, units)}
                              </Text>
                            ) : null}
                          </View>
                          <Text className="font-mono-semibold text-[13px] text-ink-2">
                            {targetLabel(it, units.distance)}
                          </Text>
                        </View>
                      ),
                    )}
                  </View>
                ))}
              </View>
            ))}
            {download?.status === 'done' ? (
              <Text className="font-sans text-[13px] leading-6 text-ink-3">Disponible sin conexión</Text>
            ) : null}
          </View>
        </View>
      </ScrollView>

      {/* Bottom bar */}
      <View
        className="absolute inset-x-0 bottom-0 flex-row gap-2.5 bg-bg px-5 pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <Pressable className="h-[52px] w-[52px] items-center justify-center rounded-xl bg-surface-2">
          <Text className="text-[19px] text-ink">♡</Text>
        </Pressable>
        {sectionVideos(w).length ? <DownloadButton workout={w} /> : null}
        <Button
          label={variantId && !vq.data ? 'Cargando…' : 'Empezar rutina'}
          className="flex-1"
          onPress={() => router.push(`/(app)/entrenar/${playId}`)}
        />
      </View>
    </View>
  );
}
