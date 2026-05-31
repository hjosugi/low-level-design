# Inventory Management — LLD プロジェクト

複数 **warehouse** にまたがる商品在庫を追跡する system。入荷・出荷で stock を増減し、warehouse 間で transfer し、在庫が閾値を割ったら **alert** を出す。EC / WMS の在庫コア部分を題材にした LLD。

## 含まれるノート

- `04_inventory_management.md` — 学習ノート（自分の言葉での要約・日本語）
- `inventory_management_en.md` — 原文（English / Hello Interview）
- `inventory_management_ja.md` — 原文の日本語訳

## ディレクトリ構成

```
inventory-management/
├── src/main/java/      # 実装を置く（Java 21）
├── lib/                # 外部ライブラリ（必要なら lombok.jar 等）
├── .vscode/            # settings.json / keybindings.json
├── inventory-management.code-workspace
├── mise.toml           # java = 21
├── .gitignore
└── README.md
```

## セットアップ

```sh
mise install          # Java 21 を用意
code inventory-management.code-workspace
```

実装は `src/main/java/` 配下に追加していく（既存の `parking-lot` / `logging-service` プロジェクトを参考に）。
