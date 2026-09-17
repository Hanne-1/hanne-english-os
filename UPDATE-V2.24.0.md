# English OS V2.24.0 更新與驗收

以 GitHub `Hanne-1/hanne-english-os` 的 V2.23.0 為基礎（commit `8f2987424c0021a0d941950738b9ad1ae0772547`）。這次將 Speaking 改為 Coverage Queue、伺服器驗證與同一場練習的續練。正常 Learning／Correction 回贴入口保留。

## 使用方式

1. 等頁首顯示 Cloud sync on，在 Speaking 選教材並準備／複製口說內容。
2. 貼到 ChatGPT Project，開啟語音模式。網站只準備內容，不錄音、不倒數。
3. 語音結束或中斷後，把同一份 Speaking Report 貼回網站。
4. 若只練了 8/15，網站保存 8 項有效證據；按「接續未完成練習」會產生剩餘 7 項的內容。
5. 完成全部項目、四階段與 Final Challenge 後，才能按「完成後開始新一輪」從頭再練。

時間只記錄，不設 8–12 分鐘上限。Learner 尚未說完、停頓找字或正在自我修正時，Coach 必須等待。訂正原則上在完整回答後進行。

## 修改檔案

| 檔案 | 用途 |
| --- | --- |
| `index.html` | V2.24 UI、Queue-first Brief、伺服器回貼入口、進度與續練；前端仍可單檔開啟，需要網路連上已部署的驗證服务。 |
| `src/speaking-queue.js` | 前後端共用的資料模型、各任務證據驗證、完成 gate、續練與版本失效規則。 |
| `src/speaking-client.js` | 準備／複製／回貼、伺服器結果快取、回報保存與 Review 整合。 |
| `src/source-context.mjs` | 從既有原始作答、GPT 訂正與 learner correction 邏輯自動抽出的來源對應函式。 |
| `src/speaking-service.mjs` | 伺服器讀取雲端來源、建立 session、revision 重試、回報驗證與儲存。 |
| `supabase/functions/speaking-queue/` | 已部署的 Edge Function 與同步產生的共用模組。 |
| `supabase/migrations/20260917000000_speaking_coverage_queue.sql` | 新增獨立口說進度表，不更動舊雲端 state 表。 |
| `scripts/build.mjs` | 同步來源至 HTML 與 Edge Function，並檢查 inline JavaScript 語法。 |
| `tests/speaking-queue.test.mjs`、`tests/ui.cjs` | 核心／伺服器／UI 流程與舊 Report 回歸測試。 |
| `package.json`、`vercel.json`、`.vercelignore`、`.gitignore` | 無第三方依賴的建置／測試命令；Vercel 建置後只發布 `public/index.html`，維護檔案不作公開網頁資源。 |

Speaking 的新規則拆成可維護模組，既有學習部分保留原架構。伺服器使用同一份驗證核心，沒有另一套不同規則的完成計算。

## 資料模型與 Queue

每個 item 保留 `coverageId`、`sourceVersion`、`kind`、`target`、`label`、`taskMode` 與 `state`。同字的 vocabulary、production correction、spelling correction 各用自己的來源 ID；沒有依 target 合併。

伺服器從已同步的教材與原始訂正資料重建 required inventory，不接受 Report 自訂 required 清單。順序為主要單字、延伸單字、逐條文法、逐筆訂正，排除教材指定不練習的項目與無法對應的舊題／未顯示題目。

每場 logical session 保存：

- `speakingSessionId`、`lessonId`、完整有序 `queue`
- `completedCoverage`、`remainingCoverage`，含每筆證據／未完成原因
- `phaseProgress`、`finalChallengeStatus`
- `activeAttempt`、已回貼的 `attempts`，以及兩種完成判定
- 資料庫 `revision`，避免不同視窗互相覆蓋進度

新一輪才歸零；歷史其他 session 的練習不自動抵免本輪。教材或訂正改變時，只有版本改變的項目失效，已完成的其他項目保留，Final Challenge 需重做。

## Report 驗證

`schemaVersion < 2.24` 保留舊 parser／validation。`>= 2.24` 必須送到 Edge Function，前端不能直接匯入為完成。

伺服器依 ID、版本、taskMode、實際題目、實際回答、learnerFinished、可靠度、是否由 Coach 示範／代答、phase 與任務順序驗證。

- **Vocabulary**：Learner 的新情境句子必須含目標字；只有 Coach 說 spouse 不算。
- **Capitalization**：三條規則各有自己的 `grammarTask` 與實際例子，回答中必須有明確大小寫選擇。自動轉錄大寫不算證據。
- **Spelling**：必須問該字如何拼，並取得 confirmed 的逐字母序列；說出 ancestor 不能代替拼字。
- **Correction transfer**：必須對應該筆 correctionId 與原問題，在新情境使用；示範後跟讀不算獨立轉用。
- 可靠但答錯的嘗試可算已練，不會因此自動成為 Mastered。Review 的能力判定仍獨立處理。

完成條件是全部當輪 required Coverage 有效、四階段 completed、Final Challenge 在 Queue 補齊之後發生，且 learnerFinished／independentProduction／feedbackGiven 都為 true、coachSuppliedAnswer 為 false。Final Challenge 還需實際題目、回答與可靠度，不能補填前面漏掉的 Coverage。

GPT 的 `completed:true` 只保存為 `gptClaimedCompleted`；真正狀態由 `osVerifiedCompleted` 決定。GPT 誤判完整完成時，仍保存有效證據並顯示未完成，不再丟掉整份練習。

缺項原因包括未問、無回答、轉錄不可靠、任務不符、只有 Coach 提及、只有示範，以及主動停止。舊版本證據另顯示版本過期說明。

語音原文仍由 GPT 回報。網站可以核對所提供的證據、來源與順序，**無法只憑 JSON 證明真實音訊確實發生，也不能即時操控 ChatGPT Voice 的發言或關閉按鈕**。

## Continuation

回贴一個 attempt 後保留同一 speakingSessionId；再次準備會建立新的 continuationAttemptId，Brief 只將 remaining items 列為待驗收 Queue，已完成 IDs 附在完成區供核對。完整教材可作背景，但不是再練全部的指令。

Warm-up 若已完成便直接接續；若所有 Coverage 已齊但缺 Final Challenge，只接續剩餘階段與 Final Challenge。重複貼相同 attempt 不會重複計時、建立 Review 或增加 Coverage；同 attempt 不同回報會提示使用新的續練 attempt。

伺服器狀態跨重新整理與不同裝置保存。本機快取只供顯示，不是完成狀態的來源。離線／服務錯誤時不會假裝驗證成功，待匯入文字留在本機，重新開頁也能恢復。

## Migration 與部署

需要一次 additive migration。這個 Supabase 專案已套用新表並部署 `speaking-queue` Function；舊表、舊資料與舊 function 保持原樣。

新表 RLS 開啟，撤銷 public／anon／authenticated 的直接存取，僅 service_role 可寫入。前端只持有原來公開的 publishable key；server key 只從 Edge 環境讀取。

延續目前 English OS 的共用個人工具模式，使用 project API key 驗證，並固定來源 device，**不是新增使用者登入或多租戶安全隔離**。不接受呼叫端自訂 device_key。Function 關閉 JWT gateway 檢查，因為 publishable key 並非 JWT；函式內明確驗證 project key。[Supabase 官方說明](https://supabase.com/docs/guides/functions/auth)

若移到另一個專案，需先套用 migration、設定對應 Cloud URL／publishable key／device，再部署 function，單純複製 HTML 不能替新專案建立後端。

## 自動與實際檢查

執行：`npm run build`、`npm test`。不需安裝第三方套件。

目前通過 **73 項**：34 項核心／伺服器測試，以及 39 項 UI／舊資料回歸。含使用者要求 A–H、三條文法分離、同字不同任務、Final 順序、重複回贴、並行寫入、版本改變、離線保留、V2.23 相容、來源答案不被 GPT 假資料覆寫與 Review 隔離。

UI 測試使用 Node VM 與模擬 DOM／storage／網路，實際執行頁面 handlers 及同一個 server service；**不是人工瀏覽器外觀或真人語音驗收**。另以比對確認 Cloud Sync、Learning／計時／Vocabulary movement、Correction teaching、Review 及 responsive CSS 區段與 V2.23 一致。

後端實際檢查：有效 key 可取得狀態；沒有 key 回 401；新資料表拒絕匿名直接存取；從實際課程建立未開始的 Queue 並重新讀取／重複準備可延續同一 attempt。沒有把模擬作答寫入你的學習紀錄。

## 手動驗收完整 15-item Session

1. 開啟 V2.24，選擇家庭成員課，準備內容。核對總數來自實際來源。若目前來源為 5 vocabulary＋3 grammar＋4 production correction＋3 spelling correction，應顯示 0/15；不是把所有課固定成 15 題。
2. 貼到 Project Voice，逐項提問。刻意在 spouse 題回答 “We watch movies together.”，確認 Coach 會繼續引導你自己用 spouse。
3. 分別做稱謂＋名字、稱謂代人名、所有格＋稱謂三種大小寫選擇；不要把 transcript 自動大寫當作回答。
4. 對 spelling 項目逐字母說出 ancestor 等字；若辨識不清先確認，不算已練。
5. 完成 8 項後主動說明要停止，要求 partial Report，回贴。應看到 8/15、剩餘 7；GPT 若錯寫完成，OS 仍未完成並保留 8 項。
6. 重新整理、按續練，核對同一 logical ID、新 attempt ID、7 個 remaining。Warm-up 已完成就不重來。
7. 剩餘 7 項完成後才進 Final Challenge。完整獨立回答、明確說完並收到整體回饋，再回贴 Report，才會成為完整完成。
8. 重貼同份 Report，不應增加時間／Report／Review；之後按新一輪才重新 0/15。
