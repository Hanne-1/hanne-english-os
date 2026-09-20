# Hanne's English OS Speaking V2.30.0 — Live Voice Runtime State Control

## 改版範圍

V2.30.0 直接延續 V2.29.0。English OS → Speaking Brief → ChatGPT Project Voice → Speaking Report → Server Validation 流程，以及 Session identity、Vocabulary Coverage、CURRENT WORD、Required Vocabulary queue、Compact Review Priorities、Final Challenge、Coverage IDs、`sourceVersion` 與既有 Report JSON 結構均保留。

本版只重寫 Live Voice runtime control。

## Runtime Mode

新增三個互斥的內部 Mode：

- `PRACTICE`：只處理一個 CURRENT WORD。
- `RETRY`：只取得目前訂正的成功 Learner Retry。
- `FINAL`：只處理 Final Challenge。

WAIT 不再視為 Coach Mode。若 Learner 仍擁有發言權，runtime 回傳 `NO_ASSISTANT_TURN` 與空白 `coachSpeech`，不產生 acknowledgement、鼓勵、澄清或訂正。

## 狀態控制

- **Turn ownership first**：只有 Learner 明確完成整段意思，才允許 Coach 開始一個 turn。
- **Current speech source lock**：Target 與 Correction 只接受目前可靠 Learner speech；CURRENT WORD、Coach 問句、歷史 Review Context 與語意推測不能成為證據。
- **Hearing lock**：重要語音不清楚時只 Clarify，不計分、不補字。
- **Correction source lock**：Correction 必須能指出目前原句中的實際錯誤，並保留 Learner intent。
- **Retry Mode**：Correction 立即切換至 RETRY；`Yes`、`Okay`、`Thank you` 等 acknowledgement 不能解除。
- **One blocker per Coach turn**：依 Hearing → Target → Usage → Current Error → Retry → Resolve → Next 處理；不得合併 Correction 與 Next／Final／Completion。
- **Vocabulary audit before Final**：所有 Vocabulary evidence、usage、Retry、hearing 與 skip audit 通過後才進 FINAL。
- **Completion gate**：Vocabulary Audit、Final Challenge、Retry、hearing 與 turn ownership 全部通過後才可完成 Session。

## Report 與 Server Validation

`schemaVersion` 更新為 `2.30.0`，新增 `live_runtime_state_v230` schema class。

Report 每個 Coverage／Final row 可記錄：

- `runtimeMode: PRACTICE|RETRY|FINAL`
- `turnOwnership: learner|coach`
- `retryPending: boolean`

這些欄位只記錄 runtime evidence。伺服器會依 Learner 完成狀態、Correction 與 Retry 證據重新計算；欄位本身不能建立 Target、Coverage、Retry 或 Completion evidence。若回報與實際證據不符，保存伺服器推導值並加入 `runtime_state_mismatch` Coach execution issue。

## 驗證

- 規格指定 micro-tests：**10/10 PASS**。
- 全部核心／runtime／server／相容性測試：**232/232 PASS**。
- UI／資料保存／Report 回貼測試：**60/60 PASS**。
- JavaScript syntax、單檔 build 與 shared server module 同步：**PASS**。
- 產生的 Live Voice section：1192 words，低於既有 1200-word compact gate。

真人 Voice 的實際停頓切分、Voice hearing 與 Assistant turn 產生行為仍需在 ChatGPT Project Voice 中完成最後驗收。
