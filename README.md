# 家具家電ティアリスト

家族で共有する「家具・家電の優先度リスト」。1ページの静的アプリ + Vercel の API 1 本。

## 構成

- `index.html` … 画面。編集すると `/api/state` に保存し、開いたときと 20 秒ごとに読み直す。
- `api/state.js` … 共有データの読み書き。保存には合言葉（`EDIT_PASSCODE`）が必要。

## Vercel の設定（環境変数）

| 変数 | 用途 |
|---|---|
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Upstash Redis（Vercel Marketplace の Storage から接続すると自動で入る） |
| `EDIT_PASSCODE` | 編集用の合言葉（任意）。未設定なら誰でも編集できる |
