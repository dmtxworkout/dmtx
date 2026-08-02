import { forwardRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { Image } from 'expo-image';
import { colors } from '../theme';

const whiteLogo = require('../../assets/images/logo-white.png');

/** Full DMTX logo (gorilla + wordmark), white — for dark backgrounds. */
export function Logo({ height = 28 }: { height?: number }) {
  return (
    <Image
      source={whiteLogo}
      style={{ height, width: height * (191 / 150) }}
      contentFit="contain"
    />
  );
}

type ButtonVariant = 'primary' | 'light' | 'secondary' | 'surface';

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  className = '',
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
  className?: string;
}) {
  const bg = {
    primary: 'bg-accent',
    light: 'bg-ink',
    secondary: 'border border-line bg-transparent',
    surface: 'bg-surface-2',
  }[variant];
  const fg = {
    primary: 'text-white',
    light: 'text-bg',
    secondary: 'text-ink',
    surface: 'text-ink',
  }[variant];
  const spinnerColor = variant === 'primary' ? colors.white : variant === 'light' ? colors.bg : colors.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      className={`h-[54px] flex-row items-center justify-center gap-2 rounded-xl active:opacity-80 ${bg} ${
        disabled ? 'opacity-50' : ''
      } ${className}`}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor} size="small" />
      ) : (
        <>
          {icon ? <Text className={`text-[16px] ${fg}`}>{icon}</Text> : null}
          <Text className={`font-bold text-[16px] ${fg}`}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

interface FieldProps extends TextInputProps {
  label: string;
  toggleSecure?: boolean;
}

/** Labeled text field with a mono uppercase label and terracotta focus ring. */
export const Field = forwardRef<TextInput, FieldProps>(function Field(
  { label, toggleSecure, secureTextEntry, ...props },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  const isSecure = toggleSecure ? hidden : secureTextEntry;
  return (
    <View className="gap-2">
      <Text className="font-mono-medium text-[11px] uppercase tracking-wider text-ink-3">
        {label}
      </Text>
      <View
        className={`h-[52px] flex-row items-center rounded-xl border bg-surface px-4 ${
          focused ? 'border-accent' : 'border-line'
        }`}
      >
        <TextInput
          ref={ref}
          className="h-full flex-1 font-sans text-[16px] text-ink"
          placeholderTextColor={colors.ink4}
          selectionColor={colors.accent}
          secureTextEntry={isSecure}
          autoCapitalize="none"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...props}
        />
        {toggleSecure ? (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={10}>
            <Text className="font-mono text-[13px] text-accent">{hidden ? 'Ver' : 'Ocultar'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

/** Placeholder for media that hasn't loaded (approximates the comp's hatch). */
export function Placeholder({ className = '' }: { className?: string }) {
  return <View className={`bg-[#1c1c21] ${className}`} />;
}

/** Thumbnail with graceful fallback to a placeholder. */
export function Thumb({
  uri,
  className = '',
  radius = 10,
}: {
  uri: string | null | undefined;
  className?: string;
  radius?: number;
}) {
  if (!uri) return <Placeholder className={className} />;
  return (
    <Image
      source={{ uri }}
      style={{ borderRadius: radius }}
      className={className}
      contentFit="cover"
      transition={150}
    />
  );
}

export function Pill({ label, tone = 'accent' }: { label: string; tone?: 'accent' | 'dark' }) {
  return (
    <View
      className={`self-start rounded-md px-2 py-1 ${tone === 'accent' ? 'bg-accent' : 'bg-black/75'}`}
    >
      <Text className="font-mono-semibold text-[10px] uppercase tracking-wider text-white">
        {label}
      </Text>
    </View>
  );
}

export function Center({ children }: { children: React.ReactNode }) {
  return <View className="flex-1 items-center justify-center gap-3 px-8">{children}</View>;
}

export function Loading() {
  return (
    <Center>
      <ActivityIndicator color={colors.accent} />
    </Center>
  );
}
