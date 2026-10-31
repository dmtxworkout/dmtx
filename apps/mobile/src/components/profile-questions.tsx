// The questions about the member, one per sign-up step and all together in Mis
// datos. Each edits a text draft and says what's wrong with its answer; the
// draft becomes canonical units (kg, cm, YYYY-MM-DD) only when saved.
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  ACTIVITY_LEVEL,
  ACTIVITY_LEVEL_LABEL,
  MIN_AGE,
  dateOfBirthSchema,
  heightCmSchema,
  weightKgSchema,
  type ActivityLevel,
  type Gender,
  type UpdateProfileInput,
} from '@dmtx/schemas';
import { Field, Segmented } from './ui';
import type { Profile } from '../lib/types';
import { cmToFeetInches, feetInchesToCm, kgToWeight, weightToKg, type Units } from '../lib/units';
import { useUnits } from '../lib/units-context';

export interface Draft {
  birth: string;
  gender: Gender | null;
  weight: string;
  cm: string;
  feet: string;
  inches: string;
  activityLevel: ActivityLevel | null;
}

const num = (text: string) => Number(text.replace(',', '.'));

const birthDate = (text: string) => {
  const [day, month, year] = text.split('/');
  return `${year}-${month}-${day}`;
};
const weightKg = (d: Draft, u: Units) => Math.round(weightToKg(num(d.weight), u.weight) * 10) / 10;
const heightCm = (d: Draft, u: Units) => (u.height === 'cm' ? Math.round(num(d.cm)) : feetInchesToCm(num(d.feet), num(d.inches)));

/** "31101996" → "31/10/1996" as it's typed. */
const maskBirth = (text: string) => {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('/');
};

export function useDraft(profile: Profile) {
  const { units } = useUnits();
  return useState<Draft>(() => {
    const [year, month, day] = profile.dateOfBirth?.split('-') ?? [];
    const height = profile.heightCm ? cmToFeetInches(profile.heightCm) : null;
    return {
      birth: year ? `${day}/${month}/${year}` : '',
      gender: profile.gender,
      weight: profile.weightKg ? String(Math.round(kgToWeight(profile.weightKg, units.weight) * 10) / 10) : '',
      cm: profile.heightCm ? String(profile.heightCm) : '',
      feet: height ? String(height.feet) : '',
      inches: height ? String(height.inches) : '',
      activityLevel: profile.activityLevel,
    };
  });
}

export function toInput(d: Draft, u: Units): UpdateProfileInput {
  return {
    dateOfBirth: birthDate(d.birth),
    gender: d.gender ?? undefined,
    weightKg: weightKg(d, u),
    heightCm: heightCm(d, u),
    activityLevel: d.activityLevel ?? undefined,
  };
}

type FieldsProps = { draft: Draft; onChange: (patch: Partial<Draft>) => void };

export interface Question {
  key: string;
  title: string;
  hint: string;
  Fields: (props: FieldsProps) => React.ReactNode;
  /** What's wrong with the answer, or null. */
  problem: (d: Draft, u: Units) => string | null;
}

export const QUESTIONS: Question[] = [
  {
    key: 'birth',
    title: '¿Cuándo naciste?',
    hint: 'Con tu fecha calculamos tu edad y la mantenemos al día.',
    Fields: BirthFields,
    problem: (d) =>
      dateOfBirthSchema.safeParse(birthDate(d.birth)).success
        ? null
        : `Escribe una fecha válida. Debes tener al menos ${MIN_AGE} años.`,
  },
  {
    key: 'gender',
    title: '¿Cuál es tu género?',
    hint: 'Lo usamos para calcular tu metabolismo y elegir la figura del cuerpo que ves en las rutinas.',
    Fields: GenderFields,
    problem: (d) => (d.gender ? null : 'Elige una opción.'),
  },
  {
    key: 'weight',
    title: '¿Cuánto pesas?',
    hint: 'Puedes cambiarlo cuando quieras en tu perfil.',
    Fields: WeightFields,
    problem: (d, u) => (weightKgSchema.safeParse(weightKg(d, u)).success ? null : 'Escribe un peso válido.'),
  },
  {
    key: 'height',
    title: '¿Cuánto mides?',
    hint: 'Puedes cambiarlo cuando quieras en tu perfil.',
    Fields: HeightFields,
    problem: (d, u) => (heightCmSchema.safeParse(heightCm(d, u)).success ? null : 'Escribe una altura válida.'),
  },
  {
    key: 'activity',
    title: '¿Qué tan activo eres?',
    hint: 'Piensa en una semana normal.',
    Fields: ActivityFields,
    problem: (d) => (d.activityLevel ? null : 'Elige una opción.'),
  },
];

function BirthFields({ draft, onChange }: FieldsProps) {
  return (
    <Field
      label="Fecha de nacimiento"
      value={draft.birth}
      onChangeText={(t) => onChange({ birth: maskBirth(t) })}
      placeholder="DD/MM/AAAA"
      keyboardType="number-pad"
    />
  );
}

function GenderFields({ draft, onChange }: FieldsProps) {
  return (
    <View className="flex-row gap-3">
      {(
        [
          { value: 'male', label: 'Hombre' },
          { value: 'female', label: 'Mujer' },
        ] as const
      ).map((o) => (
        <Choice key={o.value} className="flex-1" label={o.label} on={draft.gender === o.value} onPress={() => onChange({ gender: o.value })} />
      ))}
    </View>
  );
}

function WeightFields({ draft, onChange }: FieldsProps) {
  const { units, setWeight } = useUnits();
  return (
    <View className="gap-3">
      <Segmented
        value={units.weight}
        onChange={(u) => {
          // The number typed stays the same weight in the other unit.
          if (num(draft.weight)) onChange({ weight: String(Math.round(kgToWeight(weightToKg(num(draft.weight), units.weight), u) * 10) / 10) });
          setWeight(u);
        }}
        options={[
          { value: 'lb', label: 'Libras (lb)' },
          { value: 'kg', label: 'Kilos (kg)' },
        ]}
      />
      <Field
        label={`Peso (${units.weight})`}
        value={draft.weight}
        onChangeText={(weight) => onChange({ weight })}
        placeholder={units.weight === 'lb' ? '165' : '75'}
        keyboardType="decimal-pad"
      />
    </View>
  );
}

function HeightFields({ draft, onChange }: FieldsProps) {
  const { units, setHeight } = useUnits();
  return (
    <View className="gap-3">
      <Segmented
        value={units.height}
        onChange={(u) => {
          // Likewise the height: each unit has its own fields, kept in step.
          const cm = heightCm(draft, units);
          if (cm) onChange({ cm: String(cm), feet: String(cmToFeetInches(cm).feet), inches: String(cmToFeetInches(cm).inches) });
          setHeight(u);
        }}
        options={[
          { value: 'cm', label: 'Centímetros (cm)' },
          { value: 'ft', label: 'Pies (ft)' },
        ]}
      />
      {units.height === 'cm' ? (
        <Field label="Altura (cm)" value={draft.cm} onChangeText={(cm) => onChange({ cm })} placeholder="175" keyboardType="number-pad" />
      ) : (
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Field label="Pies" value={draft.feet} onChangeText={(feet) => onChange({ feet })} placeholder="5" keyboardType="number-pad" />
          </View>
          <View className="flex-1">
            <Field label="Pulgadas" value={draft.inches} onChangeText={(inches) => onChange({ inches })} placeholder="9" keyboardType="number-pad" />
          </View>
        </View>
      )}
    </View>
  );
}

function ActivityFields({ draft, onChange }: FieldsProps) {
  return (
    <View className="gap-2.5">
      {ACTIVITY_LEVEL.map((level) => (
        <Choice
          key={level}
          label={ACTIVITY_LEVEL_LABEL[level].label}
          hint={ACTIVITY_LEVEL_LABEL[level].hint}
          on={draft.activityLevel === level}
          onPress={() => onChange({ activityLevel: level })}
        />
      ))}
    </View>
  );
}

function Choice({
  label,
  hint,
  on,
  onPress,
  className = '',
}: {
  label: string;
  hint?: string;
  on: boolean;
  onPress: () => void;
  className?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-xl border px-4 py-3.5 active:opacity-80 ${on ? 'border-accent bg-surface-2' : 'border-line bg-surface'} ${className}`}
    >
      <Text className="font-semibold text-[15px] text-ink">{label}</Text>
      {hint ? <Text className="mt-0.5 font-sans text-[13px] text-ink-3">{hint}</Text> : null}
    </Pressable>
  );
}
