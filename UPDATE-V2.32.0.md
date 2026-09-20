# Hanne's English OS Speaking V2.32.0

V2.32.0 以 V2.31.3 為穩定基礎，將 Live Voice 的判斷統一為一個可驗證的八 Gate Controller。這次沒有移除 Vocabulary Coverage、Hearing Lock、Same-task Target Evidence、完整回答掃描、完整句 Correction／Retry、Vocabulary Audit、Final Challenge、Cloud Sync、Review 或舊版 Report 相容層。

## 唯一決策順序

每次 Coach 回應前固定依序判斷：

1. `FINISHED?`
2. `HEARD?`
3. `TARGET?`
4. `MEANING?`
5. `GRAMMAR?`
6. `RETRY?`
7. `RESOLVE?`
8. `NEXT?`

只要前面的 Gate 未通過，後面的動作就不合法。停頓、完整第一句、已出現 Target 或發現錯誤都不代表 Learner 已說完；不確定時 Coach 必須保持安靜。聽辨不可靠時只能澄清，不能用課程內容、歷史答案或語意合理性補出 Learner 沒有清楚說出的字。

## Correction 與 Retry

回答完整結束且 Hearing、Target、Meaning Gate 通過後，Coach 才能掃描整個回答。Correction 使用所有受影響的完整錯句，排除原本正確的句子，並以最小幅度保留 Learner 的人物、關係、事實、動作、意見與情緒強度。

Correction 開始前，狀態必須先切換成 `RETRY`，並設定 `retryPending=true`。`Okay`、`Yes`、理解表示、片段、未說完或聽不清的 Retry 都不能解除鎖定。若 Coach 已訂正原句，之後不能再把原句說成完全正確。

## Report 與伺服器驗證

每筆 Vocabulary evidence 新增或明確要求：

- `hearingReliable`
- `importantLanguageErrorsResolved`
- `retryPending`

Final Challenge 明確記錄：

- `finalChallengeAttempted`
- `finalTurnCompletionReliable`
- `finalHearingReliable`
- `finalSentenceCount`
- `finalIndependentTargetCount`
- `finalTargetUsageAcceptable`
- `finalCompleteAnswerScanned`
- `finalImportantErrorsResolved`
- `finalRetryPending`

伺服器會依實際 utterance、聽辨、Correction 與 Retry 證據重算以上欄位。欄位和證據不一致時，該項不能完成。Vocabulary 全部完成後仍須先通過 Vocabulary Audit，再完成 Final Challenge；Final 未通過時 Session 不會完成。

V2.32.0 新增可辨識的 Coach execution issues：

- `false_acceptance`
- `unclear_retry_accepted`
- `meaning_reconstructed_without_confirmation`
- `premature_final`
- `final_challenge_skipped`

這些問題只記為 Coach execution issue，不會轉成 Learner weakness。

## 驗證結果

- JavaScript syntax/build：通過
- 核心自動測試：289/289 通過
- UI 與資料相容測試：61/61 通過
- V2.32.0 專屬測試：13/13 通過，其中涵蓋 11 個指定 Voice 情境
- Live Brief：1,200 words 以下
- 單檔 HTML、前端與 server module：由同一份 source 同步建置

真人 Voice 驗收與公開部署不包含在本次本機版本製作中。
