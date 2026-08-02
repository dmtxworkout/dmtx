import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Thumb } from './ui';
import type { ContentCard, ContentRow } from '../lib/types';

export function hrefForCard(item: ContentCard): Href {
  switch (item.kind) {
    case 'program':
      return `/(app)/programas/${item.id}`;
    case 'skill':
      return `/(app)/habilidades/${item.id}`;
    default:
      return `/(app)/rutinas/${item.id}`;
  }
}

const LAYOUT: Record<ContentRow['layout'], { w: number; aspect: string }> = {
  row: { w: 176, aspect: 'aspect-[16/9]' },
  poster: { w: 134, aspect: 'aspect-[2/3]' },
  square: { w: 116, aspect: 'aspect-square' },
};

export function Card({
  item,
  layout,
}: {
  item: ContentCard;
  layout: ContentRow['layout'];
}) {
  const router = useRouter();
  const { w, aspect } = LAYOUT[layout];
  return (
    <Pressable style={{ width: w }} className="gap-1.5" onPress={() => router.push(hrefForCard(item))}>
      <View className={`relative overflow-hidden rounded-[10px] ${aspect}`}>
        <Thumb uri={item.thumbnailUrl} className="h-full w-full" radius={10} />
        <View className="absolute left-2 top-2 rounded bg-black/75 px-1.5 py-[3px]">
          <Text className="font-mono-semibold text-[9px] uppercase tracking-wide text-ink-2">
            {item.tag}
          </Text>
        </View>
        {item.progressPct > 0 ? (
          <View className="absolute inset-x-0 bottom-0 h-1 bg-line">
            <View className="h-full bg-accent" style={{ width: `${item.progressPct}%` }} />
          </View>
        ) : null}
      </View>
      <Text numberOfLines={1} className="font-semibold text-[13px] text-ink">
        {item.name}
      </Text>
      {item.meta ? (
        <Text numberOfLines={1} className="font-mono text-[10px] text-ink-3">
          {item.meta}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function Row({ row }: { row: ContentRow }) {
  return (
    <View className="gap-2.5">
      <View className="flex-row items-baseline gap-2 px-5">
        <Text className="font-bold text-[16px] tracking-tight text-ink">{row.title}</Text>
        <Text className="ml-auto text-[19px] text-ink-4">›</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-3 px-5"
      >
        {row.items.map((item) => (
          <Card key={`${item.kind}-${item.id}`} item={item} layout={row.layout} />
        ))}
      </ScrollView>
    </View>
  );
}
