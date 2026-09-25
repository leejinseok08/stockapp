"""Web Push for the installed app: BUY/SELL flips and the risk gauge reaching 경계.

Keys: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (Render env). A Cloudflare Worker cron calls
POST /push/run after each market's close with X-Cron-Secret = CRON_SECRET. Each (date, message)
is sent once, recorded as a MarketSnapshot row, so repeated runs don't repeat alerts.
iPhone: works only for the app added to the home screen (iOS 16.4+).
"""

import json
import logging
import os
from datetime import datetime

from sqlmodel import Session, select

from ..db import MarketSnapshot, PushSubscription, engine, upsert_snapshots
from .macro import KST

log = logging.getLogger("stockapp.push")
APP_URL = "https://stockapp-i5a.pages.dev"


def public_key() -> str | None:
    return os.getenv("VAPID_PUBLIC_KEY")


def save_subscription(sub: dict) -> None:
    with Session(engine) as s:
        row = s.exec(select(PushSubscription).where(PushSubscription.endpoint == sub["endpoint"])).first()
        if not row:
            row = PushSubscription(endpoint=sub["endpoint"])
        row.p256dh = sub["keys"]["p256dh"]
        row.auth = sub["keys"]["auth"]
        s.add(row)
        s.commit()


def delete_subscription(endpoint: str) -> None:
    with Session(engine) as s:
        row = s.exec(select(PushSubscription).where(PushSubscription.endpoint == endpoint)).first()
        if row:
            s.delete(row)
            s.commit()


def send(title: str, body: str, url: str = "/", only: str | None = None) -> int:
    from pywebpush import WebPushException, webpush

    key = os.getenv("VAPID_PRIVATE_KEY")
    if not key:
        raise RuntimeError("VAPID_PRIVATE_KEY 미설정")
    sent = 0
    with Session(engine) as s:
        subs = s.exec(select(PushSubscription)).all()
        for sub in subs:
            if only and sub.endpoint != only:
                continue
            try:
                webpush(
                    subscription_info={"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                    data=json.dumps({"title": title, "body": body, "url": url}, ensure_ascii=False),
                    vapid_private_key=key,
                    vapid_claims={"sub": APP_URL},
                    ttl=12 * 3600,
                )
                sent += 1
            except WebPushException as e:
                code = getattr(e.response, "status_code", None)
                if code in (404, 410):  # unsubscribed or expired
                    s.delete(sub)
                    s.commit()
                log.warning("push failed (%s): %s", code, e)
    return sent


def split_message(split: dict | None) -> tuple[str, str, str] | None:
    """One alert per buy day: (buy date, title, body). Sent the evening before and not again."""
    buys = [i for i in (split or {}).get("items", []) if i.get("status") == "buy"]
    if not buys:
        return None
    day = min(i["buyOn"] for i in buys)
    when = "오늘" if all(i.get("buyToday") for i in buys) else f"{day[5:].replace('-', '/')}"
    parts = [f"{i['sleeve']} {round(i['weight'] * 100)}%" + (" (월말)" if i["reason"] == "monthEnd" else "") for i in buys]
    return (day, f"분할매수 · {when}", f"{' · '.join(parts)} — 이번 달 몫 매수")


def daily_messages(today: dict, risk: dict | None) -> list[tuple[str, str, str]]:
    """(key, title, body) for what's worth an alert today."""
    out = []
    changed = today.get("changed") or []
    if changed:
        body = " · ".join(f"{c.get('name') or c['symbol']} {c['action']}" for c in changed)
        key = "flips:" + ",".join(sorted(f"{c['symbol']}={c['action']}" for c in changed))
        out.append((key, "매매 신호 변경", f"{body} — 다음 거래일 실행"))
    if risk and risk.get("level") == "경계":
        lit = ", ".join(i["label"] for i in risk.get("items", []) if i.get("lit"))
        out.append((f"risk:{risk['lit']}", f"위험 경고 {risk['lit']}/{risk['total']} 경계", lit))
    return out


def run_daily(today: dict, risk: dict | None) -> dict:
    date = datetime.now(KST).strftime("%Y-%m-%d")
    msgs = daily_messages(today, risk)
    split = split_message(today.get("splitBuy"))
    if split:
        buy_day, title, body = split
        # Keyed by the buy day, so the evening heads-up and the morning run don't both send it.
        with Session(engine) as s:
            seen = s.exec(select(MarketSnapshot).where(MarketSnapshot.date == buy_day,
                                                      MarketSnapshot.series == "push:split")).first()
        if not seen:
            n = send(title, body)
            upsert_snapshots([(buy_day, "push:split", float(n))])
            msgs_sent = [{"title": title, "body": body, "sent": n}]
        else:
            msgs_sent = []
    else:
        msgs_sent = []
    done = list(msgs_sent)
    with Session(engine) as s:
        sent_before = {r.series for r in s.exec(select(MarketSnapshot).where(MarketSnapshot.date == date,
                                                                             MarketSnapshot.series.startswith("push:")))}
    for key, title, body in msgs:
        series = f"push:{key}"[:250]
        if series in sent_before:
            continue
        n = send(title, body)
        upsert_snapshots([(date, series, float(n))])
        done.append({"title": title, "body": body, "sent": n})
    return {"date": date, "messages": done, "candidates": len(msgs)}
