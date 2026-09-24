import axios from "axios";
import type { Fundamentals, HistoryPoint, NewsItem, Quote, Ticker, WatchlistEntry } from "./types";

// FastAPI backend hosted on Render — reachable from anywhere, no laptop needed.
export const API_BASE_URL = "https://stockapp-ghmx.onrender.com";

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
};
