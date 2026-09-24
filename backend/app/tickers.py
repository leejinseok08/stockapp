UNIVERSE = [
    {"symbol": "NVDA", "name": "NVIDIA", "category": "AI 반도체"},
    {"symbol": "AMD", "name": "AMD", "category": "AI 반도체"},
    {"symbol": "AVGO", "name": "Broadcom", "category": "AI 반도체"},
    {"symbol": "INTC", "name": "Intel", "category": "반도체"},
    {"symbol": "QCOM", "name": "Qualcomm", "category": "반도체"},
    {"symbol": "MU", "name": "Micron", "category": "메모리"},
    {"symbol": "TSM", "name": "TSMC", "category": "파운드리"},
    {"symbol": "ASML", "name": "ASML", "category": "반도체 장비"},
    {"symbol": "AMAT", "name": "Applied Materials", "category": "반도체 장비"},
    {"symbol": "LRCX", "name": "Lam Research", "category": "반도체 장비"},
    {"symbol": "ARM", "name": "Arm Holdings", "category": "반도체 IP"},
    {"symbol": "MSFT", "name": "Microsoft", "category": "AI 플랫폼"},
    {"symbol": "GOOGL", "name": "Alphabet", "category": "AI 플랫폼"},
    {"symbol": "META", "name": "Meta", "category": "AI 플랫폼"},
    {"symbol": "005930.KS", "name": "삼성전자", "category": "메모리"},
    {"symbol": "000660.KS", "name": "SK하이닉스", "category": "메모리"},
    {"symbol": "042700.KS", "name": "한미반도체", "category": "반도체 장비"},
    {"symbol": "AAPL", "name": "Apple", "category": "빅테크"},
    {"symbol": "AMZN", "name": "Amazon", "category": "빅테크"},
    {"symbol": "TSLA", "name": "Tesla", "category": "빅테크"},
    # ISA plan ETFs (KRW-listed, unhedged); add one to the watchlist with quantity to track weights.
    {"symbol": "360750.KS", "name": "TIGER 미국S&P500", "category": "ISA ETF"},
    {"symbol": "379800.KS", "name": "KODEX 미국S&P500", "category": "ISA ETF"},
    {"symbol": "133690.KS", "name": "TIGER 미국나스닥100", "category": "ISA ETF"},
    {"symbol": "379810.KS", "name": "KODEX 미국나스닥100", "category": "ISA ETF"},
    {"symbol": "390390.KS", "name": "KODEX 미국반도체", "category": "ISA ETF"},
]

# Magnificent 7 + 삼성전자 + SK하이닉스: the first peer group for relative strength and financial scores.
BIGTECH = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "005930.KS", "000660.KS"]

UNIVERSE_BY_SYMBOL = {t["symbol"]: t for t in UNIVERSE}
