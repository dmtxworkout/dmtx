import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import type { TrainingMode } from '@dmtx/schemas';
import { durationLabel } from '../lib/format';

const STORAGE_KEY = 'dmtx.trainingMode';

/** The mode the user picked last time (null until read, or never picked). */
export function useLastTrainingMode(): TrainingMode | null {
  const [mode, setMode] = useState<TrainingMode | null>(null);
  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(STORAGE_KEY).then((raw) => {
      if (active && (raw === 'class' || raw === 'guided')) setMode(raw);
    });
    return () => {
      active = false;
    };
  }, []);
  return mode;
}

/**
 * A rutina that has a section both written and on video: the user chooses,
 * once, to follow the class or to be guided exercise by exercise. The last
 * choice is remembered and shown as their preference.
 */
export function ModeChoice({
  name,
  videoSeconds,
  onChoose,
  onExit,
}: {
  name: string;
  videoSeconds: number | null;
  onChoose: (mode: TrainingMode) => void;
  onExit: () => void;
}) {
  const insets = useSafeAreaInsets();
  const last = useLastTrainingMode();
  const choose = (mode: TrainingMode) => {
    void SecureStore.setItemAsync(STORAGE_KEY, mode);
    onChoose(mode);
  };
  const options: { mode: TrainingMode; icon: string; title: string; body: string }[] = [
    {
      mode: 'class',
      icon: '▶',
      title: 'Ver la clase',
      body: `Sigue el video de principio a fin${videoSeconds ? ` · ${durationLabel(videoSeconds)}` : ''}.`,
    },
    {
      mode: 'guided',
      icon: '☰',
      title: 'Guiada',
      body: 'La app te guía ejercicio por ejercicio, con temporizador, y guarda tus marcas.',
    },
  ];
  return (
    <View className="flex-1 bg-bg px-5" style={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 16 }}>
      <Pressable onPress={onExit} hitSlop={12} className="h-10 w-10 items-center justify-center rounded-full bg-surface-2">
        <Text className="text-[18px] text-ink">✕</Text>
      </Pressable>
      <View className="flex-1 justify-center gap-3">
        <Text className="font-mono text-[11px] uppercase tracking-widest text-ink-3">{name}</Text>
        <Text className="mb-3 font-extrabold text-[26px] leading-8 text-ink">¿Cómo quieres entrenar hoy?</Text>
        {options.map((o) => (
          <Pressable
            key={o.mode}
            onPress={() => choose(o.mode)}
            className={`flex-row items-center gap-4 rounded-2xl border p-4 ${last === o.mode ? 'border-accent bg-surface-2' : 'border-line bg-surface'}`}
          >
            <View className="h-12 w-12 items-center justify-center rounded-xl bg-surface-2">
              <Text className="text-[18px] text-ink">{o.icon}</Text>
            </View>
            <View className="min-w-0 flex-1">
              <View className="flex-row items-center gap-2">
                <Text className="font-bold text-[17px] text-ink">{o.title}</Text>
                {last === o.mode ? (
                  <Text className="font-mono text-[10px] uppercase tracking-wider text-accent">Tu preferencia</Text>
                ) : null}
              </View>
              <Text className="mt-0.5 text-[13.5px] leading-5 text-ink-3">{o.body}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
