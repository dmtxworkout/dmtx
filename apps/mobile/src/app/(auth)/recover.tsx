import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackTitle, Button, Field } from '../../components/ui';
import { authClient } from '../../lib/auth';

export default function Recover() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [seconds]);

  const send = async () => {
    if (!email.includes('@')) return;
    setLoading(true);
    // Best practice: always show success (no account enumeration).
    await authClient
      .requestPasswordReset({ email: email.trim(), redirectTo: 'dmtx://reset-password' })
      .catch(() => undefined);
    setLoading(false);
    setSent(true);
    setSeconds(42);
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
          <BackTitle title="Recupera tu acceso" onBack={() => router.back()} className="mb-3" />
          <Text className="mb-7 font-sans text-[15px] leading-6 text-ink-3">
            Te enviaremos un enlace para restablecer tu contraseña.
          </Text>

          {!sent ? (
            <View className="gap-4">
              <Field
                label="Correo"
                value={email}
                onChangeText={setEmail}
                placeholder="tu@correo.com"
                keyboardType="email-address"
                autoComplete="email"
              />
              <Button
                label="Enviar enlace"
                onPress={send}
                loading={loading}
                disabled={!email.includes('@')}
              />
            </View>
          ) : (
            <View className="gap-4 rounded-2xl border border-line bg-surface p-5">
              <Text className="font-bold text-[17px] text-ink">Revisa tu correo</Text>
              <Text className="font-sans text-[14px] leading-6 text-ink-3">
                Si existe una cuenta con {email.trim()}, recibirás un enlace para restablecer tu
                contraseña.
              </Text>
              <Pressable disabled={seconds > 0} onPress={send}>
                <Text className={`font-mono text-[13px] ${seconds > 0 ? 'text-ink-4' : 'text-accent'}`}>
                  {seconds > 0
                    ? `Reenviar en 0:${seconds.toString().padStart(2, '0')}`
                    : 'Reenviar enlace'}
                </Text>
              </Pressable>
            </View>
          )}

          <View className="mt-auto flex-row items-center justify-center gap-2 pt-8">
            <Text className="font-sans text-[14px] text-ink-3">¿Recordaste tu contraseña?</Text>
            <Pressable onPress={() => router.replace('/(auth)/login')} hitSlop={8}>
              <Text className="font-semibold text-[14px] text-accent">Entrar</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
