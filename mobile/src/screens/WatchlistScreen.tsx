import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api } from "../api";
import { minutesAgo, readCache, writeCache } from "../cache";
import { StockRow } from "../components/StockRow";
import { colors, fonts, space, type } from "../theme";
import type { RootStackParamList, Ticker, WatchlistEntry } from "../types";

const POLL_MS = 20000;

function HeaderIcon({
  icon,
  label,
  onPress,
  accent,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  onPress: () => void;
  accent?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.iconBtn, accent && styles.iconBtnAccent, pressed && { opacity: 0.6 }]}
    >
      <Feather name={icon} size={18} color={accent ? colors.onAccent : colors.text} />
    </Pressable>
  );
}
const CACHE_KEY = "watchlist";

export default function WatchlistScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [items, setItems] = useState<WatchlistEntry[]>([]);
  const [universe, setUniverse] = useState<Ticker[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [staleMinutes, setStaleMinutes] = useState<number | null>(null);

  const watchedSymbols = useMemo(() => new Set(items.map((i) => i.symbol)), [items]);

  const sections = useMemo(() => {
    const bySector = new Map<string, Ticker[]>();
    for (const t of universe) {
      const key = t.category || "기타";
      if (!bySector.has(key)) bySector.set(key, []);
      bySector.get(key)!.push(t);
    }
    return Array.from(bySector.entries()).map(([title, data]) => ({ title, data }));
  }, [universe]);

  const load = useCallback(async () => {
    try {
      const data = await api.watchlist();
      setItems(data);
      setStaleMinutes(null);
      writeCache(CACHE_KEY, data);
    } catch (e) {
      console.warn("watchlist load failed, falling back to cache", e);
      const cached = await readCache<WatchlistEntry[]>(CACHE_KEY);
      if (cached) {
        setItems(cached.data);
        setStaleMinutes(minutesAgo(cached.savedAt));
      }
    }
  }, []);

  useEffect(() => {
    api.universe().then(setUniverse).catch((e) => console.warn("universe load failed", e));
    load().finally(() => setLoading(false));
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const addSymbol = async (symbol: string) => {
    await api.addToWatchlist(symbol);
    await load();
  };

  const removeSymbol = async (symbol: string) => {
    await api.removeFromWatchlist(symbol);
    await load();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>관심종목</Text>
        <View style={styles.headerActions}>
          <HeaderIcon icon="briefcase" label="포트폴리오" onPress={() => navigation.navigate("Portfolio")} />
          <HeaderIcon icon="bar-chart-2" label="종목 비교" onPress={() => navigation.navigate("Compare")} />
          <HeaderIcon icon="layers" label="빅테크 점검" onPress={() => navigation.navigate("Scan")} />
          <HeaderIcon icon="plus" label="종목 추가" onPress={() => setPickerOpen(true)} accent />
        </View>
      </View>

      {staleMinutes != null && (
        <View style={styles.staleBanner}>
          <Feather name="wifi-off" size={12} color={colors.accent} />
          <Text style={styles.staleBannerText}>오프라인 · {staleMinutes}분 전 데이터</Text>
        </View>
      )}

      {items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>아직 추가된 종목이 없어요.{"\n"}오른쪽 위 + 버튼으로 시작해보세요.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.symbol}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          renderItem={({ item }) => (
            <StockRow
              item={item}
              onPress={() => navigation.navigate("StockDetail", { symbol: item.symbol, name: item.name })}
            />
          )}
        />
      )}

      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.title}>종목 선택</Text>
            <Pressable
              onPress={() => setPickerOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="닫기"
              hitSlop={12}
            >
              <Text style={styles.closeText}>닫기</Text>
            </Pressable>
          </View>
          <SectionList
            sections={sections}
            keyExtractor={(t) => t.symbol}
            renderSectionHeader={({ section }) => (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionHeaderText}>{section.title}</Text>
              </View>
            )}
            renderItem={({ item }) => {
              const watched = watchedSymbols.has(item.symbol);
              return (
                <Pressable
                  style={styles.pickerRow}
                  onPress={() => (watched ? removeSymbol(item.symbol) : addSymbol(item.symbol))}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name} ${watched ? "관심종목에서 제거" : "관심종목에 추가"}`}
                >
                  <View>
                    <Text style={styles.symbol}>{item.symbol}</Text>
                    <Text style={styles.name}>{item.name}</Text>
                  </View>
                  <Feather
                    name={watched ? "check-circle" : "plus-circle"}
                    size={20}
                    color={watched ? colors.accent : colors.textMuted}
                  />
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  empty: { ...type.body, color: colors.textMuted, textAlign: "center", lineHeight: 22 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  headerActions: { flexDirection: "row", gap: space.sm },
  title: { ...type.title, color: colors.text },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  iconBtnAccent: { backgroundColor: colors.accent, borderColor: colors.accent },
  staleBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    backgroundColor: colors.accentSoft,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: space.md,
  },
  staleBannerText: { fontFamily: fonts.sansMedium, color: colors.accent, fontSize: 12 },
  modalContainer: { flex: 1, backgroundColor: colors.background, paddingTop: 60 },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: space.lg,
    marginBottom: space.sm,
  },
  closeText: { fontFamily: fonts.sansMedium, color: colors.accent, fontSize: 15 },
  sectionHeader: {
    backgroundColor: colors.background,
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
    paddingBottom: space.xs,
  },
  sectionHeaderText: { ...type.section },
  pickerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  symbol: { ...type.numStrong, color: colors.text, fontSize: 15 },
  name: { ...type.caption, color: colors.textMuted, marginTop: 2 },
});
