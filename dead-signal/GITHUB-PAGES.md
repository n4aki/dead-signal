# GitHub Pages

GitHub リポジトリ: https://github.com/n4aki/dead-signal

公開予定 URL: https://n4aki.github.io/dead-signal/

リポジトリの **Settings → Pages → Build and deployment → Source** を
**GitHub Actions** に設定してください。
その後 **Actions → Publish DEAD SIGNAL to GitHub Pages → Run workflow** を実行します。
以降は `main` への更新でテスト・ビルド・公開が自動実行されます。

ゲームがリポジトリ直下でも `dead-signal/` 内でも動作する設定です。
配信するのはビルド済みの `dist/` の中身だけです。
相対パスでアセットを読み込むため、`/dead-signal/` 配下でも動作します。
スマホは横向き専用で、照準と連射を同時に操作できます。
ハイスコアはブラウザのサイトごとに保存され、Sites版からは引き継がれません。

公式手順: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
