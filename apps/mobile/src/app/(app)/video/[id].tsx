import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Loading } from '../../../components/ui';
import { api } from '../../../lib/api';
import { localVideoUri, useDownload } from '../../../lib/downloads';
import { durationLabel } from '../../../lib/format';

/**
 * Plays a video rutina: the offline copy when it is on the device (no network
 * needed), else Cloudflare Stream's HLS. Native controls, fullscreen in
 * landscape, picture in picture.
 */
export default function VideoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const download = useDownload(id);
  const offline = localVideoUri(download);
  const q = useQuery({ queryKey: ['workout', id], queryFn: () => api.workout(id), enabled: !offline });
  const workout = q.data ?? download?.workout;
  const uri = offline ?? workout?.videoUrl ?? null;

  const player = useVideoPlayer(null);
  useEffect(() => {
    if (!uri) return;
    player.replace({ uri, contentType: 'hls' });
    player.play();
  }, [uri, player]);

  const pending = !uri && (q.isLoading || (!q.isError && !workout));
  return (
    <View className="flex-1 bg-black">
      {uri ? (
        <VideoView
          player={player}
          style={{ flex: 1 }}
          contentFit="contain"
          nativeControls
          allowsPictureInPicture
          fullscreenOptions={{ enable: true, orientation: 'landscape', autoExitOnRotate: true }}
        />
      ) : pending ? (
        <Loading />
      ) : (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-center font-sans text-[14px] leading-6 text-ink-3">
            {workout?.videoPending ? 'El video todavía se está preparando. Vuelve en unos minutos.' : 'No se pudo cargar el video.'}
          </Text>
        </View>
      )}
      <View className="absolute inset-x-0 top-0 flex-row items-center gap-3 px-4" style={{ paddingTop: insets.top + 6 }}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          className="h-10 w-10 items-center justify-center rounded-full bg-black/60"
        >
          <Text className="text-[17px] text-ink">←</Text>
        </Pressable>
        {workout ? (
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="font-semibold text-[14px] text-ink">
              {workout.name}
            </Text>
            <Text className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
              {offline ? 'Sin conexión' : 'En línea'}
              {workout.videoDurationSeconds ? ` · ${durationLabel(workout.videoDurationSeconds)}` : ''}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
