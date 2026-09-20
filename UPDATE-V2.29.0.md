# Hanne's English OS Speaking V2.29.0 — Voice Runtime Fix

## 改版範圍

V2.29.0 直接延續 V2.28.0 的 Speaking 架構。English OS → Speaking Brief → ChatGPT Project Voice、Vocabulary Coverage、CURRENT WORD、Final Challenge、Report Contract、Server Validation、Review Context、Session identity、Vocabulary queue 與原有資料結構均保留。

本版只強化 Live Voice 的三個執行鎖：

- **TURN LOCK**：Learner 尚未明確說完時，Coach 必須完全安靜。明顯錯誤也要等整段回答完成後再處理。
- **TARGET LOCK**：Target evidence 只能來自本回合可靠的 Learner 原話。題目、CURRENT WORD、Coach 提示、歷史 Review Context 與語意推測都不能代替 Learner production。
- **RETRY LOCK**：重要訂正會設定 `RETRY_PENDING=true`；只有完整、可靠且成功的 Learner Retry 才能解除。`Okay`、`Yes`、致謝或 Coach recast 都不能解除。

## Voice Runtime 行為

- 下一步固定依序檢查：完成回答 → 聽辨可靠 → 實際 Target → Target Usage → 本回合重要語言錯誤 → Retry → Next。
- Correction 固定使用 `My sentence / Better / Why / Now try it again.`，並在該句結束 Coach turn。
- `REQUEST_RETRY` 的唯一發話是 `Try it again.`。
- Target 缺失時保持相同 CURRENT WORD，只引導 Learner 自己說出該字；不先做不相關文法訂正。
- 語言 Retry 可保留原回答中已有效的 Target evidence，但仍必須等 Retry 成功才能 Next。
- 新增 `very softer` 的最小訂正為 `much softer`。
- 新增語意漂移防護，阻止把 `salesperson` 擅自改寫成 Learner 沒說過的 `sold pork`。
- Review Context 只作觀察參考，不算本回合證據。
- Voice 實際可靠聽辨與顯示文字不一致時，以可靠 hearing 為準；不確定時先 Clarify。
- Vocabulary 全部通過後仍必須開始 Final Challenge；完成門檻維持 2–3 個相連句子、至少 2 個練過的 Vocabulary，以及無未完成 Retry／Hearing／Skip。

## 相容性

- `schemaVersion` 更新為 `2.29.0`，新增 `voice_runtime_fix_v229` schema class。
- V2.28.0 與更舊報告仍依原 schema class 解析。
- `coverageId`、`sourceVersion`、Correction、Retry、Final Challenge、Review 與 Cloud Sync contract 未改名或移除。
- 未新增 Required Grammar coverage；Speaking Coverage 仍為動態 Vocabulary queue。

## 自動驗收

- V2.29.0 指定 A–H 情境：**8/8 PASS**。
- 全部 runtime／server／相容性測試：**221/221 PASS**。
- UI／資料保存回歸測試：**60/60 PASS**。
- JavaScript syntax、單檔 build 與 shared server module 同步：**PASS**。

真人 Voice 的停頓、實際聽辨與語音回合切換仍需在 ChatGPT Project Voice 中完成最後驗收。
