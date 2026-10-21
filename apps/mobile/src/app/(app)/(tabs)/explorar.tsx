import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Loading } from '../../../components/ui';
import { Row } from '../../../components/content';
import { api } from '../../../lib/api';
import { colors } from '../../../theme';

const CHIPS = [
  { label: 'Todo', value: 'all' },
  { label: 'Rutinas', value: 'workout' },
  { label: 'Programas', value: 'program' },
  { label: 'Habilidades', value: 'skill' },
] as const;

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className={`rounded-full px-3.5 py-2 ${active ? 'bg-ink' : 'bg-surface-2'}`}>
      <Text className={`font-semibold text-[13px] ${active ? 'text-bg' : 'text-ink-2'}`}>{label}</Text>
    </Pressable>
  );
}

export default function Explorar() {
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [type, setType] = useState<string>('all');
  // Tag filters only apply to rutinas; picking one narrows the results to them.
  const [muscleGroup, setMuscleGroup] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<string | null>(null);
  const showTags = type === 'all' || type === 'workout';
  const filters = useQuery({ queryKey: ['browse-filters'], queryFn: api.filters, enabled: showTags });
  const browse = useQuery({
    queryKey: ['browse', q, type, showTags ? muscleGroup : null, showTags ? equipment : null],
    queryFn: () =>
      api.browse({
        q,
        type,
        muscleGroup: showTags ? (muscleGroup ?? undefined) : undefined,
        equipment: showTags ? (equipment ?? undefined) : undefined,
      }),
  });
  const tagChips = [
    ...(filters.data?.muscleGroups ?? []).map((g) => ({
      key: `g:${g.slug}`,
      label: g.name,
      active: muscleGroup === g.slug,
      onPress: () => setMuscleGroup(muscleGroup === g.slug ? null : g.slug),
    })),
    ...(filters.data?.equipment ?? []).map((e) => ({
      key: `e:${e.slug}`,
      label: e.name,
      active: equipment === e.slug,
      onPress: () => setEquipment(equipment === e.slug ? null : e.slug),
    })),
  ];

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <View className="gap-3.5 px-5 pb-3 pt-2">
        <Text className="font-extrabold text-[26px] tracking-tight text-ink">Explorar</Text>
        <View className="h-11 flex-row items-center gap-2.5 rounded-xl bg-surface-2 px-3.5">
          <Text className="text-[15px] text-ink-3">⌕</Text>
          <TextInput
            className="h-full flex-1 font-sans text-[15px] text-ink"
            placeholder="Rutinas, programas, habilidades"
            placeholderTextColor={colors.ink3}
            selectionColor={colors.accent}
            value={q}
            onChangeText={setQ}
            autoCapitalize="none"
            returnKeyType="search"
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
          {CHIPS.map((c) => (
            <Chip key={c.value} label={c.label} active={c.value === type} onPress={() => setType(c.value)} />
          ))}
        </ScrollView>
        {showTags && tagChips.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
            {tagChips.map((c) => (
              <Chip key={c.key} label={c.label} active={c.active} onPress={c.onPress} />
            ))}
          </ScrollView>
        ) : null}
      </View>

      {browse.isLoading ? (
        <Loading />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="gap-5 pb-6 pt-1">
          {(browse.data?.rows ?? []).length === 0 ? (
            <Text className="px-5 pt-10 text-center font-sans text-[15px] text-ink-3">
              Sin resultados.
            </Text>
          ) : (
            browse.data?.rows.map((row) => <Row key={row.title} row={row} />)
          )}
        </ScrollView>
      )}
    </View>
  );
}
