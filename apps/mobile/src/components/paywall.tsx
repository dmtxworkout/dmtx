import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signOut } from '../lib/auth';
import { Logo } from './ui';
import type { Entitlement } from '../lib/types';

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Shown when the signed-in user has no active entitlement (trial lapsed or no
 * subscription). Subscriptions are sold on the web, so this points there and
 * offers a re-check + sign out.
 */
export function Paywall({
  entitlement,
  onRetry,
}: {
  entitlement: Entitlement;
  onRetry: () => void;
}) {
  const insets = useSafeAreaInsets();
  const trialEnded = entitlement.status === 'trialing' && Boolean(entitlement.trialEndsAt);
  const endDate = fmtDate(entitlement.trialEndsAt ?? entitlement.currentPeriodEnd);

  return (
    <View
      className="flex-1 bg-bg px-7"
      style={{ paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }}
    >
      <View className="flex-1 items-center justify-center gap-5">
        <Logo height={30} />
        <View className="items-center gap-2.5">
          <Text className="text-center font-extrabold text-[27px] leading-tight text-ink">
            {trialEnded ? 'Tu prueba terminó' : 'Necesitas una suscripción'}
          </Text>
          <Text className="text-center font-sans text-[15px] leading-6 text-ink-3">
            {trialEnded
              ? 'Suscríbete para seguir entrenando con todas las rutinas y programas.'
              : 'Activa tu suscripción para acceder a las rutinas y programas.'}
          </Text>
          {trialEnded && endDate ? (
            <Text className="mt-0.5 font-mono text-[12px] text-ink-4">Terminó el {endDate}</Text>
          ) : null}
        </View>
        <View className="mt-1 w-full rounded-2xl bg-surface p-4">
          <Text className="text-center font-sans text-[13px] leading-5 text-ink-3">
            Las suscripciones se gestionan en la web. Suscríbete en{' '}
            <Text className="font-semibold text-ink-2">dmtx.app</Text> y vuelve a la app.
          </Text>
        </View>
      </View>

      <View className="gap-2.5">
        <Pressable
          onPress={onRetry}
          className="h-[54px] items-center justify-center rounded-xl bg-accent active:opacity-80"
        >
          <Text className="font-bold text-[16px] text-white">Ya me suscribí · Reintentar</Text>
        </Pressable>
        <Pressable
          onPress={() => void signOut()}
          className="h-[54px] items-center justify-center rounded-xl bg-surface-2 active:opacity-80"
        >
          <Text className="font-bold text-[16px] text-ink-2">Cerrar sesión</Text>
        </Pressable>
      </View>
    </View>
  );
}
