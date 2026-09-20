# Hanne's English OS V2.27.1

## 改版目標

V2.27.1 保留 V2.27.0 的 Vocabulary Coverage、Curriculum、Cloud Sync、Review、Speaking Report 與 Final Challenge 結構，修正 Voice Coach 在規則已存在時仍可能插話、跳過 Retry、誤判 Target Evidence 或提早收尾的問題。

核心執行順序固定為：

1. 更新目前可驗證的 Learner 狀態。
2. 選出唯一合法的 `NEXT_COACH_ACTION`。
3. 只產生該 Action 的語言。

## Pre-Response Action Lock

合法 Action 固定為：

- `WAIT`
- `CLARIFY_HEARING`
- `ELICIT_TARGET`
- `CORRECT_AND_REQUEST_RETRY`
- `REQUEST_RETRY`
- `FOLLOW_UP_CURRENT_WORD`
- `ADVANCE`
- `START_FINAL_CHALLENGE`
- `CONTINUE_FINAL_CHALLENGE`
- `COMPLETE_SESSION`

每個 Coach turn 只能選一項。系統會檢查回報中的 `coachTurnAction` 與當時狀態是否一致，也會拒絕把 Correction、Next、Praise 或 Wrap-up 混在同一個 turn。

## 本版修正

- Learner 尚未講完時，`WAIT` 必須是空白輸出，不能用鼓勵語打斷組句。
- Correction 必須以 `Now try it again.` 結尾；Retry 未完成或仍錯誤時，Current Word 保持鎖定。
- `Okay`、`Yeah`、`Thank you` 不算 Retry，也不能觸發 Next。
- Target Evidence 只接受可靠的當次 Learner 原句；語意推測、Coach 提供的字、舊 Session 都不能替代。
- Target 出現但用法錯誤時仍需 Correction + Retry，例如 `My ancestor is my father.`。
- 增補本次真人測試出現的 niece、sibling、spouse 重要錯誤辨識。
- Praise 只能在 Current Word 已 `RESOLVED` 後出現。
- Final Challenge 也套用相同行動鎖；至少 2 個相連句子及 2 個不同 Target，且所有 Completion Gate 通過後才可結束。
- Wrap-up 前會檢查所有 Vocabulary、Skip、Vocabulary Audit、Final Challenge 與 Retry Lock。

## 相容性

- `coverageId`、`sourceVersion` 與公開 `coverageChecks.status` 契約維持不變。
- 舊版 Speaking Reports 仍依原本 schema class 解析。
- Grammar、Know-how 與舊訂正仍只作為教學／Review Context，不新增 Required Speaking Coverage。
- Cloud Sync、Review、Correction、計時與既有頁面資料流程未重構。

## 驗證

- V2.27.1 指定 Micro Tests A–H：8/8 通過。
- 新增 Pre-Response Action、語言輸出、已知錯誤與伺服器回報一致性測試。
- 完整測試、JavaScript syntax、單檔 build 與 ZIP byte-integrity 會在發行封裝時一併執行。
