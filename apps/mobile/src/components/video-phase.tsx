import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Button } from './ui';
import { durationLabel } from '../lib/format';

/**
 * One section of a rutina played as a video (the warm-up, the class itself or
 * the stretch): expo-video with native controls, fullscreen in landscape and
 * picture in picture, playing the offline copy when there is one. «Continuar»
 * moves on; it lights up once the video has played to the end.
 */
export function VideoPhase({
  title,
  name,
  uri,
  offline,
  durationSeconds,
  doneLabel = 'Continuar',
  onDone,
  onExit,
}: {
  title: string;
  name: string;
  uri: string;
  offline: boolean;
  durationSeconds: number | null;
  doneLabel?: string;
  onDone: () => void;
  onExit: () => void;
}) {
  const insets = useSafeAreaInsets();
  const player = useVideoPlayer({ uri, contentType: 'hls' }, (p) => {
    p.play();
  });
  const [ended, setEnded] = useState(false);
  useEffect(() => {
    const sub = player.addListener('playToEnd', () => setEnded(true));
    return () => sub.remove();
  }, [player]);

  return (
    <View className="flex-1 bg-black">
      <View className="flex-row items-center gap-3 px-4" style={{ paddingTop: insets.top + 6 }}>
        <Pressable onPress={onExit} hitSlop={12} className="h-10 w-10 items-center justify-center rounded-full bg-white/10">
          <Text className="text-[18px] text-ink">✕</Text>
        </Pressable>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="font-semibold text-[14px] text-ink">
            {name}
          </Text>
          <Text className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
            {title}
            {durationSeconds ? ` · ${durationLabel(durationSeconds)}` : ''}
            {offline ? ' · Sin conexión' : ''}
          </Text>
        </View>
      </View>
      <VideoView
        player={player}
        style={{ flex: 1 }}
        contentFit="contain"
        nativeControls
        allowsPictureInPicture
        fullscreenOptions={{ enable: true, orientation: 'landscape', autoExitOnRotate: true }}
      />
      <View className="px-5 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
        <Button label={doneLabel} variant={ended ? 'primary' : 'surface'} onPress={onDone} />
      </View>
    </View>
  );
}
