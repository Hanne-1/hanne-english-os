# Hanne's English OS V2.28.0

## 改版目標

V2.28.0 保留 V2.27.1 的 Curriculum、Vocabulary Selection、Lesson Progress、Vocabulary Coverage、Review Context、Report 架構、Final Challenge 與 English OS → Speaking Brief → ChatGPT Project Voice 流程。

本版只簡化 Live Voice 執行方式：

> LISTEN → FINISHED? → TARGET? → CORRECT? → RETRY? → NEXT

Voice Coach 不需要在對話中操作複雜的狀態名稱。詳細 evidence、runtime state、correction、Retry 與 Final Challenge 欄位仍由 Speaking Report 保存並交給 English OS 驗證。

## 主要調整

- 判斷 Learner 是否講完整段意思成為所有評估前的絕對優先級。
- 一般停頓、找字、自我修正、未完子句與省略號一律採強 WAIT，Coach speech 必須為空。
- 只在整段答案完成後依序檢查 Hearing、實際 Target、Target Usage、重要英文錯誤、Retry 與 Next。
- Target Evidence 只接受可靠的 Learner 原句；題目、Coach 提示、語意推測與舊 Session 不算。
- 正確句子不產生 false correction，例如 quiet 不會被改成 kind。
- 重要訂正維持固定格式並以 `Now try it again.` 結束；沒有成功 Retry 就沒有 Next。
- 原答案已有正確 Target Evidence 時，局部語言 Retry 不強迫再次重複 Target。
- Final Challenge 仍要求 2–3 個相連句子及至少 2 個練過的 Vocabulary，並使用同一套先聽完再評估的流程。
- Session 未完成時禁止 Coach 主動 Wrap-up。

## Report 與相容性

- `schemaVersion` 更新為 `2.28.0`。
- `coverageId`、`sourceVersion`、`coverageChecks.status`、Correction、Retry、Final Challenge 與 Coach execution issues 保持既有詳細架構。
- V2.27.1 與更舊報告依各自 schema class 保持可解析。
- Grammar 與 Know-how 仍是教學／Review Context，不新增 Required Speaking Coverage。
- Cloud Sync、Review、Correction、計時與其他頁面流程未重構。

## 驗證門檻

規格指定的 12 個回歸情境均已轉為 deterministic tests。發行前另執行完整舊版回歸、UI 流程、JavaScript syntax、單檔 build 及 ZIP integrity 驗證。
