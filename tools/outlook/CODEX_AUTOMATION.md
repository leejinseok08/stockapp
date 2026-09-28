# Codex 주간 시황 자동화

상태: 등록 대기. 이 문서는 설정값이며, 예약 작업 자체는 아직 생성되지 않았다.

## 앱에서 등록할 값

- 이름: StockApp 주간 시황 보완
- 프로젝트: `C:\Users\LEEJINSEOK\stockapp`
- 일정: 매주 토요일 12:00, Asia/Seoul (한국 시간)
- 반복 규칙: `FREQ=WEEKLY;BYDAY=SA;BYHOUR=12;BYMINUTE=0;BYSECOND=0`
- 실행 위치: 별도 Git worktree
- 모델/추론: 앱 기본값
- 필요 접근: 웹 검색과 원문 열람, GitHub pull/push, 작업 디렉터리 쓰기
- 첫 예정일: 2026-10-03 12:00 KST

## 프롬프트

```text
StockApp 주간 시황의 Codex 보완 작업을 실행한다. 한국어로 보고한다.
프로젝트의 AGENTS.md와 CLAUDE.md를 읽고 tools/outlook/PROMPT.md를 따른다.
author는 "codex"다. 매 실행은 독립적인 작업이다.

최신 origin/main을 반영한 뒤 backend에서 python -m app.services.outlook week를
실행하여 한국 시간 기준 ISO 주차와 파일 존재 여부를 확인한다.
그 주 파일이 이미 있으면 수정 없이 "already written"이라고 보고하고 종료한다.
토요일 실행을 놓쳐 뒤늦게 실행되더라도 한국 시간으로 토요일이 아니면 작성하지
말고 일정 확인이 필요하다고 보고한다.

파일이 없으면 tools/outlook/PROMPT.md의 조사 기간, 여섯 기관, 원문 우선 원칙,
JSON 형식과 검증 절차를 모두 따른다. Fed/BOK는 기관 원문을 먼저 열고,
제삼자 재게시물은 출처로 사용하지 않는다. 투자 매수/매도 지시는 쓰지 않는다.

해당 주 JSON만 작성하고 검사 명령이 ok인지 확인한다. 해당 파일만 커밋한다.
푸시 직전 최신 origin/main에 같은 주 파일이 생겼는지 다시 확인한다.
이미 생겼다면 상대 파일을 덮어쓰지 말고 중복 작성으로 보고하고 종료한다.
그렇지 않으면 PROMPT.md의 pull/rebase/push 절차를 따른다.
main 푸시가 거절되면 안내된 outlook/<week> 브랜치를 사용한다.
권한 또는 네트워크 오류는 성공으로 보고하지 말고 실패한 단계와 원인을 보고한다.
사용자의 다른 수정 파일이나 HANDOFF.md는 이 정기 실행에서 수정하지 않는다.

마지막에 주차, 전체 판단, 한 줄 결론, 새 자료가 없는 기관, 검증 및 푸시 결과를 보고한다.
```

## 등록 후 확인

1. 앱의 Automations 또는 Scheduled에서 활성 상태와 다음 실행 시각을 확인한다.
2. 실행 시 PC와 앱이 켜져 있고 프로젝트에 접근 가능한지 확인한다.
3. 네트워크와 GitHub 접근이 가능한 권한 구성을 확인한다.
4. 첫 토요일 실행 후 중복 방지, 출처, JSON 검사, 푸시 결과를 확인한다.

공식 안내: https://learn.chatgpt.com/docs/automations?surface=app
