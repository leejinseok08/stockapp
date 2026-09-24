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
import { colors } from "../theme";
import type { RootStackParamList, Ticker, WatchlistEntry } from "../types";

const POLL_MS = 20000;
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
          <Pressable style={styles.iconBtn} onPress={() => navigation.navigate("Portfolio")}>
            <Text style={styles.iconBtnText}>포트폴리오</Text>
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={() => navigation.navigate("Compare")}>
            <Text style={styles.iconBtnText}>비교</Text>
          </Pressable>
        </View>
      </View>

      {staleMinutes != null && (
        <View style={styles.staleBanner}>
          <Text style={styles.staleBannerText}>오프라인 · {staleMinutes}분 전 데이터</Text>
        </View>
      )}

      <View style={styles.addRow}>
        <Pressable style={styles.addBtn} onPress={() => setPickerOpen(true)}>
          <Text style={styles.addBtnText}>+ 종목 추가</Text>
        </Pressable>
      </View>

      {items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>아직 추가된 종목이 없어요.{"\n"}상단의 '+ 종목 추가'로 시작해보세요.</Text>
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
            <Pressable onPress={() => setPickerOpen(false)}>
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
                >
                  <View>
                    <Text style={styles.symbol}>{item.symbol}</Text>
                    <Text style={styles.name}>{item.name}</Text>
                  </View>
                  <Text style={[styles.toggle, watched && styles.toggleActive]}>
                    {watched ? "제거" : "추가"}
                  </Text>
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
  empty: { color: colors.textMuted, textAlign: "center", lineHeight: 22 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  headerActions: { flexDirection: "row", gap: 8 },
  title: { color: colors.text, fontSize: 22, fontWeight: "700" },
  iconBtn: {
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  iconBtnText: { color: colors.text, fontWeight: "600", fontSize: 12 },
  staleBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: "#3A2E12",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  staleBannerText: { color: "#E8B84B", fontSize: 12, fontWeight: "600" },
  addRow: { paddingHorizontal: 16, marginBottom: 8 },
  addBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  addBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  modalContainer: { flex: 1, backgroundColor: colors.background, paddingTop: 60 },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  closeText: { color: colors.accent, fontSize: 16, fontWeight: "600" },
  sectionHeader: {
    backgroundColor: colors.background,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  sectionHeaderText: { color: colors.accent, fontSize: 12, fontWeight: "700" },
  pickerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  symbol: { color: colors.text, fontSize: 16, fontWeight: "600" },
  name: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  toggle: { color: colors.accent, fontWeight: "600" },
  toggleActive: { color: colors.down },
});
