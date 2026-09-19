# Hanne's English OS Speaking V2.25.6 — Vocabulary Stability

## Live Speaking Controller

- Speaking Brief 明確分為「Live Speaking Controller」與「Report Generation」，語音練習期間不提前產生報告。
- 全程以英文提問；開始練習後第一題固定為 `Do you have a niece? Tell me one thing about her.`。
- 每個 Vocabulary 依照 Ask → Wait → Hearing → Target → Correction → Learner Retry → Resolve → Next 執行。
- Learner 還在思考、停頓或自我修正時不換題；聽不清楚時先確認原話，不猜測意思。
- `Next`、`Okay`、Coach 重述或 Coach 示範都不會跳過尚未完成的 Vocabulary。

## Correction and Retry Stability

- 一次完整回答中的所有重要錯誤會一起辨識，Coach 以一段簡潔回饋處理，再等待 Learner 完整 Retry。
- Correction Lock 只有在 Learner 親自說出可接受的 Retry 後才解除。
- 錯誤 Retry 會停留在同一題；Coach 不會把 recast、acknowledgement 或自己提供的答案記成 Learner Retry。
- Correction Report 新增 `errorSpans`，每個聲稱的錯誤都必須能對應到原句中的實際文字；不存在的錯誤會記為 `false_correction`，不算 Learner weakness。

## Vocabulary Coverage Audit

- 全站 Speaking Required Coverage 仍只取 Vocabulary，數量由每課 Vocabulary inventory 動態決定。
- 家庭成員課依序驗證 niece、ancestor、descendant、sibling、spouse；其他課程可為 5、8、4 或其他實際單字數量。
- Final Challenge 前必須通過完整 Vocabulary audit：所有單字都已實際作答、聽辨已確認、Target 已由 Learner 產出、Correction Lock 已解除、Evidence 有效。
- Final Challenge 只使用已完成的 Vocabulary，不重新加入 Grammar coverage。

## Coach Execution Issues

- Coach 執行問題與 Learner weakness 分開記錄。
- V2.25.6 支援 `voice_language_violation`、`correction_retry_bypassed`、`incorrect_hearing_assumption`、`premature_session_completion`、`coverage_audit_failure` 與既有 issue 類型。
- Coach 執行錯誤不會污染已有效取得的 Learner Vocabulary evidence。

## Compatibility

- Cloud Sync、Review、Speaking Report、計時、舊版 Report 解析與既有 Vocabulary move 修正維持相容。
- V2.25.6 Session 會阻擋舊版 client 覆寫，避免新 runtime state 被降級。
