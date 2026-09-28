// Horizontal swipes (owner, 2026-09-28): between the four tabs, and back from a stack screen by
// dragging from the left edge (like iOS). An installed iOS web app has neither by itself.
//
// Built on the browser's own touch events rather than the React Native responder system: after a
// native scroll the responder system kept the scroll view as responder, which refused to hand over,
// so the next sideways swipe did nothing. A swipe counts only when it is clearly sideways
// (|dx| > 2|dy|), so vertical scrolling is untouched, and never when it starts on something marked
// data-noswipe (charts with a crosshair, tables that scroll sideways).
import { useNavigation } from "@react-navigation/native";
import React, { useEffect, useRef } from "react";
import { Animated, Dimensions, StyleSheet, View } from "react-native";
import { colors } from "../theme";

export const TAB_ORDER = ["Today", "Stocks", "Market", "Account"] as const;
type Tab = (typeof TAB_ORDER)[number];

const JS = false; // react-native-web runs animations on the JS driver
const EDGE = 40; // back swipe starts within this many points of the left edge
export const NO_SWIPE = { noswipe: "1" }; // dataSet for children that own sideways drags

type Handlers = {
  accept: (x0: number, dx: number, dy: number) => boolean; // decide once the finger has moved
  move: (dx: number) => void;
  end: (dx: number, vx: number) => void;
  cancel: () => void;
};

// Attaches touch listeners to the wrapper's DOM node (web only; a no-op elsewhere).
function useSwipe(ref: React.RefObject<unknown>, h: Handlers) {
  const handlers = useRef(h);
  handlers.current = h;
  useEffect(() => {
    const el = ref.current as HTMLElement | null;
    if (!el || typeof el.addEventListener !== "function") return;
    // Follows one finger by its identifier: the one that just went down.
    let start: { id: number; x: number; y: number; t: number } | null = null;
    let state: "idle" | "on" | "off" = "idle";
    const find = (list: TouchList) => {
      for (let k = 0; k < list.length; k++) if (list[k].identifier === start?.id) return list[k];
      return null;
    };
    const onStart = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      const target = e.target as Element | null;
      if (!t || target?.closest?.("[data-noswipe]")) {
        start = null;
        return;
      }
      start = { id: t.identifier, x: t.clientX, y: t.clientY, t: Date.now() };
      state = "idle";
    };
    const onMove = (e: TouchEvent) => {
      if (!start || state === "off") return;
      const t = find(e.touches) ?? find(e.changedTouches);
      if (!t) return;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (state === "idle") {
        if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
        state = handlers.current.accept(start.x, dx, dy) ? "on" : "off";
        if (state === "off") return;
      }
      if (e.cancelable) e.preventDefault(); // this drag is ours: no scrolling, no taps underneath
      handlers.current.move(dx);
    };
    const onEnd = (e: TouchEvent) => {
      const t = start && find(e.changedTouches);
      if (start && !t) return; // another finger lifted
      if (start && t && state === "on") {
        const dx = t.clientX - start.x;
        handlers.current.end(dx, dx / Math.max(Date.now() - start.t, 1));
      }
      start = null;
      state = "idle";
    };
    const onCancel = () => {
      if (state === "on") handlers.current.cancel();
      start = null;
      state = "idle";
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onCancel);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onCancel);
    };
  }, [ref]);
}

const sideways = (dx: number, dy: number) => Math.abs(dx) > Math.abs(dy) * 2;

export function TabSwipe({ tab, children }: { tab: Tab; children: React.ReactNode }) {
  const navigation = useNavigation<any>();
  const shift = useRef(new Animated.Value(0)).current;
  const ref = useRef<View>(null);
  const i = TAB_ORDER.indexOf(tab);
  const settle = () => Animated.timing(shift, { toValue: 0, duration: 160, useNativeDriver: JS }).start();
  useSwipe(ref, {
    accept: (_x0, dx, dy) => sideways(dx, dy),
    // Follows the finger a little; at the first/last tab it only gives slightly (rubber band).
    move: (dx) => {
      const blocked = (dx > 0 && i === 0) || (dx < 0 && i === TAB_ORDER.length - 1);
      shift.setValue(Math.max(-90, Math.min(90, dx * (blocked ? 0.12 : 0.35))));
    },
    end: (dx, vx) => {
      settle();
      const next = dx < 0 ? i + 1 : i - 1;
      if ((Math.abs(dx) > 70 || Math.abs(vx) > 0.5) && next >= 0 && next < TAB_ORDER.length) navigation.navigate(TAB_ORDER[next]);
    },
    cancel: settle,
  });
  return (
    <Animated.View ref={ref} style={[styles.fill, { transform: [{ translateX: shift }] }]}>
      {children}
    </Animated.View>
  );
}

export function SwipeBack({ children }: { children: React.ReactNode }) {
  const navigation = useNavigation<any>();
  const x = useRef(new Animated.Value(0)).current;
  const ref = useRef<View>(null);
  const width = Dimensions.get("window").width;
  const settle = () => Animated.timing(x, { toValue: 0, duration: 180, useNativeDriver: JS }).start();
  useSwipe(ref, {
    accept: (x0, dx, dy) => x0 < EDGE && dx > 0 && sideways(dx, dy),
    move: (dx) => x.setValue(Math.max(0, dx)),
    end: (dx, vx) => {
      if (dx > width * 0.33 || vx > 0.5) {
        Animated.timing(x, { toValue: width, duration: 180, useNativeDriver: JS }).start(() => {
          if (navigation.canGoBack()) navigation.goBack();
        });
      } else settle();
    },
    cancel: settle,
  });
  const shade = x.interpolate({ inputRange: [0, width], outputRange: [0.35, 0], extrapolate: "clamp" });
  return (
    <View style={styles.fill}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.shade, { opacity: shade }]} />
      <Animated.View ref={ref} style={[styles.fill, styles.page, { transform: [{ translateX: x }] }]}>
        {children}
      </Animated.View>
    </View>
  );
}

// Wrap a screen component once, outside render, so navigation keeps a stable component.
export function withTabSwipe<P extends object>(Screen: React.ComponentType<P>, tab: Tab) {
  const Wrapped = (props: P) => (
    <TabSwipe tab={tab}>
      <Screen {...props} />
    </TabSwipe>
  );
  Wrapped.displayName = `TabSwipe(${tab})`;
  return Wrapped;
}

export function withSwipeBack<P extends object>(Screen: React.ComponentType<P>) {
  const Wrapped = (props: P) => (
    <SwipeBack>
      <Screen {...props} />
    </SwipeBack>
  );
  Wrapped.displayName = `SwipeBack(${Screen.displayName ?? Screen.name ?? "Screen"})`;
  return Wrapped;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { backgroundColor: colors.background },
  shade: { backgroundColor: "#000" },
});
