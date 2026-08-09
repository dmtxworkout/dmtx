import { Stack } from 'expo-router';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Loading } from '../../components/ui';
import { Paywall } from '../../components/paywall';
import { colors } from '../../theme';

export default function AppLayout() {
  // Gate all content behind an active entitlement. `/me` only needs a session,
  // so it still resolves (with active=false) once the trial lapses.
  const me = useQuery({ queryKey: ['me'], queryFn: api.me });

  if (me.isLoading) {
    return (
      <View className="flex-1 bg-bg">
        <Loading />
      </View>
    );
  }
  if (me.data && !me.data.entitlement.active) {
    return <Paywall entitlement={me.data.entitlement} onRetry={() => void me.refetch()} />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}
