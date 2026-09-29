# Kiwoom REST API index

Generated 2026-09-29 from github.com/Kiwoom-Securities/Kiwoom-REST-API (`kiwoom/_data/kiwoom_api_spec.json`,
337 APIs). For a request/response field list, open that spec (entry = "API명(api-id)"). Rules: `docs/kiwoom.md`.
**MONEY** = moves real money when called on the real host: never on the real account (enforced in
`services/kiwoom.py`); only the ones the mock trader needs are allowed on the mock host.


## OAuth 인증 > 접근토큰발급

| api-id | 이름 | URL |
|---|---|---|
| au10001 | 접근토큰 발급 | `/oauth2/token` |

## OAuth 인증 > 접근토큰폐기

| api-id | 이름 | URL |
|---|---|---|
| au10002 | 접근토큰폐기 | `/oauth2/revoke` |

## 국내주식 > ELW

| api-id | 이름 | URL |
|---|---|---|
| ka10048 | ELW일별민감도지표요청 | `/api/dostk/elw` |
| ka10050 | ELW민감도지표요청 | `/api/dostk/elw` |
| ka30001 | ELW가격급등락요청 | `/api/dostk/elw` |
| ka30002 | 거래원별ELW순매매상위요청 | `/api/dostk/elw` |
| ka30003 | ELWLP보유일별추이요청 | `/api/dostk/elw` |
| ka30004 | ELW괴리율요청 | `/api/dostk/elw` |
| ka30005 | ELW조건검색요청 | `/api/dostk/elw` |
| ka30009 | ELW등락율순위요청 | `/api/dostk/elw` |
| ka30010 | ELW잔량순위요청 | `/api/dostk/elw` |
| ka30011 | ELW근접율요청 | `/api/dostk/elw` |
| ka30012 | ELW종목상세정보요청 | `/api/dostk/elw` |

## 국내주식 > ETF

| api-id | 이름 | URL |
|---|---|---|
| ka40001 | ETF수익율요청 | `/api/dostk/etf` |
| ka40002 | ETF종목정보요청 | `/api/dostk/etf` |
| ka40003 | ETF일별추이요청 | `/api/dostk/etf` |
| ka40004 | ETF전체시세요청 | `/api/dostk/etf` |
| ka40006 | ETF시간대별추이요청 | `/api/dostk/etf` |
| ka40007 | ETF시간대별체결요청 | `/api/dostk/etf` |
| ka40008 | ETF일자별체결요청 | `/api/dostk/etf` |
| ka40009 | ETF시간대별NAV현황 | `/api/dostk/etf` |
| ka40010 | ETF시간대별수급현황 | `/api/dostk/etf` |

## 국내주식 > 계좌

| api-id | 이름 | URL |
|---|---|---|
| ka00001 | 계좌번호조회 | `/api/dostk/acnt` |
| ka01690 | 일별잔고수익률 | `/api/dostk/acnt` |
| ka10072 | 일자별종목별실현손익요청_일자 | `/api/dostk/acnt` |
| ka10073 | 일자별종목별실현손익요청_기간 | `/api/dostk/acnt` |
| ka10074 | 일자별실현손익요청 | `/api/dostk/acnt` |
| ka10075 | 미체결요청 | `/api/dostk/acnt` |
| ka10076 | 체결요청 | `/api/dostk/acnt` |
| ka10077 | 당일실현손익상세요청 | `/api/dostk/acnt` |
| ka10085 | 계좌수익률요청 | `/api/dostk/acnt` |
| ka10088 | 미체결 분할주문 상세 | `/api/dostk/acnt` |
| ka10170 | 당일매매일지요청 | `/api/dostk/acnt` |
| kt00001 | 예수금상세현황요청 | `/api/dostk/acnt` |
| kt00002 | 일별추정예탁자산현황요청 | `/api/dostk/acnt` |
| kt00003 | 추정자산조회요청 | `/api/dostk/acnt` |
| kt00004 | 계좌평가현황요청 | `/api/dostk/acnt` |
| kt00005 | 체결잔고요청 | `/api/dostk/acnt` |
| kt00007 | 계좌별주문체결내역상세요청 | `/api/dostk/acnt` |
| kt00008 | 계좌별익일결제예정내역요청 | `/api/dostk/acnt` |
| kt00009 | 계좌별주문체결현황요청 | `/api/dostk/acnt` |
| kt00010 | 주문인출가능금액요청 | `/api/dostk/acnt` |
| kt00011 | 증거금율별주문가능수량조회요청 | `/api/dostk/acnt` |
| kt00012 | 신용보증금율별주문가능수량조회요청 | `/api/dostk/acnt` |
| kt00013 | 증거금세부내역조회요청 | `/api/dostk/acnt` |
| kt00015 | 위탁종합거래내역요청 | `/api/dostk/acnt` |
| kt00016 | 일별계좌수익률상세현황요청 | `/api/dostk/acnt` |
| kt00017 | 계좌별당일현황요청 | `/api/dostk/acnt` |
| kt00018 | 계좌평가잔고내역요청 | `/api/dostk/acnt` |
| kt50020 | 금현물 잔고확인 | `/api/dostk/acnt` |
| kt50021 | 금현물 예수금 | `/api/dostk/acnt` |
| kt50030 | 금현물 주문체결전체조회 | `/api/dostk/acnt` |
| kt50031 | 금현물 주문체결조회 | `/api/dostk/acnt` |
| kt50032 | 금현물 거래내역조회 | `/api/dostk/acnt` |
| kt50075 | 금현물 미체결조회 | `/api/dostk/acnt` |

## 국내주식 > 공매도

| api-id | 이름 | URL |
|---|---|---|
| ka10014 | 공매도추이요청 | `/api/dostk/shsa` |

## 국내주식 > 관심종목

| api-id | 이름 | URL |
|---|---|---|
| ka01300 | 관심종목 그룹 리스트 조회 | `/api/dostk/watchlist` |
| ka01301 | 관심종목 그룹 상세 조회 | `/api/dostk/watchlist` |

## 국내주식 > 기관/외국인

| api-id | 이름 | URL |
|---|---|---|
| ka10008 | 주식외국인종목별매매동향 | `/api/dostk/frgnistt` |
| ka10131 | 기관외국인연속매매현황요청 | `/api/dostk/frgnistt` |
| ka52301 | 금현물투자자현황 | `/api/dostk/frgnistt` |

## 국내주식 > 대차거래

| api-id | 이름 | URL |
|---|---|---|
| ka10068 | 대차거래추이요청 | `/api/dostk/slb` |
| ka10069 | 대차거래상위10종목요청 | `/api/dostk/slb` |
| ka20068 | 대차거래추이요청(종목별) | `/api/dostk/slb` |
| ka90012 | 대차거래내역요청 | `/api/dostk/slb` |

## 국내주식 > 순위정보

| api-id | 이름 | URL |
|---|---|---|
| ka10020 | 호가잔량상위요청 | `/api/dostk/rkinfo` |
| ka10021 | 호가잔량급증요청 | `/api/dostk/rkinfo` |
| ka10022 | 잔량율급증요청 | `/api/dostk/rkinfo` |
| ka10023 | 거래량급증요청 | `/api/dostk/rkinfo` |
| ka10027 | 전일대비등락률상위요청 | `/api/dostk/rkinfo` |
| ka10029 | 예상체결등락률상위요청 | `/api/dostk/rkinfo` |
| ka10030 | 당일거래량상위요청 | `/api/dostk/rkinfo` |
| ka10031 | 전일거래량상위요청 | `/api/dostk/rkinfo` |
| ka10032 | 거래대금상위요청 | `/api/dostk/rkinfo` |
| ka10033 | 신용비율상위요청 | `/api/dostk/rkinfo` |
| ka10034 | 외인기간별매매상위요청 | `/api/dostk/rkinfo` |
| ka10035 | 외인연속순매매상위요청 | `/api/dostk/rkinfo` |
| ka10036 | 외인한도소진율증가상위 | `/api/dostk/rkinfo` |
| ka10037 | 외국계창구매매상위요청 | `/api/dostk/rkinfo` |
| ka10038 | 종목별증권사순위요청 | `/api/dostk/rkinfo` |
| ka10039 | 증권사별매매상위요청 | `/api/dostk/rkinfo` |
| ka10040 | 당일주요거래원요청 | `/api/dostk/rkinfo` |
| ka10042 | 순매수거래원순위요청 | `/api/dostk/rkinfo` |
| ka10053 | 당일상위이탈원요청 | `/api/dostk/rkinfo` |
| ka10062 | 동일순매매순위요청 | `/api/dostk/rkinfo` |
| ka10065 | 장중투자자별매매상위요청 | `/api/dostk/rkinfo` |
| ka10098 | 시간외단일가등락율순위요청 | `/api/dostk/rkinfo` |
| ka90009 | 외국인기관매매상위요청 | `/api/dostk/rkinfo` |

## 국내주식 > 시세

| api-id | 이름 | URL |
|---|---|---|
| ka10004 | 주식호가요청 | `/api/dostk/mrkcond` |
| ka10005 | 주식일주월시분요청 | `/api/dostk/mrkcond` |
| ka10006 | 주식시분요청 | `/api/dostk/mrkcond` |
| ka10007 | 시세표성정보요청 | `/api/dostk/mrkcond` |
| ka10011 | 신주인수권전체시세요청 | `/api/dostk/mrkcond` |
| ka10044 | 일별기관매매종목요청 | `/api/dostk/mrkcond` |
| ka10045 | 종목별기관매매추이요청 | `/api/dostk/mrkcond` |
| ka10046 | 체결강도추이시간별요청 | `/api/dostk/mrkcond` |
| ka10047 | 체결강도추이일별요청 | `/api/dostk/mrkcond` |
| ka10063 | 장중투자자별매매요청 | `/api/dostk/mrkcond` |
| ka10066 | 장마감후투자자별매매요청 | `/api/dostk/mrkcond` |
| ka10078 | 증권사별종목매매동향요청 | `/api/dostk/mrkcond` |
| ka10086 | 일별주가요청 | `/api/dostk/mrkcond` |
| ka10087 | 시간외단일가요청 | `/api/dostk/mrkcond` |
| ka50010 | 금현물체결추이 | `/api/dostk/mrkcond` |
| ka50012 | 금현물일별추이 | `/api/dostk/mrkcond` |
| ka50087 | 금현물예상체결 | `/api/dostk/mrkcond` |
| ka50100 | 금현물 시세정보 | `/api/dostk/mrkcond` |
| ka50101 | 금현물 호가 | `/api/dostk/mrkcond` |
| ka90005 | 프로그램매매추이요청 시간대별 | `/api/dostk/mrkcond` |
| ka90006 | 프로그램매매차익잔고추이요청 | `/api/dostk/mrkcond` |
| ka90007 | 프로그램매매누적추이요청 | `/api/dostk/mrkcond` |
| ka90008 | 종목시간별프로그램매매추이요청 | `/api/dostk/mrkcond` |
| ka90010 | 프로그램매매추이요청 일자별 | `/api/dostk/mrkcond` |
| ka90013 | 종목일별프로그램매매추이요청 | `/api/dostk/mrkcond` |

## 국내주식 > 신용주문

| api-id | 이름 | URL |
|---|---|---|
| kt10006 | 신용 매수주문 **MONEY** | `/api/dostk/crdordr` |
| kt10007 | 신용 매도주문 **MONEY** | `/api/dostk/crdordr` |
| kt10008 | 신용 정정주문 **MONEY** | `/api/dostk/crdordr` |
| kt10009 | 신용 취소주문 **MONEY** | `/api/dostk/crdordr` |

## 국내주식 > 실시간시세

| api-id | 이름 | URL |
|---|---|---|
| 00 | 주문체결 | `/api/dostk/websocket` |
| 04 | 잔고 | `/api/dostk/websocket` |
| 0A | 주식기세 | `/api/dostk/websocket` |
| 0B | 주식체결 | `/api/dostk/websocket` |
| 0C | 주식우선호가 | `/api/dostk/websocket` |
| 0D | 주식호가잔량 | `/api/dostk/websocket` |
| 0E | 주식시간외호가 | `/api/dostk/websocket` |
| 0F | 주식당일거래원 | `/api/dostk/websocket` |
| 0G | ETF NAV | `/api/dostk/websocket` |
| 0H | 주식예상체결 | `/api/dostk/websocket` |
| 0I | 국제금환산가격 | `/api/dostk/websocket` |
| 0J | 업종지수 | `/api/dostk/websocket` |
| 0U | 업종등락 | `/api/dostk/websocket` |
| 0g | 주식종목정보 | `/api/dostk/websocket` |
| 0m | ELW 이론가 | `/api/dostk/websocket` |
| 0s | 장시작시간 | `/api/dostk/websocket` |
| 0u | ELW 지표 | `/api/dostk/websocket` |
| 0w | 종목프로그램매매 | `/api/dostk/websocket` |
| 1h | VI발동/해제 | `/api/dostk/websocket` |

## 국내주식 > 업종

| api-id | 이름 | URL |
|---|---|---|
| ka10010 | 업종프로그램요청 | `/api/dostk/sect` |
| ka10051 | 업종별투자자순매수요청 | `/api/dostk/sect` |
| ka20001 | 업종현재가요청 | `/api/dostk/sect` |
| ka20002 | 업종별주가요청 | `/api/dostk/sect` |
| ka20003 | 전업종지수요청 | `/api/dostk/sect` |
| ka20009 | 업종현재가일별요청 | `/api/dostk/sect` |

## 국내주식 > 조건검색

| api-id | 이름 | URL |
|---|---|---|
| ka10171 | 조건검색 목록조회 | `/api/dostk/websocket` |
| ka10172 | 조건검색 요청 일반 | `/api/dostk/websocket` |
| ka10173 | 조건검색 요청 실시간 | `/api/dostk/websocket` |
| ka10174 | 조건검색 실시간 해제 | `/api/dostk/websocket` |

## 국내주식 > 종목정보

| api-id | 이름 | URL |
|---|---|---|
| ka00198 | 실시간종목조회순위 | `/api/dostk/stkinfo` |
| ka10001 | 주식기본정보요청 | `/api/dostk/stkinfo` |
| ka10002 | 주식거래원요청 | `/api/dostk/stkinfo` |
| ka10003 | 체결정보요청 | `/api/dostk/stkinfo` |
| ka10013 | 신용매매동향요청 | `/api/dostk/stkinfo` |
| ka10015 | 일별거래상세요청 | `/api/dostk/stkinfo` |
| ka10016 | 신고저가요청 | `/api/dostk/stkinfo` |
| ka10017 | 상하한가요청 | `/api/dostk/stkinfo` |
| ka10018 | 고저가근접요청 | `/api/dostk/stkinfo` |
| ka10019 | 가격급등락요청 | `/api/dostk/stkinfo` |
| ka10024 | 거래량갱신요청 | `/api/dostk/stkinfo` |
| ka10025 | 매물대집중요청 | `/api/dostk/stkinfo` |
| ka10026 | 고저PER요청 | `/api/dostk/stkinfo` |
| ka10028 | 시가대비등락률요청 | `/api/dostk/stkinfo` |
| ka10043 | 거래원매물대분석요청 | `/api/dostk/stkinfo` |
| ka10052 | 거래원순간거래량요청 | `/api/dostk/stkinfo` |
| ka10054 | 변동성완화장치발동종목요청 | `/api/dostk/stkinfo` |
| ka10055 | 당일전일체결량요청 | `/api/dostk/stkinfo` |
| ka10058 | 투자자별일별매매종목요청 | `/api/dostk/stkinfo` |
| ka10059 | 종목별투자자기관별요청 | `/api/dostk/stkinfo` |
| ka10061 | 종목별투자자기관별합계요청 | `/api/dostk/stkinfo` |
| ka10084 | 당일전일체결요청 | `/api/dostk/stkinfo` |
| ka10095 | 지정종목 정보요청 | `/api/dostk/stkinfo` |
| ka10099 | 종목정보 리스트 | `/api/dostk/stkinfo` |
| ka10100 | 종목정보 조회 | `/api/dostk/stkinfo` |
| ka10101 | 업종코드 리스트 | `/api/dostk/stkinfo` |
| ka10102 | 회원사 리스트 | `/api/dostk/stkinfo` |
| ka90003 | 프로그램순매수상위50요청 | `/api/dostk/stkinfo` |
| ka90004 | 종목별프로그램매매현황요청 | `/api/dostk/stkinfo` |
| kt20016 | 신용융자 가능종목요청 | `/api/dostk/stkinfo` |
| kt20017 | 신용융자 가능문의 | `/api/dostk/stkinfo` |

## 국내주식 > 주문

| api-id | 이름 | URL |
|---|---|---|
| kt10000 | 주식 매수주문 **MONEY** | `/api/dostk/ordr` |
| kt10001 | 주식 매도주문 **MONEY** | `/api/dostk/ordr` |
| kt10002 | 주식 정정주문 **MONEY** | `/api/dostk/ordr` |
| kt10003 | 주식 취소주문 **MONEY** | `/api/dostk/ordr` |
| kt50000 | 금현물 매수주문 **MONEY** | `/api/dostk/ordr` |
| kt50001 | 금현물 매도주문 **MONEY** | `/api/dostk/ordr` |
| kt50002 | 금현물 정정주문 **MONEY** | `/api/dostk/ordr` |
| kt50003 | 금현물 취소주문 **MONEY** | `/api/dostk/ordr` |

## 국내주식 > 차트

| api-id | 이름 | URL |
|---|---|---|
| ka10060 | 종목별투자자기관별차트요청 | `/api/dostk/chart` |
| ka10064 | 장중투자자별매매차트요청 | `/api/dostk/chart` |
| ka10079 | 주식틱차트조회요청 | `/api/dostk/chart` |
| ka10080 | 주식분봉차트조회요청 | `/api/dostk/chart` |
| ka10081 | 주식일봉차트조회요청 | `/api/dostk/chart` |
| ka10082 | 주식주봉차트조회요청 | `/api/dostk/chart` |
| ka10083 | 주식월봉차트조회요청 | `/api/dostk/chart` |
| ka10094 | 주식년봉차트조회요청 | `/api/dostk/chart` |
| ka20004 | 업종틱차트조회요청 | `/api/dostk/chart` |
| ka20005 | 업종분봉조회요청 | `/api/dostk/chart` |
| ka20006 | 업종일봉조회요청 | `/api/dostk/chart` |
| ka20007 | 업종주봉조회요청 | `/api/dostk/chart` |
| ka20008 | 업종월봉조회요청 | `/api/dostk/chart` |
| ka20019 | 업종년봉조회요청 | `/api/dostk/chart` |
| ka50079 | 금현물틱차트조회요청 | `/api/dostk/chart` |
| ka50080 | 금현물분봉차트조회요청 | `/api/dostk/chart` |
| ka50081 | 금현물일봉차트조회요청 | `/api/dostk/chart` |
| ka50082 | 금현물주봉차트조회요청 | `/api/dostk/chart` |
| ka50083 | 금현물월봉차트조회요청 | `/api/dostk/chart` |
| ka50091 | 금현물당일틱차트조회요청 | `/api/dostk/chart` |
| ka50092 | 금현물당일분봉차트조회요청 | `/api/dostk/chart` |

## 국내주식 > 테마

| api-id | 이름 | URL |
|---|---|---|
| ka90001 | 테마그룹별요청 | `/api/dostk/thme` |
| ka90002 | 테마구성종목요청 | `/api/dostk/thme` |

## 미국주식 > 계좌

| api-id | 이름 | URL |
|---|---|---|
| usa21670 | 미국주식 일별계좌수익률현황 | `/api/us/acnt` |
| usa21680 | 미국주식 월별계좌수익률현황 | `/api/us/acnt` |
| usa21690 | 미국주식 연도별계좌수익률현황 | `/api/us/acnt` |
| usa21730 | 미국주식 일별종목수익률현황 | `/api/us/acnt` |
| usa21731 | 미국주식 월별종목수익률현황 | `/api/us/acnt` |
| usa21732 | 미국주식 연도별종목수익률현황 | `/api/us/acnt` |
| ust21050 | 미국주식 원장 미체결 | `/api/us/acnt` |
| ust21070 | 미국주식 원장잔고확인 | `/api/us/acnt` |
| ust21100 | 미국주식 거래내역 | `/api/us/acnt` |
| ust21110 | 해외주식 예수금 | `/api/us/acnt` |
| ust21111 | 원화출금가능 금액 조회(원화대용 포함) | `/api/us/acnt` |
| ust21120 | 통화별 예수금 및 증권 평가금현황 | `/api/us/acnt` |
| ust21121 | 해외증권 원장 평가금액현황 | `/api/us/acnt` |
| ust21131 | 해외증권 특정일 평가금액 | `/api/us/acnt` |
| ust21132 | 특정일 통화별 예수금 및 증권 평가금 | `/api/us/acnt` |
| ust21150 | 미국주식 일별 주문체결내역 | `/api/us/acnt` |
| ust21160 | 미국주식 예수금 상세 | `/api/us/acnt` |
| ust21170 | 미국주식 당일 종목별 실현손익 | `/api/us/acnt` |
| ust21180 | 미국주식 기간별 주문내역 | `/api/us/acnt` |
| ust21510 | 미국주식 당일 주문체결 확인 | `/api/us/acnt` |
| ust21530 | 미국주식 실현손익 | `/api/us/acnt` |
| ust21610 | 미국주식 당일매매 | `/api/us/acnt` |
| ust21620 | 미국주식 당일매매정리 | `/api/us/acnt` |
| ust21630 | 미국주식 당일 실현손익 | `/api/us/acnt` |
| ust21640 | 미국주식 일별 종목별 실현손익 | `/api/us/acnt` |
| ust21650 | 미국주식 기간별 수익률 현황 | `/api/us/acnt` |
| ust21660 | 미국주식 일별 실현손익 | `/api/us/acnt` |
| ust21661 | 미국주식 월별 실현손익 | `/api/us/acnt` |

## 미국주식 > 관심종목

| api-id | 이름 | URL |
|---|---|---|
| usa20200 | 미국주식 관심종목 그룹 리스트 조회 | `/api/us/watchlist` |
| usa20201 | 미국주식 관심종목 그룹 상세 조회 | `/api/us/watchlist` |

## 미국주식 > 순위정보

| api-id | 이름 | URL |
|---|---|---|
| usa01980 | 미국주식 실시간 종목 조회 순위 | `/api/us/rkinfo` |
| usa01990 | 미국주식 관심종목 등록 상위 | `/api/us/rkinfo` |
| usa20510 | 미국주식 기간별 등락률상위(주식/업종) | `/api/us/rkinfo` |
| usa20511 | 미국주식 기간별 등락률상위(ETF) | `/api/us/rkinfo` |
| usa20512 | 미국주식 기간별 등락률상위(관심종목) | `/api/us/rkinfo` |
| usa20530 | 미국주식 당일 거래량 상위(주식/업종) | `/api/us/rkinfo` |
| usa20531 | 미국주식 당일 거래량 상위(ETF) | `/api/us/rkinfo` |
| usa20540 | 미국주식 당일 거래대금 상위(주식/업종) | `/api/us/rkinfo` |
| usa20541 | 미국주식 당일 거래대금 상위(ETF) | `/api/us/rkinfo` |
| usa20550 | 미국주식 시가총액상위(주식/업종) | `/api/us/rkinfo` |
| usa20551 | 미국주식 시가총액상위(ETF) | `/api/us/rkinfo` |
| usa20880 | 키움 거래 상위 종목(미국주식) | `/api/us/rkinfo` |
| usa20881 | 키움 거래 상위 종목(미국 ETF) | `/api/us/rkinfo` |
| usa20910 | 미국주식 전일대비 등락률상위(주식/업종) | `/api/us/rkinfo` |
| usa20911 | 미국주식 전일대비 등락률상위(ETF) | `/api/us/rkinfo` |
| usa20920 | 미국주식 시가대비 등락률상위(주식/업종) | `/api/us/rkinfo` |
| usa20921 | 미국주식 시가대비 등락률상위(ETF) | `/api/us/rkinfo` |
| usa20922 | 미국주식 시가대비 등락률상위(관심종목) | `/api/us/rkinfo` |
| usa20940 | 미국주식 누적 등락률 상위(주식/업종) | `/api/us/rkinfo` |
| usa20941 | 미국주식 누적 등락률 상위(ETF) | `/api/us/rkinfo` |
| usa20960 | 미국주식 전일 거래상위(주식/업종) | `/api/us/rkinfo` |
| usa20961 | 미국주식 전일 거래상위(ETF) | `/api/us/rkinfo` |
| usa24110 | 미국주식 최고최저가대비 상승하락(주식/업종) | `/api/us/rkinfo` |
| usa24111 | 미국주식 최고최저가대비 상승하락(ETF) | `/api/us/rkinfo` |
| usa24120 | 미국주식 특정일자 상승/하락 (주식/업종) | `/api/us/rkinfo` |
| usa24121 | 미국주식 특정일자 상승/하락(ETF) | `/api/us/rkinfo` |
| usa24150 | 미국주식 회전율 상위(주식/업종) | `/api/us/rkinfo` |
| usa24151 | 미국주식 회전율 상위(ETF) | `/api/us/rkinfo` |
| usa24160 | 미국주식 연속상승/하락 순위(주식/업종) | `/api/us/rkinfo` |
| usa24161 | 미국주식 연속상승/하락 순위(ETF) | `/api/us/rkinfo` |
| usa24162 | 미국주식 연속상승/하락 순위(관심종목) | `/api/us/rkinfo` |
| usa24200 | 미국주식 호가잔량상위(주식/업종) | `/api/us/rkinfo` |
| usa24201 | 미국주식 호가잔량상위(ETF) | `/api/us/rkinfo` |
| usa24290 | 미국주식 주간거래 괴리율 상위(주식/업종) | `/api/us/rkinfo` |
| usa24291 | 미국주식 주간거래 괴리율 상위(ETF) | `/api/us/rkinfo` |

## 미국주식 > 시세

| api-id | 이름 | URL |
|---|---|---|
| usa20100 | 미국주식 현재가 종목정보 | `/api/us/mrkcond` |
| usa20101 | 미국주식 현재가 10호가 | `/api/us/mrkcond` |
| usa20150 | 미국주식 상세 체결내역 | `/api/us/mrkcond` |
| usa20151 | 미국주식 일별 체결내역 | `/api/us/mrkcond` |
| usa20590 | 미국주식 일별주가 | `/api/us/mrkcond` |

## 미국주식 > 실시간시세

| api-id | 이름 | URL |
|---|---|---|
| F4 | 미국주식 실시간 주문 확인 | `/api/us/websocket` |
| F5 | 미국주식 실시간 체결 | `/api/us/websocket` |
| FE | 미국주식 실시간 체결가 | `/api/us/websocket` |
| FT | 미국주식 10호가 | `/api/us/websocket` |

## 미국주식 > 업종

| api-id | 이름 | URL |
|---|---|---|
| usa23000 | 미국주식 업종별 기간별 수익률 조회 | `/api/us/sect` |
| usa23100 | 미국주식 업종별 등락률 상위/하위 조회 | `/api/us/sect` |

## 미국주식 > 조건검색

| api-id | 이름 | URL |
|---|---|---|
| usa20280 | 미국주식 조건검색 목록조회 | `/api/us/websocket` |
| usa20281 | 미국주식 조건검색 요청 일반 | `/api/us/websocket` |
| usa20290 | 미국주식 조건검색 요청 실시간 | `/api/us/websocket` |
| usa20291 | 미국주식 조건검색 실시간 해제 | `/api/us/websocket` |

## 미국주식 > 종목정보

| api-id | 이름 | URL |
|---|---|---|
| usa10098 | 미국주식 거래소구분 조회 | `/api/us/stkinfo` |
| usa10099 | 미국주식 종목리스트 | `/api/us/stkinfo` |
| usa10100 | 미국주식 종목 조회 | `/api/us/stkinfo` |
| usa10101 | 미국주식 업종리스트 | `/api/us/stkinfo` |
| usa10102 | 미국지수 리스트 | `/api/us/stkinfo` |
| usa10104 | 미국 ETF,ETN 리스트 | `/api/us/stkinfo` |
| usa10105 | 미국 ETF 카테고리 리스트 | `/api/us/stkinfo` |
| usa20520 | 미국주식 거래량급등락(주식/업종) | `/api/us/stkinfo` |
| usa20521 | 미국주식 거래량급등락(ETF) | `/api/us/stkinfo` |
| usa20570 | 미국주식 가격대별주가(주식/업종) | `/api/us/stkinfo` |
| usa20571 | 미국주식 가격대별주가(ETF) | `/api/us/stkinfo` |
| usa20930 | 미국주식 가격급등락(주식/업종) | `/api/us/stkinfo` |
| usa20931 | 미국주식 가격급등락(ETF) | `/api/us/stkinfo` |
| usa20932 | 미국주식 가격급등락(관심종목) | `/api/us/stkinfo` |
| usa20970 | 미국주식 고가/저가 접근(주식/업종) | `/api/us/stkinfo` |
| usa20971 | 미국주식 고가/저가 접근(ETF) | `/api/us/stkinfo` |
| usa20972 | 미국주식 고가/저가 접근(관심종목) | `/api/us/stkinfo` |
| usa23400 | 미국주식 거래량갱신(주식/업종) | `/api/us/stkinfo` |
| usa23401 | 미국주식 거래량갱신(ETF) | `/api/us/stkinfo` |
| usa23402 | 미국주식 거래량갱신(관심종목) | `/api/us/stkinfo` |
| usa24100 | 미국주식 신고가/신저가(주식/업종) | `/api/us/stkinfo` |
| usa24101 | 미국주식 신고가/신저가(ETF) | `/api/us/stkinfo` |
| usa24140 | 미국주식 갭상승/갭하락(주식/업종) | `/api/us/stkinfo` |
| usa24141 | 미국주식 갭상승/갭하락(ETF) | `/api/us/stkinfo` |
| usa24210 | 미국주식 잔량률급증(주식/업종) | `/api/us/stkinfo` |
| usa24211 | 미국주식 잔량률급증(ETF) | `/api/us/stkinfo` |
| usa24220 | 미국주식 매물대집중(주식/업종) | `/api/us/stkinfo` |
| usa24221 | 미국주식 매물대집중(ETF) | `/api/us/stkinfo` |
| usa26410 | 미국주식 연도별 등락률(종목) | `/api/us/stkinfo` |
| usa26411 | 미국주식 연도별 업종별 종목등락률 | `/api/us/stkinfo` |
| usa26412 | 미국주식 연도별 ETF 카테고리별 종목등락률 | `/api/us/stkinfo` |
| usa26413 | 미국주식 연도별 등락률(업종) | `/api/us/stkinfo` |
| usa26414 | 미국주식 연도별 등락률(ETF) | `/api/us/stkinfo` |

## 미국주식 > 주문

| api-id | 이름 | URL |
|---|---|---|
| ust20000 | 미국주식 매수 주문 **MONEY** | `/api/us/ordr` |
| ust20001 | 미국주식 매도 주문 **MONEY** | `/api/us/ordr` |
| ust20002 | 미국주식 정정 주문 **MONEY** | `/api/us/ordr` |
| ust20003 | 미국주식 취소 주문 **MONEY** | `/api/us/ordr` |
| ust31490 | 미국주식 주문가능수량(종목/증거금률별) | `/api/us/ordr` |

## 미국주식 > 차트

| api-id | 이름 | URL |
|---|---|---|
| usa06010 | 미국주식 틱 차트 | `/api/us/chart` |
| usa06011 | 미국주식 분 차트 | `/api/us/chart` |
| usa06012 | 미국주식 일 차트 | `/api/us/chart` |
| usa06013 | 미국주식 주 차트 | `/api/us/chart` |
| usa06014 | 미국주식 월 차트 | `/api/us/chart` |
| usa06015 | 미국주식 년 차트 | `/api/us/chart` |
| usa06016 | 미국주식 분기 차트 | `/api/us/chart` |

## 미국주식 > 투자정보

| api-id | 이름 | URL |
|---|---|---|
| usa24300 | 미국주식 리서치(미국주식/ETF) | `/api/us/invtinfo` |

## 미국주식 > 환전

| api-id | 이름 | URL |
|---|---|---|
| ust31300 | 환전 예상 금액 조회 | `/api/us/exchange` |
| ust31301 | 환율 조회 | `/api/us/exchange` |
| ust31302 | 환전 신청 **MONEY** | `/api/us/exchange` |
