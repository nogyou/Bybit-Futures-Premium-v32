# BYBIT FUTURES PREMIUM v3.2 — Trade Terminal (Beta)

본 파일은 레노버 Y700 등 Android 태블릿용 **실제 Android 프로젝트 소스**입니다. **기존 v3.1의 3열 다크 UI를 유지**하면서 요청된 8가지 개선 사항을 코드에 반영했습니다. 앱 ID는 `com.bybit.tradeterminal.v32`이므로 v3.1과 별도의 앱으로 설치하도록 구성되어 있습니다. Gradle 8.11.1 / Android Gradle Plugin 8.7.3 / compileSdk 35 / targetSdk 35.

**이 앱은 자동 주문·수익 보장 앱이 아니며, 학습된 생성형 AI 모델을 실시간 호출하지 않습니다.** 'AI 종합 판단'은 공개 데이터 기반의 규칙형 정량 분석 엔진입니다. 전략의 승률·기대값을 아직 실제 거래소 환경과 장기간 모의매매로 검증하지 않았습니다.

## 이번 미세 조정: 캔들 크기와 차트 구성을 유지하고 LONG/SHORT 진입·TP·SL 가격 배지 글씨만 9px→8px, 배지 높이 14px→12px로 축소했습니다. 초기 표시 캔들 수(82개), 확대·축소, 가격축, 차트 레이아웃, 추천 수평선은 변경하지 않았습니다.

## v3.2 요청 8가지 반영 내역

| 번호 | 요청 | 이번 소스에서 구현한 내용 |
|---|---|---|
| 1 | 가로/세로 전환 | Android 가로 고정 해제, 기존 가로 3열 UI 유지, 세로에서는 차트 → AI 판단 → 전체 시장 목록 반응형 배열 |
| 2 | 왼쪽 등락률 숫자 잘림 | 시장 종목 행의 그리드·패딩·오른쪽 등락률 너비 재조정; `+/-0.00%` 표기와 정렬 유지 |
| 3 | 15초보다 빠른 실시간 시세 | Bybit V5 `wss://stream.bybit.com/v5/public/linear` 공개 ticker WebSocket, 선물 종목별 구독을 묶어 처리, 구독 업데이트 시 선택 가격 즉시/시장 가격 배치 갱신, 끊김 시 REST 폴백과 재연결·신호 지연 보호 |
| 4 | 매물대 기반 TP1/TP2 | 고정 `1.65R/2.75R` 목표 대신 피벗, 고저점, 피보나치, 상위 시간봉 구조에서 실제 후보 목표가 선택. 시장 구조에 유효 목표가 없거나 순손익비 불충분하면 WAIT. 손절은 ATR·주요 피벗 참고 |
| 5 | 차트 LONG/SHORT 가격선 가독성 | 진입/TP/SL 수평선 굵기·색상 차별화, 가격 배지 분산 배치/연결선, `전체선 → LONG만 → SHORT만` 표시 선택, 확대/축소 유지 |
| 6 | 과거 차트 좌우 드래그 | 수평 팬, 두 손가락 확대/축소, 필요 시 Bybit Kline `end=`로 과거 캔들 추가 조회, `◉ 최신`으로 복귀, 날짜축·EMA·RSI·MACD 과거 이동 연동 |
| 7 | 단기/당일/스윙 적합성 | `1·3·5·15·30·60·240분, 일봉` 요약 추세 결합. 초단기/당일/스윙의 조건부 LONG/SHORT/WAIT 비교 및 보유 기간 **참고 범위** 안내. 부족·상충 데이터면 WAIT |
| 8 | 레버리지 1–100배 분석 | 종목 공개 `leverageFilter.maxLeverage` 상한 적용, 증거금·허용 손실액·격리/교차 모드, LONG/SHORT의 TP1/TP2/SL 예상 순손익(USDT, 증거금 대비 수익률)과 과도한 손절/배율 경고, 위험 예산 초과 시 AI WAIT. 정확한 강제청산 가격은 계정 정보 없이 산출하지 않음 |

## 화면/신호 설계 설명

- 왼쪽: Bybit **USDT 무기한 선물** 전체시장, 검색, 즐겨찾기, 상승순/하락순/가격순/거래대금순, 실시간 현재가와 24시간 등락률.
- 중앙: 현재가와 24시간 고·저/거래대금, 분봉/시간봉/일봉/월봉 선택, 캔들·EMA20/50·거래량·RSI14·MACD, 실제 시장 구조로 계산한 양방향 진입·목표·손절선.
- 오른쪽: 조건 충족 여부에 따른 `LONG / SHORT / WAIT`, LONG과 SHORT 개별 매매 후보, 차트와 동일한 TP/SL, 다중 시간봉 매매 기간 비교, 사용자 레버리지별 위험 시뮬레이션, 분석 근거.
- **시세 수신과 AI 분석은 별개의 주기**입니다. WS 가격은 수신되는 즉시 상태를 갱신하지만, 원본 완성봉·호가·OI를 포함한 전체 분석은 약 45초마다 재조회합니다. 후보가 근접한 경우 최근 데이터로 재확인하되 **수급/가격 데이터가 오래되면 WAIT**로 표시합니다. 완성 전 캔들은 신호 확정 지표에서 제외합니다.
- 과거 캔들을 탐색해도 우측 매매 계획은 **최신 데이터 기준의 현재 분석 시나리오**입니다. 과거로 이동해도 역사적 시점에 그 계획을 추천했다고 해석하면 안 됩니다.

### 실전 관련 한계 (중요)

1. **신뢰도는 검증된 적중률이 아닙니다.** 다중 시간봉 정렬과 RSI/EMA/MACD/호가 불균형/OI/펀딩비의 점수는 규칙형 계산이며, 워크포워드 백테스트나 실거래 수익 검증을 수행하지 않았습니다.
2. Bybit WebSocket 연결, 전체 종목 구독 가능 범위, API 속도 제한, Android WebView 네트워크 호환은 기기·네트워크별로 변할 수 있습니다. 연결 불가 시 화면에 REST 폴백/지연을 표시합니다. **실시간 동작은 기기에서 직접 확인해야 합니다.**
3. 수수료와 슬리피지는 추정치이며, 실제 계정 등급·미끄러짐·펀딩 정산에 따라 달라집니다. 펀딩비는 공개 시점의 수치를 활용한 단순 비용 가정이며 실제 보유 시간별 정산 비용 예측이 아닙니다.
4. 종목별 최대 배율은 거래소 상품 정보에 표시된 값이며 **계정/포지션 위험 한도 단계·시점에 따라 실제 허용 상한이 낮을 수 있습니다.** **정확한 청산가를 만들지 않았습니다.** 계정의 격리/교차 증거금, 유지증거금률, 잔고와 마크가격을 확인해야 합니다.
5. 현재 주문/자동매매, 인증 계정 조회, 푸시, 실거래 성과 리포트, 완전한 백테스트, **뉴스 감성 분석**은 구현되지 않았습니다. 메뉴에 있는 기능은 미구현 안내를 표시합니다.
6. 이 소스는 **계산·UI 오프라인 테스트를 완료했지만 실제 Android APK 빌드 및 레노버 Y700 설치/실시간 Bybit 환경 실측 테스트는 아직 이 생성 환경에서 수행하지 않았습니다.** 빌드 성공과 전략 성능 검증은 별개입니다.

## GitHub Codespaces에서 APK 생성

1. 기존 v3.1과 분리하려면 새 저장소 `Bybit-Futures-Premium-v32`를 **Private**으로 만들고 `Bybit-Futures-Premium-v3.2-TradeTerminal-Source.zip`을 업로드합니다.
2. Codespaces를 연 다음 터미널에서 다음 명령을 **새 저장소 루트에서** 실행합니다. ZIP에는 필요한 소스가 루트 기준으로 들어 있습니다.

```bash
unzip -o "Bybit-Futures-Premium-v3.2-TradeTerminal-Source.zip" -d .
git add .github app tests build.gradle.kts settings.gradle.kts gradle.properties README.md
git commit -m "Add Bybit Premium v3.2 trade terminal improvements"
git push origin main
```

3. 저장소의 **Actions → Build Bybit Futures v3.2 APK → 성공한 실행 → Artifacts**에서 `Bybit-v32-TradeTerminal-debug-APK`를 다운로드합니다. ZIP을 풀어 `app-debug.apk`를 설치합니다.
4. Android 설정에서 **자동 회전**을 켜고 가로/세로 동작을 확인합니다. 실시간 WS 데이터가 들어오는지 연결 상태와 초단위 가격 갱신을 먼저 확인합니다.

## 코드 구조 및 테스트

- `app/src/main/assets/index.html`, `style.css`: 화면, 반응형 배치, 레버리지 패널
- `app/src/main/assets/app.js`: 시장 상태/REST API/종목 전환/다중 시간봉 수집/신호 렌더링
- `app/src/main/assets/engine.js`: 지표, 매매 후보·시장 구조 TP/SL, 여러 시간봉, 배율별 PnL 위험 계산
- `app/src/main/assets/stream.js`: 공개 Bybit WS ticker 전체시장 실시간 구독, 백오프 재연결
- `app/src/main/assets/chart.js`: 차트 드래그/과거 데이터/가격선 겹침 개선
- `tests/test_engine.js`: 기존 계산/WAIT 안전성
- `tests/test_v32_engine.js`: 다중 시간봉, 동적 목표, 배율 손익, 청산가 미추정
- `tests/ui_smoke.py`: Chromium에서 **완전한 가상 테스트 데이터**로 UI/정렬/WS 모의 갱신/차트/세로 화면 검증
- `tests/ui-smoke-preview.png`, `tests/ui-portrait-preview.png`: **실제 실행 화면이 아닌 테스트용 가상 시세 스크린샷**

테스트 명령:

```bash
node tests/test_engine.js
node tests/test_v32_engine.js
python tests/ui_smoke.py  # Playwright+Chromium이 설치된 개발 환경에서만
```

공식 공개 API 문서: [WebSocket Ticker](https://bybit-exchange.github.io/docs/v5/websocket/public/ticker), [WS 연결](https://bybit-exchange.github.io/docs/v5/ws/connect), [Kline](https://bybit-exchange.github.io/docs/v5/market/kline), [상품별 배율](https://bybit-exchange.github.io/docs/v5/market/instrument).
