# Hanne's English OS V2.32.0

單檔入口為 `index.html`。Speaking V2.32.0 使用唯一的八個 Gate 決策順序：`FINISHED → HEARD → TARGET → MEANING → GRAMMAR → RETRY → RESOLVE → NEXT`。只有前一個 Gate 通過，Coach 才能執行下一步。

V2.31.3 的完整回答掃描、完整句 Correction／Retry、Vocabulary Coverage、Final Challenge、Cloud Sync、Review 與舊版 Report 相容性均保留。使用與驗收方式請見 [V2.32.0 實作報告](UPDATE-V2.32.0.md) 與 [Voice 驗收說明](V2.32.0-Speaking-Brief-Voice-Acceptance.md)。

```bash
npm run build
npm test
```
