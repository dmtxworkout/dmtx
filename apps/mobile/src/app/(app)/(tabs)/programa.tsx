import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../../components/ui';

export default function ProgramaTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View className="flex-1 bg-bg px-6" style={{ paddingTop: insets.top }}>
      <Text className="pt-2 font-extrabold text-[26px] tracking-tight text-ink">Tu programa</Text>
      <View className="flex-1 items-center justify-center gap-4">
        <View className="h-16 w-16 items-center justify-center rounded-2xl bg-surface-2">
          <Text className="text-[26px] text-ink-3">▦</Text>
        </View>
        <Text className="text-center font-bold text-[18px] text-ink">
          Aún no sigues un programa
        </Text>
        <Text className="max-w-[280px] text-center font-sans text-[14px] leading-6 text-ink-3">
          Elige un programa y aparecerá aquí con tu progreso día a día.
        </Text>
        <Button
          label="Explorar programas"
          variant="surface"
          onPress={() => router.push('/(app)/(tabs)/explorar')}
        />
      </View>
    </View>
  );
}
