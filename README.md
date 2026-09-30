# Hacker News Research

<p align="center">
  <a href="https://dashboard.decodo.com/scrapers/pricing?utm_source=github&utm_medium=social&utm_campaign=hackernews-research"><img src="https://github.com/user-attachments/assets/13b08523-32b0-4c85-8e99-580d7c2a9055" alt="Decodo Web Scraping API" /></a>
</p>

**Hacker News Research** is an open-source AI research agent for Hacker News trends. It picks promising HN submissions, follows their external links, reads the linked pages as Markdown, and analyzes them together with the HN discussion to show what developers are building, struggling with, and finding interesting. You choose the research depth.

Unlike a Hacker News digest or title-keyword tracker, Hacker News Research combines story discovery, linked-page analysis, comment analysis, and cross-story synthesis in one report.

> Hacker News Research isn't affiliated with Y Combinator or Hacker News.

<br>

<p align="center">
  <img src="https://github.com/user-attachments/assets/cb7b0f3b-8399-4a89-add5-87b78034881c" alt="Hacker News Research main research screen" width="800" />
</p>
<p align="center"><sub>Choose HN sources and research depth from the main screen.</sub></p>

<br>

## Quick navigation

- [Who Hacker News Research is for](#who-hacker-news-research-is-for)
- [How it works](#how-it-works)
- [Example report](#example-report)
- [Track Hacker News trends beyond titles and points](#track-hacker-news-trends-beyond-titles-and-points)
- [Choose your research depth](#choose-your-research-depth)
- [Recurring monitors](#recurring-monitors)
- [How Hacker News Research compares](#how-hacker-news-research-compares)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [FAQ](#faq)

## Who Hacker News Research is for

Hacker News Research works as a topic research tool and trend analysis tool for:

- **Developers** who want a structured view of tools, architectures, and technical debates gaining attention on HN
- **Technical researchers** who want to move from individual stories to recurring developer themes and open questions
- **Content teams** looking for developer pain points, topic research, and evidence-backed content opportunities
- **Developer-tool teams** monitoring how technical audiences discuss new workflows, APIs, infrastructure, and AI tooling

## How it works

1. **Choose HN sources**. Select Front page, New HN submissions, Ask HN, Show HN, or a combination.
2. **Choose research depth**. Quick, Standard, and Deep control the research budget.
3. **Collect Hacker News data**. The backend uses the official Hacker News API to collect candidate submissions, metadata, and comment threads.
4. **Triage promising stories**. A lower-cost LLM pass selects the stories most worth deeper investigation.
5. **Retrieve selected linked pages**. External URLs are collected with [Decodo Web Scraping API](https://decodo.com/scraping/web) and returned as Markdown.
6. **Analyze each selected story independently**. The research model combines the HN submission, discussion, and usable linked-page content for that story.
7. **Validate recurring themes**. Candidate themes must be supported by multiple independently analyzed stories with the same concrete topic.
8. **Synthesize the report**. The final pass produces the summary, technologies and tools, developer problems, content opportunities, and research leads.
9. **Store and export the run**. MongoDB stores completed reports in History, and reports can be exported as Markdown or JSON.

The Hacker News API supplies HN-native data. The Web Scraping API is used only for external pages linked by selected submissions.

## Example report

A Standard run can turn a current HN snapshot into a structured research report with technologies in focus, developer problems, content opportunities, and story-level research leads.

**Example generated September 28, 2026**

- **Sources**: Front page, New HN submissions, Ask HN, Show HN
- **Candidate stories**: 60
- **Stories investigated**: 9
- **External pages retrieved**: 5/5
- **Usable external sources**: 5/5
- **HN comments analyzed**: 29
- **LLM calls**: 11

**Summary**

> This snapshot contained distinct developer-relevant signals with no validated recurring theme across the selected stories. Strong individual leads included business-critical legacy DOS and industrial hardware still in active use, a draft Durable Actor Session Protocol for resumable actor sessions, a rootless container sandbox for LLM-generated code, and workplace mandates requiring developers to use AI coding tools.

**Technologies and tools in focus**

- **Linux namespaces, cgroups, and seccomp**: Kern Sandbox uses a rootless, daemonless container model for executing LLM-generated code in ephemeral OCI containers.
- **Emscripten and Rust on Cloudflare Workers**: Cloudflare demonstrated the `wasm32-unknown-emscripten` target with `wasm-bindgen`, including Tokio-based Rust workloads.
- **Jev typed decision models**: Separate HN threads discussed Jev's zero-shot classification model and a Unix-pipe CLI that wraps it for high-volume agent decisions.

**Developer problems**

- No native per-file, time-limited authorization primitive for AI agents in common cloud-storage workflows.
- Legacy industrial systems remain difficult to migrate when proprietary ISA hardware or bespoke I/O is involved.
- Rootless code sandboxes can silently lose resource-limit enforcement when cgroup v2 delegation is unavailable.

**Content opportunities**

- Scoped cloud-file access for AI agents: what practical workarounds exist today?
- Jev vs. BERT, BART, and FLAN-T5 for zero-shot classification.
- Kern vs. microVMs vs. gVisor for LLM-agent sandboxing.

The report keeps source links and evidence labels attached to findings so a reader can distinguish linked-page evidence from HN discussion.

<br>

<p align="center">
  <img src="https://github.com/user-attachments/assets/ba855a8c-84c9-4cb4-9d76-8f3b5bae1d1b" alt="Hacker News Research report screen" width="800" />
</p>
<p align="center"><sub>Report of a Standard depth run of Front page, New HN submissions, Ask HN, and Show HN sources.</sub></p>

<br>

## Track Hacker News trends beyond titles and points

Hacker News Research starts with current HN activity, but it doesn't treat points, titles, or comment counts as the final result.

You can research:

- **Front page** stories for stronger current engagement
- **New HN submissions** for early discovery
- **Ask HN** for developer problems, workflows, opinions, and unmet needs
- **Show HN** for new tools, architectures, and product ideas

The selected feeds define the candidate pool. They aren't quotas for the final shortlist: one source can contribute more investigated stories than another if the research triage finds stronger leads there.

Each completed report shows **source contribution**, so you can see how many candidate and investigated stories came from each selected feed.

## Choose your research depth

Research depth controls how broadly Hacker News Research scans and how many promising stories it is willing to investigate.

| Depth | Candidate pool | Typical investigated stories | Relative API / LLM usage | Best for |
| --- | ---: | ---: | --- | --- |
| **Quick** | ~20–30 | ~3–5 | Lowest | Fast signal checks |
| **Standard** | ~60 | ~8–10 | Medium | General research |
| **Deep** | ~100 | ~15–16 | Highest | Broader discovery and denser reports |

These are research budgets, not fixed quotas. The exact shortlist, linked-page count, runtime, and token usage depend on the current HN snapshot, source overlap, page size, selected LLM, and whether the run finds enough strong leads.

## Analyze the articles Hacker News links to

For selected stories with external URLs, Hacker News Research sends the linked pages to [Decodo Web Scraping API](https://decodo.com/scraping/web) and requests Markdown for LLM analysis.

The research engine distinguishes retrieval success from usable evidence. An external request can be:

- **Usable**: the page contains relevant source content
- **Unusable**: the request returned content, but not useful article/project evidence
- **Failed**: the external request didn't return analyzable content
- **No external URL**: the HN submission is native to Hacker News

If every requested external page fails because Decodo authentication is unavailable, the research run still completes using HN submission and comment evidence. The report displays a prominent warning instead of silently pretending that linked pages were analyzed.

## Find developer pain points in HN comments

HN comments are treated as discussion evidence, not as a substitute for the linked source.

Reports can surface:

- developer workflow problems
- implementation trade-offs
- unresolved technical questions
- product gaps
- adoption friction
- disagreements worth researching further
- content opportunities grounded in actual discussion

The analysis also avoids promoting every repeated phrase into a "trend." A recurring theme must be supported by independently analyzed stories that share the same concrete topic. If that standard isn't met, the report says that no validated recurring theme was found and presents the strongest individual signals instead.

## Evidence-aware research

Hacker News Research labels findings according to the evidence actually available:

| Evidence label | Meaning |
| --- | --- |
| **Source-backed** | Supported by an analyzed external page |
| **Source + discussion** | Supported by both the external page and HN comments |
| **Discussion-only** | Supported by HN discussion without usable external source evidence |
| **HN submission only** | Based on an HN-native submission with no discussion evidence |

Story-level analysis tracks the supporting story IDs behind synthesized findings, and the backend derives the displayed evidence label from that provenance.

This keeps linked-page facts, HN commentary, and model synthesis from collapsing into one undifferentiated claim.

## Recurring monitors

Any research configuration can be saved as a recurring monitor.

A monitor stores its source selection and research depth, then launches new research runs on its schedule while the backend is running. Scheduled reports are identified in History by their monitor name so they remain distinguishable from ordinary manual research.

If a monitor becomes due while the backend is offline, the overdue run starts when the backend resumes and the recurring schedule remains anchored to its existing cadence.

Monitors can also be run manually, paused or resumed, and deleted.

## How Hacker News Research compares

Hacker News Research is built for HN-first trend research: it goes beyond search by combining selected Hacker News stories, linked pages, and discussion into cross-story findings.

| | Hacker News Research | HN Search by Algolia | last30days |
| --- | --- | --- | --- |
| **Primary workflow** | Research developer trends across selected HN stories | Real-time full-text search across Hacker News data | Research a topic across HN and multiple other sources |
| **HN discussion** | Analyzes HN comments as story-level research evidence | Indexes and searches HN comment text | Supports HN comment enrichment |
| **HN-linked pages** | Retrieves and analyzes pages linked by selected HN stories | No | No dedicated per-story HN linked-page analysis workflow |
| **Cross-story synthesis** | Yes, across selected HN stories | No | Yes, across multiple sources |
| **Research depth** | Quick, Standard, and Deep | Search queries and filters | Quick, default, and deep |
| **HN-only focus** | Yes | Yes | No |
| **Recurring monitoring** | Built in; scheduled monitors run directly in the app | No | Watchlist and stored research are supported; recurring execution requires an external scheduler |
| **Runs locally** | Yes | No full local equivalent of the hosted Algolia search index | Yes |

Hacker News Research is specifically built for HN-first depth: it treats the submission, linked source, and discussion as one evidence package before synthesizing findings across the selected Hacker News snapshot.

## Quick start

### Prerequisites

Before installing the project, make sure you have:

- [Bun](https://bun.sh) 1.2.5 or newer
- A container runtime with Compose support, such as [Podman](https://podman.io/) or [Docker](https://docker.com/)
- A Decodo Web Scraping API Basic Auth token – [create a Decodo account](https://dashboard.decodo.com/register?page=scrapers/pricing)
- At least one supported LLM provider API key:
  - Anthropic
  - OpenAI
  - Google Gemini

> If you've just installed Bun, open a new terminal window or reload your shell configuration before running `bun install`.
>
> Examples:
> - zsh: `source ~/.zshrc`
> - bash: `source ~/.bashrc`

### 1. Clone and install

```bash
git clone https://github.com/Decodo/hackernews-research.git
cd hackernews-research
bun install
```

### 2. Create your environment file

```bash
cp .env.example .env
```

Add your Decodo token and at least one supported LLM API key. You can also configure or override credentials later from **Settings**.

### 3. Start MongoDB

Make sure your container runtime is running, then start the local MongoDB container:

```bash
bun db:up
```

The script automatically uses Podman Compose when available, otherwise Docker Compose.

On macOS with Podman, you may need to install a Compose provider separately:

```bash
brew install podman-compose
```

If port `27018` is already allocated, another MongoDB container or service is using that host port. Stop the conflicting service or change both `MONGO_PORT` and the port in `MONGODB_URI`.

### 4. Build and run

```bash
bun run build
bun dev
```

Keep the terminal window open while using the application. Closing it stops the local frontend and backend.

Frontend:

```text
http://localhost:5274
```

Backend API:

```text
http://localhost:5002
```

## Configuration

### Credentials and provider settings

The **Settings** page can:

- choose the active LLM provider
- set an optional model override
- save Anthropic, OpenAI, and Gemini API keys
- save the Decodo Web Scraping API Basic Auth token
- test provider-specific connections
- clear a saved credential and fall back to `.env`

The settings API returns credential presence and source state, not the secret values themselves.

> **Security note**: credentials saved through Settings are persisted in MongoDB and aren't encrypted at rest. For a shared or production deployment, use an appropriate secret-management strategy or add encryption before exposing the application to multiple users.

### Environment variables

The project reads local environment settings from `.env`. The included `.env.example` contains:

```env
# Backend
PORT=5002
PUBLIC_API_BASE_URL=http://localhost:5002
PUBLIC_FRONTEND_URL=http://localhost:5274

# Database
MONGO_PORT=27018
MONGODB_URI=mongodb://localhost:27018/hn-intelligence

# Decodo Web Scraping API
# Paste the Basic Auth token only, without the word "Basic".
DECODO_AUTH_TOKEN=
DECODO_SCRAPER_ENDPOINT=https://scraper-api.decodo.com/v2/scrape

# LLM provider: claude | openai | gemini
LLM_PROVIDER=claude
LLM_MODEL=

# Optional cheaper provider-specific model for triage
LLM_TRIAGE_MODEL=

ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=
```

Only the API key for the selected provider is required. `LLM_MODEL` and `LLM_TRIAGE_MODEL` can be left empty to use the application defaults.

Files beginning with a dot may be hidden by default. If you don't see `.env` in the project folder:

- On macOS Finder, press **Cmd**+**Shift**+**.**
- On most Linux file managers, press **Ctrl**+**H**
- On Windows, use **View** → **Show** → **Hidden items** if needed

| Variable | Description |
| --- | --- |
| `PORT` | Backend port. Defaults to `5002` |
| `PUBLIC_API_BASE_URL` | API URL used by the frontend |
| `PUBLIC_FRONTEND_URL` | Frontend URL used by the application |
| `MONGO_PORT` | Host port mapped to the MongoDB container |
| `MONGODB_URI` | MongoDB connection string |
| `DECODO_AUTH_TOKEN` | Decodo Web Scraping API Basic Auth token, without the `Basic` prefix |
| `DECODO_SCRAPER_ENDPOINT` | Decodo scraping endpoint. The included default is normally sufficient |
| `LLM_PROVIDER` | LLM provider: `claude`, `openai`, or `gemini` |
| `LLM_MODEL` | Optional main-model override |
| `LLM_TRIAGE_MODEL` | Optional triage-model override |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `GEMINI_API_KEY` | Google Gemini API key |

## Output

Every completed research run is stored in **History** and can be reopened later.

Reports include:

- run metadata and source contribution
- summary
- validated recurring themes when supported
- technologies and tools in focus
- developer problems and questions
- content opportunities
- story-level research leads
- HN engagement
- evidence basis
- linked-page usability status
- source links
- HN discussion summaries
- LLM call and token usage

Reports can be exported as **Markdown** or **JSON**.

## Research methodology

Hacker News Research separates deterministic collection and provenance from LLM interpretation.

- **Stories are deduplicated by HN story ID**. If the same story appears in multiple selected feeds, it is analyzed once.
- **Source contribution remains visible**. Overlapping candidates are attributed once to the selected feed where they rank highest.
- **External retrieval success isn't treated as evidence by itself**. Retrieved content must still be usable and relevant to the linked story.
- **Story analysis is isolated**. Each selected story is analyzed independently before final synthesis.
- **Themes require multiple stories**. A recurring theme needs at least two independently analyzed stories sharing the same concrete topic.
- **Generic topic labels are rejected**. Shared implementation technology alone doesn't make unrelated stories one theme.
- **Evidence labels are derived from provenance**. The report distinguishes source-backed, discussion-backed, and HN-submission evidence.
- **Unsupported broad claims are guarded**. Deterministic validation catches unsupported quantifiers before report output.
- **Generated years aren't assumed**. A calendar year is kept only when supporting evidence establishes it.
- **No-theme runs are valid**. When the evidence contains distinct signals rather than a recurring pattern, the report says so instead of manufacturing a theme.

## API endpoints

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/research` | Run Hacker News research |
| `POST` | `/research/stream` | Run research with NDJSON progress events |
| `GET` | `/queries` | List saved research history |
| `GET` | `/queries/:id` | Retrieve one stored report |
| `DELETE` | `/queries/:id` | Delete a history entry |
| `GET` | `/monitors` | List recurring monitors |
| `POST` | `/monitors` | Create a recurring monitor |
| `PATCH` | `/monitors/:id` | Update, pause, or resume a monitor |
| `POST` | `/monitors/:id/run` | Run a saved monitor immediately |
| `DELETE` | `/monitors/:id` | Delete a monitor |
| `GET` | `/settings` | Return provider/model and credential state |
| `PATCH` | `/settings` | Update provider, model, or saved credentials |

## FAQ

### How does Hacker News Research decide which submissions are promising?

Hacker News Research first collects candidates from the selected HN feeds, then uses a triage LLM to identify the stories most likely to contain useful developer signals. The shortlist is a research decision, not a ranking of the "best" HN posts, and selected feeds define the candidate pool rather than fixed per-feed quotas.

### What does research depth control?

Research depth controls the size of the candidate pool and the amount of deeper story analysis the tool is willing to perform. Quick favors a small, signal-dense shortlist, Standard is the general-purpose default, and Deep scans a broader HN snapshot. Exact story counts can vary with the available evidence.

### Does Hacker News Research use the official Hacker News API?

Yes. Hacker News Research uses the official Hacker News API for HN submissions, metadata, and comment trees. It doesn't depend on Algolia's HN Search for its research flow. For selected submissions with external URLs, it adds linked-page content retrieved through Decodo [Web Scraping API](https://decodo.com/scraping/web) before analysis.

### Is this a Hacker News scraper?

The tool doesn't scrape Hacker News itself for its core HN data; it uses the official Hacker News API. Web scraping is used as the enrichment layer for external pages linked by selected HN submissions. Those pages are retrieved through Decodo Web Scraping API and analyzed alongside the HN submission and discussion.

### How is this different from Hacker News Search or a Hacker News digest?

HN Search is designed for finding stories and comments, while digests generally summarize selected stories or threads. Hacker News Research is a cross-story research workflow: it selects promising submissions, follows linked pages, reads discussion, validates recurring topics, and synthesizes developer trends, problems, and research opportunities.

### Which LLMs does Hacker News Research support?

The application includes provider strategies for Anthropic Claude, OpenAI, and Google Gemini. You can choose the active provider in Settings or through environment configuration. The main research model and the cheaper triage model can also be overridden separately when the selected provider supports the configured model names.

### How much does a research run cost?

There is no fixed run price because cost depends on the research depth, number and size of linked pages, selected LLM provider, model pricing, and token usage. The report records LLM call and token counts so you can audit actual usage. Quick generally uses less than Standard, while Deep uses the most.

### What happens if Decodo Web Scraping API is unavailable?

If individual linked pages fail, Hacker News Research continues with the evidence that remains. If all requested external pages fail because Decodo authentication is unavailable, the report still completes from HN submissions and comments but displays a prominent enrichment warning and downgrades evidence labels accordingly.

### Is Hacker News Research affiliated with Y Combinator or Hacker News?

No. Hacker News Research is an independent open-source project maintained by Decodo. It analyzes publicly available Hacker News data and the external pages linked by HN submissions, but it isn't affiliated with, sponsored by, or endorsed by Y Combinator or Hacker News.

### Can I self-host Hacker News Research?

Yes. Hacker News Research is designed to run locally or on an always-on host with Bun, MongoDB, and the required API credentials. Recurring monitors execute while the backend and database are available; overdue monitor runs are picked up when the backend resumes.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React, TypeScript, TanStack Router, TanStack Query, Tailwind CSS, Radix UI, Rsbuild |
| Backend | NestJS, TypeScript, MongoDB, Mongoose |
| Hacker News data | Official Hacker News API |
| Linked-page retrieval | Decodo Web Scraping API |
| LLMs | Anthropic Claude, OpenAI, Google Gemini |
| Runtime | Bun |
| Local services | Compose, MongoDB |

## Project structure

```text
apps/
  backend/src/features/
    decodo/             # Decodo Web Scraping API integration
    hacker-news/        # Hacker News collection and comment retrieval
    research/           # Triage, story analysis, synthesis, and reporting
    monitors/           # Saved schedules and recurring execution
    queries/            # History and stored reports
    llm/                # Anthropic, OpenAI, and Gemini abstraction layer
    settings/           # Provider, model, and credential configuration

  frontend/src/features/
    tracker/            # Research form, progress flow, and report UI
    monitors/           # Recurring monitor controls
    queries/            # History and stored reports
    settings/           # Runtime provider/model/credential settings

  shared/src/           # Shared TypeScript types

docs/
  ARCHITECTURE.md
```

## Scripts

| Command | Description |
| --- | --- |
| `bun dev` | Build shared types and start frontend/backend development servers |
| `bun run build` | Build all application packages |
| `bun start` | Start the production backend and frontend preview server |
| `bun lint` | Run linting across frontend and backend |
| `bun format` | Format frontend and backend source files |
| `bun db:up` | Start the local MongoDB container using Podman Compose or Docker Compose |
| `bun db:down` | Stop the local MongoDB container using Podman Compose or Docker Compose |

## Related repositories

- [Decodo GitHub Research](https://github.com/Decodo/github-research)
- [Decodo Forum Scraper](https://github.com/Decodo/Forum-scraper)
- [Decodo Stack Overflow Trends Monitor](https://github.com/Decodo/stackoverflow-trends-monitor)
- [Decodo Web Scraping API](https://github.com/Decodo/Web-Scraping-API)
- [Decodo SDK for TypeScript](https://github.com/Decodo/sdk-ts)
- [Decodo MCP Server](https://github.com/Decodo/mcp-server)

For Web Scraping API targets, parameters, and request behavior, see the [Decodo Web Scraping API documentation](https://help.decodo.com/docs/web-scraping-api-introduction).

## License

MIT – see [LICENSE](LICENSE).

