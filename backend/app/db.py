from sqlmodel import SQLModel, Field, create_engine, Session

engine = create_engine("sqlite:///./watchlist.db", connect_args={"check_same_thread": False})


class WatchlistItem(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    symbol: str = Field(index=True, unique=True)


def init_db():
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
