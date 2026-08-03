import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { mmss } from '../lib/format';
import { useUnits } from '../lib/units-context';
import { formatDistance, formatWeight, weightToKg } from '../lib/units';
import type { DistanceUnit, WeightUnit } from '../lib/units';
import type { WorkoutDetail, WorkoutItem } from '../lib/types';

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
  const blocksView = useMemo(
    () =>
      workout.blocks
        .map((b) => ({
          name: b.label,
          rounds: b.rounds && b.rounds > 0 ? b.rounds : 1,
          items: b.items.filter((it) => it.kind === 'rest' || it.exercise),
        }))
        .filter((bv) => bv.items.length > 0),
    [workout],
  );

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
