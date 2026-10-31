// The sign-up steps after the account (step 1, in register): one question per
// screen, saved together at the end. Until they're answered the app stays here.
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from './ui';
import { QUESTIONS, toInput, useDraft } from './profile-questions';
import { api } from '../lib/api';
import type { Profile } from '../lib/types';
import { useUnits } from '../lib/units-context';

const TOTAL = QUESTIONS.length + 1;

export function Onboarding({ profile }: { profile: Profile }) {
  const qc = useQueryClient();
  const { units } = useUnits();
  const [draft, setDraft] = useDraft(profile);
  const [index, setIndex] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => api.updateProfile(toInput(draft, units)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
    onError: (e) => setProblem(e.message),
  });

  const question = QUESTIONS[index]!;
  const last = index === QUESTIONS.length - 1;
  const step = index + 2;

  const next = () => {
    const wrong = question.problem(draft, units);
    setProblem(wrong);
    if (wrong) return;
    if (last) save.mutate();
    else setIndex(index + 1);
  };
  const back = () => {
    setProblem(null);
    setIndex(index - 1);
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-bg">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="flex-grow px-6 pb-6" keyboardShouldPersistTaps="handled">
          <View className="mt-2 flex-row items-center gap-3">
            <Pressable
              onPress={back}
              disabled={index === 0}
              hitSlop={12}
              className={`h-10 w-10 items-center justify-center ${index === 0 ? 'opacity-0' : ''}`}
            >
              <Text className="text-[22px] text-ink">←</Text>
            </Pressable>
            <View className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
              <View className="h-full rounded-full bg-accent" style={{ width: `${(step / TOTAL) * 100}%` }} />
            </View>
            <Text className="font-mono text-[12px] text-ink-3">
              {step} / {TOTAL}
            </Text>
          </View>

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
            <Button label={last ? 'Terminar' : 'Continuar'} onPress={next} loading={save.isPending} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
