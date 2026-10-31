// The first sign-up step after the account: the six-digit code sent to the email.
// A code goes out each time this opens, also when coming back after leaving, and
// the sixth digit checks it with no button to press. It only says a code was sent
// once the API confirms it went out.
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { StepHeader } from './ui';
import { SIGN_UP_STEPS } from './onboarding';
import { ApiError, api } from '../lib/api';
import { signOut, verifyEmailCode } from '../lib/auth';

const LENGTH = 6;
const RESEND_SECONDS = 30;

/**
 * One digit per box, but a single hidden input: that's what lets iOS offer the
 * code from the email above the keyboard and paste all six at once, and makes
 * typing advance and deleting go back with no extra logic.
 */
function CodeField({
  value,
  onChange,
  invalid,
  disabled,
}: {
  value: string;
  onChange: (code: string) => void;
  invalid: boolean;
  disabled: boolean;
}) {
  const input = useRef<TextInput>(null);
  const active = Math.min(value.length, LENGTH - 1);
  return (
    <Pressable onPress={() => input.current?.focus()} disabled={disabled} className="flex-row justify-between gap-2">
      {Array.from({ length: LENGTH }, (_, i) => (
        <View
          key={i}
          className={`h-[58px] flex-1 items-center justify-center rounded-xl border bg-surface ${
            invalid || (i === active && !disabled) ? 'border-accent' : 'border-line'
          }`}
        >
          <Text className="font-bold text-[24px] text-ink">{value[i] ?? ''}</Text>
        </View>
      ))}
      <TextInput
        ref={input}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, LENGTH))}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={LENGTH}
        autoFocus
        editable={!disabled}
        caretHidden
        className="absolute h-px w-px opacity-0"
        accessibilityLabel="Código de verificación"
      />
    </Pressable>
  );
}

export function EmailCode({ email }: { email: string }) {
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [delivery, setDelivery] = useState<'sending' | 'sent' | 'failed'>('sending');
  const [seconds, setSeconds] = useState(0);
  const sent = useRef(false);

  const send = async () => {
    setDelivery('sending');
    setProblem(null);
    try {
      await api.sendEmailCode();
    } catch (e) {
      // 429: one went out moments ago, and that one still works.
      if (!(e instanceof ApiError && e.status === 429)) {
        setDelivery('failed');
        return;
      }
    }
    setDelivery('sent');
    setSeconds(RESEND_SECONDS);
  };

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void send();
  }, []);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [seconds]);

  const change = async (next: string) => {
    setCode(next);
    setProblem(null);
    if (next.length < LENGTH) return;
    setChecking(true);
    const wrong = await verifyEmailCode(email, next);
    if (wrong) {
      setProblem(wrong);
      setCode('');
      setChecking(false);
      return;
    }
    // The refreshed account says it's verified and the layout moves on.
    await qc.invalidateQueries({ queryKey: ['me'] });
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-bg">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="flex-grow px-6 pb-6" keyboardShouldPersistTaps="handled">
          <StepHeader step={1} total={SIGN_UP_STEPS} />

          <Text className="mt-4 font-extrabold text-[30px] tracking-tight text-ink">
            {delivery === 'failed' ? 'No se envió el código' : 'Revisa tu correo'}
          </Text>
          <Text className="mb-7 mt-2 font-sans text-[14px] leading-5 text-ink-3">
            {delivery === 'sending' ? 'Enviando un código de 6 dígitos a ' : delivery === 'sent' ? 'Te enviamos un código de 6 dígitos a ' : 'No pudimos enviar el código a '}
            <Text className="font-semibold text-ink">{email}</Text>
            {delivery === 'failed' ? '. Intenta de nuevo en un momento.' : '.'}
          </Text>

          <CodeField value={code} onChange={(next) => void change(next)} invalid={Boolean(problem)} disabled={checking} />

          {problem ? <Text className="mt-4 font-medium text-[13px] text-accent">{problem}</Text> : null}

          <Pressable
            onPress={() => void send()}
            disabled={delivery === 'sending' || seconds > 0 || checking}
            hitSlop={8}
            className="mt-6 self-start"
          >
            <Text className={`font-semibold text-[14px] ${delivery === 'sending' || seconds > 0 ? 'text-ink-3' : 'text-accent'}`}>
              {delivery === 'sending'
                ? 'Enviando…'
                : delivery === 'failed'
                  ? 'Intentar de nuevo'
                  : seconds > 0
                    ? `Reenviar código en ${seconds} s`
                    : 'Reenviar código'}
            </Text>
          </Pressable>

          <View className="mt-auto flex-row items-center justify-center gap-2 pt-8">
            <Text className="font-sans text-[14px] text-ink-3">¿No es tu correo?</Text>
            <Pressable onPress={() => void signOut()} hitSlop={8}>
              <Text className="font-semibold text-[14px] text-accent">Usar otro</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
