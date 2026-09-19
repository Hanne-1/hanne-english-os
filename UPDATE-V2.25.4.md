# Hanne's English OS V2.25.4

V2.25.4 將 Speaking 改為由伺服器驗證的 Runtime State Lock。每次只允許一個 Current Required Item；Hearing、Target/Task、Correction、Retry、Evidence、Pre-Final 與 Final Audit 都必須通過後才可前進。

## 主要變更

- Speaking schema 的單一版本來源為 `EnglishSpeakingQueue.SCHEMA_VERSION`，新 Brief 與 Report 固定為 `2.25.4`。
- 新增 `runtimeFinalState`、`evidenceValid`、`correctionLock`、`queuePosition`、`attemptSequence`。
- ASR 不確定時維持 Hearing Lock，不可猜測語意或轉成學習錯誤。
- Coach 提供答案後，必須有 Learner 後續獨立產出才可成立。
- Correction／Retry 未完成時禁止換題；錯誤訂正會被撤銷並記為 Coach issue，不會成為 Learner weakness。
- Grammar 未實際回答時保持 `not_tested`，三個 Grammar Coverage ID 分別驗證。
- Final Challenge 前要求完整 Coverage 與 Correction audit；Final 後再做 Final Audit。
- 舊版 2.25.2／2.25.3 報告仍可讀取；未完成場次保留已驗證進度、清除舊 active attempt，並記錄 migration metadata 後改用 2.25.4。

## 驗證

執行 `npm test` 與 `npm run build`。`tests/runtime-integrity.test.mjs` 涵蓋 18 組 Voice 實測回歸情境。
