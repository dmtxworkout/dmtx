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

export default function Explorar() {
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [type, setType] = useState<string>('all');
  const browse = useQuery({
    queryKey: ['browse', q, type],
    queryFn: () => api.browse({ q, type }),
  });

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
          {CHIPS.map((c) => {
            const active = c.value === type;
            return (
              <Pressable
                key={c.value}
                onPress={() => setType(c.value)}
                className={`rounded-full px-3.5 py-2 ${active ? 'bg-ink' : 'bg-surface-2'}`}
              >
                <Text className={`font-semibold text-[13px] ${active ? 'text-bg' : 'text-ink-2'}`}>
                  {c.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
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
