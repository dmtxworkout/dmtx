import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/ui';

// Placeholder for the post-workout summary (marcas, volumen, esfuerzo).
export default function Resumen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View
      className="flex-1 bg-bg px-6"
      style={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }}
    >
      <Text className="font-mono-semibold text-[11px] uppercase tracking-widest text-accent">
        Rutina completada
      </Text>
      <Text className="mt-2 font-extrabold text-[30px] leading-tight tracking-tight text-ink">
        ¡Buen trabajo!
      </Text>
      <View className="flex-1 items-center justify-center">
        <Text className="max-w-[290px] text-center font-sans text-[14px] leading-6 text-ink-3">
          El resumen con tus marcas y comparación con sesiones anteriores llega con el reproductor.
        </Text>
      </View>
      <Button label="Guardar y salir" onPress={() => router.dismissTo('/(app)/(tabs)/inicio')} />
    </View>
  );
}
