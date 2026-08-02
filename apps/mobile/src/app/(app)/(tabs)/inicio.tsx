import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Button, Center, Loading, Logo, Thumb } from '../../../components/ui';
import { Row, hrefForCard } from '../../../components/content';
import { api } from '../../../lib/api';
import { difficultyLabel, es } from '../../../i18n';

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function Inicio() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useQuery({ queryKey: ['me'], queryFn: api.me });
  const home = useQuery({ queryKey: ['home'], queryFn: api.home });

  if (home.isLoading) return <Loading />;
  if (home.isError || !home.data) {
    return (
      <Center>
        <Text className="text-center font-sans text-[15px] text-ink-3">{es.common.error}</Text>
        <Button label={es.common.retry} variant="surface" onPress={() => home.refetch()} />
      </Center>
    );
  }

  const { hero, rows } = home.data;
  const heroMeta = hero
    ? [hero.meta, difficultyLabel(hero.difficulty, true)].filter(Boolean).join(' · ')
    : '';

  return (
    <View className="flex-1 bg-bg">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-6">
        {/* Hero */}
        <View className="relative" style={{ height: 380 }}>
          <Thumb uri={hero?.thumbnailUrl} className="absolute inset-0 h-full w-full" radius={0} />
          <View className="absolute inset-0 bg-black/45" />
          <View className="absolute inset-x-0 bottom-0 h-40 bg-bg/80" />

          {/* Top bar */}
          <View
            className="absolute inset-x-0 flex-row items-center gap-3 px-5"
            style={{ top: insets.top + 6 }}
          >
            <Logo height={26} />
            <View className="ml-auto flex-row items-center gap-2">
              <Text className="text-[18px] text-ink">⌕</Text>
              <View className="h-10 w-10 items-center justify-center rounded-full bg-accent">
                <Text className="font-bold text-[13px] text-white">
                  {me.data ? initials(me.data.user.name) : ''}
                </Text>
              </View>
            </View>
          </View>

          {/* Hero content */}
          {hero ? (
            <View className="absolute inset-x-0 bottom-0 gap-3 px-5 pb-5">
              <View className="self-start rounded bg-accent px-2 py-1">
                <Text className="font-mono-semibold text-[10px] uppercase tracking-wider text-white">
                  Nuevo esta semana
                </Text>
              </View>
              <Text className="font-extrabold text-[30px] leading-[1.05] text-ink">{hero.name}</Text>
              {heroMeta ? <Text className="font-mono text-[12px] text-ink-2">{heroMeta}</Text> : null}
              <View className="flex-row gap-2.5 pt-1">
                <Button
                  label="Empezar"
                  icon="▶"
                  variant="light"
                  className="flex-1"
                  onPress={() => router.push(hrefForCard(hero))}
                />
                <Pressable className="h-[54px] w-[54px] items-center justify-center rounded-xl bg-surface-3">
                  <Text className="text-[22px] text-ink">+</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>

        {/* Rows */}
        <View className="gap-5 pt-4">
          {rows.length === 0 ? (
            <View className="items-center gap-2 px-8 py-16">
              <Text className="text-center font-sans text-[15px] text-ink-3">
                Aún no hay contenido publicado.
              </Text>
            </View>
          ) : (
            rows.map((row) => <Row key={row.title} row={row} />)
          )}
        </View>
      </ScrollView>
    </View>
  );
}
