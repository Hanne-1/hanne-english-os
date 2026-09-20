# V2.27.0 IMPLEMENTATION REPORT

Version: 2.27.0  
Release focus: Current Required Item Lock + Target Usage Validation

## 1. 修改檔案

核心修改包含 `src/speaking-queue.js`、`src/speaking-client.js`、`src/speaking-service.mjs`、`index.html`、`public/index.html`、Supabase Function 同步檔、`package.json`、`README.md`、既有相容性測試與 `tests/v270-current-word-lock.test.mjs`。

## 2. schemaVersion

`SPEAKING_SCHEMA_VERSION`、網站標題與 package version 均已更新為 `2.27.0`。V2.26.1 的未完成 active attempt 會重設為 V2.27.0 attempt，但保留已由伺服器驗證的 Coverage 進度。

## 3. Current Required Item Lock

`src/speaking-queue.js` 的 `canResolveCurrentWord()` 與 `decideCurrentWordAction()` 是新的 Live 控制核心。只有目前單字符合六項成功條件才允許 `queueAdvance=true`。

## 4. Live Voice primary states

Live Voice 只使用：

`PENDING → ACTIVE → AWAITING_LEARNER → NEEDS_SUPPORT / AWAITING_RETRY → RESOLVED`

另保留 `EXPLICITLY_SKIPPED`。舊的細部狀態仍可存在於 Report evidence，沒有繼續擴大 Live Voice 的狀態機。

## 5. 多 Gate 主架構

V2.27.0 Live Brief 已移除 TURN → HEARING → TARGET → LANGUAGE → RETRY → ADVANCE 作為六段主要控制流程，改為單一問題：`CAN THE CURRENT WORD BE RESOLVED NOW?`。Report 與 Server 仍保留細部證據驗證。

## 6. targetUsageCorrect

`evaluateTargetUsage()` 先確認可靠 Learner target evidence，再回傳 `true | false | null`：

- `null`：尚未可靠產出 target。
- `true`：target 已產出且用法可接受。
- `false`：target 已產出但語意／用法錯誤。

Live Coach 依完整語意判斷一般用法；Server 要求 Report 明確提供 `true`，並會獨立攔截已定義的錯誤用法（包含 `ancestor = father`）。未提供、為 `false` 或命中錯誤規則都不能 RESOLVED；保存時使用 Server 正規化後的值。

## 7. ancestor regression

`My ancestor is my father` 會得到：

- `targetProducedIndependently=true`
- `targetUsageCorrect=false`
- `AWAITING_RETRY`
- `queueAdvance=false`

若 Coach 仍標成完成，Report 會加入 `target_usage_missed`。指定測試 PASS。

## 8. Slow formulation

`learnerFinished=false` 時回傳空的 `coachSpeech`，`My niece is...` 與 `a student and...` 兩段停頓都不會觸發評估或前進。指定測試 PASS。

## 9. Correction → Retry Lock

Target Usage 或重要語言錯誤都進入 `AWAITING_RETRY`。`Okay`、`Yeah`、`Thank you` 不算 Retry；錯誤 Retry 會保持目前單字並要求再試一次。

## 10. 保留原本有效 target evidence

若原始完整回答已可靠產出 target 且 `targetUsageCorrect=true`，而訂正只處理局部語言問題，Retry 可只重說修正片段。Server 保留原回答的 target evidence。若 target 缺漏或用法錯誤，Retry 必須含正確 target。

## 11. ASR unclear

重要語音不清楚時只做一次 clarification，然後停止等待。Server 不接受 semantic guess，也不會把語音辨識問題記成 Learner 錯誤。

## 12. Grammar Coverage

Required Coverage 仍只有 Vocabulary。Grammar／Know-how 只作為 coaching context，並在 Vocabulary 自然產出中訂正。

## 13. Vocabulary Audit

`fullVocabularyCoverageAudit()` 檢查所有 Vocabulary evidence、剩餘 Coverage 與 correction lock。若 `descendant` 未完成，`completionAuditResponse()` 會回到該單字，Final Challenge 保持封鎖。

## 14. Final Challenge Retry Lock

Final Challenge 仍要求 2–3 個相連句子並使用 2–3 個已練單字。任何重要訂正都必須有後續 Learner Retry；Coach correction 不算 Learner evidence。

## 15. Report schema 新欄位

Vocabulary coverage evidence 新增 `targetUsageCorrect`。Speaking correction template 新增 `correctionScope` 與 `intentClarified`，用來區分 Target Usage／Language 訂正與避免未確認就改變 Learner 意思。

## 16. coachExecutionIssues

已加入 `target_usage_missed`。此項屬於 Coach execution issue，不會轉成 Learner weakness。

## 17. 12 個 regression tests

12 / 12 PASS：clean success、ancestor 用法錯誤、article error、slow formulation、unclear audio、target missing、self-correction、保留 target evidence、Retry required、Final Challenge 句數、Final Challenge correction、Vocabulary Audit。

## 18. 4 個 critical micro-tests

4 / 4 PASS：

- A `My niece is very kind girl.` → Correction + Retry。
- B `My ancestor is my father.` → Target Usage correction + Retry。
- C 多段停頓 → 零 Coach speech。
- D 錯誤 Retry → 留在目前單字並再次 Retry。

## 19. Build

`npm run build` PASS。單檔 HTML JavaScript syntax check PASS，`public/index.html` 與 Supabase Function 共用模組已同步。

## 20. Deploy

本次尚未推送 GitHub 或更新 Vercel。這次要求是版本更新與可下載初版，沒有包含新的公開部署授權。

## 21. V2.27.0 Speaking Brief

網站的 Speaking 頁會依目前教材、Session ID、Coverage IDs 與剩餘進度即時生成可匯入 Report 的正式 Brief。另附 `V2.27.0-Speaking-Brief-Voice-Acceptance.md`，可先執行四個 Critical tests，再進行完整 Voice 驗收。
