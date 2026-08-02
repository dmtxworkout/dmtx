import { Text } from 'react-native';
import { Tabs } from 'expo-router';
import { colors } from '../../../theme';

const TABS = [
  { name: 'inicio', label: 'Inicio', icon: '⌂' },
  { name: 'explorar', label: 'Explorar', icon: '⌕' },
  { name: 'programa', label: 'Programa', icon: '▦' },
  { name: 'perfil', label: 'Perfil', icon: '◐' },
] as const;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.ink4,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.line2,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontFamily: 'Archivo_600SemiBold', fontSize: 10 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.label,
            tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 17 }}>{t.icon}</Text>,
          }}
        />
      ))}
    </Tabs>
  );
}
