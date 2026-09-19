# English OS Speaking V2.25.2 更新與驗收

## 版本目標

V2.25.2 延續 V2.25.1 的 Speaking 架構，強化每一題從聽辨到下一題的執行狀態。Required Coverage 仍只包含當課非排除的 Main Vocabulary、Extended Vocabulary 與 Grammar；Correction、Spelling、Previous Weakness、Review Items 與 Learning Focus 仍只屬於 Review Context／Coaching Priority。

唯一允許的逐題流程為：

`HEARING RESOLVED → TARGET/TASK RESOLVED → CORRECTION RESOLVED OR NOT NEEDED → QUEUE UPDATED → FIRST UNRESOLVED ITEM`

Final Challenge 的流程為：

`ALL REQUIRED COVERAGE RESOLVED → PRE-FINAL FULL QUEUE AUDIT → remainingCoverage === 0 → FINAL CHALLENGE`

## 修改檔案

| 檔案 | 修改 |
|---|---|
| `src/speaking-client.js` | schemaVersion 2.25.2；Speaking Brief 新增 Hearing、Target、Correction、Next Item、Queue Update、Learner Completion Check 與 Pre-Final Queue Audit Gate；保留 Voice Start／Readiness／No Readiness Loop。 |
| `src/speaking-queue.js` | 新增 V2.25.2 execution-gate schema class；驗證 hearing、target/task、correction、Retry、queue 順序、explicit Skip 與 Pre-Final audit；Coverage 仍動態生成。 |
| `src/speaking-service.mjs` | 保留 server-side source rebuild／validation；支援 2.25.1 → 2.25.2 未完成 Session 升級，阻止舊 client 降級 2.25.2 Session。 |
| `tests/speaking-queue.test.mjs` | 新增附件 A–N 情境的核心／後端驗證、動態 10-item 課程、完整 audit ID、版本升級與舊 client 防降級。 |
| `tests/ui.cjs` | 新增 A–N Speaking Brief regression tests，並保留 Correction、Review、Cloud、timer 與 legacy regression。 |
| `index.html`、`public/index.html` | 建置後的完整 V2.25.2 單檔網站。 |
| `supabase/functions/speaking-queue/*` | 與共用 queue/service 模組同步的正式 Edge Function。 |

## schemaVersion

網站發出的 status／prepare 請求、Speaking Brief 與新 Report 均使用 `2.25.2`。V2.24 legacy 與 V2.25.0／V2.25.1 Report 的既有解析與 Session 歷史仍保留。

V2.25.2 的 `coverageChecks[].resolution` 記錄：

- `hearing`: `clear | clarified | unresolved`
- clarification prompt／response
- `targetOrTask`: `resolved | unresolved | explicit_skip`
- progressive recall support
- correction resolution
- `queueUpdated`

`finalChallenge` 另外記錄 `preFinalAuditPassed`、`remainingCoverageBeforeChallenge` 與完整 `auditedCoverageIds`。

## 動態 Required Coverage

總數直接來自目前教材 inventory：

`non-excluded Main Vocabulary + Extended Vocabulary + Grammar`

程式沒有固定 8。家庭成員課剛好是 5 Vocabulary＋3 Grammar＝8；回歸測試另建 6 Vocabulary＋4 Grammar 的課程，驗證結果為 10。Correction 與 Spelling 不會增加總數。

## NEXT ITEM GATE

Brief 的 `HARD RULE — NEXT ITEM GATE` 規定 response 本身不等於可以 Next。每一題必須先完成聽辨、目標／任務、必要訂正與 queue update。

Server 會依 `activeAttempt.items` 的順序驗證 Report。除可靠的 warm-up Vocabulary 自然產出外，新的 evidence 必須對應當時的 FIRST unresolved item；如果前一題仍 unresolved，後面題目會標成 `queue_order_violation`，不能取得 Coverage。

## Hearing Confirmation Gate

疑似錯誤轉錄時，本項保持 `hearing_unresolved`。Report 必須記錄清楚的 hearing 狀態；若是 `clarified`，必須同時保留最小確認問題與 Learner 的確認／重說。`uncertain`、`transcriptionIssue=true` 或未確認的 transcript 不能變成 Learner 能力錯誤，也不能取得 Coverage。

## Target Resolution Gate

Vocabulary 必須在可靠的 Learner utterance 中實際出現 target。只有描述概念仍保持 `target_not_produced`。Brief 指定依序使用 natural follow-up、small hint、clearer hint，最後才提供答案。Coach 直接提供 target 時，該次本身不能算獨立 production。

## Correction + Retry Gate

Coverage 與 quality 仍分開：target 可以已 practiced，但 `productionQuality=needs_review` 或 Grammar `accuracy=incorrect` 時，NEXT 仍被 correction gate 擋住。

V2.25.2 必須有對應 `speakingCorrections`，保留 My sentence／Better／Why，並記錄：

- `retried`：完整 Retry、Learner finished、可靠度及 transcription 狀態；或
- `declined`：Learner 明確拒絕 Retry 的原話。

只有稱讚、未完成 Retry，或沒有對應 correction evidence，都不能通過。

## Next 與 Explicit Skip

`Next`、`Next question`、`Let's continue`、`下一題` 只代表繼續 Session，不代表跳過目前 unresolved step。

只有明確的 Skip 表達才記錄 `targetOrTask=explicit_skip`、`status=not_tested`、`remainingReason=explicit_skip`。Coach 可以繼續問下一題，但被跳過的 Required item 仍在 remaining queue，因此不能讓整場完成或進入有效 Final Challenge。

## Grammar Queue

每一條 Grammar 都有獨立 coverageId。Title + Name、Direct Address、Possessive + Title 分別驗證；完成其中一條不能完成相鄰規則。Grammar transcript 如 Capital 被轉成 Capitalist，必須先確認聽辨；自動大小寫不能當證據。

## Pre-Final Queue Audit

Final Challenge 前必須：

1. `remainingCoverage === 0`
2. 所有 Required Vocabulary／Grammar 有有效 practiced evidence
3. `preFinalAuditPassed === true`
4. `remainingCoverageBeforeChallenge === 0`
5. `auditedCoverageIds` 完整且精確對應目前 queue
6. Final Challenge sequence 晚於本 attempt 的 Coverage evidence

Final Challenge 只屬於 integration evidence，不能回頭補 missed Required Coverage。

## Learner 問「有沒有漏」

Brief 要求立即 audit 完整 Required queue，不能依對話印象回答。若仍有項目，Coach 直接回到 FIRST unresolved item，也不得要求 Learner 指出漏掉哪一題。

## Database

不需要新的 DB migration。V2.25.2 沿用既有 Speaking Session state JSON、continuation 與 idempotent Report import 架構；新增欄位由目前 JSON Report／state 直接保存。

## 自動驗證

執行：

```bash
npm run build
npm test
```

目前結果：

- JavaScript syntax／shared-module build：通過
- Speaking core／server：55／55
- UI／Prompt／Correction／Review／timer／legacy：60／60
- 合計：115／115

## 真人 Voice 驗收重點

1. 將新的 V2.25.2 Brief 貼入 Project，進入 Voice。
2. 用 descendant 製造含糊轉錄，確認 Coach 先問最小 clarification。
3. sibling 只描述 older sister 而不說 sibling，確認 Coach 依 progressive support 追問。
4. spouse 說出 target 但保留 `we don't have married`／`boyfriend marry`，確認 Coach 完成 My sentence／Better／Why／Retry 後才 Next。
5. 只完成 Grammar #2，確認 Coach 接著處理 FIRST unresolved Grammar，不能提前 Final Challenge。
6. 在未完成時說 Next，確認沒有跳題；再明確說 Skip this word，確認它保持 unresolved。
7. 問「是不是都練完了？」，確認 Coach audit queue 並直接續問第一個漏項。
8. 全部 Required 完成後確認才進 Pre-Final Audit 與 Final Challenge。
