import axios from "axios";
import type {
  CompareRow,
  Fundamentals,
  HistoryPoint,
  MarketOverview,
  NewsItem,
  PortfolioFields,
  Quote,
  Ticker,
  WatchlistEntry,
} from "./types";

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

  compare: (symbols: string[]) =>
    client
      .get<CompareRow[]>("/stocks/compare", { params: { symbols: symbols.join(",") } })
      .then((r) => r.data),
};
