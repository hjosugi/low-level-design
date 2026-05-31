# Movie Ticket Booking — LLD プロジェクト

BookMyShow 風の **映画予約**。映画・劇場・上映回を検索し、上映回の座席を予約する。肝は「**同じ座席を 2 人に売らない**」こと——seat lock / 予約確定の **concurrency** が本丸。

## 含まれるノート

- `07_movie_ticket_booking.md` — 学習ノート（自分の言葉での要約・日本語）
- `movie_ticket_booking_en.md` — 原文（English / Hello Interview）
- `movie_ticket_booking_ja.md` — 原文の日本語訳

## ディレクトリ構成

```
movie-ticket-booking/
├── src/main/java/      # 実装を置く（Java 21）
├── lib/                # 外部ライブラリ（必要なら lombok.jar 等）
├── .vscode/            # settings.json / keybindings.json
├── movie-ticket-booking.code-workspace
├── mise.toml           # java = 21
├── .gitignore
└── README.md
```

## セットアップ

```sh
mise install          # Java 21 を用意
code movie-ticket-booking.code-workspace
```

実装は `src/main/java/` 配下に追加していく（既存の `parking-lot` / `logging-service` プロジェクトを参考に）。
