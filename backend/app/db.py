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


class MarketSnapshot(SQLModel, table=True):
    """One number per (trading date, series), e.g. ('2026-09-24', 'flow:KOSPI:foreign')."""

    __table_args__ = (UniqueConstraint("date", "series"),)

    id: int | None = Field(default=None, primary_key=True)
    date: str = Field(index=True)
    series: str = Field(index=True)
    value: float


_ADDED_COLUMNS = {"buy_price": "FLOAT", "quantity": "FLOAT", "note": "VARCHAR"}


def init_db():
    SQLModel.metadata.create_all(engine)
    if not IS_SQLITE:
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
