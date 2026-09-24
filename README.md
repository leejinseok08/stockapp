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

Expo Go 앱(또는 시뮬레이터)으로 QR코드를 스캔해 실행합니다. 기본으로 Render에 배포된 백엔드를 사용합니다.

**브라우저로 미리보기:** 폰 없이 `npm run web`으로 노트북 브라우저에서 바로 볼 수 있습니다.

**다른 백엔드 사용:** 로컬 백엔드를 쓰려면 환경변수로 주소를 지정합니다.
실기기에서는 `localhost` 대신 개발 머신의 LAN IP를 써야 합니다.

```bash
EXPO_PUBLIC_API_URL=http://192.168.0.10:8000 npm start
```

**디자인:** UI를 바꿀 때는 [`mobile/DESIGN.md`](mobile/DESIGN.md)의 규칙을 따릅니다.

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
| GET | `/market/overview` | 지수·수급·통화 강세 요약 |
| POST | `/market/collect` | 오늘 수치를 DB에 저장 (여러 번 호출해도 안전) |
| GET | `/market/export.csv` | 저장된 전체 기록 CSV (`date, series, value`) |

## 서버 환경변수 (Render)

| 이름 | 용도 |
| --- | --- |
| `DATABASE_URL` | Postgres 연결 문자열. 없으면 SQLite를 쓰는데, Render는 배포할 때마다 파일을 지우므로 데이터가 사라집니다. |
| `KRX_ID`, `KRX_PW` | 한국거래소 데이터 사이트(data.krx.co.kr) 계정. 수급 데이터에 필요합니다. |
| `PYTHON_VERSION` | `3.11.9` |

## 매일 자동 수집 + 구글 드라이브 저장

[`tools/drive_export.gs`](tools/drive_export.gs)를 [Google Apps Script](https://script.google.com)에 붙여넣고,
프로젝트 설정에서 시간대를 `Asia/Seoul`로 바꾼 뒤 `setup`을 한 번 실행합니다.
매일 16:30(한국장 마감 후)과 07:00(미국장 마감 후)에 수집을 실행하고, 드라이브의 `StockApp Data/market_snapshots.csv`를 갱신합니다.

## 참고 사항

- 무료 데이터 소스(yfinance, 비공식 Yahoo Finance 스크래핑)를 사용하므로 요청이 과도하면 일시적으로 차단될 수 있습니다. 서버에 캐시(시세 15초, 재무제표 6시간, 뉴스 10분)를 적용해 완화했습니다.
- 한국 종목은 `.KS`(코스피)/`.KQ`(코스닥) 접미사를 붙여 조회합니다.
- 프로덕션 배포 시에는 유료 데이터 API(Alpha Vantage, Polygon, 한국투자증권 OpenAPI 등)로 교체를 고려하세요.
