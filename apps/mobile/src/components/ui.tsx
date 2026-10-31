import { forwardRef, useState } from 'react';
import {
  ActivityIndicator,
  PixelRatio,
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { Image } from 'expo-image';
import Svg, { Path } from 'react-native-svg';
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

/** Segmented toggle (e.g. kg | lb, or the three download qualities). */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <View className="flex-row rounded-xl bg-surface-2 p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            className={`flex-1 items-center justify-center rounded-lg py-2 ${active ? 'bg-accent' : ''}`}
          >
            <Text className={`font-semibold text-[14px] ${active ? 'text-white' : 'text-ink-3'}`}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A back chevron with the screen's title on the line below it. */
export function BackTitle({ title, onBack, className = '' }: { title: string; onBack: () => void; className?: string }) {
  return (
    <View className={`mt-2 ${className}`}>
      <Pressable
        onPress={onBack}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Volver"
        className="-ml-2 h-10 w-10 items-center justify-center"
      >
        <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
          <Path d="M15 5l-7 7 7 7" stroke={colors.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Pressable>
      <Text className="mt-3 font-extrabold text-[30px] tracking-tight text-ink">{title}</Text>
    </View>
  );
}

/** Sign-up progress, from the step after the account: back arrow, bar, "2 / 6". */
export function StepHeader({ step, total, onBack }: { step: number; total: number; onBack?: () => void }) {
  return (
    <View className="mt-2 flex-row items-center gap-3">
      <Pressable
        onPress={onBack}
        disabled={!onBack}
        hitSlop={12}
        className={`h-10 w-10 items-center justify-center ${onBack ? '' : 'opacity-0'}`}
      >
        <Text className="text-[22px] text-ink">←</Text>
      </Pressable>
      <View className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
        <View className="h-full rounded-full bg-accent" style={{ width: `${(step / total) * 100}%` }} />
      </View>
      <Text className="font-mono text-[12px] text-ink-3">
        {step} / {total}
      </Text>
    </View>
  );
}

/** Placeholder for media that hasn't loaded (approximates the comp's hatch). */
export function Placeholder({ className = '' }: { className?: string }) {
  return <View className={`bg-[#1c1c21] ${className}`} />;
}

// Cloudflare Images resizes on request: the API sends `w=1200` and the thumb
// asks for the width it is actually drawn at (times the screen's pixel
// ratio), so a 62 px cell does not download a hero.
const WIDTHS = [240, 360, 480, 640, 800, 1200, 1600];
export function sizedImageUrl(uri: string, layoutWidth: number): string {
  if (!uri.includes('imagedelivery.net/')) return uri;
  const px = layoutWidth * Math.min(3, PixelRatio.get());
  const w = WIDTHS.find((x) => x >= px) ?? WIDTHS[WIDTHS.length - 1]!;
  return uri.replace(/\bw=\d+/, `w=${w}`);
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
  const [width, setWidth] = useState(0);
  if (!uri) return <Placeholder className={className} />;
  return (
    <Image
      source={{ uri: width ? sizedImageUrl(uri, width) : undefined }}
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
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
