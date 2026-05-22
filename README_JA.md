# LLM Wiki

<p align="center">
  <img src="logo.jpg" width="128" height="128" style="border-radius: 22%;" alt="LLM Wiki Logo">
</p>

<p align="center">
  <strong>自分で育つパーソナル知識ベース。</strong><br>
  LLM が文書を読み、構造化された Wiki を作成し、継続的に更新します。
</p>

<p align="center">
  <a href="#これは何ですか">これは何ですか？</a> •
  <a href="#変更点と追加機能">主な機能</a> •
  <a href="#技術スタック">技術スタック</a> •
  <a href="#インストール">インストール</a> •
  <a href="#クレジット">クレジット</a> •
  <a href="#ライセンス">ライセンス</a>
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README_CN.md">中文</a> | 日本語
</p>

---

<p align="center">
  <img src="assets/overview.jpg" width="100%" alt="概要">
</p>

## 主な機能

- **2 段階 Chain-of-Thought Ingest** — LLM がまず分析し、その後 source traceability と増分キャッシュ付きの Wiki ページを生成
- **マルチモーダル画像 Ingest** — PDF 内の埋め込み画像を抽出し、Vision LLM で事実ベースのキャプションを生成。画像対応検索結果、lightbox preview、元資料位置へのジャンプに対応
- **4 シグナル知識グラフ** — 直接リンク、source overlap、Adamic-Adar、type affinity による関連度モデル
- **Louvain コミュニティ検出** — 知識クラスタを自動発見し、凝集度をスコアリング
- **Graph Insights** — 意外な接続と知識ギャップを検出し、ワンクリックで Deep Research を開始
- **ベクトル意味検索** — LanceDB による任意の OpenAI-compatible endpoint 対応の embedding 検索
- **永続 Ingest Queue** — 直列処理、クラッシュ復旧、キャンセル、リトライ、進捗可視化に対応
- **フォルダインポート** — ディレクトリ構造を保った再帰インポート。フォルダ文脈を LLM の分類ヒントとして利用
- **Source フォルダ Auto-Watch** — `raw/sources/` の外部変更を検出し、ingest / delete cleanup を同期
- **Deep Research** — LLM 最適化 search topic、Tavily / SerpApi / SearXNG による multi-query Web search、結果の自動 Wiki 化
- **非同期 Review System** — LLM が人間の判断が必要な項目を作成し、定義済み action と事前生成 search query を付与
- **Chrome Web Clipper** — Web ページをワンクリックで取り込み、知識ベースへ自動 ingest
- **ローカル HTTP API + AI Agent Skill** — `127.0.0.1:19828` の JSON API（Token 認証）で hybrid search、file read、graph traversal、source rescan を提供。専用の [agent skill](https://github.com/nashsu/llm_wiki_skill) は Claude Code / Codex にワンコマンドで追加可能（`npx skills add …`）

## これは何ですか？

LLM Wiki は、手元の文書を整理された相互リンク付きの知識ベースへ自動変換するクロスプラットフォームのデスクトップアプリです。従来の RAG のように毎回ゼロから検索して回答するのではなく、LLM が資料から**永続的な Wiki を増分的に構築・維持**します。知識は一度コンパイルされ、継続的に更新されます。毎回の質問で再推論する必要はありません。

このプロジェクトは [Karpathy の LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) に基づいています。LLM を使ってパーソナル知識ベースを構築する方法論を、実際に使えるデスクトップアプリとして実装し、多数の拡張を加えました。

<p align="center">
  <img src="assets/llm_wiki_arch.jpg" width="100%" alt="LLM Wiki アーキテクチャ">
</p>

## クレジット

基礎となる方法論は **Andrej Karpathy** の [llm-wiki.md](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) です。この文書は、LLM を使って個人 Wiki を増分的に構築・維持する設計パターンを示しています。元の文書は抽象的な設計パターンであり、本プロジェクトはその具体的な実装に大幅な拡張を加えたものです。

## 元の設計から継承したもの

コアアーキテクチャは Karpathy の設計に忠実です。

- **3 層アーキテクチャ**: Raw Sources（不変）→ Wiki（LLM 生成）→ Schema（ルールと設定）
- **3 つのコア操作**: Ingest、Query、Lint
- **index.md** をコンテンツ目録および LLM のナビゲーション入口として利用
- **log.md** を parse 可能な時系列操作記録として利用
- **[[wikilink]]** 構文による相互参照
- すべての Wiki ページに **YAML frontmatter**
- **Obsidian 互換** — Wiki ディレクトリを Obsidian vault として利用可能
- **人間がキュレーションし、LLM が維持する** という基本的な役割分担

<p align="center">
  <img src="assets/5-obsidian_compatibility.jpg" width="100%" alt="Obsidian 互換">
</p>

## 変更点と追加機能

### 1. CLI からデスクトップアプリへ

元の設計は、LLM agent にコピーして使う抽象的なパターン文書でした。本プロジェクトでは、それを**完全なクロスプラットフォームデスクトップアプリ**として実装しました。

- **3 カラムレイアウト**: Knowledge Tree / File Tree（左）+ Chat（中央）+ Preview（右）
- **アイコンサイドバー**: Wiki、Sources、Search、Graph、Lint、Review、Deep Research、Settings を切り替え
- **カスタムリサイズ可能パネル**: 左右パネルを drag でリサイズ。min / max 制約付き
- **Activity Panel**: file-by-file の ingest 進捗をリアルタイム表示
- **全 state の永続化**: conversations、settings、review items、project config が再起動後も保持
- **シナリオテンプレート**: Research、Reading、Personal Growth、Business、General。各テンプレートが purpose.md と schema.md を事前設定

### 2. Purpose.md — Wiki の魂

元の設計には Schema（Wiki の動作ルール）はありますが、この Wiki が**なぜ存在するのか**を正式に定義する場所はありませんでした。本プロジェクトでは `purpose.md` を追加しました。

- 目標、主要な問い、研究範囲、変化していく仮説を定義
- LLM が毎回の ingest と query で context として読む
- 利用パターンに基づいて LLM が更新を提案可能
- schema とは別物。schema は構造ルール、purpose は方向性と意図

### 3. 2 段階 Chain-of-Thought Ingest

元の設計では、LLM が読み取りと書き込みを同時に行う single-step ingest が想定されていました。本プロジェクトでは品質を大きく高めるため、これを**2 回の連続した LLM call** に分割しました。

```text
Step 1 (Analysis): LLM が source を読む → 構造化 analysis
  - 主要 entity、concept、argument
  - 既存 Wiki content との接続
  - 既存知識との contradiction / tension
  - Wiki 構造への recommendation

Step 2 (Generation): LLM が analysis を受け取る → Wiki files を生成
  - frontmatter 付き source summary（type, title, sources[]）
  - cross-reference を持つ entity page / concept page
  - index.md、log.md、overview.md の更新
  - 人間の判断が必要な review item
  - Deep Research 用 search query
```

元の設計を超える ingest 強化:

- **SHA256 増分キャッシュ** — source file の内容を ingest 前に hash 化。未変更ファイルは自動 skip し、LLM token と時間を節約
- **永続 ingest queue** — concurrent LLM call を防ぐ直列処理。queue は disk に保存され app restart 後も復元。失敗 task は最大 3 回まで auto-retry
- **フォルダインポート** — ディレクトリ構造を保って再帰 import。folder path を分類 context として LLM に渡す（例: "papers > energy"）
- **Source folder auto-watch** — app 外で `raw/sources/` に追加・変更・削除された file を自動検出し、app 内操作と同じ ingest / delete lifecycle を再利用
- **Queue visualization** — Activity Panel に progress bar、pending / processing / failed task、cancel / retry button を表示
- **Auto-embedding** — vector search が有効な場合、新規 page は ingest 後に自動 embedding
- **Source traceability** — 生成されたすべての Wiki page が YAML frontmatter の `sources: []` で raw source file に link
- **overview.md auto-update** — Wiki の最新状態を反映する global summary page を ingest ごとに再生成
- **Guaranteed source summary** — LLM が漏らした場合でも source summary page が必ず作成される fallback
- **Language-aware generation** — LLM は user が設定した言語（English または Chinese）で応答
- **Progressive Sources view** — 大きな source folder は scroll に合わせて段階的に render し、大規模 collection でも responsive

### 4. 関連度モデル付き Knowledge Graph

<p align="center">
  <img src="assets/3-knowledge_graph.jpg" width="100%" alt="Knowledge Graph">
</p>

元の設計は cross-reference 用の `[[wikilinks]]` に触れていますが、graph analysis はありません。本プロジェクトでは**完全な知識グラフ可視化と関連度 engine** を構築しました。

**4 シグナル関連度モデル:**

| Signal | Weight | Description |
|--------|--------|-------------|
| Direct link | ×3.0 | `[[wikilinks]]` で link された page |
| Source overlap | ×4.0 | frontmatter `sources[]` 経由で同じ raw source を共有する page |
| Adamic-Adar | ×1.5 | 共通 neighbor を持つ page（neighbor degree で重み付け） |
| Type affinity | ×1.0 | 同じ page type への bonus（entity↔entity、concept↔concept） |

**Graph Visualization（sigma.js + graphology + ForceAtlas2）:**

- page type または community による node color、link count に応じた node size（√ scaling）
- relevance weight に応じた edge thickness / color（green=strong、gray=weak）
- hover interaction: neighbor は可視のまま、non-neighbor は dim、edge は relevance score label 付きで highlight
- zoom controls（ZoomIn、ZoomOut、Fit-to-screen）
- position caching により data update 時の layout jump を防止
- coloring mode に応じて legend が type count と community info を切り替え

### 5. Louvain コミュニティ検出

元の設計にはありません。**Louvain algorithm**（graphology-communities-louvain）を使って知識クラスタを自動発見します。

- **Auto-clustering** — predefined page type とは独立に、link topology に基づいて自然にまとまる page 群を発見
- **Type / Community toggle** — node color を page type（entity、concept、source...）または発見された knowledge cluster で切り替え
- **Cohesion scoring** — community ごとに internal edge density（actual edges / possible edges）を score。低 cohesion cluster（< 0.15）には warning
- **12-color palette** — cluster 間を視覚的に区別
- **Community legend** — top node label、member count、cohesion を表示

<p align="center">
  <img src="assets/kg_community.jpg" width="100%" alt="Louvain コミュニティ検出">
</p>

### 6. Graph Insights — 意外な接続と知識ギャップ

元の設計にはありません。system が**graph structure を自動分析**し、actionable insight を提示します。

**Surprising Connections:**

- cross-community edge、cross-type link、peripheral↔hub coupling などの unexpected relationship を検出
- composite surprise score により注目すべき connection を ranking
- dismissable。review 済みとして mark すると再表示されない

**Knowledge Gaps:**

- **Isolated pages**（degree ≤ 1）— Wiki の他の部分との connection が少ない page
- **Sparse communities**（cohesion < 0.15、≥ 3 pages）— 内部 cross-reference が弱い knowledge area
- **Bridge nodes**（3+ clusters を接続）— 複数の knowledge area をつなぐ重要な junction page

**Interactive:**

- insight card を click すると該当 node / edge を graph 上で **highlight**。再 click で解除
- knowledge gap と bridge node には **Deep Research button** があり、overview.md + purpose.md を読んだ domain-aware topic で LLM 最適化 research を開始
- research topic は開始前に**編集可能な確認 dialog** に表示。user が topic と search query を調整可能

<p align="center">
  <img src="assets/kg_insights.jpg" width="100%" alt="Graph Insights">
</p>

### 7. 最適化された Query Retrieval Pipeline

元の設計では、LLM が関連 page を読む simple query が説明されています。本プロジェクトでは、optional vector search と budget control を備えた**多段階 retrieval pipeline** を構築しました。

```text
Phase 1: Tokenized Search
  - English: word splitting + stop word removal
  - Chinese: CJK bigram tokenization（每个 → [每个, 个…]）
  - Title match bonus（+10 score）
  - wiki/ と raw/sources/ の両方を検索

Phase 1.5: Vector Semantic Search (optional)
  - 任意の OpenAI-compatible /v1/embeddings endpoint で embedding
  - LanceDB（Rust backend）に保存し、高速 ANN retrieval
  - Cosine similarity により keyword overlap がなくても semantic に関連する page を発見
  - 結果を search に merge: 既存 match を boost + 新規 discovery を追加

Phase 2: Graph Expansion
  - top search result を seed node として使用
  - 4-signal relevance model で関連 page を発見
  - 2-hop traversal、deep connection には decay

Phase 3: Budget Control
  - configurable context window: 4K → 1M tokens
  - proportional allocation: 60% wiki pages、20% chat history、5% index、15% system
  - search + graph relevance score の combined score で page を優先順位付け

Phase 4: Context Assembly
  - numbered page と full content（summary だけではない）
  - system prompt に purpose.md、language rules、citation format、index.md を含める
  - LLM に page number 形式で citation させる: [1], [2] など
```

**Vector Search** は完全に optional です。default は disabled で、Settings から endpoint、API key、model を独立設定して有効化できます。disabled の場合は tokenized search + graph expansion に fallback します。benchmark では、vector search 有効時に overall recall が 58.2% から 71.4% に改善しました。

### 8. 永続化付き Multi-Conversation Chat

元の設計には single query interface しかありません。本プロジェクトでは**完全な multi-conversation support** を構築しました。

- **独立 chat session** — conversation の作成、rename、delete
- **Conversation sidebar** — topic 間をすばやく切り替え
- **Per-conversation persistence** — 各 conversation を `.llm-wiki/chats/{id}.json` に保存
- **Configurable history depth** — context として送信する message 数を制限（default: 10）
- **Cited references panel** — 各 response に collapsible section を表示し、使用された Wiki page を type と icon で group
- **Reference persistence** — cited page は message data に直接保存され、restart 後も安定
- **Regenerate** — last response をワンクリック再生成（最後の assistant + user message pair を削除して再送信）
- **Save to Wiki** — 価値のある回答を `wiki/queries/` に archive し、auto-ingest して entity / concept を knowledge network に抽出

### 9. Thinking / Reasoning Display

元の設計にはありません。`<think>` block を出力する LLM（DeepSeek、QwQ など）向けです。

- **Streaming thinking** — 生成中に rolling 5-line display と opacity fade で表示
- **Collapsed by default** — 完了後は thinking block を非表示にし、click で展開
- **Visual separation** — thinking content は main response とは別 style で表示

### 10. KaTeX 数式レンダリング

元の設計にはありません。すべての view で LaTeX math をサポートします。

- **KaTeX rendering** — inline `$...$` と block `$$...$$` formula を remark-math + rehype-katex で render
- **Milkdown math plugin** — preview editor が @milkdown/plugin-math で math を native render
- **Auto-detection** — bare `\begin{aligned}` などの LaTeX environment を自動的に `$$` delimiter で wrap
- **Unicode fallback** — math block 外の simple inline notation 用に 100+ symbol mappings（α, ∑, →, ≤ など）

### 11. Review System（非同期 Human-in-the-Loop）

元の設計では ingest 中に人間が関与することが推奨されています。本プロジェクトでは**非同期 review queue** を追加しました。

- ingest 中に LLM が人間の判断が必要な item を flag
- **定義済み action type**: Create Page、Deep Research、Skip。任意 action の hallucination を防ぐため制約
- **Search query を ingest 時に生成** — LLM が review item ごとに最適化された Web search query を事前生成
- user は都合のよいタイミングで review 可能。ingest を block しない

### 12. Deep Research

<p align="center">
  <img src="assets/1-deepresearch.jpg" width="100%" alt="Deep Research">
</p>

元の設計にはありません。LLM が knowledge gap を見つけたときに利用します。

- **Web search** — Tavily、SerpApi、SearXNG 経由で relevant source を取得。full content extraction に対応（truncation なし）
- **Provider-specific configuration** — Tavily と SerpApi は独立 API key。SerpApi は selectable engine、SearXNG は instance URL と search categories を設定
- **Multiple search queries** per topic — ingest 時に LLM が search engine 向けに最適化して生成
- **LLM-optimized research topics** — Graph Insights から起動した場合、LLM が overview.md + purpose.md を読み、generic keyword ではなく domain-specific topic と query を生成
- **User confirmation dialog** — research 開始前に editable topic と search query を表示
- **LLM synthesizes** search result を既存 Wiki への cross-reference 付き research page に統合
- **Thinking display** — synthesis 中の `<think>` block を collapsible section として表示し、latest content へ auto-scroll
- **Auto-ingest** — research result を自動処理し、entity / concept を Wiki に抽出
- **Task queue** — 3 concurrent tasks
- **Research Panel** — dynamic height と real-time streaming progress を持つ専用 sidebar panel

### 13. Browser Extension（Web Clipper）

<p align="center">
  <img src="assets/4-chrome_extension_webclipper.jpg" width="100%" alt="Chrome Extension Web Clipper">
</p>

元の設計では Obsidian Web Clipper が言及されています。本プロジェクトでは**専用 Chrome Extension**（Manifest V3）を構築しました。

- **Mozilla Readability.js** による正確な article extraction（広告、nav、sidebar を除去）
- **Turndown.js** による HTML → Markdown conversion。table support あり
- **Project picker** — clip 先の Wiki を選択（multi-project support）
- **Local HTTP API**（port 19827、tiny_http）— Extension ↔ App communication
- **Auto-ingest** — clipped content が自動で two-step ingest pipeline を起動
- **Clip watcher** — 3 秒ごとに new clip を poll して自動処理
- **Offline preview** — app が起動していなくても抽出 content を表示

### 14. Multi-format Document Support

元の設計は text / markdown に焦点を当てています。本プロジェクトでは document semantics を保った structured extraction に対応しています。

| Format | Method |
|--------|--------|
| PDF | pdf-extract（Rust）+ file caching |
| DOCX | docx-rs — headings、bold / italic、lists、tables → structured Markdown |
| PPTX | ZIP + XML — slide-by-slide extraction、heading / list structure を保持 |
| XLSX/XLS/ODS | calamine — proper cell types、multi-sheet support、Markdown tables |
| Images | Native preview（png, jpg, gif, webp, svg など） |
| Video/Audio | built-in player |
| Web clips | Readability.js + Turndown.js → clean Markdown |

### 15. File Deletion with Cascade Cleanup

元の設計には deletion mechanism がありません。本プロジェクトでは**intelligent cascade deletion** を追加しました。

- source file を削除すると、その Wiki summary page も削除
- **3-method matching** で関連 Wiki page を検索: frontmatter `sources[]` field、source summary page name、frontmatter section references
- **Shared entity preservation** — 複数 source に link された entity / concept page は page 自体を消さず、削除された source だけを `sources[]` から外す
- **Index cleanup** — 削除された page を index.md から purged
- **Wikilink cleanup** — 削除 page への dead `[[wikilinks]]` を残りの Wiki page から削除

### 16. Configurable Context Window

元の設計にはありません。LLM に渡す context 量を user が設定できます。

- **4K から 1M tokens までの slider** — 異なる LLM capability に適応
- **Proportional budget allocation** — 大きな window では Wiki content に比例して多く割り当て
- **60/20/5/15 split** — wiki pages / chat history / index / system prompt

### 17. Cross-Platform Compatibility

元の設計は platform-agnostic な抽象パターンです。本プロジェクトでは実際の cross-platform 問題を扱っています。

- **Path normalization** — 22+ files で unified `normalizePath()` を使用し、backslash → forward slash
- **Unicode-safe string handling** — byte-based ではなく char-based slicing（CJK filename での crash を防止）
- **macOS close-to-hide** — close button は window を隠す（app は background で継続）。Dock icon click で restore、Cmd+Q で quit
- **Windows/Linux close confirmation** — accidental data loss 防止の quit confirmation dialog
- **Tauri v2** — macOS、Windows、Linux の native desktop
- **GitHub Actions CI/CD** — macOS（ARM + Intel）、Windows（.msi）、Linux（.deb / .AppImage）の automated builds

### 18. その他の追加機能

- **i18n** — English + Chinese interface（react-i18next）
- **Settings persistence** — LLM provider、API key、model、context size、language を Tauri Store で保存
- **Obsidian config** — 推奨 settings 付き `.obsidian/` directory を自動生成
- **Markdown rendering** — border 付き GFM tables、適切な code blocks、chat / preview 内の wikilink processing
- **Multi-provider LLM support** — OpenAI、Anthropic、Google、Ollama、Custom。provider ごとに streaming と headers を調整
- **15-minute timeout** — 長時間 ingest operation が早期失敗しない
- **dataVersion signaling** — Wiki content 変更時に graph と UI を自動 refresh

## 技術スタック

| Layer | Technology |
|-------|------------|
| Desktop | Tauri v2（Rust backend） |
| Frontend | React 19 + TypeScript + Vite |
| UI | shadcn/ui + Tailwind CSS v4 |
| Editor | Milkdown（ProseMirror-based WYSIWYG） |
| Graph | sigma.js + graphology + ForceAtlas2 |
| Search | Tokenized search + graph relevance + optional vector（LanceDB） |
| Vector DB | LanceDB（Rust、embedded、optional） |
| PDF | pdf-extract |
| Office | docx-rs + calamine |
| i18n | react-i18next |
| State | Zustand |
| LLM | Streaming fetch（OpenAI、Anthropic、Google、Ollama、Custom） |
| Web Search | Tavily、SerpApi、SearXNG JSON API |

## インストール

### ビルド済みバイナリ

[Releases](https://github.com/nashsu/llm_wiki/releases) からダウンロードできます。

- **macOS**: `.dmg`（Apple Silicon + Intel）
- **Windows**: `.msi`
- **Linux**: `.deb` / `.AppImage`

### ソースからビルド

```bash
# Requirements: Node.js 20+, Rust 1.70+
git clone https://github.com/nashsu/llm_wiki.git
cd llm_wiki
npm install
npm run tauri dev      # Development
npm run tauri build    # Production build
```

### Chrome Extension

1. `chrome://extensions` を開く
2. "Developer mode" を有効にする
3. "Load unpacked" をクリック
4. `extension/` directory を選択

## クイックスタート

1. アプリを起動し、新しい project を作成します（template を選択）
2. **Settings** で LLM provider（API key + model）を設定します
3. 必要に応じて **Web Search** provider と source folder auto-watch を Settings で設定します
4. **Sources** から document（PDF、DOCX、MD など）を import します
5. **Activity Panel** で LLM が Wiki page を自動生成する様子を確認します
6. **Chat** で知識ベースに質問します
7. **Knowledge Graph** で関連を探索します
8. **Review** で attention が必要な item を確認します
9. **Lint** を定期的に実行し、Wiki の健全性を保ちます

## ローカル HTTP API + AI Agent Skill

LLM Wiki は `http://127.0.0.1:19828` で組み込みのローカル HTTP API を提供します（token-protected、`127.0.0.1` only）。**Claude Code**、**Codex** などの AI agent、または HTTP client を使える任意の script から Wiki を query できます。

- `GET /api/v1/health` — server status（no auth）
- `GET /api/v1/projects` — project list
- `GET /api/v1/projects/{id}/files` / `files/content` — file tree と content を取得
- `POST /api/v1/projects/{id}/search` — **hybrid** retrieval（keyword + vector）。`mode`、`tokenHits`、`vectorHits`、per-result `vectorScore` を返す
- `GET /api/v1/projects/{id}/graph` — wikilinks graph
- `POST /api/v1/projects/{id}/sources/rescan` — backend rescan を trigger

**Settings → API Server** で API を有効化し、token を生成してください。

### AI Agent をワンコマンドで接続

LLM Wiki 用の **agent skill** は別リポジトリで管理されています。Claude Code / Codex / skills-compatible runtime に install できます。

```bash
npx skills add https://github.com/nashsu/llm_wiki_skill.git --skill llm_wiki_skill
```

install 後、agent は "what does my LLM Wiki say about X"、"search my 知識庫 for Y"、"show the neighborhood of node Z in my wiki graph"、"rescan my wiki sources" といった prompt に対し、local app と直接通信して答えます。default は read-only で、app 内で確認できるよう wiki page path を cite します。

- **Skill repo**: <https://github.com/nashsu/llm_wiki_skill>
- **Trigger discipline**: generic な "search my notes" / "check my Obsidian / Notion / Logseq" では意図的に trigger しません。LLM Wiki / `my wiki` / `知識庫` を明示した場合のみ起動します。

## Project Structure

```text
my-wiki/
├── purpose.md              # 目標、主要な問い、研究範囲
├── schema.md               # Wiki 構造ルール、page type
├── raw/
│   ├── sources/            # upload された documents（不変）
│   └── assets/             # local images
├── wiki/
│   ├── index.md            # content catalog
│   ├── log.md              # operation history
│   ├── overview.md         # global summary（auto-updated）
│   ├── entities/           # people、organizations、products
│   ├── concepts/           # theories、methods、techniques
│   ├── sources/            # source summaries
│   ├── queries/            # saved chat answers + research
│   ├── synthesis/          # cross-source analysis
│   └── comparisons/        # side-by-side comparisons
├── .obsidian/              # Obsidian vault config（auto-generated）
└── .llm-wiki/              # app config、chat history、review items
```

## Star History

<a href="https://www.star-history.com/?repos=nashsu%2Fllm_wiki&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=nashsu/llm_wiki&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=nashsu/llm_wiki&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=nashsu/llm_wiki&type=date&legend=top-left" />
 </picture>
</a>

## ライセンス

このプロジェクトは **GNU General Public License v3.0** でライセンスされています。詳細は [LICENSE](LICENSE) を参照してください。
