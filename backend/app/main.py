import logging
import threading

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import init_db
from .routers import market, stocks, today, watchlist

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

app = FastAPI(title="StockApp API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(stocks.router)
app.include_router(watchlist.router)
app.include_router(market.router)
app.include_router(today.router)


@app.on_event("startup")
def on_startup():
    init_db()
    threading.Thread(target=market.startup_collect, daemon=True).start()


@app.get("/health")
def health():
    return {"status": "ok"}
