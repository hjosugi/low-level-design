# Rate Limiter — LLD プロジェクト

client（または endpoint）ごとに一定時間あたりのリクエスト数を制限する。許可なら通し、超過なら拒否して「**いつ再試行できるか**」を返す。**アルゴリズムを差し替え可能**（Token Bucket / Sliding Window 等）にし、**thread-safe** にするのが設計の中心。

## 含まれるノート

- `08_rate_limiter.md` — 学習ノート（自分の言葉での要約・日本語）
- `rate_limiter_en.md` — 原文（English / Hello Interview）
- `rate_limiter_ja.md` — 原文の日本語訳

## ディレクトリ構成

```
rate-limiter/
├── src/main/java/      # 実装を置く（Java 21）
├── lib/                # 外部ライブラリ（必要なら lombok.jar 等）
├── .vscode/            # settings.json / keybindings.json
├── rate-limiter.code-workspace
├── mise.toml           # java = 21
├── .gitignore
└── README.md
```

## セットアップ

```sh
mise install          # Java 21 を用意
code rate-limiter.code-workspace
```

実装は `src/main/java/` 配下に追加していく（既存の `parking-lot` / `logging-service` プロジェクトを参考に）。
