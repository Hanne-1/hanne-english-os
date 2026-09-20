# Hanne's English OS Speaking V2.31.0

V2.31.0 直接延續 V2.30.0，保留 Session Identity、Vocabulary Coverage、CURRENT WORD、PRACTICE / RETRY / FINAL、Target Source Lock、Hearing Uncertainty Lock、Review Context、Vocabulary Audit、Final Challenge、Report Contract、Server Validation、Coverage IDs 與 `sourceVersion`。

本版集中修正三個 Live Voice 問題：Learner 尚未講完時 Coach 插話、Correction 只示範片段、Correction 後未真正鎖定 Retry。

## Turn Completion Lock

Coach 只有在取得完整回答的正向證據後才能接手。停頓、找字、自我修正、第一句講完後開始第二句，以及 `He was...`、`My niece is a student and...`、`I have one siblings and...` 等未完結語句都維持 Learner turn，Assistant 必須輸出空白。規則在 PRACTICE、RETRY 與 FINAL 都適用。

Report 可附上：

```json
"turnCompletionEvidence": {
  "positiveCompletionDetected": true,
  "completionBasis": "complete_thought"
}
```

伺服器會依 `learnerFinished` 與實際 utterance 重新推導，不直接相信回報值。

## Complete-Sentence Correction

一個 correction 代表一個主要教學重點或相連 error cluster，輸出的 `My sentence` 與 `Better` 必須保留完整相關句子。填充詞可保留在原句並從 Better 移除；清楚放棄的自我修正不列為錯誤。

V2.31.0 的指定範例會完整輸出：

```text
My sentence:
My ancestor was a businessman and he is, uh, sell the pork in the market.

Better:
My ancestor was a businessman, and he sold pork in the market.

Why:
You're talking about the past, so use “was” and “sold.” We usually say “sell pork” without “the” when talking about pork in general.

Now try it again.
```

伺服器會拒絕只回傳 `He sold pork in the market.` 的片段模型，並記錄 `incomplete_correction_model`。

## Hard Retry Lock

Correction 產生前即原子化設定：

- `runtimeMode = RETRY`
- `retryPending = true`
- `currentWordLocked = true`
- `nextAllowed = false`

Correction 必須以 `Now try it again.` 結束。`Yes`、`Okay`、Coach 自己念 Better、片段 Retry，以及仍含主要錯誤的 Retry 都不能解除鎖定。只有完整、可靠、保留原意且修正主要問題的 Learner Retry 才能回到 PRACTICE / FINAL 並允許 Next。

## 驗證

- JavaScript syntax/build：通過
- 核心自動測試：245/245 通過
- UI/資料相容測試：60/60 通過
- V2.31.0 Micro-tests A–I：全部通過
- Live Brief：低於 1,200 words
- 既有 Cloud Sync 程式與 Supabase server module 已保留並同步到建置檔

自動測試不等同真人 Voice 驗收。公開部署與真人語音測試未在此版本製作步驟中執行。
