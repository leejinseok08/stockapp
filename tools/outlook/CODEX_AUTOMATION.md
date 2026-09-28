# Codex 시황 자동화 (대체 실행)

상태: 등록 대기. 이 문서는 설정값이며, 예약 작업 자체는 Codex 앱에서 직접 만들어야 한다.

Claude Code 루틴이 매일 09:00과 22:30(한국 시간)에 시황을 쓴다. Codex는 한 시간 뒤에 돌면서,
그 회차 파일이 없을 때만(Claude 크레딧 소진 등) 대신 쓴다.

## 앱에서 등록할 값 (자동화 2개)

| 이름 | 일정 (Asia/Seoul) | 반복 규칙 |
|---|---|---|
| StockApp 시황 보완 오전 | 매일 10:00 | `FREQ=DAILY;BYHOUR=10;BYMINUTE=0;BYSECOND=0` |
| StockApp 시황 보완 밤 | 매일 23:30 | `FREQ=DAILY;BYHOUR=23;BYMINUTE=30;BYSECOND=0` |

- 프로젝트: `C:\Users\LEEJINSEOK\stockapp`
- 실행 위치: 별도 Git worktree
- 모델/추론: 앱 기본값
- 필요 접근: 웹 검색과 원문 열람, GitHub pull/push, 작업 디렉터리 쓰기
- PC와 Codex 앱이 켜져 있어야 실행된다.

## 프롬프트 (두 자동화 공통)

```text
StockApp 시황의 Codex 보완 작업을 실행한다. 한국어로 보고한다.
프로젝트의 AGENTS.md와 CLAUDE.md를 읽고 tools/outlook/PROMPT.md를 따른다.
author는 "codex"다. 매 실행은 독립적인 작업이다.

최신 origin/main을 반영한 뒤 backend에서 python -m app.services.outlook slot을
실행하여 한국 시간 기준 회차(YYYY-MM-DD-am 또는 -pm)와 파일 존재 여부를 확인한다.
그 회차 파일이 이미 있으면 수정 없이 "already written"이라고 보고하고 종료한다.

파일이 없으면 tools/outlook/PROMPT.md의 직전 회차 이어받기, 여섯 기관, 원문 우선 원칙,
JSON 형식과 검증 절차를 모두 따른다. Fed/BOK는 기관 원문을 먼저 열고,
제삼자 재게시물은 출처로 사용하지 않는다. 투자 매수/매도 지시는 쓰지 않는다.

핵심(points)은 중요한 것부터, 한 줄 70자 이내의 한 문장으로 쓴다(앱은 앞의 3개와 판단 이유 3줄만 먼저 보여준다).
해당 회차 JSON만 작성하고 검사 명령이 ok인지 확인한다. 해당 파일만 커밋한다.
커밋 메시지는 "Outlook <slot> [skip render]"로 쓴다. [skip render]를 빼면 서버가 재배포되며 캐시가 비어
앱이 1~5분 느려진다.
푸시 직전 최신 origin/main에 같은 회차 파일이 생겼는지 다시 확인한다.
이미 생겼다면 상대 파일을 덮어쓰지 말고 중복 작성으로 보고하고 종료한다.
그렇지 않으면 PROMPT.md의 pull/rebase/push 절차를 따른다.
main 푸시가 거절되면 안내된 outlook/<slot> 브랜치를 사용한다.
권한 또는 네트워크 오류는 성공으로 보고하지 말고 실패한 단계와 원인을 보고한다.
사용자의 다른 수정 파일이나 HANDOFF.md는 이 정기 실행에서 수정하지 않는다.

마지막에 회차, 전체 판단, 한 줄 결론, 새 자료가 있었던 기관, 검증 및 푸시 결과를 보고한다.
```

## 등록 후 확인

1. 앱의 Automations 또는 Scheduled에서 두 자동화의 활성 상태와 다음 실행 시각을 확인한다.
2. 네트워크와 GitHub 접근이 가능한 권한 구성을 확인한다.
3. 첫 실행 후 "already written" 보고(Claude가 이미 쓴 경우)와 중복 방지가 동작하는지 확인한다.

공식 안내: https://learn.chatgpt.com/docs/automations?surface=app
