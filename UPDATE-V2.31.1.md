# Hanne's English OS Speaking V2.31.1

V2.31.1 是基於 V2.31.0 的最小 Runtime Patch。保留原本的 Turn Ownership、PRACTICE / RETRY / FINAL、Retry Lock、Current Word Lock、Vocabulary Audit、Final Challenge、Report Contract、Server Validation 與 Review Context。

## Same-task Target Evidence

Learner 在同一個 CURRENT WORD 任務中自行說出 Target 後，這份證據會保留到後續追問與 Retry。後續回答可以使用代名詞，不必為了讓系統辨識而重複單字。

例如：

```text
My niece is a student.
She is five years old. She is a very beautiful girl.
```

第二段仍保留 `niece` 的 Target evidence。只有可靠、實際由 Learner 說出、屬於同一個 active task 的內容能進入 `targetEvidenceHistory`。Coach 提供的答案、其他題目、舊 Session 或不可靠轉錄都不算。

## Listening 與必要訂正

Coach 先確認實際聽到的英文。聽不清楚時先做 Hearing clarification，不得依 Target、上下文或預期答案補寫句子。

正確自然的句子直接接受，例如：

```text
My niece is a student, and she is a very beautiful girl.
```

若 Coach 仍提出沒有必要的改寫，Server Validation 會取消該 correction，並記錄 `unnecessary_correction`；它不會成為 Learner weakness。

## Grammar Correction 與 Usage Clarification 分流

Grammar error 仍使用完整句子的 `My sentence / Better / Why / Retry`：

```text
If I get married, I have a spouse.
→ If I get married, I will have a spouse.

My ancestor was a businessman and he is sold pork in the market.
→ My ancestor was a businessman, and he sold pork in the market.
```

若文法可以成立，但人物關係或單字方向需要確認，Coach 會使用 `usage_clarification`，留在同一個 Current Word 等 Learner 說清楚，不會誤標成 Grammar，也不會自動進入 Retry。這些規則涵蓋 `niece`、`ancestor`、`descendant`、`sibling` 與 `spouse`。

Report 新增或擴充：

- `targetEvidenceHistory`
- `feedbackType: grammar_correction | usage_clarification | hearing_clarification | none`
- `coachExecutionIssues: unnecessary_correction`
- `remainingReason: usage_clarification_needed`

## 驗證

- JavaScript syntax/build：通過
- 核心自動測試：254/254 通過
- UI/資料相容測試：60/60 通過
- V2.31.1 專屬自動驗收：9/9 通過
- Live Brief：低於 1,200 words
- 既有 Cloud Sync 程式與 Supabase server module 已保留並同步到建置檔

自動測試不等同真人 Voice 驗收。公開部署與真人語音測試未在此版本製作步驟中執行。
