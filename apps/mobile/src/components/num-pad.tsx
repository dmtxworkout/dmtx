import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * In-app numeric keypad (bottom sheet). Numbers-only entry without the system
 * keyboard. Mount it conditionally (`{open && <NumPad … />}`) so it resets to
 * `initial` on each open; opening with a value pre-selected — the first digit
 * typed replaces it (calculator-style).
 */
export function NumPad({
  initial,
  unit,
  label,
  allowDecimal = false,
  onClose,
  onSubmit,
}: {
  initial: number;
  unit: string;
  label: string;
  allowDecimal?: boolean;
  onClose: () => void;
  onSubmit: (value: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState(() => {
    const s = Number.isFinite(initial) && initial !== 0 ? String(initial) : '';
    return s;
  });
  // Until the first keypress the initial value is "selected": typing replaces it.
  const [fresh, setFresh] = useState(true);

  const digit = (d: string) => {
    setText((t) => {
      const base = fresh ? '' : t;
      if (d === '.') {
        if (!allowDecimal || base.includes('.')) return base;
        return (base === '' ? '0' : base) + '.';
      }
      const next = base === '0' ? d : base + d;
      return next.slice(0, 7);
    });
    setFresh(false);
  };
  const backspace = () => {
    setText((t) => (fresh ? '' : t.slice(0, -1)));
    setFresh(false);
  };
  const submit = () => {
    const n = parseFloat(text);
    onSubmit(Number.isFinite(n) ? n : 0);
    onClose();
  };

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', allowDecimal ? '.' : '', '0', 'back'];

  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Pressable className="absolute inset-0 bg-black/60" onPress={onClose} />
        <View
          className="rounded-t-3xl bg-surface px-4 pt-4"
          style={{ paddingBottom: insets.bottom + 10 }}
        >
          <View className="mb-3 flex-row items-center justify-between px-2">
            <Text className="font-mono-medium text-[11px] uppercase tracking-widest text-ink-3">
              {label}
            </Text>
            <View className="flex-row items-baseline gap-1.5">
              <Text className="font-extrabold text-[32px] leading-none text-ink">{text || '0'}</Text>
              <Text className="font-semibold text-[15px] text-ink-2">{unit}</Text>
            </View>
          </View>

          <View className="flex-row flex-wrap">
            {keys.map((k, i) => (
              <View key={i} className="w-1/3 p-1.5">
                {k === '' ? (
                  <View className="h-14" />
                ) : (
                  <Pressable
                    onPress={() => (k === 'back' ? backspace() : digit(k))}
                    className="h-14 items-center justify-center rounded-xl bg-surface-2 active:opacity-60"
                  >
                    <Text className="font-semibold text-[22px] text-ink">{k === 'back' ? '⌫' : k}</Text>
                  </Pressable>
                )}
              </View>
            ))}
          </View>

          <Pressable
            onPress={submit}
            className="mx-1.5 mt-2 h-[52px] items-center justify-center rounded-xl bg-accent active:opacity-80"
          >
            <Text className="font-bold text-[16px] text-white">Listo</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
