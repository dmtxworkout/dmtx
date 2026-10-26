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
  // What the content works (rutinas, programs and skills): whole zones, or a
  // muscle of one (Brazos → Bíceps), or «Cuerpo completo». With several, the
  // content that works them all comes first.
  const [zones, setZones] = useState<string[]>([]);
  const [muscles, setMuscles] = useState<string[]>([]);
  const [fullBody, setFullBody] = useState(false);
  // The zone whose muscles show in the row below, to narrow it to one.
  const [open, setOpen] = useState<string | null>(null);
  // Rutinas only: equipment, and how the rutina is done (a video class, guided; a rutina may be both).
  const [equipment, setEquipment] = useState<string | null>(null);
  const [video, setVideo] = useState(false);
  const [guided, setGuided] = useState(false);
  const showTags = type === 'all' || type === 'workout';
  const filters = useQuery({ queryKey: ['browse-filters'], queryFn: api.filters });
  const browse = useQuery({
    queryKey: ['browse', q, type, zones, muscles, fullBody, showTags ? equipment : null, showTags && video, showTags && guided],
    queryFn: () =>
      api.browse({
        q,
        type,
        zones,
        muscles,
        fullBody,
        equipment: showTags ? (equipment ?? undefined) : undefined,
        video: showTags && video,
        guided: showTags && guided,
      }),
  });

  const zoneList = filters.data?.zones ?? [];
  const musclesOf = (zone: string) => zoneList.find((z) => z.zone === zone)?.muscles ?? [];
  const picked = (zone: string) => musclesOf(zone).filter((m) => muscles.includes(m.slug));
  const zoneOn = (zone: string) => zones.includes(zone) || picked(zone).length > 0;
  const clearZone = (zone: string) => {
    setZones((zs) => zs.filter((z) => z !== zone));
    setMuscles((ms) => ms.filter((m) => !musclesOf(zone).some((x) => x.slug === m)));
  };
  // A zone: on (and open, to narrow it); tapped again while open, off.
  const tapZone = (zone: string) => {
    if (!zoneOn(zone)) {
      setZones((zs) => [...zs, zone]);
      setOpen(musclesOf(zone).length > 1 ? zone : null);
    } else if (open !== zone && musclesOf(zone).length > 1) setOpen(zone);
    else {
      clearZone(zone);
      setOpen(null);
    }
  };
  // A muscle narrows its zone: the zone as a whole gives way to the muscles picked.
  const tapMuscle = (zone: string, slug: string) => {
    const next = muscles.includes(slug) ? muscles.filter((m) => m !== slug) : [...muscles, slug];
    setMuscles(next);
    const anyLeft = musclesOf(zone).some((m) => next.includes(m.slug));
    setZones((zs) => (anyLeft ? zs.filter((z) => z !== zone) : zs.includes(zone) ? zs : [...zs, zone]));
  };
  const bodyChips = [
    ...(filters.data?.fullBody ? [{ key: 'b:full', label: 'Cuerpo completo', active: fullBody, onPress: () => setFullBody(!fullBody) }] : []),
    ...zoneList.map((z) => {
      const narrowed = picked(z.zone);
      return {
        key: `z:${z.zone}`,
        label: narrowed.length ? `${z.name} · ${narrowed.map((m) => m.name).join(', ')}` : z.name,
        active: zoneOn(z.zone),
        onPress: () => tapZone(z.zone),
      };
    }),
  ];
  const openZone = open ? zoneList.find((z) => z.zone === open) : undefined;
  const muscleChips = openZone
    ? [
        {
          key: 'm:all',
          label: `Todo ${openZone.name.toLowerCase()}`,
          active: zones.includes(openZone.zone),
          onPress: () => {
            setMuscles((ms) => ms.filter((m) => !openZone.muscles.some((x) => x.slug === m)));
            setZones((zs) => (zs.includes(openZone.zone) ? zs : [...zs, openZone.zone]));
          },
        },
        ...openZone.muscles.map((m) => ({
          key: `m:${m.slug}`,
          label: m.name,
          active: muscles.includes(m.slug),
          onPress: () => tapMuscle(openZone.zone, m.slug),
        })),
      ]
    : [];
  const tagChips = [
    { key: 'k:video', label: '▶ Con video', active: video, onPress: () => setVideo(!video) },
    { key: 'k:guided', label: '☰ Guiada', active: guided, onPress: () => setGuided(!guided) },
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
        {bodyChips.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
            {bodyChips.map((c) => (
              <Chip key={c.key} label={c.label} active={c.active} onPress={c.onPress} />
            ))}
          </ScrollView>
        ) : null}
        {muscleChips.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 pl-3">
            {muscleChips.map((c) => (
              <Chip key={c.key} label={c.label} active={c.active} onPress={c.onPress} />
            ))}
          </ScrollView>
        ) : null}
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
