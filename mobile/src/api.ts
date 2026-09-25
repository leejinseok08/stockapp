import axios from "axios";
import type {
  Analysis,
  Fundamentals,
  HeatmapData,
  ListRow,
  HistoryPoint,
  MarketOverview,
  NewsItem,
  PortfolioFields,
  Quote,
  Relative,
  RiskGauge,
  Scan,
  Signals,
  Ticker,
  Today,
  TrendChart,
  WatchlistEntry,
} from "./types";

// Type-only, module-scoped: the installed @types/node narrows process.env and rejects this key.
// Expo still inlines the literal `process.env.EXPO_PUBLIC_API_URL` at build time.
declare const process: { env: { EXPO_PUBLIC_API_URL?: string } };

// FastAPI backend hosted on Render — reachable from anywhere, no laptop needed.
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://stockapp-ghmx.onrender.com";

const client = axios.create({ baseURL: API_BASE_URL, timeout: 10000 });

export const api = {
  universe: () => client.get<Ticker[]>("/stocks/universe").then((r) => r.data),

  quotes: (symbols: string[]) =>
    client
      .get<Quote[]>("/stocks/quotes", { params: { symbols: symbols.join(",") } })
      .then((r) => r.data),

  history: (symbol: string, range: string) =>
    client
      .get<HistoryPoint[]>(`/stocks/${encodeURIComponent(symbol)}/history`, { params: { range } })
      .then((r) => r.data),

  fundamentals: (symbol: string) =>
    client.get<Fundamentals>(`/stocks/${encodeURIComponent(symbol)}/fundamentals`).then((r) => r.data),

  news: (symbol: string) =>
    client.get<NewsItem[]>(`/stocks/${encodeURIComponent(symbol)}/news`).then((r) => r.data),

  watchlist: () => client.get<WatchlistEntry[]>("/watchlist").then((r) => r.data),

  addToWatchlist: (symbol: string) => client.post(`/watchlist/${encodeURIComponent(symbol)}`),

  removeFromWatchlist: (symbol: string) => client.delete(`/watchlist/${encodeURIComponent(symbol)}`),

  updateWatchlistItem: (symbol: string, fields: Partial<PortfolioFields>) =>
    client
      .patch<WatchlistEntry>(`/watchlist/${encodeURIComponent(symbol)}`, fields)
      .then((r) => r.data),

  marketOverview: () =>
    // First call after the free server sleeps also fetches ~10 series, so allow extra time.
    client.get<MarketOverview>("/market/overview", { timeout: 45000 }).then((r) => r.data),

  marketSignals: () => client.get<Signals>("/market/signals", { timeout: 45000 }).then((r) => r.data),

  heatmap: () => client.get<HeatmapData>("/market/heatmap", { timeout: 60000 }).then((r) => r.data),

  risk: () => client.get<RiskGauge>("/market/risk", { timeout: 45000 }).then((r) => r.data),

  // Nine companies' statements on a cold server take a while.
  scan: (symbols?: string[]) =>
    client
      .get<Scan>("/stocks/scan", { params: symbols ? { symbols: symbols.join(",") } : {}, timeout: 90000 })
      .then((r) => r.data),

  // Cold server: nine companies' statements and notes can take close to a minute the first time.
  list: () => client.get<{ rows: ListRow[] }>("/stocks/list", { timeout: 120000 }).then((r) => r.data),

  today: () => client.get<Today>("/today", { timeout: 120000 }).then((r) => r.data),

  analysis: (symbol: string) =>
    client.get<Analysis>(`/stocks/${encodeURIComponent(symbol)}/analysis`, { timeout: 90000 }).then((r) => r.data),

  trendChart: (symbol: string) =>
    client.get<TrendChart>(`/stocks/${encodeURIComponent(symbol)}/trend-chart`, { timeout: 45000 }).then((r) => r.data),

  relative: (symbol: string) =>
    client.get<Relative>(`/stocks/${encodeURIComponent(symbol)}/relative`, { timeout: 45000 }).then((r) => r.data),

};
