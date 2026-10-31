// What a rutina works, on a drawn body: front and back, primary muscles in the
// accent and secondary ones fainter. The figure (man or woman) is the member's,
// set in Perfil.
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import Svg, { G, Path } from 'react-native-svg';
import { BODY_FIGURES, type BodyView } from '@dmtx/core/body-map';
import { BODY_PART, type BodyPart } from '@dmtx/schemas';
import { api } from '../lib/api';
import { figureOf } from '../lib/profile';
import { colors } from '../theme';

const MUSCLE = '#34343e';
const SECONDARY = '#7c3d27';
const VIEWS: { view: BodyView; label: string }[] = [
  { view: 'front', label: 'Frente' },
  { view: 'back', label: 'Espalda' },
];

export function BodyMap({ primary, secondary }: { primary: BodyPart[]; secondary: BodyPart[] }) {
  const me = useQuery({ queryKey: ['me'], queryFn: api.me });
  const figure = figureOf(me.data?.profile);
  const fillOf = (part: BodyPart) => (primary.includes(part) ? colors.accent : secondary.includes(part) ? SECONDARY : MUSCLE);

  return (
    <View className="gap-3">
      <Text className="font-mono-semibold text-[10px] uppercase tracking-widest text-ink-3">Qué trabaja</Text>

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
                  <G key={part} fill={fillOf(part)}>
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
