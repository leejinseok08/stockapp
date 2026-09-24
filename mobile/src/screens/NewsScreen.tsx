import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { api } from "../api";
import { colors } from "../theme";
import type { NewsItem } from "../types";

function timeAgo(published: number | string | null) {
  if (!published) return "";
  const ms = typeof published === "number" ? published * 1000 : Date.parse(published);
  if (Number.isNaN(ms)) return "";
  const diffMin = Math.max(1, Math.floor((Date.now() - ms) / 60000));
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}시간 전`;
  return `${Math.floor(diffHr / 24)}일 전`;
}

export default function NewsScreen() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const watchlist = await api.watchlist();
    const symbols = watchlist.length ? watchlist.map((w) => w.symbol) : [];
    if (!symbols.length) {
      setNews([]);
      return;
    }
    const results = await Promise.all(symbols.map((s) => api.news(s).catch(() => [] as NewsItem[])));
    const merged = results.flat().sort((a, b) => {
      const at = typeof a.published === "number" ? a.published : Date.parse(String(a.published || 0));
      const bt = typeof b.published === "number" ? b.published : Date.parse(String(b.published || 0));
      return bt - at;
    });
    setNews(merged);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
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
      <Text style={styles.title}>뉴스</Text>
      {news.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>관심종목을 추가하면{"\n"}관련 뉴스를 모아볼 수 있어요.</Text>
        </View>
      ) : (
        <FlatList
          data={news}
          keyExtractor={(item, idx) => `${item.symbol}-${idx}-${item.url ?? item.title}`}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => item.url && Linking.openURL(item.url)}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.badge}>{item.symbol}</Text>
                <Text style={styles.time}>{timeAgo(item.published)}</Text>
              </View>
              <Text style={styles.cardTitle}>{item.title}</Text>
              {!!item.publisher && <Text style={styles.publisher}>{item.publisher}</Text>}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  empty: { color: colors.textMuted, textAlign: "center", lineHeight: 22 },
  title: { color: colors.text, fontSize: 22, fontWeight: "700", padding: 16, paddingBottom: 8 },
  card: {
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 12,
    padding: 12,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  badge: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "700",
    backgroundColor: "#1B2733",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  time: { color: colors.textMuted, fontSize: 11 },
  cardTitle: { color: colors.text, fontSize: 14, fontWeight: "600", lineHeight: 20 },
  publisher: { color: colors.textMuted, fontSize: 11, marginTop: 6 },
});
