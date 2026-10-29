# GitHub Pages

公開URL: https://n4aki.github.io/dead-signal/

既存のmainブランチ・ルート公開を利用しています。リポジトリ直下のindex.htmlからdead-signal/内のゲームへ移動します。.nojekyllで静的ファイルをそのまま配信します。

ゲームの更新はdead-signal/内のソースに反映してください。dist/は他の静的ホスティング向けのビルド出力です。GitHub Pagesはソース内のindex.htmlと相対パスのアセットを配信します。

.github/workflows/pages.ymlはテストとビルドの検証専用です。公開は既存のpages build and deploymentが担当し、二重公開を避けます。Settings → PagesのSourceはDeploy from a branch、main、/(root)を使用します。

スマホは横向き専用、照準と連射の同時操作に対応。ハイスコアはサイトごとにブラウザへ保存されます。
