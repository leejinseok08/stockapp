export function fmtNum(v: number | null | undefined, digits = 2): string {
  return v != null ? v.toFixed(digits) : "-";
}

export function fmtPct(v: number | null | undefined, digits = 2): string {
  return v != null ? `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%` : "-";
}

const WHOLE_UNIT_CURRENCIES = new Set(["KRW", "JPY"]);

// Price in its listing currency: KRW 256,000 / USD 182.40
export function fmtPrice(v: number | null | undefined, currency?: string | null): string {
  if (v == null) return "-";
  const digits = currency && WHOLE_UNIT_CURRENCIES.has(currency) ? 0 : 2;
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

// Compact money: KRW uses 억/조 (Korean reading), everything else uses K/M/B/T with its symbol.
export function fmtMoney(v: number | null | undefined, currency?: string | null): string {
  if (v == null) return "-";
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (currency === "KRW") {
    if (a >= 1e12) return `${sign}${(a / 1e12).toFixed(2)}조`;
    if (a >= 1e8) return `${sign}${Math.round(a / 1e8).toLocaleString("en-US")}억`;
    if (a >= 1e4) return `${sign}${(a / 1e4).toFixed(0)}만`;
    return `${sign}${a.toLocaleString("en-US", { maximumFractionDigits: 0 })}원`;
  }
  const sym = currency === "USD" || !currency ? "$" : `${currency} `;
  if (a >= 1e12) return `${sign}${sym}${(a / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${sign}${sym}${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${sign}${sym}${(a / 1e6).toFixed(1)}M`;
  return `${sign}${sym}${a.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

// "▲ 2.31%" / "▼ 1.20%" — direction is carried by the glyph, not just color.
export function fmtTrendPct(v: number | null | undefined, digits = 2): string {
  if (v == null) return "-";
  if (v === 0) return `${(0).toFixed(digits)}%`;
  return `${v > 0 ? "▲" : "▼"} ${Math.abs(v).toFixed(digits)}%`;
}
