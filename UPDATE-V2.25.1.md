# English OS Speaking V2.25.1 更新與驗收

## 修改範圍

V2.25.1 是 V2.25.0 的 Voice Session Start 小型修正。Required Coverage、Correction、續練、Final Challenge 與 server-side validation 架構維持不變。

| 檔案 | 修改 |
|---|---|
| `src/speaking-client.js` | Brief／Report 版本更新；加入 Voice Session Start、Readiness Response、No Readiness Loop、Text → Voice state 與暖身規則。 |
| `src/speaking-queue.js` | 保留 8-item 驗證，允許暖身中可靠、自然產出的 Required Vocabulary 成為有效 evidence。 |
| `src/speaking-service.mjs` | 保留完整 patch schemaVersion，讓 2.25.1 Session／Report 顯示正確版本；V2.24 相容規則不變。 |
| `tests/speaking-queue.test.mjs` | 新增暖身 Vocabulary evidence 與停頓未完成測試，保留所有既有 Coverage／Server 測試。 |
| `tests/ui.cjs` | 新增 Voice Start A–E、I 與 Text／Voice state Prompt regression tests。 |
| `index.html`、`public/index.html` | 建置後的 V2.25.1 單檔正式網站。 |

## Voice Start Rule 的位置

新規則放在 Speaking Brief 的 `REQUIRED COVERAGE POLICY` 後、`TODAY'S REQUIRED COVERAGE` 前，順序為：

1. `VOICE SESSION START RULE — HARD RULE`
2. `READINESS RESPONSE RULE`
3. `HARD RULE — NO READINESS LOOP`
4. `TEXT → VOICE SESSION STATE`

這讓 Coach 在讀取 queue 之前就先確定「Voice 進入後立刻出第一題」，避免把 Ready／Yes／Okay 當成第二層開始確認。

## Text → Voice state

Prompt 明確定義：

`BRIEF_LOADED → TEXT_READY → VOICE_ENTERED → SESSION_ACTIVE → FIRST_QUESTION_ASKED → SPEAKING_LOOP`

- Text mode 剛貼入 Brief：只回「口說內容已準備好，請開啟這個 Project 的語音模式。」
- Voice interaction 開始：不再重複 Text mode 提示，也不等待 `learnerSaidStart=true`，第一個可用 Coach turn 直接問教材題。

English OS 網站只準備 Brief，無法讀取 ChatGPT 是否切換 Voice，因此本版不新增不可靠的網站 Voice detector，也不重構 Session architecture。

## Yes／Okay／Question? 的處理

第一個真正問題尚未問出時，Yes、Okay、Ready、Let's go、Question?、Can you ask me a question? 等都表示「現在開始」，下一個 Coach turn 必須包含實際 lesson-linked question。

Required task 已問出後，Yes／Okay／Yeah 仍不是 Vocabulary／Grammar evidence。Grammar 題會重新問最小必要問題，例如 `Capital or lowercase?`。Readiness acknowledgement 與 Coverage evidence 在 Prompt 與 server validator 中分開。

## 第一題與暖身

Voice 第一回合可以：

- 問一個非常短、與教材相連的 warm-up，然後直接進 CURRENT REQUIRED ITEM；或
- 直接問 CURRENT REQUIRED ITEM。

Warm-up 最多一個主要問題，不建立新 Coverage ID，也不能延遲 Required Coverage。若 Learner 在暖身中自然、可靠地說出 Required Vocabulary，且符合 target、完成回答、可靠轉錄、非 Coach 代答等全部條件，可以計入該 Vocabulary Coverage。Grammar 與 Final Challenge gate 未放寬。

## 8-item Coverage 與相容性

- Required Coverage 仍只有 Vocabulary＋Grammar。
- 家庭成員課仍為 5 Vocabulary＋3 Grammar＝8。
- Correction／Spelling 仍只屬於 Review Context／Coaching Priority。
- Vocabulary Coverage／Accuracy 分離不變。
- Grammar Coverage／Accuracy 分離不變。
- Final Challenge 仍須等 Required Coverage 全部 practiced。
- V2.24 Report parser 與 V2.25.0 Report 保持相容。
- 不需要 DB migration。

## 自動測試

執行：

```bash
npm run build
npm test
```

結果：

- JavaScript syntax check：通過
- Speaking queue／server：40／40
- UI／Prompt／Correction／Review／timer／legacy regression：46／46
- 合計：86／86

Prompt tests 驗證 Voice 直接開始、Yes、Okay、Question?、不要求 topic selection、禁止 repeated readiness loop、Text／Voice state；核心測試驗證暖身自然 target、Grammar Okay 無效、停頓未完成、8-item、Final Challenge、續練、server validation 與 legacy compatibility。

## 真人 Voice 驗收

1. 將 V2.25.1 Brief 貼到 ChatGPT Project 的文字模式，確認只收到進入 Voice 的提示。
2. 進入 Voice 後先不說 Start；確認 Coach 直接問一個短暖身或 CURRENT REQUIRED ITEM。
3. 另測 Yes、Okay、Question?；每次都應直接收到 lesson question，不得再出現 readiness statement。
4. 第一題後故意說 `My niece is... um...` 並停頓，確認 Coach 等待，不搶答。
5. Grammar 題只回 Okay，確認 Coach 重問 `Capital or lowercase?`，不能標記 practiced。
6. 暖身自然說出 `I spend a lot of time with my niece.`，確認可靠 Report 可以把 niece 標成 practiced。
7. 貼回 Report，確認 Coverage 仍為 8 項架構，Correction／Spelling 未進 queue。
