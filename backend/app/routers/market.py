import csv
import io
import logging

from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlmodel import Session, select

from ..db import IS_SQLITE, MarketSnapshot, engine, get_session
from ..services.macro import get_overview, snapshot_rows

log = logging.getLogger("stockapp.market")
router = APIRouter(prefix="/market", tags=["market"])


@router.get("/overview")
def overview():
    return get_overview()


def collect_snapshot(session: Session) -> int:
    """Upsert today's numbers; safe to call repeatedly (same date+series just overwrites)."""
    rows = snapshot_rows(get_overview())
    if not rows:
        return 0
    insert = sqlite_insert if IS_SQLITE else pg_insert
    stmt = insert(MarketSnapshot).values([{"date": d, "series": s, "value": v} for d, s, v in rows])
    stmt = stmt.on_conflict_do_update(index_elements=["date", "series"], set_={"value": stmt.excluded.value})
    session.exec(stmt)
    session.commit()
    return len(rows)


@router.post("/collect")
def collect(session: Session = Depends(get_session)):
    count = collect_snapshot(session)
    log.info("market snapshot collected: %d rows", count)
    return {"stored": count}


@router.get("/export.csv", response_class=PlainTextResponse)
def export_csv(session: Session = Depends(get_session)):
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["date", "series", "value"])
    for r in session.exec(select(MarketSnapshot).order_by(MarketSnapshot.date, MarketSnapshot.series)):
        writer.writerow([r.date, r.series, r.value])
    return PlainTextResponse(buf.getvalue(), media_type="text/csv")


def startup_collect() -> None:
    """One collection at boot so deploy logs show whether each data source works from the server."""
    try:
        ov = get_overview()
        ok_idx = sum(1 for i in ov["indices"] if i.get("last") is not None)
        ok_fx = sum(1 for c in ov["fx"]["currencies"] if c.get("quote") is not None)
        flows = ov["flows"]
        log.info(
            "data check: indices %d/%d, fx %d/%d, flows available=%s reason=%s",
            ok_idx, len(ov["indices"]), ok_fx, len(ov["fx"]["currencies"]),
            flows["available"], flows.get("reason"),
        )
        with Session(engine) as session:
            log.info("startup snapshot stored: %d rows", collect_snapshot(session))
    except Exception:
        log.exception("startup data check failed")
