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

export type PortfolioFields = {
  buyPrice: number | null;
  quantity: number | null;
  note: string | null;
};

export type WatchlistEntry = Quote & Partial<Ticker> & PortfolioFields;

export type CompareRow = Quote & Partial<Ticker> & { trailingPE: number | null; marketCapUsd: number | null };

export type HistoryPoint = {
  t: number;
  close: number | null;
};

export type StatementRow = {
  item: string;
  values: Record<string, number | null>;
};

export type FundamentalScores = {
  valuation: number | null;
  profitability: number | null;
  health: number | null;
  growth: number | null;
};

export type Fundamentals = {
  symbol: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  summary: string | null;
  financialCurrency: string | null;
  scores: FundamentalScores;
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
  Portfolio: undefined;
  Compare: undefined;
};

export type TabParamList = {
  Watchlist: undefined;
  Market: undefined;
  News: undefined;
};

export type IndexStat = {
  symbol: string;
  name: string;
  region: "US" | "KR";
  last?: number;
  asOf?: string;
  change1d?: number | null;
  change1m?: number | null;
  vsMa200?: number | null;
  range52w?: number | null;
};

export type CurrencyStat = {
  code: string;
  name: string;
  quote: number | null;
  quoteLabel: string;
  asOf: string | null;
  strength1d: number | null;
  strength1m: number | null;
};

export type InvestorFlows = { foreign: number; institution: number; individual: number };

export type MarketFlows = {
  market: string;
  asOf: string;
  sum5d: InvestorFlows;
  sum20d: InvestorFlows;
  daily: ({ date: string } & InvestorFlows)[];
};

export type MarketOverview = {
  indices: IndexStat[];
  fx: {
    dollarIndex: { name: string; last?: number; change1d?: number | null; change1m?: number | null; asOf?: string };
    currencies: CurrencyStat[];
  };
  flows: { available: boolean; reason?: "krx_login_required" | "fetch_failed"; markets: MarketFlows[] };
  generatedAt: string;
};
