import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Button, Loading } from '../../../components/ui';
import { api } from '../../../lib/api';
import { signOut } from '../../../lib/auth';
import {
  QUALITIES,
  formatBytes,
  setDownloadQuality,
  useDownloadQuality,
  useDownloads,
  type DownloadQuality,
} from '../../../lib/downloads';
import { useUnits } from '../../../lib/units-context';

/** Segmented toggle (e.g. kg | lb, or the three download qualities). */
function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <View className="flex-row rounded-xl bg-surface-2 p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            className={`flex-1 items-center justify-center rounded-lg py-2 ${active ? 'bg-accent' : ''}`}
          >
            <Text className={`font-semibold text-[14px] ${active ? 'text-white' : 'text-ink-3'}`}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function accessLine(entitlement: NonNullable<Awaited<ReturnType<typeof api.me>>>['entitlement']): string {
  if (!entitlement.active) return 'Sin suscripción activa';
  if (entitlement.source === 'trial' && entitlement.trialEndsAt) {
    const days = Math.max(
      0,
      Math.ceil((new Date(entitlement.trialEndsAt).getTime() - Date.now()) / 86_400_000),
    );
    return `Prueba gratis · ${days} día${days === 1 ? '' : 's'} restantes`;
  }
  if (entitlement.source === 'grant') return 'Acceso de cortesía';
  return 'Suscripción activa';
}

export default function Perfil() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const me = useQuery({ queryKey: ['me'], queryFn: api.me });
  const { units, setWeight, setDistance } = useUnits();
  const quality = useDownloadQuality();
  const downloads = useDownloads();
  const saved = downloads.filter((d) => d.status === 'done');
  const savedBytes = saved.reduce((n, d) => n + (d.bytes ?? 0), 0);
  const inFlight = downloads.length - saved.length;

  if (me.isLoading) return <Loading />;

  const user = me.data?.user;
  const entitlement = me.data?.entitlement;

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="px-6 pb-10"
      style={{ paddingTop: insets.top }}
    >
      <Text className="pt-2 font-extrabold text-[26px] tracking-tight text-ink">Perfil</Text>

      <View className="mt-6 flex-row items-center gap-4">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-accent">
          <Text className="font-bold text-[22px] text-white">
            {user?.name?.charAt(0)?.toUpperCase() ?? '·'}
          </Text>
        </View>
        <View className="flex-1">
          <Text className="font-bold text-[18px] text-ink">{user?.name}</Text>
          <Text className="font-sans text-[14px] text-ink-3">{user?.email}</Text>
        </View>
      </View>

      {entitlement ? (
        <View className="mt-6 rounded-2xl border border-line bg-surface p-4">
          <Text className="font-mono-medium text-[10px] uppercase tracking-wider text-ink-3">
            Suscripción
          </Text>
          <Text className="mt-1.5 font-semibold text-[16px] text-ink">{accessLine(entitlement)}</Text>
          {entitlement.source === 'trial' ? (
            <Text className="mt-1 font-sans text-[13px] leading-5 text-ink-3">
              Suscríbete en la web para mantener el acceso cuando termine tu prueba.
            </Text>
          ) : null}
        </View>
      ) : null}

      <View className="mt-6 rounded-2xl border border-line bg-surface p-4">
        <Text className="font-mono-medium text-[10px] uppercase tracking-wider text-ink-3">
          Unidades
        </Text>
        <View className="mt-3 gap-1.5">
          <Text className="font-semibold text-[14px] text-ink">Peso</Text>
          <Segmented
            value={units.weight}
            onChange={setWeight}
            options={[
              { value: 'lb', label: 'Libras (lb)' },
              { value: 'kg', label: 'Kilos (kg)' },
            ]}
          />
        </View>
        <View className="mt-4 gap-1.5">
          <Text className="font-semibold text-[14px] text-ink">Distancia</Text>
          <Segmented
            value={units.distance}
            onChange={setDistance}
            options={[
              { value: 'km', label: 'Kilómetros (km)' },
              { value: 'mi', label: 'Millas (mi)' },
            ]}
          />
        </View>
      </View>

      <View className="mt-6 rounded-2xl border border-line bg-surface p-4">
        <Text className="font-mono-medium text-[10px] uppercase tracking-wider text-ink-3">
          Descargas
        </Text>
        <View className="mt-3 gap-1.5">
          <Text className="font-semibold text-[14px] text-ink">Calidad de descarga</Text>
          <Segmented<DownloadQuality>
            value={quality}
            onChange={setDownloadQuality}
            options={QUALITIES.map((q) => ({ value: q.value, label: q.label }))}
          />
          <Text className="font-sans text-[12px] leading-5 text-ink-3">
            {QUALITIES.find((q) => q.value === quality)?.hint}. Solo afecta a las próximas descargas.
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/(app)/descargas')}
          className="mt-4 flex-row items-center justify-between rounded-xl bg-surface-2 px-4 py-3 active:opacity-80"
        >
          <View>
            <Text className="font-semibold text-[14px] text-ink">Rutinas descargadas</Text>
            <Text className="font-mono text-[11px] text-ink-3">
              {saved.length === 0 && inFlight === 0
                ? 'Ninguna todavía'
                : [
                    saved.length ? `${saved.length} · ${formatBytes(savedBytes)}` : '',
                    inFlight ? `${inFlight} en curso` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
            </Text>
          </View>
          <Text className="text-[17px] text-ink-3">›</Text>
        </Pressable>
      </View>

      <View className="mt-8">
        <Button label="Cerrar sesión" variant="secondary" onPress={() => signOut()} />
      </View>
    </ScrollView>
  );
}
