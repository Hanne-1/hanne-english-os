# Hanne's English OS Speaking V2.31.3

V2.31.3 以 V2.31.2 為穩定基礎，修正 Voice Coach 提早把停頓判為回答結束，以及只訂正片段或漏掉後段錯誤的問題。Vocabulary Coverage IDs、Session Identity、Current Word Lock、Hearing Lock、Same-task Target Evidence、Usage / Meaning Coaching、Final Challenge、Cloud Sync 與舊版 Report 相容邏輯均保留。

## 先等完整回答，再掃描全部句子

Coach 只有在有正向證據確認整個回答已完成後才能接手。停頓、完整第一句、已聽到 Target 或已發現錯誤，都不能單獨結束 Learner turn；如果仍可能繼續，Coach 必須完全安靜。

回答完成且 Hearing 可靠後，Coach 必須先掃描全部句子，不能看到第一個錯誤就開始訂正，也不能漏掉較後面的錯誤。Learner 在同一回合已自行修好的形式，不會再次列為錯誤。

## 訂正與 Retry 使用相同的完整句子範圍

訂正單位是「含錯誤的完整句子」，不是片段，也不是無條件重說整段回答：

```text
My sentence: <含錯誤的完整句子，或多個含錯誤的完整句子>
Better: <相同句子範圍的必要修正版>
Why: <涵蓋該範圍所有重要錯誤的簡短原因>
Now try it again.
```

若三句中只有第二句錯，Correction 與 Retry 都只包含第二句。若第二、三句都有錯，兩句都要納入，不能修第二句後漏掉第三句。正確句子不必重說。自然等義的 Retry 可以通過，不要求逐字背誦。

Final Challenge 仍以原始完整回答驗證 2–3 句與至少兩個 Vocabulary Targets；若只有其中一句需要修正，Retry 只處理該句，原始完整回答的句數與 Target 證據不會因此遺失。

## Report 與 Server Validation

每筆相關 Vocabulary evidence 使用：

- `turnCompletionReliable`
- `completeAnswerScanned`
- `selfCorrectionDetected`
- `correctionScope: none | complete_sentence | multiple_complete_sentences`
- `retryScope: none | complete_sentence | multiple_complete_sentences`

新增的 Coach execution issues：

- `pause_misread_as_turn_end`
- `sentence_end_misread_as_turn_end`
- `correction_started_before_answer_complete`
- `complete_answer_not_scanned`
- `fragment_only_correction`
- `later_sentence_error_missed`
- `unnecessary_full_answer_retry`
- `self_correction_ignored`
- `correction_scope_mismatch`

Server 會驗證完整回答確實結束並完成掃描、Correction 是否包含所有實際出錯的完整句子、是否排除無關正確句，以及 Retry scope 是否與 Correction scope 一致。這些 Coach execution issues 不會轉成 Learner weakness。

## 驗證

- JavaScript syntax/build：通過
- 核心自動測試：276/276 通過
- UI 與資料相容測試：61/61 通過
- V2.31.3 專屬驗收：14/14 通過
- Live Brief：低於 1,200 words
- Server module 與單檔 HTML：由同一份 source 同步建置

真人 Voice 驗收與公開部署不包含在本次本機版本製作中。
