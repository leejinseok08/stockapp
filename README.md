# stockapp

반도체·AI 종목을 추적하는 모바일 앱. 관심종목 시세, 재무제표/펀더멘털 분석, 뉴스를 한 곳에서 확인합니다.

## 구성

- `backend/` — FastAPI 서버. [yfinance](https://github.com/ranaroussi/yfinance)로 시세·재무제표·뉴스를 가져오고, SQLite에 관심종목을 저장합니다.
- `mobile/` — Expo(React Native) 앱. 관심종목 탭, 종목 상세(차트+재무제표), 뉴스 탭으로 구성됩니다.

## 시작하기

### 1. 백엔드 실행

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- API 문서: http://localhost:8000/docs
- 관심종목은 `watchlist.db`(SQLite)에 저장됩니다.

### 2. 모바일 앱 실행

```bash
cd mobile
npm install
npm start
```

Expo Go 앱(또는 시뮬레이터)으로 QR코드를 스캔해 실행합니다.

**중요:** 실제 기기(Expo Go)에서 테스트할 때는 `localhost`가 폰에서 백엔드를 가리키지 않습니다.
`mobile/src/api.ts`의 `API_BASE_URL`을 개발 머신의 LAN IP(예: `http://192.168.0.10:8000`)로 바꿔주세요.

## 기본 제공 종목 유니버스

`backend/app/tickers.py`에 반도체·AI 관련 종목이 미리 정의되어 있습니다 (NVDA, AMD, TSM, ASML, 삼성전자(005930.KS), SK하이닉스(000660.KS) 등). 필요에 따라 자유롭게 추가/수정하세요.

## API 개요

| Method | Path | 설명 |
| --- | --- | --- |
| GET | `/stocks/universe` | 추적 가능한 전체 종목 목록 |
| GET | `/stocks/quotes?symbols=NVDA,AMD` | 여러 종목 현재가 |
| GET | `/stocks/{symbol}/quote` | 단일 종목 현재가 |
| GET | `/stocks/{symbol}/history?range=1mo` | 가격 히스토리 (1d/5d/1mo/6mo/1y/5y) |
| GET | `/stocks/{symbol}/fundamentals` | 재무비율 + 손익/재무상태/현금흐름표 |
| GET | `/stocks/{symbol}/news` | 종목 관련 뉴스 |
| GET | `/stocks/compare?symbols=NVDA,AMD` | 비교용 시세 + PER |
| GET | `/watchlist` | 관심종목 목록 (+ 현재가) |
| POST | `/watchlist/{symbol}` | 관심종목 추가 |
| PATCH | `/watchlist/{symbol}` | 매수가·수량·메모 수정 (`buyPrice`, `quantity`, `note`) |
| DELETE | `/watchlist/{symbol}` | 관심종목 삭제 |

## 참고 사항

- 무료 데이터 소스(yfinance, 비공식 Yahoo Finance 스크래핑)를 사용하므로 요청이 과도하면 일시적으로 차단될 수 있습니다. 서버에 캐시(시세 15초, 재무제표 6시간, 뉴스 10분)를 적용해 완화했습니다.
- 한국 종목은 `.KS`(코스피)/`.KQ`(코스닥) 접미사를 붙여 조회합니다.
- 프로덕션 배포 시에는 유료 데이터 API(Alpha Vantage, Polygon, 한국투자증권 OpenAPI 등)로 교체를 고려하세요.
