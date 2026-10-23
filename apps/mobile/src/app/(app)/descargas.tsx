import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Thumb } from '../../components/ui';
import {
  formatBytes,
  removeAllDownloads,
  removeDownloadEntry,
  retryDownload,
  useDownloads,
  type Download,
} from '../../lib/downloads';
import { durationLabel } from '../../lib/format';

function statusLine(d: Download): string {
  switch (d.status) {
    case 'queued':
      return 'En cola';
    case 'downloading':
      return `Descargando ${Math.round(d.fraction * 100)} %${d.bytes ? ` · ${formatBytes(d.bytes)}` : ''}`;
    case 'done':
      return `${formatBytes(d.bytes)} · ${d.quality}p`;
    case 'error':
      return d.error ?? 'No se pudo descargar';
  }
}

/** Everything saved for offline use, with its size, and a way to delete one or all. */
export default function Descargas() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const downloads = useDownloads();
  const total = downloads.reduce((n, d) => n + (d.status === 'done' ? (d.bytes ?? 0) : 0), 0);

  function onAction(d: Download) {
    if (d.status === 'error') {
      Alert.alert('No se pudo descargar', d.error ?? 'Inténtalo de nuevo.', [
        { text: 'Quitar', style: 'destructive', onPress: () => void removeDownloadEntry(d.id) },
        { text: 'Reintentar', onPress: () => retryDownload(d.id) },
      ]);
      return;
    }
    const inFlight = d.status !== 'done';
    Alert.alert(inFlight ? 'Cancelar descarga' : 'Eliminar descarga', `«${d.name}»${d.bytes && !inFlight ? ` · ${formatBytes(d.bytes)}` : ''}`, [
      { text: 'Volver', style: 'cancel' },
      { text: inFlight ? 'Cancelar descarga' : 'Eliminar', style: 'destructive', onPress: () => void removeDownloadEntry(d.id) },
    ]);
  }

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center gap-3 px-5 pb-3 pt-2">
        <Pressable onPress={() => router.back()} hitSlop={10} className="h-10 w-10 items-center justify-center rounded-full bg-surface-2">
          <Text className="text-[17px] text-ink">←</Text>
        </Pressable>
        <View className="flex-1">
          <Text className="font-extrabold text-[22px] tracking-tight text-ink">Descargas</Text>
          <Text className="font-mono text-[11px] text-ink-3">
            {downloads.length === 0
              ? 'Nada guardado todavía'
              : `${downloads.length} rutina${downloads.length === 1 ? '' : 's'}${total ? ` · ${formatBytes(total)} en el dispositivo` : ''}`}
          </Text>
        </View>
        {downloads.length > 0 ? (
          <Pressable
            onPress={() =>
              Alert.alert('Eliminar todas las descargas', `Se liberarán ${formatBytes(total) || '0 MB'}.`, [
                { text: 'Volver', style: 'cancel' },
                { text: 'Eliminar todo', style: 'destructive', onPress: () => void removeAllDownloads() },
              ])
            }
            hitSlop={8}
          >
            <Text className="font-semibold text-[13px] text-accent">Eliminar todo</Text>
          </Pressable>
        ) : null}
      </View>
      <FlatList
        data={downloads}
        keyExtractor={(d) => d.id}
        contentContainerClassName="px-5 pb-10"
        ItemSeparatorComponent={() => <View className="h-px bg-line-2" />}
        ListEmptyComponent={
          <Text className="pt-10 text-center font-sans text-[14px] leading-6 text-ink-3">
            Abre una rutina en video y toca ↓ para tenerla sin conexión.
          </Text>
        }
        renderItem={({ item: d }) => (
          <Pressable onPress={() => router.push(`/(app)/rutinas/${d.id}`)} className="flex-row items-center gap-3 py-3 active:opacity-80">
            <Thumb uri={d.thumbnailUrl} className="h-14 w-[92px]" radius={8} />
            <View className="min-w-0 flex-1 gap-0.5">
              <Text numberOfLines={1} className="font-semibold text-[15px] text-ink">
                {d.name}
              </Text>
              <Text numberOfLines={1} className={`font-mono text-[11px] ${d.status === 'error' ? 'text-accent' : 'text-ink-3'}`}>
                {statusLine(d)}
                {d.durationSeconds && d.status === 'done' ? ` · ${durationLabel(d.durationSeconds)}` : ''}
              </Text>
              {d.status === 'downloading' ? (
                <View className="mt-1 h-[3px] overflow-hidden rounded-full bg-line">
                  <View className="h-full rounded-full bg-accent" style={{ width: `${Math.round(d.fraction * 100)}%` }} />
                </View>
              ) : null}
            </View>
            <Pressable onPress={() => onAction(d)} hitSlop={10} className="h-9 w-9 items-center justify-center rounded-full bg-surface-2">
              <Text className={`text-[15px] ${d.status === 'done' ? 'text-ink-3' : 'text-ink'}`}>{d.status === 'done' ? '🗑' : d.status === 'error' ? '!' : '✕'}</Text>
            </Pressable>
          </Pressable>
        )}
      />
    </View>
  );
}
