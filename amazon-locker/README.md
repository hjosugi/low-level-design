# Amazon Locker — LLD プロジェクト

宅配 **ロッカー**。配達員が荷物を空き compartment に入れると **pickup code** が発行され、受取人がその code で開ける。荷物サイズに合う compartment を割り当て、期限切れの荷物は回収する、という割当・状態管理が題材。

## 含まれるノート

- `06_amazon_locker.md` — 学習ノート（自分の言葉での要約・日本語）
- `amazon_locker_en.md` — 原文（English / Hello Interview）
- `amazon_locker_ja.md` — 原文の日本語訳

## ディレクトリ構成

```
amazon-locker/
├── src/main/java/      # 実装を置く（Java 21）
├── lib/                # 外部ライブラリ（必要なら lombok.jar 等）
├── .vscode/            # settings.json / keybindings.json
├── amazon-locker.code-workspace
├── mise.toml           # java = 21
├── .gitignore
└── README.md
```

## セットアップ

```sh
mise install          # Java 21 を用意
code amazon-locker.code-workspace
```

実装は `src/main/java/` 配下に追加していく（既存の `parking-lot` / `logging-service` プロジェクトを参考に）。
