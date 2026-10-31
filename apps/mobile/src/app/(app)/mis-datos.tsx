import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Loading } from '../../components/ui';
import { QUESTIONS, toInput, useDraft } from '../../components/profile-questions';
import { api } from '../../lib/api';
import type { Profile } from '../../lib/types';
import { useUnits } from '../../lib/units-context';

export default function MisDatos() {
  const me = useQuery({ queryKey: ['me'], queryFn: api.me });
  return me.data ? <Form profile={me.data.profile} /> : <Loading />;
}

function Form({ profile }: { profile: Profile }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { units } = useUnits();
  const [draft, setDraft] = useDraft(profile);
  const [problem, setProblem] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => api.updateProfile(toInput(draft, units)),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['me'] });
      router.back();
    },
    onError: (e) => setProblem(e.message),
  });

  const submit = () => {
    const wrong = QUESTIONS.map((q) => q.problem(draft, units)).find(Boolean) ?? null;
    setProblem(wrong);
    if (!wrong) save.mutate();
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-bg">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="px-6 pb-6" keyboardShouldPersistTaps="handled">
          <View className="mt-2 flex-row items-center gap-3">
            <Pressable onPress={() => router.back()} hitSlop={12} className="h-10 w-10 items-center justify-center">
              <Text className="text-[22px] text-ink">←</Text>
            </Pressable>
            <Text className="font-extrabold text-[22px] tracking-tight text-ink">Tus datos</Text>
          </View>

          <View className="mt-6 gap-7">
            {QUESTIONS.map((q) => (
              <View key={q.key} className="gap-3">
                <Text className="font-bold text-[16px] text-ink">{q.title}</Text>
                <q.Fields draft={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} />
              </View>
            ))}
          </View>

          {problem ? <Text className="mt-4 font-medium text-[13px] text-accent">{problem}</Text> : null}
          <Button label="Guardar" onPress={submit} loading={save.isPending} className="mt-6" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
