# Hanne's English OS Speaking V2.25.5 — Vocabulary-only Required Coverage

## Required Coverage

- 新 Speaking Session 只從 Main／Extended Vocabulary 建立 Required Coverage。
- Grammar 保留在教材、Learning Session、GPT Check、Lesson Progress 與 Grammar Mastery，不再進入 Speaking queue。
- 家庭成員課的 Required Coverage 從 5 Vocabulary + 3 Grammar 改為 5 Vocabulary。
- 總數由當次 Vocabulary inventory 動態計算，未硬編碼為 5。
- V2.25.4 與更舊的 Report schema 仍可依原本 inventory 規則解析。

## Vocabulary Runtime

- 每個 Vocabulary 依序經過 Hearing、Target Production、Important Error、Correction／Retry 三層驗證。
- Target 出現在 Coach 問題、提示或示範中，不算 Learner evidence。
- 單字產出正確但有重要語言錯誤時，Coverage 保持鎖定。
- Correction 後必須取得完整、可靠、由 Learner 說出的 Retry；Coach recast 不算 Retry。
- `Next`、`Okay`、`Yeah` 只表示繼續，不會跳過未完成項目。

## False Correction

- Correction 先保留實際原句，並比較 Original 與 Better。
- 沒有實際差異的 Correction 會被撤回，只記為 `coachExecutionIssue: false_correction`。
- False Correction 不會建立 learner weakness、correction record 或 recurring error。

## Audit and Completion

- 最後一個 Vocabulary 後執行 `fullVocabularyCoverageAudit()`。
- 只有全部 Vocabulary 已完成、沒有 Correction Lock、證據有效時，才允許 Final Challenge。
- Final Challenge 使用 2–3 個適合的 Vocabulary，重要錯誤仍需 Correction → Learner Retry → Final Audit。
- Report 的 `coverageChecks` 只包含 Vocabulary Required Coverage；不再補三筆 Grammar `not_tested`。

## Compatibility

- Cloud Sync、Review、Speaking Report、計時與舊版 Report 解析維持相容。
- Review Context 仍可影響題目選擇與難度，但不增加 Required Coverage。
