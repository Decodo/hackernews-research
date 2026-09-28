# Hacker News Intelligence MVP

Working MVP for an open-source developer-trends tool. Hacker News provides discovery, engagement, and discussion signals. Decodo Web Scraping API enriches selected submissions by retrieving the external pages behind them as Markdown, and an LLM turns the combined evidence into developer themes, pain points, technologies, and content opportunities with explicit evidence-basis labels.

The final repository name and SEO-oriented README positioning are intentionally not locked yet.

## How it works

1. Read current `top`, `new`, `ask`, and/or `show` stories through the official Hacker News API.
2. Run a lightweight LLM triage over HN metadata and submission text to choose the most promising leads.
3. Fetch HN comments only for shortlisted leads, then attempt every shortlisted external URL through Decodo Web Scraping API using:

```json
{
  "proxy_pool": "premium",
  "headless": "html",
  "markdown": true
}
```

4. Pipeline external scraping into story analysis: each story starts its isolated LLM pass as soon as its own scrape attempt completes, while slower pages continue fetching in parallel. Separate scrape and analysis concurrency limits preserve bounded load.
5. Validate retrieved Markdown before treating it as source evidence. Definite failures such as thin responses, access challenges, login/error pages, and generic Notion workspace shells are rejected immediately. Ambiguous JavaScript/app-shell markers are only flagged as suspicious and passed to the existing isolated story analysis, which makes the final semantic usability decision without adding another LLM call. Retrieved-but-unusable pages never count as source-backed evidence.
6. Compact large usable Markdown pages before each story's analysis so useful article structure is retained without sending the entire page blindly. Comment-derived claims retain their supporting HN comment IDs.
7. Triage assigns each selected story a canonical `topicKey`, and each isolated story analysis confirms that subject family while adding narrower `issueKeys`. Only two or more independently analyzed stories sharing the same concrete `topicKey` can become a theme candidate; issue keys explain their different angles. A second deterministic co-membership check now requires the stories to share concrete subject evidence (for example the same named technology/category) or at least two independently produced issue angles before they are allowed into the same theme. This lets related stories such as a Jev implementation and a Jev benchmark connect under `typed-decision-models` while excluding merely analogous decision systems and generic matches such as Python, migration, or tooling. Human/work topics are treated more conservatively: hiring/interview design, individual skill maintenance, career strategy, and productivity remain separate unless the stories share a concrete subject anchor. Detailed leads and synthesized findings use the same evidence labels throughout: Source-backed, Source + discussion, Discussion-only, and HN submission only. For synthesized findings, the model now returns explicit per-finding provenance (`sourceStoryIds`, `discussionStoryIds`, and `submissionStoryIds`) and the backend derives the label deterministically after validating those IDs against usable sources and actual HN comments. Zero-comment HN-native submissions therefore never appear as discussion-backed evidence, and a finding that combines source facts with comment-derived analysis cannot be mislabeled as discussion-only. Generated calendar years are also evidence-checked: a year is kept only when it appears in the supporting evidence, preventing stale or invented date-stamping in titles and findings.

## Research scope and depth

All four Hacker News sources are selected by default: Front page, New HN submissions, Ask HN, and Show HN. “New” means newly submitted to Hacker News, not necessarily newly published. Deselect sources in the UI to narrow a run.

Research-depth numbers are deliberately approximate:

- Quick: roughly 20–30 candidates and usually 3–5 shortlisted leads. Quick favors signal density and skips HN-native stories with no external URL and zero comments.
- Recurring monitors can be created without immediately launching research, or created and run immediately.
- History distinguishes automatic scheduled-monitor reports from manual research, including the monitor name; manual “Run now” monitor executions are labeled separately.
- Standard: roughly 50–60 candidates and usually 6–10 shortlisted leads.
- Deep: roughly 80–100 candidates and usually 10–16 shortlisted leads.
- External-page enrichment is deterministic: every selected story with an external URL is attempted within the depth budget; the triage model does not decide whether to follow links.

For every shortlisted lead that has an external URL, the tool attempts to retrieve that page. Retrieval success and evidence usability are tracked separately, so a fetched application shell or login page does not inflate the source-backed count. Ask HN or other HN-native submissions can still be researched without an external page. If every requested linked page fails Decodo authentication, the run still completes from Hacker News evidence but the finished report displays a prominent Web Scraping API credential warning and carries the warning into Markdown/JSON exports.

These are research budgets, not quotas. Actual counts vary with source overlap, available stories, and LLM triage. A normal run uses one lower-cost triage call, one compact analysis call per shortlisted story, and one final synthesis call. Token usage is recorded in each completed report when the provider exposes it. Synthesis output is deliberately concise and now has enough headroom to avoid routine max-token retries.

## Local setup

```bash
cp .env.example .env
bun install
bun run db:up
bun dev
```

Configure credentials either in **Settings** after the app starts or through `.env`. Credentials saved in Settings override the corresponding environment variables; clearing a saved override falls back to `.env`. The Settings page never returns stored credential values to the browser and includes provider-specific **Test connection** actions. Hacker News itself does not require an API key.

For initial bootstrap you can still set `DECODO_AUTH_TOKEN` and one of `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GEMINI_API_KEY` in `.env`. The triage stage automatically uses a cheaper provider-specific model. Set `LLM_TRIAGE_MODEL` only if you want to override that triage model. The selected primary model is used for isolated story analysis and final synthesis.

### Local proxy error

If the UI reports that the research backend is unavailable or the dev proxy returns `ECONNREFUSED` for port `5002`, the frontend is running but the NestJS backend is not listening. Start MongoDB first with `bun run db:up`, then launch the complete stack with `bun dev`. If the backend still does not start, check the backend terminal output for the startup error.

See `docs/ARCHITECTURE.md` for the current MVP pipeline and design decisions.

Completed reports show per-source candidate and investigated-story contribution. Overlapping stories are counted once under the selected feed where they rank highest.
