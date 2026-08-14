<div align="center">

# Cogito

**You think, it expands — let AI expand your thinking, not replace it**

<img src="https://cdn.jsdelivr.net/gh/waliean/cogito@main/assets/banner.png" alt="Cogito — You think, it expands" width="100%">

[![License: MIT][license-shield]][license-url]
[![Version: 0.4.0][version-shield]][version-url]
[![Node 22+][node-shield]][node-url]
[![Platform: Windows][windows-shield]][version-url]

</div>

<div align="center">

English &middot; [中文](README.md)

</div>

<div align="center">

[Quick Start](#quick-start) &middot; [Features](#features-what-pain-each-feature-solves) &middot; [Typical Workflow](#typical-workflow) &middot; [Tech Stack](#tech-stack) &middot; [Docs](#docs) &middot; [Roadmap](#roadmap)

</div>

---

## Table of Contents

- [What is Cogito](#what-is-cogito)
- [The Pain: where your current AI workflow gets stuck](#the-pain-where-your-current-ai-workflow-gets-stuck)
- [Design Philosophy: You think, it expands](#design-philosophy-you-think-it-expands)
- [Features: what pain each feature solves](#features-what-pain-each-feature-solves)
- [Quick Start](#quick-start)
- [Typical Workflow](#typical-workflow)
- [Use Cases and Boundaries](#use-cases-and-boundaries)
- [Tech Stack](#tech-stack)
- [Architecture Overview](#architecture-overview)
- [Testing and Quality](#testing-and-quality)
- [Docs](#docs)
- [Roadmap](#roadmap)
- [License](#license)
- [About the Author](#about-the-author)

---

## What is Cogito

Cogito is a **locally-running** AI knowledge exploration workspace. It turns your "scattered thoughts" and "unreadable long documents" into **a traceable, editable, continuously-growing knowledge tree**.

It uses "cards" as the smallest unit of knowledge: one AI generation does not dump a wall of text on you — it produces a **card with a title, a body, term definitions, and the ability to be individually edited or rejected**. Cards grow into a tree through three relationships — drill down / diverge / branch — and the tree can be read as a card list or switched to a mind map for a full overview.

It doesn't touch the cloud, doesn't require an account, and never uploads anything of yours — your data and API key live entirely on your own machine.

> **One-line positioning**: Cogito is not a "you ask, it answers" chatbot. It is a personal knowledge-growth system where **you set the direction, and it helps you expand it**.

---

## The Pain: where your current AI workflow gets stuck

### Pain 1: Ask and discard — knowledge never accumulates

Mainstream AI tools organize content by "conversation": one topic per thread, and the moment you close the window, the product of your thinking evaporates into history. Next week, when you want to pick up the thread again, you have to scroll back through the chat — and what you find is a wall of stream-of-consciousness logs.

> **Consequence**: the time you spend writing, thinking, and reading never becomes a reusable asset.

### Pain 2: Agency quietly slips from you to the AI

This is the most insidious problem. You ask a question, and the AI hands you a complete answer — **you are led by the answer instead of driven by your own question**. It chose the topic, fixed the structure, and drew the conclusion for you; all that's left for you is "accept or reject". Over time, your ability to ask, judge, and diverge all atrophy.

> **Consequence**: you think you are thinking with AI, when the AI is really thinking for you. You become the "reviewer" instead of the "author".

### Pain 3: AI jargon blocks the way, learning gets more frustrating

CoT, RAG, context window, Token, prefix caching… AI answers are full of terms nobody explains; looking one up pulls up a whole web of more. **Especially for beginners**, this isn't a tooling problem — it's an ecosystem entry-barrier problem.

> **Consequence**: a steep learning curve. Can't understand → don't want to read → give up. Both breadth and depth get blocked.

### Pain 4: Long documents are indigestible — read and immediately forgotten

Given a 30-page PDF, reading it end-to-end takes an hour, highlighting is exhausting, and you remember nothing once you close it. A summarizer gives you a paragraph — but that paragraph **isn't your own thinking structure**, so you can't grow anything from it.

> **Consequence**: high-value material like literature, papers, and reports has a terrible input-to-output ratio.

### Pain 5: Inspiration fragments scattered everywhere, never forming a system

Memos, bookmarks, chat logs, drafts… your fragments of inspiration are scattered across seven or eight places, and nowhere can tell you: **what have I actually thought about? How are these questions related?**

> **Consequence**: you feel like you're inputting every day, but you never build "your own framework".

### Pain 6: AI output is untrustworthy, uncontrollable, untraceable

Which model did it use? How many Tokens did it cost? Why is this answer different from last time? When it fails, is it a network issue or the model acting up? Mainstream tools hide all of this — you can neither trace it nor modify a piece of it; changing one sentence often means regenerating the whole block.

> **Consequence**: when AI output quality is unstable, your only option is to redo the whole thing — cost spirals and you don't know how to fix it.

### Pain 7: No privacy guarantee

Cloud tools mean your documents, your thinking process, and your API key all pass through someone else's servers. For enterprise material, personal research, and unpublished writing, this red line blocks many scenarios that could have used AI.

> **Consequence**: either upload at risk, or don't use it at all.

### Pain 8: Setup friction drives non-developers away

A large share of the people who want to use AI tools deeply are not developers. "Install Node, configure environment variables, open two terminals, deal with port conflicts" — a one-minute chore for someone who codes is a wall for everyone else. Many who could have benefited from AI stop at "how do I even run this thing".

> **Consequence**: good tools end up available only to people who know tech; the tool itself becomes a filter.

---

**A single table summarizing the status quo vs. Cogito:**

| Dimension | Mainstream AI Q&A tools | Cogito |
|---|---|---|
| Output form | One-shot conversation stream | A growing card-based knowledge tree |
| Who does the thinking | Quietly becomes the AI | Always you: AI only expands |
| Knowledge accumulation | Nearly zero | Every act of thinking becomes an asset |
| Term understanding | You look things up everywhere | Auto-highlight + hover-to-explain + built-in dictionary |
| Long-document handling | A paragraph summary and done | PDF/TXT → a card tree that keeps growing |
| Traceability | None | Every card records model / Token / latency |
| Editability | Redo the whole block | Each card independently edited, rejected, retried |
| Data privacy | Cloud | Fully local, key never echoed back |
| Mind map & notes | Two tools that don't sync | Two views of the same data |

---

## Design Philosophy: You think, it expands

"Cogito" comes from Descartes' *Cogito, ergo sum* ("I think, therefore I am"). The name is a reminder of the core claim: **the subject of thinking must be you**.

In Cogito, the division of labor between human and AI is deliberately asymmetric:

| Role | Responsibility | Concrete action |
|---|---|---|
| **You (the thinker)** | Choose topics, set direction, judge right from wrong | Decide which card to drill into, which to diverge, which to branch; edit, reject, reorganize any card |
| **AI (the expander)** | Break open and spread out the direction you point at | Generate semantically coherent, information-dense card drafts; suggest branches; extract term definitions |
| **You (the final judge)** | Last arbiter | AI output is only a draft — every card keeps full human editing capability |

Why design it this way? Because what AI is best at is "expanding along a given direction", and what it's worst at is "judging which direction is worth expanding". Hand the former to AI, keep the latter for humans — this isn't virtue, it's efficiency: **let each side do what it is most irreplaceable at**.

---

## Features: what pain each feature solves

<img src="https://cdn.jsdelivr.net/gh/waliean/cogito@main/assets/features.png" alt="Cogito — three core outcomes" width="100%">

### 1. Card-based knowledge tree: let thinking "grow" instead of "flow away"

**What it is**: the smallest unit of knowledge is a "card" (title + Markdown body + term list). Cards spawn child cards via three relationships:

| Generation mode | Meaning | When |
|---|---|---|
| **Drill down** (child) | Pick one point in a card and go deeper | When a concept needs to be fully excavated |
| **Diverge** (divergent) | Explore adjacent and related directions from a card | When your thinking needs broadening |
| **Branch** (branch) | Follow a thread in the card and fork a new line | When a thread deserves its own expansion |

**What pain it solves**: Pain 1 (ask-and-discard) and Pain 6 (uncontrollable). What's generated isn't "an answer" but **an independent, editable card** — you can rename it, rewrite it, delete and redo it, even move it under a different parent, without affecting the whole tree. Existing subtrees are **never rewritten** during incremental generation.

**Technical highlights**: single-card content has hard constraints (title ≤ 40 chars, body 200–500 chars of Markdown, 3–6 terms that must appear verbatim in the body), keeping cards "small and precise" and the tree "dense and clear"; each card's `parentId` explicitly records lineage, so the full root-to-leaf thinking path is traceable.

---

### 2. MindScape mind map: one-map overview, cards/mind-map from the same source

**What it is**: a mind-map view built on @xyflow/react + dagre deterministic layout. The card list and the mind map **share the same data**, switchable with one click, and linked both ways: clicking a map node opens the corresponding card detail; adding/deleting/editing in the card list syncs to the map in real time.

**What pain it solves**: Pain 5 (fragments never form a system). "Note tools" and "mind-map tools" are two separate systems whose data doesn't interoperate; once you draw a map it's detached from your notes. In Cogito, they're two renderings of one thing.

**Technical highlights**:
- dagre deterministic layout — the same tree lays out identically every time it opens, no "ghost jitter";
- MiniMap colors cards by status (draft/processing/done/failed), so you can locate anything at a glance even with thousands of nodes;
- the minimap is resizable by drag, and nodes can collapse subtrees — reading efficiency stays controllable on very large trees;
- pure-function `dagreLayout(nodes, edges)` design means the layout logic is unit-testable and replaceable.

---

### 3. AI branch suggestions: facing a blank, it gives you three directions first

**What it is**: select a card in the mind map and click "Branch suggestions" — the AI analyzes the card and returns **3 suggestions** — one each for drill down / diverge / branch, each with a title and a one-line reason (e.g. "Suggest drilling down: state machines and concurrency conflicts — the card mentions the `processing` state without expanding it"). You read them and decide which to adopt; adopting generates the corresponding child card in one click.

**What pain it solves**: Pain 2 (agency taken away) and "blank canvas anxiety". Many people get stuck not because they don't want to think, but because they don't know which way to expand a card. Here the AI's role is **advisor**, not **ghostwriter** — suggestions only lower the "where do I start" cost; direction judgment and the final call always stay with you.

**Technical highlights**: `POST /api/cards/:id/suggestions` is a **read-only endpoint** that never mutates card state; suggestion count/length have hard validation (title ≤ 20 chars, reason ≤ 40 chars), and fewer than 3 triggers one automatic retry; "adopt & generate" reuses the exact same state machine and error handling as single-card generation — consistent, predictable behavior.

---

### 4. One-click full map generation: one button grows a forest, without ever destroying existing work

**What it is**: the "Generate full tree" toolbar action lets you configure generation depth (1–3 levels, default 2) and branches per node (1–4, default 3). The dialog **previews the number of cards to be generated in real time**; on confirm, it generates the full map from every root node, level by level, breadth-first.

**What pain it solves**: the scaled-up version of Pain 1 and Pain 5. Generating a dozens-of-cards map one at a time is tens of minutes of repetitive labor; getting the whole map from a "one-shot answer" is completely uncontrollable — budget, order, and failures all unknown. One-click generation turns "growing a big tree" from manual labor into a single configuration.

**Technical highlights** (one of the most "engineered" features in the project):
- **Incremental semantics**: nodes that already have children are skipped, existing subtrees are never rewritten — your manual edits are always safe;
- **Budget protection**: a full tree, including existing cards, is capped at 50; over-limit / no root cards / out-of-range params return 400 immediately, preventing runaway spend;
- **Partial-failure collection**: one node failing doesn't fail the whole tree; the failure list (node, error code, reason) is returned in the result with a 200 rather than a blanket error;
- **Dynamic timeout**: `min(timeout × estimated calls, 300s) + 30s` — call volume is estimated geometrically, so long tasks don't hang forever;
- serial recursive calls avoid `E_CARD_BUSY` concurrency conflicts, with semantics identical to single-card generation.

---

### 5. Glossary + built-in dictionary: translating AI jargon into plain language

**What it is**: a three-tier term system:

1. **Auto-highlight**: when the AI generates a card it is forced to extract 3–6 terms with definitions, highlighted verbatim in the body;
2. **Hover-to-explain / click-to-link**: hovering a term pops up its definition; clicking a term in any card highlights every occurrence globally and locates it in the glossary sidebar;
3. **Built-in AI coding dictionary**: ships with 62 AI programming terms as a localized encyclopedia (model / Token / context window / MCP / subagent …). Dictionary entries in the body get their own distinct style (italic/bold/underline) and hover-to-lookup; there's a dedicated "Dictionary" view for full browsing, plus a "Glossary" view that manages terms you **manually saved** (same term with different meanings is shown separately with its source card labeled, with one-click select-all save).

**What pain it solves**: Pain 3 (jargon blocks the way), **especially for beginners**. Unfamiliar terms no longer require jumping out of context to a search engine — reading density drops sharply; and the most confusing case ("the same term with different definitions in different cards") is exposed explicitly through source labeling instead of being glossed over.

**Technical highlights**: highlighting uses **longest-first matching** (`term.length` descending, so "context" doesn't swallow "context window"); the Markdown detail page uses TreeWalker to wrap only pure text nodes, **never touching any HTML structure** — the highlight feature introduces no XSS surface; dictionary data is generated offline from the `ai-coding-dictionary-zh` repository by a standalone script.

---

### 6. Document import (PDF / TXT): long text becomes a card tree in one click

**What it is**: upload a PDF or TXT (≤10MB) and the backend automatically runs a "text extraction → AI structured summary → auto-generate root card" pipeline: an uploaded paper becomes a knowledge tree you can grow from any angle in minutes, with the root card keeping lineage to the original document (`sourceDocumentId`). Progress is polled every 1.5s, and failures can re-summarize with one click.

**What pain it solves**: Pain 4 (long text is indigestible). A summarizer gives you "a conclusion"; Cogito gives you "a starting point" — the summary becomes a root card, and you can immediately drill down / diverge / branch from any sentence of it, turning "read it" into "absorbed it".

**Technical highlights**:
- upload validation is **paired**: MIME type and extension must match (prevents a .pdf disguised as text/plain);
- TXT decoding probes UTF-8 (including BOM) and falls back to GBK (iconv-lite), so old files from Chinese Windows environments no longer garble;
- scanned PDFs (no text layer) report `E_PDF_NO_TEXT` explicitly instead of returning garbage summaries;
- the summary pipeline is serially queued (202 → queue → extract → AI summary → auto-create root card), avoiding concurrency-driven rate limits.

---

### 7. Folder workspace: turn a whole local folder into a knowledge source

**What it is**: when creating a workspace you can directly associate a local folder (the desktop app pops a system folder picker). The app provides a VS Code-like file-tree browser: browse the hierarchy, preview text/Markdown/PDF, and import a selected document as a card tree in one click.

**What pain it solves**: Pain 5 (fragments scattered). When materials are thinly spread across local directories, dragging them in one by one is pure manual labor; once you make a workspace for a folder, **document browsing and importing live in the same interface**, with paths and lineage kept transparent.

---

### 8. Full provenance (aiMeta): every card has a "birth certificate"

**What it is**: every AI call (card generation, document summary, branch suggestions, full-tree generation) honestly records `aiMeta`: **model, input Tokens, output Tokens, latency (ms), whether it retried, and the error code on failure** — shown in card and document details.

**What pain it solves**: Pain 6 (untrustworthy, untraceable). "Why was this answer so expensive?" "Why is it different from last time?" "Where exactly did it fail?" — no more guessing, everything is auditable: Token counts make cost visible, error codes take you straight to the cause (429 rate-limit / 504 timeout / invalid key), and the `retried` field tells you whether the result went through a retry, so you don't mistake "occasional" for "systematic".

---

### 9. Local-first and privacy: your data and key belong only to you

**What it is**: fully localized, on both fronts —

- **Local data**: cards, documents, and settings are all stored in a local JSON file (`backend/data/db.json`) and a local `uploads/` directory — nothing is uploaded to any cloud;
- **Local key**: the API key is written only to the local database; `GET /api/settings` **never returns the key in plaintext** — it exposes only non-sensitive config like `hasApiKey`, meaning no endpoint path can ever echo back the key you entered;
- **Three-tier key resolution**: request header `X-API-Key` > local settings > environment variable `DEEPSEEK_API_KEY`, so team/script scenarios don't need to enter a key in the UI;
- **Repo safety**: `db.json` and `uploads/` are in `.gitignore`, so even if you push the project to GitHub, your key never leaks.

**What pain it solves**: Pain 7 (the cost of the privacy red line). For hard "keep confidential material off the cloud" scenarios — internal company references, unpublished papers, personal research notes — this is the difference between "can use AI" and "cannot use AI"; for regular users, it removes the whole data-exchange path of signup, login, and subscription.

---

### 10. Reliability and fault tolerance: no data loss on power-off, failures you can read

**What it is**: production-facing engineering safeguards:

| Risk | Countermeasure |
|---|---|
| Power off / crash / force-kill | temp file + post-write JSON validation + overwrite-to-disk write flow, with a serialized write queue; corrupted data is automatically backed up as `db.json.corrupted-{timestamp}.bak` and the store rebuilt — no silent corruption |
| AI service flakiness | SDK retries 3× (exponential backoff + Retry-After), JSON-parse failure retries once, card state machine `draft → processing → done / failed` |
| Accidental double-click on generate | generating again during `processing` returns 409 `E_CARD_BUSY`, preventing re-entry |
| Not knowing how to continue after a failure | `failed` cards retry with one click; all error codes map to localized text: 429 says slow down, 504 says timeout, missing key points you straight to settings |

**What pain it solves**: the engineering side of Pain 6 (cost spiraling). AI apps lose user trust fastest at the moment of "failure" — the design goal here is **recoverable failures, readable errors, no data loss**, keeping uncertainty within a range the user can understand.

---

### 11. Desktop app: install and go, no Node knowledge required

**What it is**: an Electron-packaged Windows desktop version (NSIS installer + portable no-install variant). One installer handles everything: the app automatically launches the backend child process, auto-assigns a free port, auto-hosts the frontend static assets, stays in the system tray, minimizes on close, and cleans up the backend on exit.

**What pain it solves**: the "setup friction" pain — without the desktop app, using Cogito requires Node 22+, two terminals, and manual port management, which is a deal-breaking barrier for non-developers. The desktop app turns **install → enter key → start thinking** into three steps, and it's the final realization of the privacy promise (everything stays local).

---

### 12. Bilingual UI (i18n): one-click switching, follows your system

**What it is**: the app interface (settings panel, card actions, error messages, and desktop main-process text like tray menu / window title) supports Chinese / English, defaulting to "follow system". Choose one of three in "Settings → Language"; the switch takes effect instantly and persists across restarts.

**What pain it solves**: an extension of the "setup friction" pain — language preference shouldn't be an assumption you must get right at install time. Non-Chinese users can onboard with zero friction, and developers who want the UI language to match their documentation save the hassle.

**Technical highlights**: built on `react-i18next` + `i18next`; language preference `system | zh | en` stored in backend `PublicSettings` (db.json); Electron main-process text syncs with the renderer via IPC; error-code text is localized while keeping the English error-code contract; the AI coding dictionary and user-generated content are **deliberately not translated**.

---

## Quick Start

### Option 1: Desktop app (recommended, non-developer friendly)

1. Go to the [Releases page](https://github.com/waliean/cogito/releases);
2. Download `Cogito Setup x.x.x.exe` (installer, NSIS wizard) or the portable zip (`win-unpacked.zip` — extract and run `Cogito.exe` directly, no install needed; data is stored in the `data/` directory next to `Cogito.exe` and moves with the whole folder);
3. After launching, open "Settings" in the top-right, enter your DeepSeek API Key, and click "Test connection":
   - the key is stored only locally; neither the UI nor the backend API echoes back plaintext;
   - you can also skip the key — any AI operation will then guide you to Settings.

### Option 2: Development mode (for people who want to modify code / build on it)

```bash
npm install        # Node 22+ (npm workspaces: shared + backend + frontend)
npm run dev        # one-command start: backend :3001 + frontend :5173 (Vite auto-proxies /api)
npm test           # all tests: backend 144 cases + frontend 62 cases
npm run typecheck  # repo-wide TypeScript type check
npm run dist:win   # package Windows installer + portable (output to release/)
```

### First-use three steps

1. (Optional) enter an API key in Settings and test the connection;
2. create a workspace (or associate a local folder);
3. create a card manually → select it → click "Drill down / Diverge / Branch" to generate child cards, or upload a PDF/TXT and let the AI generate a root card.

---

## Typical Workflow

Take "finish reading an AI survey PDF and form my own knowledge system" as an example, end to end:

1. **Import**: drop the PDF into the workspace → backend extracts text → AI summary generates a root card (title, Markdown summary, auto-extracted terms);
2. **Read**: terms in the body are auto-highlighted, hover to see definitions — unfamiliar concepts are digested on the spot, no jumping out to search;
3. **Expand**: click "Branch suggestions" on the root card — the AI gives one drill-down / diverge / branch direction each → adopt two of them and enter deep reading;
4. **Fork**: a thread worth separate study → use "Branch" mode to start another line; many cards without chaos;
5. **Overview**: switch to MindScape — the whole tree on one map; mini-map coloring shows at a glance which cards are still drafts and which are done;
6. **Settle**: collect frequent terms into the glossary (same term with different meanings auto-grouped, source labeled); when you need to lay it out fully, use "Generate full tree" to reclaim the time spent on repetitive work (incremental semantics guarantee your manual edits aren't overwritten);
7. **Review**: every card's aiMeta tells you how many Tokens the whole exploration cost and which step failed — cost and path fully transparent.

---

## Use Cases and Boundaries

### For you, if you are…

- **a learner**: term highlighting + built-in dictionary + card-based decomposition — a dimensionality-reducing tool for reading and note-taking (especially friendly to AI-coding beginners);
- **a researcher / analyst**: long PDF papers → a growing knowledge tree, with traceable source lineage;
- **a writer / thinker**: turning "ideate → expand → reorganize" into an explicit tree process, avoiding inspiration loss;
- **privacy-conscious**: internal references, unpublished manuscripts — all processed locally;
- **someone who wants AI as a second brain but refuses to be replaced**: you think, it expands, with a clear division of labor.

### Not for you, if you…

- **only want a faster answer**: Cogito deliberately refuses to judge for you; it may be "slower" than a chat tool — that's by design;
- **need image / multimodal input**: currently only PDF/TXT text content is supported; scanned PDFs without a text layer report a clear error (OCR is on the roadmap);
- **need multi-user collaboration / cloud sync**: the current positioning is a local, single-machine personal tool.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + TypeScript + Vite, zustand state management |
| Mind map | @xyflow/react (React Flow) + dagre deterministic layout |
| Backend | Node.js + Express 5 (full ESM), JSON file storage + atomic writes |
| AI | openai SDK (baseURL pointed at DeepSeek), JSON mode, timeout, retry, error-code mapping |
| Documents | multer upload validation + pdf-parse extraction + iconv-lite (UTF-8/GBK) decoding |
| Desktop | Electron 43 + electron-builder (NSIS / portable) |
| Testing | Vitest (backend 144 cases + frontend 62 cases), supertest + jsdom |
| Repo | npm workspaces monorepo: `shared` (shared types/constants) / `backend` / `frontend` |

## Architecture Overview

```
[Electron main process electron/main.cjs]
  ├─ single-instance lock; launches backend child process (random port); parses stdout for the real port
  ├─ BrowserWindow loads frontend; system tray; cleans up backend on exit
  │
[backend  Express :3001 (dev) / <random port> (desktop)]
  ├─ middleware: apiKey (X-API-Key three-tier resolution) → error (unified error-code mapping)
  ├─ routes: workspaces / cards(+generate+suggestions+generate-tree) / documents / terms / settings
  ├─ services: cardService / aiService / treeService / documentService / folderService / settingsService
  └─ storage: JSON atomic writes → backend/data/db.json    uploads/ → original documents
               │
[frontend  Vite :5173 (dev) / <Express static hosting> (desktop)]
  ├─ AppShell → views: cards (card tree) | mindscape (mind map) | glossary | dictionary
  ├─ stores (zustand): workspace / card / document / settings / ui / term
  └─ TermText: global term highlighting + hover explanations + dictionary-entry styling
```

> For deeper detail (data schema, API contracts, state machine, prompt design, ADRs), see [docs/design.md](docs/design.md); for desktop packaging details see [docs/packaging.md](docs/packaging.md).

---

## Testing and Quality

- **Backend 144 cases**: storage atomic-write/corruption-recovery, card state machine and concurrency re-entry prevention, AI retry and error-code mapping, document upload validation and GBK decoding, full API integration (X-API-Key priority, unified error structure);
- **Frontend 62 cases**: flow tests for five async stores (workspace / card / document / settings / term; ui is sync view state), TermText longest-first highlight matching, dagre layout determinism, API client error wrapping, and i18n language resolution / error localization;
- Commands: `npm test` runs everything; `npm run typecheck` runs repo-wide type checks.
- Browser end-to-end validation (Playwright): home / settings / workspace / editor generation area / mind map / document drawer / branch suggestions and full-tree generation, with no console errors; language switching between Chinese and English verified live.

---

## Docs

| Doc | Content |
|---|---|
| [docs/design.md](docs/design.md) | Technical design: data schema, API contracts, state machine, prompts, ADRs |
| [docs/packaging.md](docs/packaging.md) | Desktop packaging: build, package, verify, FAQ |
| [CHANGELOG.md](CHANGELOG.md) | Version changes and release notes |

> The built-in AI coding dictionary (62 entries) is compiled into the app frontend and needs no extra data files; its source is generated from the Chinese localization of the open-source *Dictionary of AI Coding* by a standalone script, updatable offline via `scripts/generate-dictionary.mjs`.

## Roadmap

Per the known boundaries and planned directions recorded in `docs/design.md` (non-committal):

- **SSE streaming generation**: streaming progress and mid-task cancellation for full-tree/long tasks (in design; currently sync requests + dynamic timeout);
- **OCR support**: the plan-B for scanned PDFs (currently reports `E_PDF_NO_TEXT` explicitly);
- **Concurrent tree generation**: full-tree generation is currently serial-recursive to avoid `E_CARD_BUSY`; controlled concurrency can speed up large trees later;
- **Data export**: structured export of the knowledge tree / glossary (Markdown / JSON).

## License

[MIT](./LICENSE)

## About the Author

Henry — an independent developer who believes AI should amplify thinking, not replace it. The project name Cogito is a footnote to that belief: **I think, therefore I am — not "it thinks, therefore I am".**

---

<p align="center">
  <a href="#what-is-cogito">⬆ Back to top</a>
</p>

<!-- Badge links (reference-style) -->
[license-shield]: https://img.shields.io/badge/License-MIT-blue.svg
[license-url]: ./LICENSE
[version-shield]: https://img.shields.io/badge/Version-0.4.0-blue
[version-url]: https://github.com/waliean/cogito/releases
[node-shield]: https://img.shields.io/badge/Node-22%2B-339933
[node-url]: https://nodejs.org
[windows-shield]: https://img.shields.io/badge/Platform-Windows-lightgrey
