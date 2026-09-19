# Hanne's English OS V2.25.3

這版保留 V2.25.2 的動態 Required Coverage、Voice Start、續練、Correction、Review Context 與伺服器驗證，新增 Current Required Item 的 Runtime State Enforcement。

- 每次只能有一個 Current Required Item；只有 `RESOLVED`、`RESOLVED_WITH_DECLINED_CORRECTION` 或 `EXPLICITLY_SKIPPED` 能解鎖前進。
- Vocabulary 必須由 Learner 實際說出 target；理解意思、Coach 提供答案或題目中出現 target 都不算。
- 重要錯誤進入 Correction Lock，完成 My sentence / Better / Why / Retry 或明確拒絕後才可前進。
- Grammar 由 queue 自動接續；沒有實際提問與 Learner 回答時維持 `not_tested`。
- `queuePosition` 與 `attemptSequence` 分開；未問項目的 `attemptSequence` 為 `null`。
- Report 新增 `runtimeQueue`、`currentItemStateHistory`、`finalItemState` 與 `coachExecutionIssues`。
- Final Challenge 只在 remainingCoverage=0、currentCoverageId=null 且 Pre-Final Audit 通過時開放。
