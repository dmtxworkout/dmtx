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
        // The part's label shows once, on its first block.
        name:
          [partOf && (i === 0 || flat[i - 1]?.partOf !== partOf) ? partLabel(partOf) : null, b.label]
            .filter(Boolean)
            .join(' · ') || null,
        rounds: b.rounds && b.rounds > 0 ? b.rounds : 1,
        items: b.items.filter((it) => it.kind === 'rest' || it.exercise),
      }))
      .filter((bv) => bv.items.length > 0);
  }, [workout]);

  return (
    <>
      {blocksView.map((bv, i) => {
        const label = [bv.name, bv.rounds > 1 ? `× ${bv.rounds} rondas` : '']
          .filter(Boolean)
          .join('  ·  ');
        return (
          <View key={i} className="gap-0.5">
            {label ? (
              <Text className="pb-0.5 font-mono-semibold text-[11px] uppercase tracking-wider text-accent">
                {label}
              </Text>
            ) : null}
            {bv.items.map((it) =>
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
                  <Text numberOfLines={1} className="min-w-0 flex-1 font-semibold text-[15px] text-ink">
                    {it.exercise?.name}
                  </Text>
                  {loadKgOf(it) != null ? (
                    <Text className="font-mono text-[12px] text-ink-3">
                      {formatWeight(loadKgOf(it), wu)}
                    </Text>
                  ) : null}
                </View>
              ),
            )}
          </View>
        );
      })}
    </>
  );
}
