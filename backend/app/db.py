import os

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, Session, SQLModel, create_engine

# Render's disk is wiped on every deploy, so production points DATABASE_URL at a managed Postgres.
# Without it (local dev) we fall back to a SQLite file.
_url = os.environ.get("DATABASE_URL", "sqlite:///./watchlist.db")
if _url.startswith("postgres://"):
    _url = "postgresql://" + _url[len("postgres://"):]  # SQLAlchemy only accepts the long scheme

IS_SQLITE = _url.startswith("sqlite")
engine = create_engine(
    _url,
    connect_args={"check_same_thread": False} if IS_SQLITE else {},
    pool_pre_ping=not IS_SQLITE,  # serverless Postgres drops idle connections
)


class WatchlistItem(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    symbol: str = Field(index=True, unique=True)
    buy_price: float | None = Field(default=None)
    quantity: float | None = Field(default=None)
    note: str | None = Field(default=None)
    buy_date: str | None = Field(default=None)  # YYYY-MM-DD, for the benchmark comparison


class MarketSnapshot(SQLModel, table=True):
    """One number per (trading date, series), e.g. ('2026-09-24', 'flow:KOSPI:foreign')."""

    __table_args__ = (UniqueConstraint("date", "series"),)

    id: int | None = Field(default=None, primary_key=True)
    date: str = Field(index=True)
    series: str = Field(index=True)
    value: float


class PushSubscription(SQLModel, table=True):
    """A browser's Web Push endpoint (the installed PWA on the owner's phone)."""

    id: int | None = Field(default=None, primary_key=True)
    endpoint: str = Field(index=True, unique=True)
    p256dh: str
    auth: str


_ADDED_COLUMNS = {"buy_price": "FLOAT", "quantity": "FLOAT", "note": "VARCHAR", "buy_date": "VARCHAR"}


def init_db():
    SQLModel.metadata.create_all(engine)
    if not IS_SQLITE:
        # create_all doesn't add columns to an existing table.
        with engine.begin() as conn:
            conn.exec_driver_sql("ALTER TABLE watchlistitem ADD COLUMN IF NOT EXISTS buy_date VARCHAR")
        return
    # create_all doesn't add columns to an existing table; patch older local SQLite files in place.
    with engine.begin() as conn:
        existing = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(watchlistitem)")}
        for column, sql_type in _ADDED_COLUMNS.items():
            if column not in existing:
                conn.exec_driver_sql(f"ALTER TABLE watchlistitem ADD COLUMN {column} {sql_type}")


def get_session():
    with Session(engine) as session:
        yield session


def upsert_snapshots(rows: list[tuple[str, str, float]]) -> int:
    """Insert or overwrite (date, series, value) rows."""
    if not rows:
        return 0
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from sqlalchemy.dialects.sqlite import insert as sqlite_insert

    insert = sqlite_insert if IS_SQLITE else pg_insert
    stmt = insert(MarketSnapshot).values([{"date": d, "series": s, "value": v} for d, s, v in rows])
    stmt = stmt.on_conflict_do_update(index_elements=["date", "series"], set_={"value": stmt.excluded.value})
    with Session(engine) as session:
        session.exec(stmt)
        session.commit()
    return len(rows)


def latest_snapshots(prefix: str) -> dict[str, tuple[str, float]]:
    """Most recent (date, value) for every series starting with `prefix`."""
    from sqlmodel import select

    out: dict[str, tuple[str, float]] = {}
    with Session(engine) as session:
        q = select(MarketSnapshot).where(MarketSnapshot.series.startswith(prefix)).order_by(MarketSnapshot.date.desc())
        for r in session.exec(q):
            out.setdefault(r.series, (r.date, r.value))
    return out
