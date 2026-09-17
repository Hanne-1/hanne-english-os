# English OS Speaking V2.25.0 更新與驗收

## 1. 修改檔案

| 檔案 | 內容 |
|---|---|
| `src/speaking-queue.js` | Required Coverage、證據判定、完成條件、V2.24 相容與 V2.25 Report 驗證。 |
| `src/speaking-client.js` | Speaking Brief、分組進度、自然訂正流程、續練與本次口說 Corrections 顯示。 |
| `src/speaking-service.mjs` | 伺服器重建來源、版本協調、Session 保存與併發驗證。 |
| `index.html` | V2.25 單檔網站與新版 Speaking Report 範本。 |
| `public/index.html` | Vercel 部署用的建置結果。 |
| `supabase/functions/speaking-queue/*` | Edge Function 使用的同步後共用模組。 |
| `tests/speaking-queue.test.mjs` | 36 項 Coverage、Report、續練、版本與伺服器測試。 |
| `tests/ui.cjs` | 39 項既有資料與新版 Speaking UI 回歸測試。 |

## 2. Required Coverage：15 → 8

V2.25 的 Required Coverage 只包含本課 Vocabulary 與 Grammar。以 2-1 家庭成員為例：

- Vocabulary：5 項
- Grammar：3 項
- Required Coverage：共 8 項

舊版加入的 4 筆 production correction 與 3 筆 spelling correction 不再增加 Required Coverage，因此原本的 15 項改為 8 項。每一課仍依實際教材內容計數，並非所有課都固定為 8 項。

## 3. Review Context / Coaching Priority

過去的 production corrections、spelling errors、speaking weaknesses、`reviewItems` 與 `learningFocus` 會送進 Brief，供 Coach 在自然對話中留意。它們不會建立額外必答題，也不會阻止本次 Session 完成。

同一個舊問題若在本次 Vocabulary 或 Grammar 對話中自然再次出現，Coach 可以訂正並記錄。只出現一次的新錯誤不會直接被標記為 recurring。

## 4. 自然訂正循環

每題流程固定為：

1. Coach 自然提問。
2. 等 Learner 完整說完；停頓、找字、自我修正不代表作答結束。
3. 確認 Learner 是否真的說出 Vocabulary target，或真的回答 Grammar 題。
4. 完整回答後再處理重要錯誤。
5. 使用 `My sentence / Better / Why` 說明。
6. 請 Learner Retry；需要時才追加一個自然 follow-up。
7. 再進下一個 target。

讚美不能取代訂正，也不能在 Learner 還在組句時搶答或完成句子。

## 5. Vocabulary 與 Grammar 的判定

- Vocabulary：Learner 只要實際說出 target，就算已練。句子有錯時，Coverage 仍為 `PRACTICED`，並另外保存 `productionQuality=needs_review` 與 correction。
- Vocabulary target 只出現在 Coach 題目，Learner 沒有說出時，不算已練。
- Grammar：Learner 有作出明確回答，即使答錯仍算已練；另存 `accuracy=incorrect`、`needsReview=true`，再教學與 Retry。
- `Okay`、`Yeah`、沉默、填充詞或無關回答不算 Grammar 作答。

Coverage 只表示實際練過；品質與正確性由 `productionQuality`、`accuracy`、`needsReview` 和 `speakingCorrections` 個別保存。

## 6. Speaking Corrections 保存

本次口說新發生的重要錯誤保存在 `speakingCorrections`：

- `target`（可選）
- `coverageId`（可選）
- `original`
- `better`
- `reason`
- `learnerRetried`
- `retryUtterance`（Retry 時必填）

Speaking 頁會在 Vocabulary / Grammar 進度之外，獨立顯示「Corrections from this session」。Correction 不會建立新的 Required Coverage ID。

## 7. Final Challenge 與完成條件

Final Challenge 只能在 Vocabulary 與 Grammar 全部練完後開始，選 2–3 個適合的 targets，要求 2–3 句連貫回答。Coach 必須等待 Learner 完整說完並提供回饋。

V2.25 完成條件為：

- Vocabulary 全部 `PRACTICED`
- Grammar 全部 `PRACTICED`
- Final Challenge `learnerFinished=true`
- Final Challenge `feedbackGiven=true`
- 有可靠的實際提問與 Learner utterance，且順序晚於 Required Coverage

時間只記錄，不是限制。18、25 或更多分鐘都能照實保存。

## 8. Continuation

中斷或部分完成時，伺服器只保存有可靠證據的項目。下一次 Brief 只放仍未練的 Vocabulary / Grammar，沿用同一個 logical Speaking Session，不重做已完成項目，也不把 correction/spelling 重新塞進 queue。

## 9. 伺服器驗證與版本相容

網站送出的 queue 不是可信來源。Edge Function 會從已保存的教材、作答與 GPT Report 重建內容，核對 `coverageId`、`sourceVersion`、attempt、證據、Final Challenge 順序與完成條件。

- V2.25 Report 使用簡化的 8 項架構。
- V2.24 Report 保留舊 15-item parser 與舊完成規則。
- 部署轉換期間，舊網站沒有傳 `schemaVersion` 時仍使用 V2.24 合約。
- 已建立 V2.25 Session 後，舊網站可以讀取狀態，但不能用舊合約修改它；畫面會要求重新載入最新版。
- Report schema 必須與產生它的 attempt 相同，避免跨版本混用。

## 10. 資料庫 migration

V2.25 不需要新增 migration。既有 `english_os_speaking_sessions.state` 與 `source_fingerprint` 已能保存新 queue、quality、corrections 與版本欄位；V2.24 Report 也會繼續保留在同一份 Session JSONB 中。

## 11. 自動測試

執行：

```bash
npm run build
npm test
```

結果：

- JavaScript syntax check：通過
- Speaking queue / server：36 / 36 通過
- UI / Correction / Review / timer / legacy compatibility：39 / 39 通過
- 合計：75 / 75 通過

涵蓋需求中的 A–H 驗收情境，另測試不可靠轉錄、未說完、model-only、Final Challenge 順序、部分保存、重複匯入、併發 prepare/report、教材更新、V2.24 相容與 V2.25 版本轉換。

## 12. 真人語音手動驗收

1. 在正式網站選擇 2-1 家庭成員，按「準備並複製口說內容」。確認畫面顯示 Vocabulary 5、Grammar 3、Coverage 0/8。
2. 貼到 ChatGPT Project 並開語音模式。故意在 `niece` 句子中漏掉 `is`；確認 Coach 等完整回答後才用 My sentence / Better / Why 訂正並要求 Retry，且 `niece` 仍算已練。
3. 讓題目提到 `sibling`，但回答只說 `I have a sister.`；確認 `sibling` 留在 remaining queue。
4. Grammar 題先回答錯誤的 capital/lowercase；確認 Coach 教學與 Retry，Report 為 practiced + incorrect + needsReview。
5. 另一題只回 `Okay`；確認該 Grammar 仍未練，Coach 重新提問。
6. 刻意停頓與找字；確認 Coach 不打斷、不代答、不因 8–12 分鐘收尾。
7. 中途停止並貼回 partial Report；確認網站保存有效項目，下一份 Brief 只列剩餘 Vocabulary / Grammar。
8. 補齊所有 Required Coverage 後，確認才進 Final Challenge，且只自然整合 2–3 個 targets。
9. 貼回完整 Report；確認 Vocabulary、Grammar 分組完成，本次 corrections 獨立顯示，English OS 驗證完成。
10. 重貼同一份 Report；確認不重複增加時間、Report 或 Review signal。

