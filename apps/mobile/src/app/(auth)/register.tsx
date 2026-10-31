import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Field } from '../../components/ui';
import { signUp } from '../../lib/auth';

function passwordScore(pw: string): number {
  let s = 0;
  if (pw.length >= 8) s += 1;
  if (/\d/.test(pw)) s += 1;
  if (/[A-Z]/.test(pw) || /[^A-Za-z0-9]/.test(pw)) s += 1;
  return s; // 0..3
}

export default function Register() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const score = useMemo(() => passwordScore(password), [password]);
  const valid =
    name.trim().length > 0 && email.includes('@') && password.length >= 8 && /\d/.test(password) && terms;

  const onSubmit = async () => {
    if (!valid) {
      setError('Completa tus datos y acepta los términos.');
      return;
    }
    setError(null);
    setLoading(true);
    const res = await signUp.email({ email: email.trim(), password, name: name.trim() });
    setLoading(false);
    if (res.error) {
      setError(
        res.error.code?.startsWith('USER_ALREADY_EXISTS')
          ? 'Ese correo ya tiene una cuenta. Entra con tu contraseña.'
          : 'No se pudo crear la cuenta',
      );
    }
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
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            className="mt-2 h-10 w-10 items-center justify-center"
          >
            <Text className="text-[22px] text-ink">←</Text>
          </Pressable>

          <Text className="mb-7 mt-4 font-extrabold text-[30px] tracking-tight text-ink">
            Crea tu cuenta
          </Text>

          <View className="gap-4">
            <Field label="Nombre" value={name} onChangeText={setName} placeholder="Tu nombre" autoCapitalize="words" />
            <Field
              label="Correo"
              value={email}
              onChangeText={setEmail}
              placeholder="tu@correo.com"
              keyboardType="email-address"
              autoComplete="email"
            />
            <View className="gap-2">
              <Field
                label="Contraseña"
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                toggleSecure
              />
              <View className="flex-row gap-1.5">
                {[0, 1, 2].map((i) => (
                  <View
                    key={i}
                    className={`h-1 flex-1 rounded-full ${
                      i < score ? (score >= 3 ? 'bg-success' : 'bg-accent') : 'bg-surface-2'
                    }`}
                  />
                ))}
              </View>
              <Text className="font-mono text-[11px] text-ink-4">
                Mínimo 8 caracteres y un número
              </Text>
            </View>

            <Pressable onPress={() => setTerms((t) => !t)} className="mt-1 flex-row items-center gap-3">
              <View
                className={`h-6 w-6 items-center justify-center rounded-md border ${
                  terms ? 'border-accent bg-accent' : 'border-line bg-surface'
                }`}
              >
                {terms ? <Text className="font-bold text-[13px] text-white">✓</Text> : null}
              </View>
              <Text className="flex-1 font-sans text-[13px] text-ink-3">
                Acepto los términos y la política de privacidad.
              </Text>
            </Pressable>

            {error ? <Text className="font-medium text-[13px] text-accent">{error}</Text> : null}

            <Button label="Continuar" onPress={onSubmit} loading={loading} disabled={!valid} className="mt-1" />
          </View>

          <View className="mt-auto flex-row items-center justify-center gap-2 pt-8">
            <Text className="font-sans text-[14px] text-ink-3">¿Ya tienes cuenta?</Text>
            <Pressable onPress={() => router.replace('/(auth)/login')} hitSlop={8}>
              <Text className="font-semibold text-[14px] text-accent">Entrar</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
