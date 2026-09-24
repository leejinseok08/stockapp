export type Ticker = {
  symbol: string;
  name: string;
  category: string;
};

export type Quote = {
  symbol: string;
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  currency: string | null;
  marketCap: number | null;
  volume: number | null;
};

export type WatchlistEntry = Quote & Partial<Ticker>;

export type HistoryPoint = {
  t: number;
  close: number | null;
};

export type StatementRow = {
  item: string;
  values: Record<string, number | null>;
};

export type Fundamentals = {
  symbol: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  summary: string | null;
  ratios: {
    trailingPE: number | null;
    forwardPE: number | null;
    priceToBook: number | null;
    returnOnEquity: number | null;
    profitMargins: number | null;
    operatingMargins: number | null;
    revenueGrowth: number | null;
    earningsGrowth: number | null;
    debtToEquity: number | null;
    dividendYield: number | null;
    fiftyTwoWeekHigh: number | null;
    fiftyTwoWeekLow: number | null;
  };
  income: StatementRow[];
  balance: StatementRow[];
  cashflow: StatementRow[];
};

export type NewsItem = {
  symbol: string;
  title: string;
  url: string | null;
  publisher: string | null;
  published: number | string | null;
};

export type RootStackParamList = {
  Tabs: undefined;
  StockDetail: { symbol: string; name?: string };
};

export type TabParamList = {
  Watchlist: undefined;
  News: undefined;
};
