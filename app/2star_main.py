from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set
from urllib.parse import urlparse
from uuid import uuid4

import requests
import uvicorn
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

try:
    import yfinance as yf
except Exception:
    yf = None


print("2star_main.py is running ..", flush=True)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
STATIC_DIR = PROJECT_ROOT / "static"

app = FastAPI(title="tooStar")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


class QuoteRequest(BaseModel):
    symbols: List[str]
    fields: Optional[List[str]] = None


class PhoneHeartbeatRequest(BaseModel):
    device_id: str = "note20"
    message: str = "ok"
    battery: Optional[int] = None


class AuthRequest(BaseModel):
    email: str
    password: str


class SignupRequest(AuthRequest):
    name: str


ACCOUNTS_FILE = Path(os.getenv("ACCOUNTS_FILE", str(PROJECT_ROOT / "accounts.json")))
ACCOUNTS_LOCK = threading.Lock()
PHONE_HEARTBEAT_DIR = Path(os.getenv("PHONE_HEARTBEAT_DIR", str(PROJECT_ROOT / "server_files")))
PHONE_HEARTBEAT_TOKEN_FILE = Path(os.getenv("PHONE_HEARTBEAT_TOKEN_FILE", str(PROJECT_ROOT / "phone_heartbeat_token.json")))
PHONE_HEARTBEAT_TOKEN = os.getenv("PHONE_HEARTBEAT_TOKEN", "")
PHONE_HEARTBEAT_TIMEOUT_MINUTES = int(os.getenv("PHONE_HEARTBEAT_TIMEOUT_MINUTES", "70"))
APP_HOST = os.getenv("APP_HOST", "0.0.0.0")
APP_PORT = int(os.getenv("APP_PORT", "2222"))
PHONE_DEVICE_IDS = ["note20", "s8", "note9", "note10"]
STOCK_LIST_FILE = Path(os.getenv("STOCK_LIST_FILE", str(PROJECT_ROOT / "stock_list.json")))


def load_stock_list() -> List[Dict[str, str]]:
    try:
        data = json.loads(STOCK_LIST_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []

    stocks: List[Dict[str, str]] = []
    seen_symbols = set()
    categories = data.get("categories", []) if isinstance(data, dict) else []
    for category in categories:
        if not isinstance(category, dict):
            continue
        category_name = str(category.get("name", "")).strip()
        items = category.get("items", [])
        if not isinstance(items, list):
            continue
        for item in items:
            if not isinstance(item, dict):
                continue
            symbol = str(item.get("ticker") or item.get("symbol") or "").strip()
            if not symbol or symbol in seen_symbols:
                continue
            seen_symbols.add(symbol)
            stock = {key: str(value).strip() for key, value in item.items()}
            stock.update(
                {
                    "name": str(item.get("name") or symbol).strip(),
                    "symbol": symbol,
                    "ticker": symbol,
                    "market": str(item.get("market") or "").strip(),
                    "category": category_name,
                }
            )
            stocks.append(stock)
    return stocks


def get_stock_by_symbol() -> Dict[str, Dict[str, str]]:
    return {stock["symbol"]: stock for stock in load_stock_list()}


YAHOO_SESSION = requests.Session()
YAHOO_SESSION.headers.update({"User-Agent": "Mozilla/5.0"})
YAHOO_CRUMB = ""

SERVER_TARGETS: List[Dict[str, str]] = [
    {
        "id": "vultr",
        "name": "벌처 서버 테스트",
        "url": "https://example.com",
        "description": "벌처 서버에서 공개 중인 테스트 대상입니다.",
    },
    {
        "id": "local",
        "name": "로컬 서버 테스트",
        "url": f"http://127.0.0.1:{APP_PORT}",
        "description": "현재 실행 중인 로컬 서버입니다.",
    },
]


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/stocks")
def get_stocks() -> Response:
    data = {
        "mtime": get_stock_list_mtime(),
        "stocks": load_stock_list(),
    }
    return Response(
        content=json.dumps(data, ensure_ascii=False),
        media_type="application/json; charset=utf-8",
    )


def get_stock_list_mtime() -> float:
    try:
        return STOCK_LIST_FILE.stat().st_mtime
    except OSError:
        return 0


@app.get("/api/server-targets")
def get_server_targets(x_user_id: str = Header(default="")) -> List[Dict[str, str]]:
    require_role(x_user_id, "admin")
    return SERVER_TARGETS


@app.post("/api/login")
def login(payload: AuthRequest) -> Dict[str, Any]:
    email = payload.email.strip().lower()
    password = payload.password
    if not email or not password:
        raise HTTPException(status_code=400, detail="missing_credentials")

    with ACCOUNTS_LOCK:
        user = next(
            (
                account
                for account in load_accounts()
                if str(account.get("email", "")).strip().lower() == email
                and str(account.get("password", "")) == password
            ),
            None,
        )

    if user is None:
        raise HTTPException(status_code=401, detail="invalid_credentials")
    return {"user": public_user(user)}


@app.post("/api/signup", status_code=201)
def signup(payload: SignupRequest) -> Dict[str, Any]:
    name = payload.name.strip()
    email = payload.email.strip().lower()
    password = payload.password
    if not name or not email or not password:
        raise HTTPException(status_code=400, detail="missing_fields")

    with ACCOUNTS_LOCK:
        accounts = load_accounts()
        if any(str(account.get("email", "")).strip().lower() == email for account in accounts):
            raise HTTPException(status_code=409, detail="email_exists")

        user = {
            "id": str(uuid4()),
            "name": name,
            "email": email,
            "password": password,
            "role": "user",
            "dailyGoal": 5,
        }
        accounts.append(user)
        save_accounts(accounts)

    return {"user": public_user(user)}


@app.get("/api/me")
def me(user_id: str = "") -> Dict[str, Any]:
    if not user_id:
        raise HTTPException(status_code=400, detail="missing_user_id")

    with ACCOUNTS_LOCK:
        user = next((account for account in load_accounts() if str(account.get("id")) == user_id), None)

    if user is None:
        raise HTTPException(status_code=404, detail="user_not_found")
    return {"user": public_user(user)}


@app.get("/api/server-status")
def get_server_status(x_user_id: str = Header(default="")) -> Dict[str, Any]:
    require_role(x_user_id, "admin")
    return {
        "targets": [
            *[check_server_target(target) for target in SERVER_TARGETS],
            *[build_phone_server_target(build_phone_status(device_id)) for device_id in PHONE_DEVICE_IDS],
        ]
    }


@app.post("/api/quotes")
def get_quotes(payload: QuoteRequest) -> Dict[str, Any]:
    stock_by_symbol = get_stock_by_symbol()
    unknown = [symbol for symbol in payload.symbols if symbol not in stock_by_symbol]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown symbols: {', '.join(unknown)}")

    requested_fields = set(payload.fields or [])
    return {"quotes": [fetch_quote(symbol, requested_fields, stock_by_symbol) for symbol in payload.symbols]}


@app.post("/api/phone-heartbeat")
def receive_phone_heartbeat(payload: PhoneHeartbeatRequest, request: Request, token: str = "") -> Dict[str, Any]:
    expected_token = get_phone_heartbeat_token()
    if expected_token and token != expected_token:
        raise HTTPException(status_code=401, detail="Invalid heartbeat token")

    now = datetime.now(timezone.utc)
    data = {
        "deviceId": payload.device_id,
        "heartbeatMessage": payload.message,
        "battery": payload.battery,
        "clientIp": request.client.host if request.client else None,
        "lastSeenAt": now.isoformat(),
    }
    get_phone_heartbeat_file(payload.device_id).write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return {"ok": True, **data}


@app.get("/api/phone-status")
def get_phone_status(x_user_id: str = Header(default="")) -> Dict[str, Any]:
    require_role(x_user_id, "admin")
    return build_phone_status("note20")


@app.get("/api/phone-statuses")
def get_phone_statuses(x_user_id: str = Header(default="")) -> Dict[str, Any]:
    require_role(x_user_id, "admin")
    return {"phones": [build_phone_status(device_id) for device_id in PHONE_DEVICE_IDS]}


def build_phone_status(device_id: str) -> Dict[str, Any]:
    data = read_phone_heartbeat(device_id)
    now = datetime.now(timezone.utc)
    timeout = timedelta(minutes=PHONE_HEARTBEAT_TIMEOUT_MINUTES)

    if not data:
        return {
            "online": False,
            "deviceId": device_id,
            "lastSeenAt": None,
            "elapsedSeconds": None,
            "timeoutMinutes": PHONE_HEARTBEAT_TIMEOUT_MINUTES,
            "message": "아직 휴대폰 확인 메시지를 받은 적이 없습니다.",
        }

    last_seen = parse_datetime(data.get("lastSeenAt"))
    if last_seen is None:
        if data.get("lastSeenAt") is None:
            return {
                **data,
                "deviceId": device_id,
                "online": False,
                "elapsedSeconds": None,
                "timeoutMinutes": PHONE_HEARTBEAT_TIMEOUT_MINUTES,
                "message": "아직 휴대폰 확인 메시지를 받은 적이 없습니다.",
            }
        return {
            **data,
            "online": False,
            "elapsedSeconds": None,
            "timeoutMinutes": PHONE_HEARTBEAT_TIMEOUT_MINUTES,
            "message": "휴대폰 확인 메시지 시간이 올바르지 않습니다.",
        }

    elapsed = now - last_seen
    online = elapsed <= timeout
    return {
        **data,
        "online": online,
        "elapsedSeconds": int(elapsed.total_seconds()),
        "timeoutMinutes": PHONE_HEARTBEAT_TIMEOUT_MINUTES,
        "message": "휴대폰 확인 메시지가 정상적으로 들어오고 있습니다."
        if online
        else "1시간 10분 이상 지났습니다. 서버를 확인하세요.",
    }


def load_accounts() -> List[Dict[str, Any]]:
    try:
        accounts = json.loads(ACCOUNTS_FILE.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return []
    return accounts if isinstance(accounts, list) else []


def save_accounts(accounts: List[Dict[str, Any]]) -> None:
    ACCOUNTS_FILE.write_text(json.dumps(accounts, ensure_ascii=False, indent=2), encoding="utf-8")


def public_user(user: Dict[str, Any]) -> Dict[str, Any]:
    public = {key: value for key, value in user.items() if key != "password"}
    public["role"] = normalize_role(public.get("role"))
    return public


def require_role(user_id: str, role: str) -> Dict[str, Any]:
    with ACCOUNTS_LOCK:
        user = next((account for account in load_accounts() if str(account.get("id")) == str(user_id)), None)
    if user is None:
        raise HTTPException(status_code=401, detail="login_required")
    if normalize_role(user.get("role")) != role:
        raise HTTPException(status_code=403, detail="admin_required")
    return user


def normalize_role(value: Any) -> str:
    return "admin" if str(value).strip().lower() == "admin" else "user"


def build_phone_server_target(phone: Dict[str, Any]) -> Dict[str, Any]:
    device_id = phone.get("deviceId") or "phone"
    client_ip = phone.get("clientIp")
    return {
        "id": f"phone-{device_id}",
        "name": str(device_id),
        "url": f"받은 IP {client_ip}" if client_ip else f"{device_id} heartbeat 없음",
        "online": bool(phone.get("online")),
        "statusCode": None,
        "responseMs": None,
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "lastSeenAt": phone.get("lastSeenAt"),
        "elapsedSeconds": phone.get("elapsedSeconds"),
        "timeoutMinutes": phone.get("timeoutMinutes"),
        "battery": phone.get("battery"),
        "heartbeatMessage": phone.get("heartbeatMessage"),
        "message": phone.get("message") or "휴대폰 상태 확인 실패",
    }


LIVE_QUOTE_FIELDS = {"price", "change", "todayChangePercent", "volume", "close", "open", "high", "low"}
FUNDAMENTAL_FIELDS = {"per", "roic", "operatingIncomeGrowth", "marketCap"}
PERFORMANCE_FIELDS = {
    "performance1D",
    "performance1W",
    "performance1M",
    "performance1Y",
    "performanceYTD",
    "performance3Y",
    "performance5Y",
}


def fetch_quote(
    symbol: str,
    requested_fields: Optional[Set[str]] = None,
    stock_by_symbol: Optional[Dict[str, Dict[str, str]]] = None,
) -> Dict[str, Any]:
    stocks = stock_by_symbol or get_stock_by_symbol()
    stock = stocks[symbol]
    quote = {
        "symbol": symbol,
        "name": stock["name"],
        "market": stock["market"],
        "price": None,
        "change": stock.get("change"),
        "changePercent": None,
        "todayChangePercent": None,
        "volume": None,
        "close": None,
        "open": None,
        "high": None,
        "low": None,
        "per": stock.get("per"),
        "roic": stock.get("roic"),
        "operatingIncomeGrowth": stock.get("operating_income_growth"),
        "marketCap": stock.get("market_cap") or stock.get("marketCap"),
        "performance1D": stock.get("performance_1d") or stock.get("1D"),
        "performance1W": stock.get("performance_1w") or stock.get("1W"),
        "performance1M": stock.get("performance_1m") or stock.get("1M"),
        "performance1Y": stock.get("performance_1y") or stock.get("1Y"),
        "performanceYTD": stock.get("performance_ytd") or stock.get("YTD"),
        "performance3Y": stock.get("performance_3y") or stock.get("3Y"),
        "performance5Y": stock.get("performance_5y") or stock.get("5Y"),
        "currency": "KRW" if stock["market"] in ("KR", "KOSPI", "KOSDAQ") else "USD",
        "status": "unavailable",
    }
    requested_fields = requested_fields or set()
    if requested_fields and not LIVE_QUOTE_FIELDS.isdisjoint(requested_fields):
        yahoo_quote = fetch_yahoo_chart_quote(symbol, quote.copy())
        if yahoo_quote["status"] == "ok":
            quote = yahoo_quote
        elif yf is not None:
            quote = fetch_yfinance_quote(symbol, quote)

    if requested_fields and not FUNDAMENTAL_FIELDS.isdisjoint(requested_fields):
        quote.update(fetch_yahoo_fundamentals(symbol))

    if requested_fields and not PERFORMANCE_FIELDS.isdisjoint(requested_fields):
        quote.update(fetch_yahoo_performance(symbol, requested_fields))

    if requested_fields:
        return quote

    yahoo_quote = fetch_yahoo_chart_quote(symbol, quote.copy())
    if yahoo_quote["status"] == "ok":
        return yahoo_quote
    if yf is None:
        return quote

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
        open_price = safe_float(latest.get("Open"))
        high_price = safe_float(latest.get("High"))
        low_price = safe_float(latest.get("Low"))
        volume = int(latest.get("Volume") or 0)
        change_value = None
        change_percent = None
        if current_price is not None and previous_close and previous_close != 0:
            change_value = current_price - previous_close
            change_percent = ((current_price - previous_close) / previous_close) * 100

        quote.update(
            {
                "price": round(current_price, 2) if current_price is not None else None,
                "change": round(change_value, 2) if change_value is not None else None,
                "changePercent": round(change_percent, 2) if change_percent is not None else None,
                "todayChangePercent": round(change_percent, 2) if change_percent is not None else None,
                "volume": volume,
                "close": round(current_price, 2) if current_price is not None else None,
                "open": round(open_price, 2) if open_price is not None else None,
                "high": round(high_price, 2) if high_price is not None else None,
                "low": round(low_price, 2) if low_price is not None else None,
                "status": "ok",
            }
        )
        return quote
    except Exception:
        return quote


def fetch_yfinance_quote(symbol: str, quote: Dict[str, Any]) -> Dict[str, Any]:
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
        open_price = safe_float(latest.get("Open"))
        high_price = safe_float(latest.get("High"))
        low_price = safe_float(latest.get("Low"))
        volume = int(latest.get("Volume") or 0)
        change_value = None
        change_percent = None
        if current_price is not None and previous_close and previous_close != 0:
            change_value = current_price - previous_close
            change_percent = ((current_price - previous_close) / previous_close) * 100

        quote.update(
            {
                "price": round(current_price, 2) if current_price is not None else None,
                "change": round(change_value, 2) if change_value is not None else None,
                "changePercent": round(change_percent, 2) if change_percent is not None else None,
                "todayChangePercent": round(change_percent, 2) if change_percent is not None else None,
                "volume": volume,
                "close": round(current_price, 2) if current_price is not None else None,
                "open": round(open_price, 2) if open_price is not None else None,
                "high": round(high_price, 2) if high_price is not None else None,
                "low": round(low_price, 2) if low_price is not None else None,
                "status": "ok",
            }
        )
        return quote
    except Exception:
        return quote


def fetch_yahoo_chart_quote(symbol: str, base_quote: Dict[str, Any]) -> Dict[str, Any]:
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
        opens = [safe_float(value) for value in quote_data.get("open", [])]
        highs = [safe_float(value) for value in quote_data.get("high", [])]
        lows = [safe_float(value) for value in quote_data.get("low", [])]
        volumes = quote_data.get("volume", [])
        valid_closes = [value for value in closes if value is not None]
        if not valid_closes:
            return base_quote

        current_price = safe_float(meta.get("regularMarketPrice")) or valid_closes[-1]
        previous_close = safe_float(meta.get("chartPreviousClose"))
        if previous_close is None and len(valid_closes) > 1:
            previous_close = valid_closes[-2]

        change_value = None
        change_percent = None
        if previous_close and previous_close != 0:
            change_value = current_price - previous_close
            change_percent = ((current_price - previous_close) / previous_close) * 100

        latest_volume = next((int(value) for value in reversed(volumes) if value), None)
        latest_open = next((value for value in reversed(opens) if value is not None), None)
        latest_high = next((value for value in reversed(highs) if value is not None), None)
        latest_low = next((value for value in reversed(lows) if value is not None), None)
        base_quote.update(
            {
                "price": round(current_price, 2),
                "change": round(change_value, 2) if change_value is not None else None,
                "changePercent": round(change_percent, 2) if change_percent is not None else None,
                "todayChangePercent": round(change_percent, 2) if change_percent is not None else None,
                "volume": latest_volume,
                "close": round(current_price, 2),
                "open": round(latest_open, 2) if latest_open is not None else None,
                "high": round(latest_high, 2) if latest_high is not None else None,
                "low": round(latest_low, 2) if latest_low is not None else None,
                "currency": meta.get("currency") or base_quote["currency"],
                "status": "ok",
            }
        )
        return base_quote
    except Exception:
        return base_quote


def fetch_yahoo_fundamentals(symbol: str) -> Dict[str, Any]:
    fallback = fetch_yahoo_quote_fundamentals(symbol)
    try:
        crumb = get_yahoo_crumb()
        params = {"modules": "summaryDetail,defaultKeyStatistics,financialData,price"}
        if crumb:
            params["crumb"] = crumb
        response = YAHOO_SESSION.get(
            f"https://query1.finance.yahoo.com/v10/finance/quoteSummary/{symbol}",
            params=params,
            timeout=8,
        )
        response.raise_for_status()
        result = response.json()["quoteSummary"]["result"][0]
    except Exception:
        return fallback

    summary = result.get("summaryDetail", {})
    key_stats = result.get("defaultKeyStatistics", {})
    financial = result.get("financialData", {})
    price = result.get("price", {})
    data = {
        "per": first_formatted(summary, key_stats, "trailingPE", "forwardPE"),
        "roic": first_formatted(financial, key_stats, "returnOnAssets", "returnOnEquity"),
        "operatingIncomeGrowth": first_formatted(key_stats, financial, "earningsQuarterlyGrowth", "revenueGrowth"),
        "marketCap": first_formatted(price, summary, key_stats, "marketCap", "enterpriseValue"),
    }
    return {**fallback, **{key: value for key, value in data.items() if value not in (None, "")}}


def fetch_yahoo_quote_fundamentals(symbol: str) -> Dict[str, Any]:
    try:
        crumb = get_yahoo_crumb()
        params = {"symbols": symbol}
        if crumb:
            params["crumb"] = crumb
        response = YAHOO_SESSION.get(
            "https://query1.finance.yahoo.com/v7/finance/quote",
            params=params,
            timeout=8,
        )
        response.raise_for_status()
        result = response.json()["quoteResponse"]["result"][0]
    except Exception:
        return {}

    return {
        "per": result.get("trailingPE") or result.get("forwardPE"),
        "marketCap": result.get("marketCap"),
    }


def get_yahoo_crumb() -> str:
    global YAHOO_CRUMB
    if YAHOO_CRUMB:
        return YAHOO_CRUMB
    try:
        YAHOO_SESSION.get("https://fc.yahoo.com", timeout=8)
        response = YAHOO_SESSION.get("https://query1.finance.yahoo.com/v1/test/getcrumb", timeout=8)
        response.raise_for_status()
        YAHOO_CRUMB = response.text.strip()
    except Exception:
        YAHOO_CRUMB = ""
    return YAHOO_CRUMB


def fetch_yahoo_performance(symbol: str, requested_fields: Set[str]) -> Dict[str, Any]:
    try:
        response = requests.get(
            f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
            params={"range": "5y", "interval": "1d"},
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=10,
        )
        response.raise_for_status()
        result = response.json()["chart"]["result"][0]
        timestamps = result.get("timestamp", [])
        closes = [safe_float(value) for value in result["indicators"]["quote"][0].get("close", [])]
    except Exception:
        return {}

    points = [
        (datetime.fromtimestamp(timestamp, tz=timezone.utc), close)
        for timestamp, close in zip(timestamps, closes)
        if close is not None
    ]
    if len(points) < 2:
        return {}

    latest_date, latest_close = points[-1]
    periods = {
        "performance1D": timedelta(days=1),
        "performance1W": timedelta(days=7),
        "performance1M": timedelta(days=30),
        "performance1Y": timedelta(days=365),
        "performance3Y": timedelta(days=365 * 3),
        "performance5Y": timedelta(days=365 * 5),
    }
    values: Dict[str, Any] = {}
    for field, delta in periods.items():
        if field in requested_fields:
            values[field] = calculate_return(points, latest_close, latest_date - delta)
    if "performanceYTD" in requested_fields:
        values["performanceYTD"] = calculate_return(
            points,
            latest_close,
            datetime(latest_date.year, 1, 1, tzinfo=timezone.utc),
        )
    return values


def calculate_return(points: List[Any], latest_close: float, target_date: datetime) -> Optional[float]:
    start_close = None
    for point_date, close in points:
        if point_date >= target_date:
            start_close = close
            break
    if start_close is None:
        start_close = points[0][1]
    if not start_close:
        return None
    return round(((latest_close - start_close) / start_close) * 100, 2)


def first_formatted(*sources_and_keys: Any) -> Any:
    sources = [item for item in sources_and_keys if isinstance(item, dict)]
    keys = [item for item in sources_and_keys if isinstance(item, str)]
    for source in sources:
        for key in keys:
            value = source.get(key)
            formatted = yahoo_value(value)
            if formatted not in (None, ""):
                return formatted
    return None


def yahoo_value(value: Any) -> Any:
    if isinstance(value, dict):
        if value.get("fmt") not in (None, ""):
            return value.get("fmt")
        return value.get("raw")
    return value


def check_server_target(target: Dict[str, str]) -> Dict[str, Any]:
    result: Dict[str, Any] = {
        **target,
        "online": False,
        "statusCode": None,
        "responseMs": None,
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "message": "확인 실패",
    }

    try:
        parsed = urlparse(target["url"])
        if not parsed.scheme or not parsed.netloc:
            result["message"] = "URL 설정 필요"
            return result

        response = requests.get(target["url"], timeout=5, headers={"User-Agent": "tooStar-server-check/1.0"})
        result["statusCode"] = response.status_code
        result["responseMs"] = int(response.elapsed.total_seconds() * 1000)
        result["online"] = 200 <= response.status_code < 400
        result["message"] = "정상" if result["online"] else "응답 오류"
    except requests.RequestException as error:
        result["message"] = str(error)

    return result


def get_phone_heartbeat_file(device_id: str) -> Path:
    safe_device_id = "".join(char for char in device_id.lower() if char.isalnum() or char in ("-", "_"))
    if safe_device_id in ("", "phone-n20", "n20"):
        safe_device_id = "note20"
    if safe_device_id == "note20":
        return PHONE_HEARTBEAT_DIR / "phone_heartbeat_k20sh.json"
    if safe_device_id == "s8":
        return PHONE_HEARTBEAT_DIR / "phone_heartbeat_kish_s8.json"
    if safe_device_id in ("note9", "k9sh"):
        return PHONE_HEARTBEAT_DIR / "phone_heartbeat_k9sh.json"
    if safe_device_id in ("note10", "k10sh"):
        return PHONE_HEARTBEAT_DIR / "phone_heartbeat_k10sh.json"
    return PHONE_HEARTBEAT_DIR / f"phone_heartbeat_{safe_device_id}.json"


def read_phone_heartbeat(device_id: str = "note20") -> Optional[Dict[str, Any]]:
    try:
        heartbeat_file = get_phone_heartbeat_file(device_id)
        if not heartbeat_file.exists():
            return None
        data = json.loads(heartbeat_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None

    stored_device_id = str(data.get("deviceId") or "").lower()
    expected_device_id = device_id.lower()
    aliases = {
        "note20": {"note20", "phone-n20", "n20"},
        "s8": {"s8", "kish_s8", "kish-s8"},
        "note9": {"note9", "k9sh"},
        "note10": {"note10", "k10sh"},
    }
    valid_ids = aliases.get(expected_device_id, {expected_device_id})
    if stored_device_id and stored_device_id not in valid_ids:
        return None
    return data


def get_phone_heartbeat_token() -> str:
    if PHONE_HEARTBEAT_TOKEN:
        return PHONE_HEARTBEAT_TOKEN

    try:
        if not PHONE_HEARTBEAT_TOKEN_FILE.exists():
            return ""
        data = json.loads(PHONE_HEARTBEAT_TOKEN_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return ""

    token = data.get("token")
    return token.strip() if isinstance(token, str) else ""


def parse_datetime(value: Any) -> Optional[datetime]:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def safe_float(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


if __name__ == "__main__":
    uvicorn.run(app, host=APP_HOST, port=APP_PORT)

