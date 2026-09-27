// One place that decides which tone each signal gets (theme.tones). Same meaning → same color:
//   good    = favorable: BUY, 매수, 시황 긍정, 시장 온도 조정·공포 (the score's "cheaper than usual" end)
//   neutral = no call:   보유, 관망, 중립, 시장 온도 보통, 위험 게이지 평상
//   caution = unfavorable: SELL, 매도, 시황 신중, 시장 온도 과열, 위험 게이지 관찰·경계
import type { Tone } from "./theme";
import type { TrendAction } from "./types";

export function actionTone(a: TrendAction | null | undefined): Tone {
  return a === "BUY" ? "good" : a === "SELL" ? "caution" : "neutral";
}

export function ratingTone(r: string | null | undefined): Tone {
  return r === "매수" ? "good" : r === "매도" ? "caution" : "neutral";
}

export function outlookTone(t: string | null | undefined): Tone {
  return t === "긍정" ? "good" : t === "신중" ? "caution" : "neutral";
}

export function riskTone(level: string | null | undefined): Tone {
  return level === "관찰" || level === "경계" ? "caution" : "neutral";
}

// Market temperature reading (backend signals.BANDS): 조정·공포 구간 / 보통 / 과열 구간.
export function temperatureTone(reading: string | null | undefined): Tone {
  if (!reading) return "neutral";
  return reading.startsWith("조정") ? "good" : reading.startsWith("과열") ? "caution" : "neutral";
}
