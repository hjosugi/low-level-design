# File System — LLD プロジェクト

disk を持たない **in-memory file system**。folder / file の作成・削除、path 解決、move / rename を扱う。RAM 上で完結するため、persistence や I/O 性能ではなく **データ構造と操作の設計** に集中できる題材。

## 含まれるノート

- `03_file_system.md` — 学習ノート（自分の言葉での要約・日本語）
- `file_system_en.md` — 原文（English / Hello Interview）
- `file_system_ja.md` — 原文の日本語訳

## ディレクトリ構成

```
file-system/
├── src/main/java/      # 実装を置く（Java 21）
├── lib/                # 外部ライブラリ（必要なら lombok.jar 等）
├── .vscode/            # settings.json / keybindings.json
├── file-system.code-workspace
├── mise.toml           # java = 21
├── .gitignore
└── README.md
```

## セットアップ

```sh
mise install          # Java 21 を用意
code file-system.code-workspace
```

実装は `src/main/java/` 配下に追加していく（既存の `parking-lot` / `logging-service` プロジェクトを参考に）。
