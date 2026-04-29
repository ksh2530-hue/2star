from __future__ import annotations

from typing import Any

import requests
import yfinance as yf
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel


app = FastAPI(title="tooStar")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")


class QuoteRequest(BaseModel):
    symbols: list[str]


STOCKS: list[dict[str, str]] = [
    {"name": "삼성전자", "symbol": "005930.KS", "market": "KR"},
    {"name": "SK하이닉스", "symbol": "000660.KS", "market": "KR"},
    {"name": "LG에너지솔루션", "symbol": "373220.KS", "market": "KR"},
    {"name": "NAVER", "symbol": "035420.KS", "market": "KR"},
    {"name": "카카오", "symbol": "035720.KS", "market": "KR"},
    {"name": "현대차", "symbol": "005380.KS", "market": "KR"},
    {"name": "기아", "symbol": "000270.KS", "market": "KR"},
    {"name": "POSCO홀딩스", "symbol": "005490.KS", "market": "KR"},
    {"name": "셀트리온", "symbol": "068270.KS", "market": "KR"},
    {"name": "삼성바이오로직스", "symbol": "207940.KS", "market": "KR"},
    {"name": "Apple", "symbol": "AAPL", "market": "US"},
    {"name": "Microsoft", "symbol": "MSFT", "market": "US"},
    {"name": "Google(Alphabet)", "symbol": "GOOGL", "market": "US"},
    {"name": "Amazon", "symbol": "AMZN", "market": "US"},
    {"name": "NVIDIA", "symbol": "NVDA", "market": "US"},
    {"name": "Tesla", "symbol": "TSLA", "market": "US"},
    {"name": "Meta", "symbol": "META", "market": "US"},
    {"name": "Netflix", "symbol": "NFLX", "market": "US"},
    {"name": "Oracle", "symbol": "ORCL", "market": "US"},
    {"name": "AMD", "symbol": "AMD", "market": "US"},
]

STOCK_BY_SYMBOL = {stock["symbol"]: stock for stock in STOCKS}


@app.get("/")
def index() -> FileResponse:
    return FileResponse("static/index.html")


@app.get("/api/stocks")
def get_stocks() -> list[dict[str, str]]:
    return STOCKS


@app.post("/api/quotes")
def get_quotes(payload: QuoteRequest) -> dict[str, Any]:
    unknown = [symbol for symbol in payload.symbols if symbol not in STOCK_BY_SYMBOL]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown symbols: {', '.join(unknown)}")

    return {"quotes": [fetch_quote(symbol) for symbol in payload.symbols]}


def fetch_quote(symbol: str) -> dict[str, Any]:
    stock = STOCK_BY_SYMBOL[symbol]
    quote = {
        "symbol": symbol,
        "name": stock["name"],
        "market": stock["market"],
        "price": None,
        "changePercent": None,
        "volume": None,
        "currency": "KRW" if stock["market"] == "KR" else "USD",
        "status": "unavailable",
    }

    yahoo_quote = fetch_yahoo_chart_quote(symbol, quote.copy())
    if yahoo_quote["status"] == "ok":
        return yahoo_quote

    try:
        ticker = yf.Ticker(symbol)
        history = ticker.history(period="5d", interval="1d", auto_adjust=False)
        if history.empty:
            return quote

        latest = history.iloc[-1]
        previous_close = None
        if len(history) > 1:
            previous_close = float(history.iloc[-2]["Close"])

        current_price = safe_float(latest.get("Close"))
        volume = int(latest.get("Volume") or 0)
        change_percent = None
        if current_price is not None and previous_close and previous_close != 0:
            change_percent = ((current_price - previous_close) / previous_close) * 100

        quote.update(
            {
                "price": round(current_price, 2) if current_price is not None else None,
                "changePercent": round(change_percent, 2) if change_percent is not None else None,
                "volume": volume,
                "status": "ok",
            }
        )
        return quote
    except Exception:
        return quote


def fetch_yahoo_chart_quote(symbol: str, base_quote: dict[str, Any]) -> dict[str, Any]:
    try:
        response = requests.get(
            f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
            params={"range": "5d", "interval": "1d"},
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=8,
        )
        response.raise_for_status()
        result = response.json()["chart"]["result"][0]
        meta = result.get("meta", {})
        quote_data = result["indicators"]["quote"][0]

        closes = [safe_float(value) for value in quote_data.get("close", [])]
        volumes = quote_data.get("volume", [])
        valid_closes = [value for value in closes if value is not None]
        if not valid_closes:
            return base_quote

        current_price = safe_float(meta.get("regularMarketPrice")) or valid_closes[-1]
        previous_close = safe_float(meta.get("chartPreviousClose"))
        if previous_close is None and len(valid_closes) > 1:
            previous_close = valid_closes[-2]

        change_percent = None
        if previous_close and previous_close != 0:
            change_percent = ((current_price - previous_close) / previous_close) * 100

        latest_volume = next((int(value) for value in reversed(volumes) if value), None)
        base_quote.update(
            {
                "price": round(current_price, 2),
                "changePercent": round(change_percent, 2) if change_percent is not None else None,
                "volume": latest_volume,
                "currency": meta.get("currency") or base_quote["currency"],
                "status": "ok",
            }
        )
        return base_quote
    except Exception:
        return base_quote


def safe_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None
