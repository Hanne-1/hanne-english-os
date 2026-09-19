# Hanne's English OS Speaking V2.25.4 — Clean Rebuild

本版從實際 V2.25.3 穩定提交 `79482eb` 重建，保留 Current Item Lock、Coverage Queue、Voice Start、Hearing Confirmation、Correction Retry 與 Final Challenge gate。

## 本次最小修正

- Speaking Brief 分為 `SPEAKING CONTROLLER`、`COACHING RULES` 與最末端隔離的 `REPORT GENERATION ONLY`。
- Voice 進入後直接開始，用短而自然的問題；學習者說不懂時簡化同一題。
- 停頓、找字與自我修正不算回答結束；Coach 不搶答、不提前訂正。
- 聽辨不清時先確認，不用語意猜測補寫轉錄。
- Vocabulary 必須由學習者實際產出 target；Coach 提供答案後仍需新的獨立回答。
- 重要錯誤完成 Retry 或明確拒絕後才可前進；相同原句與建議句不建立錯誤紀錄。
- `Next` 與確認繼續的 `Yes` 只代表進入下一題，不代表結束。
- Grammar 逐一使用伺服器 `expectedAnswer` 驗證，三個 Grammar Coverage ID 互相獨立。
- Final Challenge 只在 Required Coverage、Correction Lock 與證據檢查全部通過後開放。

## Report 2.25.4

保留 `queuePosition`、`attemptSequence`、`runtimeFinalState`、`evidenceValid`、`correctionLock`、`coachExecutionIssues`，並維持 `accuracy: correct | incorrect | not_tested | null`。未提問項目固定保留 `not_tested`、`attemptSequence: null` 與 `evidenceValid: false`。

## 驗證

新增 10 個 clean rebuild checkpoints，並與原 Coverage、Current Item Lock、Runtime Integrity、UI 回歸測試一起執行。

## Targeted Acceptance Fix

- Target Gate 與 Correction Gate 分離；target 出現後仍需檢查重要句型錯誤。
- Runtime 可偵測本次真人測試確認的 determiner、noun phrase、ancestor past tense、market article/preposition 與 plural 錯誤。
- Retry 需完整、可靠，而且修正後仍需包含 Vocabulary target；Grammar Retry 必須符合伺服器 expectedAnswer。
- 新增可執行的 Current Item transition：`CORRECTION_REQUIRED → AWAITING_RETRY → RESOLVED`。
- Speaking Brief 明確禁止把 recast、praise 或 Coach model 當成 Retry，並縮減 Review Context，降低 Voice 執行規則被大量資料淹沒的風險。
- 新增 10 個 targeted runtime acceptance tests，涵蓋 niece、ancestor、Retry pause、sibling、Vocabulary → Grammar、三個獨立 Grammar、錯誤 Grammar 答案、不可跳過 Grammar 與 Final Challenge gate。
