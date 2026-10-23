import { Alert, Pressable, Text, View } from 'react-native';
import { enqueueDownload, formatBytes, removeDownloadEntry, retryDownload, useDownload } from '../lib/downloads';
import type { WorkoutDetail } from '../lib/types';

/**
 * Square control next to «Empezar rutina» for a video rutina: an arrow to
 * download, the percentage while it goes (tap to cancel), a check once it is
 * on the device (tap to delete), a «!» if it failed (tap to retry).
 */
export function DownloadButton({ workout }: { workout: WorkoutDetail }) {
  const d = useDownload(workout.id);
  const disabled = !workout.videoUrl && !d;

  function onPress() {
    if (!d) {
      enqueueDownload(workout);
      return;
    }
    if (d.status === 'done') {
      Alert.alert('Eliminar descarga', `«${d.name}» dejará de estar disponible sin conexión${d.bytes ? ` (${formatBytes(d.bytes)})` : ''}.`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => void removeDownloadEntry(d.id) },
      ]);
      return;
    }
    if (d.status === 'error') {
      Alert.alert('No se pudo descargar', d.error ?? 'Inténtalo de nuevo.', [
        { text: 'Quitar', style: 'destructive', onPress: () => void removeDownloadEntry(d.id) },
        { text: 'Reintentar', onPress: () => retryDownload(d.id) },
      ]);
      return;
    }
    Alert.alert('Cancelar descarga', `Se detendrá la descarga de «${d.name}».`, [
      { text: 'Seguir descargando', style: 'cancel' },
      { text: 'Cancelar descarga', style: 'destructive', onPress: () => void removeDownloadEntry(d.id) },
    ]);
  }

  const label =
    !d ? '↓' : d.status === 'done' ? '✓' : d.status === 'error' ? '!' : d.status === 'queued' ? '…' : `${Math.round(d.fraction * 100)}`;
  const hint = !d
    ? 'Descargar'
    : d.status === 'done'
      ? 'Descargada'
      : d.status === 'error'
        ? 'Error'
        : d.status === 'queued'
          ? 'En cola'
          : `${Math.round(d.fraction * 100)} %`;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={hint}
      className={`h-[52px] w-[52px] items-center justify-center rounded-xl ${d?.status === 'done' ? 'bg-success/20' : 'bg-surface-2'} ${disabled ? 'opacity-40' : ''}`}
    >
      {d?.status === 'downloading' ? (
        <View className="items-center">
          <Text className="font-mono-semibold text-[13px] text-accent">{label}</Text>
          <View className="mt-1 h-[3px] w-7 overflow-hidden rounded-full bg-line">
            <View className="h-full rounded-full bg-accent" style={{ width: `${Math.round(d.fraction * 100)}%` }} />
          </View>
        </View>
      ) : (
        <Text className={`text-[19px] ${d?.status === 'done' ? 'text-success' : d?.status === 'error' ? 'text-accent' : 'text-ink'}`}>{label}</Text>
      )}
    </Pressable>
  );
}
