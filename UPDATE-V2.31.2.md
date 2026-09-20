# Hanne's English OS Speaking V2.31.2

V2.31.2 基於 V2.31.1 做最小修正，保留 Turn Ownership、PRACTICE / RETRY / FINAL、Current Word Lock、Same-task Target Evidence、Retry Lock、Usage / Meaning Coaching、Vocabulary Audit、Final Challenge、Report Contract、Server Validation 與 Review Context。

## 移除 Live answer priming

Live Speaking Brief 不再放入 ancestor、spouse、sibling、descendant 或 niece 的固定完整訂正答案。歷史訂正資料仍保留在 Reporting-only Context；Live 區只收到抽象觀察提示，例如時態一致、單複數、冠詞、介系詞或關係方向。

這可避免 Coach 因舊例句或預期答案，把 Learner 當下沒有說過的故事內容帶進 Correction。

## Current utterance 是唯一訂正來源

Correction 前必須依序確認：

- `ACTUAL`：Learner 當下實際說了什麼。
- `ERROR`：真正錯誤的位置。
- `INTENT`：Learner 表達的意思。
- `BETTER`：保留原意後的英文修正。

`My sentence` 必須是目前可靠 utterance 的逐字片段。V2.31.2 Server Validation 會拒絕經過默默修補、改寫或從其他回合重建的原句。

## Preserve Meaning

`Better` 必須保留人物、關係、動作、意見、情緒強度與事實。若 Correction 加入舊回合的內容、交換人物、改變關係，或把強烈情緒擅自柔化，系統會拒絕該 correction，並記錄：

```json
"meaning_changed_by_correction"
```

例如文法正確的 `I hate him.` 不會被強迫改成不同強度的情緒表達。

## Reliable Hearing

Target、Meaning、Grammar、praise 或 Next 之前都必須先通過 Hearing。若重要字詞聽不清楚，Coach 只能簡短確認或要求重說，然後停止並等待。Likely intended speech 不會成為 evidence。

## Final Challenge 使用相同教學引擎

Final 仍遵守 Turn Ownership → Hearing → Meaning → Language → Correction → Retry。Learner 即使已使用兩個 Vocabulary，只要任一句仍有重要錯誤，Final 就不能通過。

Server 會重新檢查 Final utterance：

- 可靠 hearing
- 2–3 個 connected sentences
- 至少 2 個獨立產出的 practiced targets
- Target usage 可接受
- important language errors 已解決
- Retry lock 已清除

若 Final 需要訂正，必須完成完整 Correction 與可靠 Retry；完成前不得 praise 或結束 Session。Learner 不理解任務時，Coach 要改用具體、簡單的說法，不重複抽象指令，也不直接提供完整答案。

## 驗證

- JavaScript syntax/build：通過
- 核心自動測試：262/262 通過
- UI/資料相容測試：61/61 通過
- V2.31.2 專屬自動驗收：8/8 通過
- Live Brief：低於 1,200 words
- 歷史答案只保留於 Reporting-only Context 的 UI 驗收：通過
- Cloud Sync 與 Supabase server module：保留並同步到建置檔

自動測試不等同真人 Voice 驗收。公開部署與真人語音測試未在此版本製作步驟中執行。
