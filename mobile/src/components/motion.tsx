// How the app answers a touch or a wait (redesign I1-I4, DESIGN.md "Interaction"):
// - Press: every tappable thing shrinks to 98% and lightens while the finger is down
// - Skeleton: grey blocks in the layout's shape while nothing is cached yet
// - Collapsible: a one-line header that opens its body with a short fade
// - FadeIn: a tab's content fades in when the tab gains focus
// - useToast: a short note after a refresh ("방금 업데이트 · 2개 바뀜")
// - Flash: a number that changed is tinted for a moment (red up, blue down)
// Haptics are left out: an installed iOS web app can't vibrate.
import { Feather } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors, fonts, radius, space, type } from "../theme";

const useNative = false; // web build: the JS driver is the one react-native-web runs

type PressProps = Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle> | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>);
  // false for things that carry their own pressed color (e.g. filled buttons)
  pressedBg?: string | false;
};

export function Press({ style, pressedBg = colors.pressed, ...rest }: PressProps) {
  return (
    <Pressable
      {...rest}
      style={(state) => [
        typeof style === "function" ? style(state) : style,
        state.pressed && styles.pressed,
        state.pressed && pressedBg ? { backgroundColor: pressedBg } : null,
      ]}
    />
  );
}

export function Skeleton({ width, height, r = radius.sm, style }: { width: number | `${number}%`; height: number; r?: number; style?: StyleProp<ViewStyle> }) {
  const pulse = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: useNative }),
        Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: useNative }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View style={[{ width, height, borderRadius: r, backgroundColor: colors.skeleton, opacity: pulse }, style]} />;
}

// A whole screen's worth of placeholders: title, a hero card, then rows. Used only when there is no
// cached copy to show; with one, the cached screen shows at once and updates in place.
export function ScreenSkeleton({ hero = true, rows = 5 }: { hero?: boolean; rows?: number }) {
  return (
    <View style={styles.skelScreen} accessibilityLabel="불러오는 중">
      <Skeleton width={90} height={28} />
      {hero && <Skeleton width="100%" height={150} r={20} style={{ marginTop: space.lg }} />}
      <Skeleton width={140} height={20} style={{ marginTop: space.xl }} />
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.skelRow}>
          <Skeleton width={40} height={40} r={20} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width="55%" height={14} />
            <Skeleton width="35%" height={12} />
          </View>
          <Skeleton width={56} height={22} r={11} />
        </View>
      ))}
    </View>
  );
}

export function Collapsible({
  title,
  preview,
  initiallyOpen = false,
  children,
}: {
  title: string;
  preview?: string;
  initiallyOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const fade = useRef(new Animated.Value(initiallyOpen ? 1 : 0)).current;
  const toggle = () => {
    const next = !open;
    setOpen(next);
    fade.setValue(0);
    if (next) Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: useNative }).start();
  };
  return (
    <View style={styles.collapsible}>
      <Press
        onPress={toggle}
        pressedBg={false}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}${preview ? `, ${preview}` : ""}. ${open ? "접기" : "펼치기"}`}
        style={styles.collHead}
      >
        <Text style={styles.collTitle}>{title}</Text>
        {!!preview && (
          <Text style={styles.collPreview} numberOfLines={1}>
            {preview}
          </Text>
        )}
        <Feather name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
      </Press>
      {open && <Animated.View style={{ opacity: fade, paddingBottom: space.lg }}>{children}</Animated.View>}
    </View>
  );
}

export function FadeIn({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const focused = useIsFocused();
  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!focused) return;
    fade.setValue(0.4);
    Animated.timing(fade, { toValue: 1, duration: 150, useNativeDriver: useNative }).start();
  }, [focused, fade]);
  return <Animated.View style={[{ flex: 1, opacity: fade }, style]}>{children}</Animated.View>;
}

// Returns [show, element]: render the element last in the screen; show("방금 업데이트 · 2개 바뀜").
export function useToast(): [(msg: string) => void, React.ReactElement | null] {
  const [msg, setMsg] = useState<string | null>(null);
  const fade = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback(
    (m: string) => {
      if (timer.current) clearTimeout(timer.current);
      setMsg(m);
      fade.setValue(0);
      Animated.timing(fade, { toValue: 1, duration: 150, useNativeDriver: useNative }).start();
      timer.current = setTimeout(() => {
        Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: useNative }).start(() => setMsg(null));
      }, 2000);
    },
    [fade]
  );
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const el = msg ? (
    <Animated.View pointerEvents="none" style={[styles.toastWrap, { opacity: fade }]} accessibilityLiveRegion="polite">
      <View style={styles.toast}>
        <Feather name="check" size={14} color={colors.text} />
        <Text style={styles.toastText}>{msg}</Text>
      </View>
    </Animated.View>
  ) : null;
  return [show, el];
}

// Tints its children for 0.8s when `value` changes after the first render: up = red tint, down = blue.
export function Flash({ value, children, style }: { value: number | null | undefined; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const prev = useRef(value);
  const glow = useRef(new Animated.Value(0)).current;
  const [dir, setDir] = useState<"up" | "down">("up");
  useEffect(() => {
    const before = prev.current;
    prev.current = value;
    if (before == null || value == null || before === value) return;
    setDir(value > before ? "up" : "down");
    glow.setValue(1);
    Animated.timing(glow, { toValue: 0, duration: 800, useNativeDriver: useNative }).start();
  }, [value, glow]);
  const tint = dir === "up" ? colors.upSoft : colors.downSoft;
  return (
    <View style={[{ borderRadius: 6 }, style]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tint, borderRadius: 6, opacity: glow }]} />
      {children}
    </View>
  );
}

// "방금 업데이트" plus how many of the given keys changed between two snapshots.
export function refreshMessage(before: Record<string, unknown> | null, after: Record<string, unknown>): string {
  if (!before) return "방금 업데이트";
  const changed = Object.keys(after).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])).length;
  return changed ? `방금 업데이트 · ${changed}개 바뀜` : "방금 업데이트 · 바뀐 것 없음";
}

const styles = StyleSheet.create({
  pressed: { transform: [{ scale: 0.98 }] },
  skelScreen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: space.lg, paddingTop: space.sm },
  skelRow: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.lg },
  collapsible: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  collHead: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.lg },
  collTitle: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.text },
  collPreview: { flex: 1, ...type.caption, fontSize: 13, color: colors.textMuted },
  toastWrap: { position: "absolute", left: 0, right: 0, bottom: space.lg, alignItems: "center" },
  toast: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#2A2F36", borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 10 },
  toastText: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.text },
});
