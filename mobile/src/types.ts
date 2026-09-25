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
  buyDate?: string | null;
};

export type WatchlistEntry = Quote & Partial<Ticker> & PortfolioFields;

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
};

export type TabParamList = {
  Today: undefined;
  Stocks: undefined;
  Market: undefined;
  Account: undefined;
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
  history: { t: number; v: number }[];
  zones: { from: number | null; to: number | null }[];
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
  logo?: string | null;
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

// ---- daily trend call, research note, list and today (docs/app-design.md) ----

export type TrendAction = "BUY" | "SELL" | "HOLD" | "WAIT";

export type TrendSignal = {
  symbol?: string;
  action: TrendAction;
  position: "보유" | "현금";
  since: string | null;
  asOf: string;
  close: number;
  sma: number | null;
  vsSma: number | null;
  macdUp: boolean;
  smaFalling: boolean;
};

export type TrendBacktest = {
  rule: string;
  period: string;
  vsPlain: number;
  mdd: number;
  plainMdd: number;
  worstVsPrincipal: number;
  plainWorstVsPrincipal: number;
  trades: number;
  timeInMarket: number;
};

export type TrendChart = {
  symbol: string;
  maWindow: number;
  points: { t: number; close: number; sma: number | null }[];
  marks: { t: number; type: "BUY" | "SELL"; price: number }[];
};

export type Scenario = { price: number; upside: number };

export type Analysis = {
  symbol: string;
  logo?: string | null;
  asOf: string;
  rating: "매수" | "중립" | "매도" | null;
  conviction: "높음" | "보통" | null;
  price: number;
  currency: string | null;
  scenarios:
    | ({ bear: Scenario; base: Scenario; bull: Scenario } & {
        peRange: { min: number; median: number; max: number; years: number };
        pbrRange: { min: number; median: number; max: number } | null;
        method: string;
        excludedYears: string[];
        clampedToStreet: string[];
      })
    | null;
  model: { eps: { low: number | null; avg: number | null; high: number | null }; epsSource: string; forwardPe: number | null; cyclical: boolean };
  street: { low: number | null; median: number | null; mean: number | null; high: number | null; modelVsStreet?: number } | null;
  thesis: string[];
  catalysts: { date: string; text: string }[];
  risks: string[];
  trend: TrendSignal | null;
  trendBacktest: TrendBacktest | null;
};

export type ListRow = ScanRow & {
  group: boolean;
  watched: boolean;
  price: number | null;
  changePercent: number | null;
  quoteCurrency: string | null;
  trend: TrendSignal | null;
  rating: { rating: Analysis["rating"]; conviction: Analysis["conviction"]; baseUpside: number | null } | null;
};

export type TodayItem = {
  symbol: string;
  logo?: string | null;
  name: string | null;
  action: TrendAction | null;
  position: string | null;
  since: string | null;
  asOf: string | null;
  rating: Analysis["rating"];
};

export type Today = {
  changed: TodayItem[];
  recent: TodayItem[];
  risk: { lit: number; total: number; level: string; litItems: string[] } | null;
  earnings: { symbol: string; name: string | null; logo?: string | null; date: string; text: string }[];
  nextEarnings: { symbol: string; name: string | null; date: string; text: string } | null;
  dividends?: { symbol: string; name: string | null; logo?: string | null; date: string; estimated: boolean; amount: number | null; currency: string | null }[];
  generatedAt: string;
};

export type HeatmapMarket = {
  id: "US" | "KR";
  name: string;
  currency: string;
  sectors: { name: string; stocks: { symbol: string; name: string; cap: number; change: number | null }[] }[];
};

export type HeatmapData = { markets: HeatmapMarket[]; generatedAt: string };

export type SearchResult = { symbol: string; name: string; market: string; nation: "KOR" | "USA" };

export type SnowflakeCheck = { label: string; pass: boolean; detail: string };
export type SnowflakeAxis = { label: string; score: number; checks: SnowflakeCheck[] };
export type FilingYear = {
  year: number;
  periodEnd?: string;
  form?: string;
  revenue?: number;
  operatingIncome?: number;
  netIncome?: number;
  eps?: number;
  ocf?: number;
  equity?: number;
  debt?: number;
  dps?: number;
};
export type Snowflake =
  | { symbol: string; available: false; reason: string }
  | {
      symbol: string;
      available: true;
      source: string;
      sourceUrl: string;
      currency: string;
      price: number;
      priceSource: string;
      axes: Record<"value" | "growth" | "past" | "health" | "dividend", SnowflakeAxis>;
      total: number;
      metrics: Record<string, number | null>;
      years: FilingYear[];
    };

export type Disclosure = { title: string; date: string; filer: string; url: string };

export type Dividends = {
  symbol: string;
  currency: string | null;
  pays: boolean;
  lastExDate?: string;
  lastAmount?: number;
  ttm?: number;
  frequency?: string;
  nextExDate?: string | null;
  nextEstimated?: boolean;
  yieldTTM?: number;
  history?: { date: string; amount: number }[];
};

export type Performance = {
  usdkrw: number | null;
  totalCostKRW: number;
  totalValueKRW: number;
  totalReturn: number | null;
  rows: {
    symbol: string;
    currency: string;
    cost: number;
    value: number;
    return: number | null;
    buyDate: string | null;
    benchmark: { symbol: string; name: string; return: number } | null;
    excess: number | null;
    valueKRW: number | null;
  }[];
};

export type IsaPlanItem = {
  id: string;
  symbol: string;
  name: string;
  sleeve: string;
  weight: number;
  status: "buy" | "wait" | "done" | "error";
  reason?: "dip" | "monthEnd";
  boughtOn?: string;
  buyOn?: string;
  buyToday?: boolean;
  lastDate?: string;
  move?: number;
  ratio?: number | null;
};
export type IsaPlan = { active: boolean; items: IsaPlanItem[]; rule: string; backtestVsPlain: number; generatedAt: string };

export type SwingRecord = {
  pass: boolean;
  trades: number;
  win: number;
  avg: number;
  median: number;
  edge: number;
  days: number;
  pf: number | null;
  portfolio?: { cagr: number; mdd: number; bhCagr: number; bhMdd: number } | null;
};
export type SwingCandidate = { symbol: string; name: string | null; close: number; order: string; limit: number | null; date: string };
export type SwingGroup = { key: string; name: string; source: string; plan: string; record: SwingRecord; count: number; candidates: SwingCandidate[] };
export type SwingScan = {
  market: "KR" | "US";
  asOf: string | null;
  scanned: number;
  techniques: { key: string; name: string }[];
  excluded: { key: string; name: string; record?: SwingRecord | null }[];
  groups: SwingGroup[];
  generatedAt: string;
};
