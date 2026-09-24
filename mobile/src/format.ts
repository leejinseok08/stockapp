export function fmtNum(v: number | null | undefined, digits = 2): string {
  return v != null ? v.toFixed(digits) : "-";
}

export function fmtPct(v: number | null | undefined, digits = 2): string {
  return v != null ? `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%` : "-";
}

export function fmtBig(v: number | null | undefined): string {
  if (v == null) return "-";
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toFixed(2)}조`;
  if (abs >= 1e8) return `${(v / 1e8).toFixed(2)}억`;
  if (abs >= 1e4) return `${(v / 1e4).toFixed(1)}만`;
  return v.toLocaleString();
}
