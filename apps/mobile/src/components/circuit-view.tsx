import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { mmss } from '../lib/format';
import { useUnits } from '../lib/units-context';
import { formatDistance, formatWeight, weightToKg } from '../lib/units';
import type { DistanceUnit, WeightUnit } from '../lib/units';
import type { WorkoutBlock, WorkoutDetail, WorkoutItem } from '../lib/types';
import { formatLabel } from '../i18n';

/** "AMRAP 12 min"-style label for a part block. */
export function partLabel(b: WorkoutBlock): string {
  const cfg = (b.formatConfig ?? {}) as Record<string, number | undefined>;
  const fmt = formatLabel(b.format);
  const dur = (s?: number) => (s ? (s % 60 === 0 ? `${s / 60} min` : `${s}s`) : '');
  switch (b.format) {
    case 'amrap':
      return `${fmt} ${dur(cfg.totalSeconds)}`.trim();
    case 'emom':
      return `${fmt} ${cfg.rounds ?? ''} x ${dur(cfg.intervalSeconds ?? 60)}`.trim();
    case 'tabata':
      return `${fmt} ${cfg.rounds ?? 8} x ${cfg.workSeconds ?? 20}/${cfg.restSeconds ?? 10}`;
    default:
      return fmt || 'Parte';
  }
}

const loadKgOf = (it: WorkoutItem): number | null => {
  const l = it.loadPrescription;
  return l?.type === 'absolute' ? weightToKg(l.value, l.unit) : null;
};

function targetText(it: WorkoutItem, du: DistanceUnit): string {
  const mt = it.measure;
  if (mt === 'time' && it.workSeconds != null)
    return it.workSeconds >= 60 ? mmss(it.workSeconds) : `${it.workSeconds} s`;
  if (mt === 'distance' && it.distanceMeters != null) return formatDistance(it.distanceMeters, du);
  if (it.reps != null) return `${it.reps}`;
  return '—';
}

/**
 * Read-only reference of the work to do: blocks (with their round count) and the
 * exercises/rests inside. Shared by the AMRAP and EMOM players.
 */
export function CircuitView({ workout }: { workout: WorkoutDetail }) {
  const { units } = useUnits();
  const du: DistanceUnit = units.distance;
  const wu: WeightUnit = units.weight;
  // Parts (a format holding blocks) flatten to a header plus their blocks.
  const blocksView = useMemo(() => {
    const flat: { block: WorkoutBlock; partOf: WorkoutBlock | null }[] = [];
    for (const b of workout.blocks) {
      if (b.kind === 'part') b.blocks.forEach((c) => flat.push({ block: c, partOf: b }));
      else flat.push({ block: b, partOf: null });
    }
    return flat
      .map(({ block: b, partOf }, i) => ({
        // The part's label shows once, above its first block.
        part: partOf && (i === 0 || flat[i - 1]?.partOf !== partOf) ? partLabel(partOf) : null,
        label: b.label ? b.label.replace(/^\p{L}/u, (c) => c.toUpperCase()) : null,
        rounds: b.rounds && b.rounds > 0 ? b.rounds : 1,
        // Notes written for the athlete: the part's (once, on its first block) and the block's.
        note:
          [partOf && (i === 0 || flat[i - 1]?.partOf !== partOf) ? partOf.notes : null, b.notes]
            .filter(Boolean)
            .join(' · ') || null,
        items: b.items.filter((it) => it.kind === 'rest' || it.exercise),
      }))
      .filter((bv) => bv.items.length > 0);
  }, [workout]);

  return (
    <>
      {blocksView.map((bv, i) => {
        // A group (rounds, a label or several exercises) is boxed with a plain
        // heading, so it is clear what repeats together and what sits outside.
        const grouped = bv.rounds > 1 || !!bv.label || bv.items.length > 1;
        const rows = bv.items.map((it) =>
          it.kind === 'rest' ? (
            <View key={it.id} className="flex-row items-center gap-3 border-b border-line-2 py-2">
              <Text className="w-14 font-mono-semibold text-[15px] text-ink-4">
                {it.workSeconds != null
                  ? it.workSeconds >= 60
                    ? mmss(it.workSeconds)
                    : `${it.workSeconds} s`
                  : '—'}
              </Text>
              <Text numberOfLines={1} className="min-w-0 flex-1 font-semibold text-[15px] text-ink-3">
                Descanso
              </Text>
            </View>
          ) : (
            <View key={it.id} className="flex-row items-center gap-3 border-b border-line-2 py-2">
              <Text className="w-14 font-mono-semibold text-[15px] text-accent">
                {targetText(it, du)}
              </Text>
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="font-semibold text-[15px] text-ink">
                  {it.exercise?.name}
                </Text>
                {it.notes ? (
                  <Text className="font-sans text-[12px] italic leading-4 text-ink-3">{it.notes}</Text>
                ) : null}
              </View>
              {loadKgOf(it) != null ? (
                <Text className="font-mono text-[12px] text-ink-3">
                  {formatWeight(loadKgOf(it), wu)}
                </Text>
              ) : null}
            </View>
          ),
        );
        return (
          <View key={i} className="gap-1">
            {bv.part ? (
              <Text className="pb-0.5 font-mono-semibold text-[11px] uppercase tracking-wider text-accent">
                {bv.part}
              </Text>
            ) : null}
            {grouped ? (
              <View className="rounded-xl border border-line-2 bg-surface-2 px-3 py-2">
                <View className="flex-row flex-wrap items-baseline gap-x-2 pb-1">
                  <Text className="font-bold text-[15px] text-ink">
                    {bv.rounds > 1 ? `${bv.rounds} rondas` : (bv.label ?? 'Bloque')}
                  </Text>
                  {bv.rounds > 1 && bv.label ? (
                    <Text className="font-sans text-[13px] text-ink-3">· {bv.label}</Text>
                  ) : null}
                  <Text className="font-sans text-[13px] text-ink-3">
                    {bv.rounds > 1 ? `repite estos ejercicios ${bv.rounds} veces` : 'seguidos'}
                  </Text>
                </View>
                {bv.note ? (
                  <Text className="pb-1 font-sans text-[13px] italic leading-5 text-ink-3">{bv.note}</Text>
                ) : null}
                <View className="border-l-2 border-accent/40 pl-3">{rows}</View>
              </View>
            ) : (
              <View>
                {bv.note ? (
                  <Text className="pb-1 font-sans text-[13px] italic leading-5 text-ink-3">{bv.note}</Text>
                ) : null}
                {rows}
              </View>
            )}
          </View>
        );
      })}
    </>
  );
}
