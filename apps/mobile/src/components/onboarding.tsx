// The sign-up steps after the account and its email: one question per screen.
// Each answer saves as it's given, so whoever leaves comes back to the first one
// missing. Until they're all answered the app stays here.
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, StepHeader } from './ui';
import { QUESTIONS, useDraft } from './profile-questions';
import { api } from '../lib/api';
import type { Me, Profile } from '../lib/types';
import { useUnits } from '../lib/units-context';

export const SIGN_UP_STEPS = QUESTIONS.length + 1;

export function Onboarding({ profile }: { profile: Profile }) {
  const qc = useQueryClient();
  const { units } = useUnits();
  const [draft, setDraft] = useDraft(profile);
  const [index, setIndex] = useState(() => Math.max(0, QUESTIONS.findIndex((q) => !q.answered(profile))));
  const [problem, setProblem] = useState<string | null>(null);
  const question = QUESTIONS[index]!;

  const save = useMutation({
    mutationFn: () => api.updateProfile(question.answer(draft, units)),
    onSuccess: (saved) => {
      // With the last answer the profile is complete and the layout opens the app.
      qc.setQueryData<Me>(['me'], (me) => me && { ...me, profile: saved });
      if (!saved.onboardingCompletedAt) setIndex(index + 1);
    },
    onError: () => setProblem('No pudimos guardar tu respuesta. Intenta de nuevo.'),
  });

  const next = () => {
    const wrong = question.problem(draft, units);
    setProblem(wrong);
    if (!wrong) save.mutate();
  };
  const back = () => {
    setProblem(null);
    setIndex(index - 1);
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-bg">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="flex-grow px-6 pb-6" keyboardShouldPersistTaps="handled">
          <StepHeader step={index + 2} total={SIGN_UP_STEPS} onBack={index > 0 ? back : undefined} />

          <Text className="mt-4 font-extrabold text-[30px] tracking-tight text-ink">{question.title}</Text>
          <Text className="mb-7 mt-2 font-sans text-[14px] leading-5 text-ink-3">{question.hint}</Text>

          <question.Fields
            draft={draft}
            onChange={(patch) => {
              setProblem(null);
              setDraft({ ...draft, ...patch });
            }}
          />

          {problem ? <Text className="mt-4 font-medium text-[13px] text-accent">{problem}</Text> : null}

          <View className="mt-auto pt-8">
            <Button label={index === QUESTIONS.length - 1 ? 'Terminar' : 'Continuar'} onPress={next} loading={save.isPending} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
