// What a rutina works, on a drawn body: front and back, primary muscles in the
// accent and secondary ones fainter. The figure (man or woman) is remembered on
// the device.
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Svg, { G, Path } from 'react-native-svg';
import { BODY_FIGURES, PLAIN_BODY_PARTS, type BodyFigureKind, type BodyView } from '@dmtx/core/body-map';
import { BODY_PART, type BodyPart } from '@dmtx/schemas';
import { colors } from '../theme';

const STORAGE_KEY = 'dmtx.body-figure';
const MUSCLE = '#34343e';
const SECONDARY = '#7c3d27';
const VIEWS: { view: BodyView; label: string }[] = [
  { view: 'front', label: 'Frente' },
  { view: 'back', label: 'Espalda' },
];
const FIGURES: { kind: BodyFigureKind; label: string }[] = [
  { kind: 'male', label: 'Hombre' },
  { kind: 'female', label: 'Mujer' },
];

export function BodyMap({ primary, secondary }: { primary: BodyPart[]; secondary: BodyPart[] }) {
  const [figure, setFigure] = useState<BodyFigureKind>('male');

  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(STORAGE_KEY).then((saved) => {
      if (active && (saved === 'male' || saved === 'female')) setFigure(saved);
    });
    return () => {
      active = false;
    };
  }, []);

  const choose = (kind: BodyFigureKind) => {
    setFigure(kind);
    void SecureStore.setItemAsync(STORAGE_KEY, kind);
  };
  const fillOf = (part: BodyPart) =>
    primary.includes(part) ? colors.accent : secondary.includes(part) ? SECONDARY : PLAIN_BODY_PARTS.includes(part) ? colors.surface : MUSCLE;

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="font-mono-semibold text-[10px] uppercase tracking-widest text-ink-3">Qué trabaja</Text>
        <View className="flex-row overflow-hidden rounded-lg border border-line">
          {FIGURES.map(({ kind, label }) => (
            <Pressable key={kind} onPress={() => choose(kind)} className={`px-3 py-1.5 ${figure === kind ? 'bg-surface-3' : ''}`}>
              <Text className={`font-sans text-[12px] ${figure === kind ? 'text-ink' : 'text-ink-3'}`}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View className="flex-row gap-2">
        {VIEWS.map(({ view, label }) => {
          const f = BODY_FIGURES[figure][view];
          return (
            <View key={view} className="flex-1 items-center gap-1.5">
              <Svg width="100%" height={300} viewBox={f.viewBox} accessibilityLabel={label}>
                <Path d={f.border} fill="none" stroke={colors.line} strokeWidth={2} />
                {f.base.map((d, i) => (
                  <Path key={i} d={d} fill={colors.surface} stroke={colors.line} strokeWidth={2} />
                ))}
                {BODY_PART.map((part) => (
                  <G key={part} fill={fillOf(part)} stroke={PLAIN_BODY_PARTS.includes(part) ? colors.line : undefined} strokeWidth={2}>
                    {f.parts[part]?.map((d, i) => <Path key={i} d={d} />)}
                  </G>
                ))}
              </Svg>
              <Text className="font-mono-medium text-[9px] uppercase tracking-widest text-ink-3">{label}</Text>
            </View>
          );
        })}
      </View>

      <View className="flex-row justify-center gap-4">
        <Legend color={colors.accent} label="Principal" />
        {secondary.length ? <Legend color={SECONDARY} label="Secundario" /> : null}
      </View>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
      <Text className="font-sans text-[12px] text-ink-3">{label}</Text>
    </View>
  );
}
