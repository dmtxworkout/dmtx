import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Button, Loading } from '../../../components/ui';
import { api } from '../../../lib/api';
import { signOut } from '../../../lib/auth';

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
  const me = useQuery({ queryKey: ['me'], queryFn: api.me });

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

      <View className="mt-8">
        <Button label="Cerrar sesión" variant="secondary" onPress={() => signOut()} />
      </View>
    </ScrollView>
  );
}
