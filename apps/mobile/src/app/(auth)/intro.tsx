import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Logo } from '../../components/ui';

const POINTS = [
  'Programas de 2 a 12 semanas',
  'Video demo en cada ejercicio',
  'Registra tus marcas y supéralas',
];

export default function Intro() {
  const router = useRouter();
  return (
    <View className="flex-1 bg-bg">
      {/* Hero area */}
      <View className="flex-1 bg-surface" />
      <SafeAreaView edges={['top', 'bottom']} className="absolute inset-0">
        <View className="flex-1 justify-between px-6 pb-6 pt-4">
          <Logo height={30} />

          <View className="gap-7">
            <View className="gap-5">
              <Text className="font-extrabold text-[40px] leading-[1.05] text-ink">
                Entrena como un atleta.
              </Text>
              <View className="gap-3">
                {POINTS.map((p) => (
                  <View key={p} className="flex-row items-center gap-3">
                    <View className="h-6 w-6 items-center justify-center rounded-full bg-surface-2">
                      <Text className="font-bold text-[12px] text-accent">✓</Text>
                    </View>
                    <Text className="flex-1 font-medium text-[15px] text-ink-2">{p}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View className="gap-3">
              <Button label="Empezar gratis" onPress={() => router.push('/(auth)/register')} />
              <Button
                label="Ya tengo cuenta"
                variant="secondary"
                onPress={() => router.push('/(auth)/login')}
              />
              <Text className="mt-1 text-center font-mono text-[12px] text-ink-4">
                7 días gratis · cancela cuando quieras
              </Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
