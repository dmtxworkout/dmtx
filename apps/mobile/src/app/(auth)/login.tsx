import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackTitle, Button, Field } from '../../components/ui';
import { signIn } from '../../lib/auth';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    const res = await signIn.email({ email: email.trim(), password });
    setLoading(false);
    if (res.error) setError(res.error.message ?? 'Correo o contraseña inválidos');
    // On success, the root AuthGate redirects into the app.
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-bg">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerClassName="flex-grow px-6 pb-6"
          keyboardShouldPersistTaps="handled"
        >
          <BackTitle title="Bienvenido de vuelta" onBack={() => router.back()} className="mb-7" />

          <View className="gap-4">
            <Field
              label="Correo"
              value={email}
              onChangeText={setEmail}
              placeholder="tu@correo.com"
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
            />
            <Field
              label="Contraseña"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              toggleSecure
              textContentType="password"
            />
            <Pressable onPress={() => router.push('/(auth)/recover')} hitSlop={8}>
              <Text className="font-mono text-[13px] text-accent">¿Olvidaste tu contraseña?</Text>
            </Pressable>

            {error ? (
              <Text className="font-medium text-[13px] text-accent">{error}</Text>
            ) : null}

            <Button label="Entrar" onPress={onSubmit} loading={loading} className="mt-1" />
          </View>

          <View className="mt-auto pt-8">
            <View className="flex-row items-center justify-center gap-2 pt-4">
              <Text className="font-sans text-[14px] text-ink-3">¿No tienes cuenta?</Text>
              <Pressable onPress={() => router.replace('/(auth)/register')} hitSlop={8}>
                <Text className="font-semibold text-[14px] text-accent">Crear cuenta</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
