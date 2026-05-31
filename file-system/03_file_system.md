# File System — LLD 学習ノート

> 自分の言葉でまとめた要約。原文の全文訳ではない。技術用語は英語のまま。

## 問題の核
disk なしの in-memory file system。folder/file の作成・削除、path 解決、move/rename を扱う。RAM 上なので persistence や I/O 性能でなくデータ構造と操作に集中できる。

## Clarifying questions の確定事項
- single root の Unix 風 path（`/home/user/file.txt`）。
- 操作: create / delete / list / move / rename / path 解決 / 任意 entry から full path 取得。
- file は string content を持つ。
- error は specific な exception type。
- 規模は数万 entry、深い階層でも応答性を保つ。
- permission / timestamp / symlink / relative path / search / persistence は out of scope。

## Core entities
- **FileSystem → orchestrator**。root を持ち path を parse して公開 API を提供。外部はこの class だけ触る。
- **Folder → entity**。name と children を持つ container。content は持たない。
- **File → entity**。name と content を持つ leaf。
- **Path → entity にしない**。位置を表す string で、操作の入力にすぎない。parse はするが class にしない。

## 共通 abstraction の発見
File と Folder は name / parent / getName / getPath / isDirectory を重複して持つ。さらに Folder の children の型が決まらない。これは **missing abstraction のサイン**。両者は tree の node という共通アイデンティティを持つ。

→ `abstract class FileSystemEntry` を切り出す。重複が消え、children の型が `Map<String, FileSystemEntry>` に定まる。

## full path の持ち方（parent pointer vs stored path）
各 entry に `parent: Folder?` を持たせ、path は getPath() で動的に親を辿って組み立てる。
- stored path（各 entry に絶対 path 文字列を持つ）にすると、folder を rename/move したとき数千の descendant を全部書き換える羽目になる。
- parent pointer なら rename/move は pointer の付け替えだけで済む。

## Class design

```
abstract class FileSystemEntry:
    - name: string
    - parent: Folder?
    + getName/setName/getParent/setParent
    + getPath() -> string
    + isDirectory() -> boolean   // abstract

class File extends FileSystemEntry:
    - content: string
    + getContent/setContent
    + isDirectory() -> false

class Folder extends FileSystemEntry:
    - children: Map<string, FileSystemEntry>   // O(1) lookup、private
    + isDirectory() -> true
    + addChild/removeChild/getChild/hasChild/getChildren

class FileSystem:
    - root: Folder
    + createFile(path, content) -> File
    + createFolder(path) -> Folder
    + delete(path)
    + list(path) -> List<FileSystemEntry>
    + get(path) -> FileSystemEntry
    + rename(path, newName)
    + move(srcPath, destPath)
```

children は Map を private にし add/remove/get 経由で触らせる。parent pointer の整合（bidirectional consistency）を Folder が一元管理できる。

## 主要メソッド

```
createFile(path, content):
    if path == "/": throw InvalidPath
    parent = resolveParent(path)
    name = extractName(path)
    if parent.hasChild(name): throw AlreadyExists
    file = File(name, content); parent.addChild(file); return file

move(srcPath, destPath):
    if srcPath == "/": throw InvalidPath
    srcParent = resolveParent(srcPath); entry = srcParent.getChild(extractName(srcPath))
    if entry == null: throw NotFound
    destParent = resolveParent(destPath)
    if entry.isDirectory():               // cycle 検出
        current = destParent
        while current != null:
            if current == entry: throw InvalidPath("自分の中には移せない")
            current = current.getParent()
    if destParent.hasChild(destName): throw AlreadyExists
    srcParent.removeChild(srcName); entry.setName(destName); destParent.addChild(entry)
```

helper:
- **resolvePath**: root から `/` で split して1階層ずつ降りる。途中が無ければ throw、file の途中で降りようとしたら throw。
- **resolveParent**: 最後の component の親を返す。
- **extractName**: 最後の component。
- **getPath**（FileSystemEntry）: parent を再帰で辿り組み立て。root は "/" 特別扱いで `//` を防ぐ。

addChild/removeChild は parent pointer を同時に set/clear して整合を保つ（これを忘れると move 後に getPath が壊れる）。getChildren は内部 map のコピーを返す。

rename は map の key が name なので、remove → setName → add の順で key を貼り替える（setName だけだと古い key で orphan 化）。

move の cycle 検出が肝。`/home` を `/home/user/stuff` に入れると ancestor かつ descendant の不可能ループになる。destination から root へ辿り、移動対象に当たったら拒否。

## Concurrency（extensibility）
single-thread 前提。2 thread が同名 file を同時 create すると、check（hasChild）と act（addChild）の間に割り込む check-then-act race。
- 最簡: **coarse-grained lock**（公開メソッドを FileSystem 単位で synchronize）。正しいが、別 folder への操作も互いに block。
- **fine-grained lock**（folder ごとに lock）: 別 folder は並行可。ただし move は2 folder に触るので deadlock リスク。
- **lock ordering**: path 文字列のアルファベット順など一定順で acquire し circular wait を防ぐ。
- **read-write lock**: get/list は読みだけなので複数 reader 並行、writer は排他。read 多なら有効。

面接では coarse-grained で十分。fine-grained の存在・move の deadlock・lock ordering を口頭で。

## Extensibility
- **search**: 最簡は再帰走査で O(n)。頻繁なら `nameIndex: Map<name, List<entry>>` を維持（create/delete/rename で更新）し O(1)。prefix は trie、wildcard は拡張子別 index、content 検索は inverted index。
- **symlink / permission**: 既存構造を大きく崩さず追加できることを説明。

## 各レベル期待値
- **Junior**: tree を正しくモデル化。FileSystem + File + Folder、create/delete と path parse、children を name で引く。存在しない path や衝突の基本 error。FileSystemEntry abstraction は気づかなくてよい（聞かれて共通 field を抽出できれば可）。
- **Mid**: 責務分離と shared abstraction を自分から（FileSystemEntry 抽出）。parent pointer vs stored path の理由を理解。move の parent pointer 更新。cycle 検出は hint があれば実装。
- **Senior**: 誘導なしで微妙な edge case。parent pointer の優位を説明、cycle 検出が自然に出る、check-then-act race・move の atomic な複数 lock・lock ordering を議論、coarse vs fine-grained の tradeoff、search index の構想。
