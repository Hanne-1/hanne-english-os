# Hanne's English OS — V2.41.2

Dashboard 移除大塊 Cloud Sync 說明卡，保留頁首連線狀態與原有同步機制。首頁現在優先顯示已存教材，提供「前往學習／前往口說」捷徑；新增教材步驟收進可展開說明。Speaking 表單寬度與間距也已整理，手機版按鈕更容易點選。

Speaking 頁面只從所選教材產生並複製 `SPEAKING_BRIEF`（schema 2.1）。Brief 的 targetPlan 只包含該教材的 Main Vocabulary、Extended Vocabulary 與 Grammar；不再讀取 Review、學習狀態或既有弱點，也不加入舊知識整合階段。

練習後可將完整 Speaking Report 原文回貼，按「保存口說報告」保存。回貼區是**未驗證報告收件匣**：它保留原文、教材、時間和未驗證標記，不解析口說表現。相同教材的相同原文重貼不會新增第二份。原有 `english_os_speaking_reports` 資料不受影響。

已保存的報告依教材顯示，經既有 `english_os_state` Cloud Sync 機制同步；重新開啟頁面仍可查看。網站其他頁面的 Review、Learning State、Learning Session、Correction 和歷史資料保持原樣。

Grammar targets 在 Brief 中仍可練習，但不作為自然結束的硬門檻。Coach 仍應主持開場與後續進度。網站沒有 ChatGPT Voice 音訊 runtime，這版不宣稱修正 Voice 的音訊回合或 transcript 行為，也沒有 Voice E2E 測試。

## 本機驗證

Node.js 22 以上；依賴版本固定於 `package-lock.json`。

```sh
npm ci
npm run lint
npm test
npm run typecheck
npm run build
```

`npm test` 執行網站整合檢查與 Coach 契約 fixture，不會呼叫 ChatGPT Voice。真人 Voice 測試不是本次交付條件。
