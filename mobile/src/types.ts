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
  Scan: undefined;
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

export type SignalComponent = {
  key: string;
  label: string;
  score: number;
  raw: number;
  reason: string;
  weight: number;
};

// Market temperature: context only, not a buy multiplier (see docs/signal-research.md).
export type SignalTarget = {
  id: string;
  symbol: string;
  name: string;
  etfExample: string;
  region: "US" | "KR";
  reference: boolean;
  asOf: string | null;
  score: number | null;
  action: string | null;
  components: SignalComponent[];
  missing: string[];
  fxHint: string | null;
};

export type Signals = {
  targets: SignalTarget[];
  bands: { min: number; action: string }[];
  generatedAt: string;
};

export type DayGuide = {
  etfSymbol: string;
  etfName: string;
  asOf: string;
  lastReturn: number;
  usualMove: number | null;
  threshold: number | null;
  buyNextSession: boolean;
  firedThisMonth: string[];
};

export type PlanSleeve = {
  id: string;
  name: string;
  weight: number;
  etfs: { symbol: string; name: string }[];
  guide: DayGuide | null;
};

export type BacktestSummary = {
  period: string;
  weights: Record<string, number>;
  costOneWay: number;
  plainXirr: number;
  plainWorstVsPrincipal: number;
  plainMdd: number;
  scaledSignalVsPlain: number;
  dipDayVsPlain: number;
  hindsightBestDayVsPlain: number;
  rebalanceByNewMoneyVsPlain?: number;
  gridSettingsTried: number;
  gridSettingsBeatingPlain: number;
  generatedAt: string;
};

export type Plan = {
  account: string;
  sleeves: PlanSleeve[];
  rule: { z: number; lookback: number; text: string };
  backtest: BacktestSummary | null;
  generatedAt: string;
};

export type RiskItem = {
  key: string;
  label: string;
  value: number;
  unit: string;
  lit: boolean;
  rule: string;
  reason: string;
  asOf: string;
  source: string;
};

export type RiskGauge = {
  lit: number;
  total: number;
  level: string;
  items: RiskItem[];
  failed: string[];
  generatedAt: string;
};

export type RelativeSummary = {
  symbol: string;
  benchmark: string;
  benchmarkName: string;
  maWindow: number;
  aboveMa: boolean | null;
  since: string | null;
  excess1m: number | null;
  excess3m: number | null;
  excess6m: number | null;
  stock3m: number | null;
  bench3m: number | null;
  verdict: string | null;
};

export type Relative = RelativeSummary & { series: { t: number; ratio: number; ma: number | null }[] };

export type FinancialLine = { latest: number | null; qoq: number | null; yoy: number | null; ttm: number | null };

export type FinancialLineKey = "revenue" | "operatingIncome" | "netIncome" | "operatingCashFlow";

export type ScanRow = {
  symbol: string;
  name?: string;
  category?: string;
  currency?: string | null;
  quarter: string | null;
  lines: Partial<Record<FinancialLineKey, FinancialLine | null>>;
  ocfNegativeTtm: boolean;
  roe?: number | null;
  peg?: number | null;
  pbr?: number | null;
  psr?: number | null;
  capToOpIncome?: number | null;
  score: number | null;
  scoreCoverage: number;
  relative: RelativeSummary | null;
};

export type Scan = { rows: ScanRow[] };

export type MarketOverview = {
  indices: IndexStat[];
  fx: {
    dollarIndex: { name: string; last?: number; change1d?: number | null; change1m?: number | null; asOf?: string };
    currencies: CurrencyStat[];
  };
  flows: { available: boolean; reason?: "krx_login_required" | "fetch_failed"; markets: MarketFlows[] };
  generatedAt: string;
};
