# Connect Four — LLD プロジェクト

2人用の **Connect Four**。交互に列へ disc を落とし、重力で最下段に積む。縦・横・斜めいずれかに 4 つ並べた方が勝ち、盤が埋まれば引き分け。**turn 管理・着手の合法性・勝敗判定** が設計の中心。

## 含まれるノート

- `05_connect_four.md` — 学習ノート（自分の言葉での要約・日本語）
- `connect_four_en.md` — 原文（English / Hello Interview）
- `connect_four_ja.md` — 原文の日本語訳

## ディレクトリ構成

```
connect-four/
├── src/main/java/      # 実装を置く（Java 21）
├── lib/                # 外部ライブラリ（必要なら lombok.jar 等）
├── .vscode/            # settings.json / keybindings.json
├── connect-four.code-workspace
├── mise.toml           # java = 21
├── .gitignore
└── README.md
```

## セットアップ

```sh
mise install          # Java 21 を用意
code connect-four.code-workspace
```

実装は `src/main/java/` 配下に追加していく（既存の `parking-lot` / `logging-service` プロジェクトを参考に）。
