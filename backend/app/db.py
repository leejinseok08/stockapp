from sqlmodel import SQLModel, Field, create_engine, Session

engine = create_engine("sqlite:///./watchlist.db", connect_args={"check_same_thread": False})


class WatchlistItem(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    symbol: str = Field(index=True, unique=True)
    buy_price: float | None = Field(default=None)
    quantity: float | None = Field(default=None)
    note: str | None = Field(default=None)


_ADDED_COLUMNS = {"buy_price": "FLOAT", "quantity": "FLOAT", "note": "VARCHAR"}


def init_db():
    SQLModel.metadata.create_all(engine)
    # create_all doesn't add columns to an existing table; patch older DBs in place.
    with engine.begin() as conn:
        existing = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(watchlistitem)")}
        for column, sql_type in _ADDED_COLUMNS.items():
            if column not in existing:
                conn.exec_driver_sql(f"ALTER TABLE watchlistitem ADD COLUMN {column} {sql_type}")


def get_session():
    with Session(engine) as session:
        yield session
