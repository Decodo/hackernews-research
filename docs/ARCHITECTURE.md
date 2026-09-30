# Hacker News Intelligence architecture

The current version uses Hacker News as the discovery and discussion layer, Decodo Web Scraping API as the external-web enrichment layer, and an LLM in three roles: low-cost triage, isolated per-story analysis, and concise cross-story synthesis.

## Pipeline

1. The frontend submits a set of Hacker News sources (`top`, `new`, `ask`, `show`) and a research depth (`quick`, `standard`, `deep`). In the UI, `new` is described as “New HN submissions” to make clear that submission recency does not imply publication recency.
2. `HackerNewsService` retrieves story IDs and item metadata from the free official Hacker News API. The Web Scraping API is not used to reproduce data already available from the official API.
3. Obvious unusable items are removed and duplicate stories across HN surfaces are merged.
4. A lightweight LLM triage pass sees only HN metadata and submission text. It selects the leads most likely to reveal meaningful developer interests. Comments are not fetched before triage. Every selected lead with an external URL is then treated as an enrichment target. This is a deterministic pipeline rule; the triage LLM does not decide whether a selected URL should be followed.
5. Research depth controls the candidate pool, shortlist size, comment depth, Markdown budget, and LLM output budgets. External-page attempts track the shortlist: every selected lead with an external URL is attempted.
6. HN comments are fetched only for shortlisted leads.
7. Every shortlisted external URL is sent to Decodo Web Scraping API. Requests use `proxy_pool: "premium"`, `headless: "html"`, and `markdown: true`. Failed external retrieval is non-fatal. Scraping and story analysis are pipelined: as soon as one story's external-page attempt finishes, that story can enter analysis while other pages are still being fetched. Scraping and analysis keep separate concurrency caps (4 and the depth-specific story-analysis limit), so one slow page no longer blocks all analysis.
8. Retrieval success is separated from evidence usability. A deterministic pre-check hard-rejects only clear failures such as very thin responses, access challenges, login/error pages, and generic Notion workspace shells. Ambiguous JavaScript/app-shell markers are flagged as suspicious rather than rejected; the already-scheduled isolated story-analysis call inspects the retrieved Markdown and makes the final semantic usability decision. Retrieved-but-unusable Markdown is not supplied as source evidence to downstream synthesis.
9. Large usable Markdown pages are compacted before LLM analysis. The tool keeps the opening section, page headings, and ending section instead of sending the complete page blindly.
10. Each shortlisted story is analyzed in its own LLM call as soon as its own scrape state is known. This isolation prevents details from unrelated stories leaking into one another and keeps the linked source distinct from HN reaction.
11. The batch triage call assigns a canonical lowercase `topicKey` to every selected story, reusing the exact key for genuinely related subject families visible in the candidate set. Each isolated story analysis confirms or corrects that key after reading the source/discussion and adds narrower `issueKeys` for angles such as calibration, benchmarking, cost, or sandbox overhead.
12. Theme validation starts from exact `topicKey` matches across at least two independently analyzed stories. Generic topic keys such as `ai`, `security`, `python`, `tooling`, and `developer-tools` are rejected. Exact key equality alone is not sufficient: stories must also have concrete story-to-story support through a shared non-generic subject anchor (for example `jev`, `saml`, or `gvisor`) or at least two independently produced matching `issueKeys`. This splits out false-positive co-members that share only an abstract goal. The final synthesis call may create a recurring theme only from one of these validated components; otherwise stories stay separate.
13. MongoDB stores the configuration, selected research leads, analyses, report, run statistics, and LLM token usage. Recurring monitors reuse the same pipeline.
14. Run statistics expose per-source contribution for both the candidate pool and investigated shortlist. Each story is attributed once to the selected feed where it has the strongest (lowest) HN rank, so overlapping Top/New/Ask/Show membership does not inflate totals.

A normal Quick run therefore uses one triage call, up to five compact story-analysis calls, and one synthesis call. Quick mode also excludes HN-native stories with no external URL and zero comments so its limited investigation slots stay evidence-dense. Malformed structured output can trigger one retry for the affected stage.

## Research depth

The current version defaults are intentionally easy to tune:

| Depth | Candidate stories | Selected leads | External pages | Comments per selected story | Markdown per usable page |
| --- | ---: | ---: | ---: | ---: | ---: |
| Quick | 30 | 5 | up to 5 | 5 | 12,000 chars |
| Standard | 60 | 10 | up to 10 | 8 | 16,000 chars |
| Deep | 100 | 16 | up to 16 | 12 | 22,000 chars |

These are research budgets, not claims about the amount of useful content on Hacker News. The LLM may select fewer leads when the available candidates are weak. Any selected lead with an external URL is attempted; failures remain non-fatal.

## LLM quality and cost controls

- Triage uses a cheaper provider-specific model by default: Claude Haiku, GPT-4o mini, or Gemini Flash. Set `LLM_TRIAGE_MODEL` to override it.
- Candidate comments are not sent to triage.
- Comments are fetched only for selected leads.
- Per-story analysis uses the primary configured model but has a tight structured-output budget.
- Each story sees only its own HN metadata, comments, and optional external Markdown, preventing cross-story contamination.
- Comment IDs and authors are preserved during story analysis. Material discussion claims carry supporting comment IDs so a single anecdote cannot silently become "commenters said" during synthesis.
- External Markdown gets a larger budget than the previous two-call experiment because source detail is valuable, while output length is constrained instead.
- Final synthesis consumes structured story analyses rather than raw articles and comments, keeping its context compact.
- Each run stores reported input/output token usage when the configured provider returns usage metadata.

## Evidence model

The application intentionally keeps these layers separate:

- Hacker News engagement and submission data show what was shared and attracted discussion.
- External Markdown explains the actual subject, project, technique, or issue behind a linked submission.
- Hacker News comments reveal the questions, concerns, comparisons, disagreements, and practical problems developers focus on.

If a selected linked page cannot be retrieved, or it is retrieved but does not expose usable page-specific content, that state is kept distinct from HN-native evidence and the tool does not reconstruct the page from comments. Only `success` pages count as usable source evidence; `unusable` pages can still contribute HN submission/discussion evidence. Run statistics separately track requested, retrieved, usable, unusable, and failed external pages. Both detailed research leads and synthesized findings use the same four user-facing evidence labels: Source-backed, Discussion-only, HN submission only, or Source + discussion. For each synthesized finding, the synthesis model must explicitly identify which supporting story IDs contributed usable external-source evidence, HN-discussion evidence, or HN-submission evidence. The backend validates those provenance IDs against the saved story records, drops unsupported story IDs, and derives the final evidence label deterministically rather than trusting a model-selected label. Zero-comment HN-native submissions are therefore kept distinct from actual discussion evidence everywhere in the report. Legacy saved runs are still rendered compatibly.

The final report must cite the HN story IDs supporting each synthesized finding, retain explicit evidence provenance for those IDs, and attach the backend-derived evidence-basis label. A recurring theme needs at least two distinct stories that independently confirm the same normalized canonical `topicKey`, plus concrete co-membership evidence between those stories. The topic key names a concrete subject family such as `typed-decision-models` or `developer-sandboxing`; per-story `issueKeys` describe narrower angles. The validator accepts a connection when stories share a non-generic subject anchor or at least two independently produced issue keys. Human/work themes are stricter: hiring/interview design, individual skill maintenance, career strategy, education, and productivity are not merged through broad issue overlap and require a concrete shared subject anchor. Mere analogy, programming-language overlap, or a shared high-level goal is not sufficient. Returning no recurring themes is normal.

For discussion-derived facts, the isolated story pass records the exact supporting HN comment IDs. A claim backed by one comment must remain attributed to one commenter; synthesis is instructed not to upgrade it to "commenters" or an unqualified fact. Story-level and report-level scope guards also soften unsupported broad quantifiers, so version or branch coverage cannot silently become prevalence across installations, users, projects, or sites.

Temporal consistency is guarded at both story-analysis and final-synthesis stages. Generated calendar years are retained only when the same year appears in the supporting evidence; unsupported editorial date-stamping such as an invented year in a content-opportunity title is removed rather than replaced with another assumed year.

The current version doesn't make longitudinal claims such as a topic growing or declining unless future historical comparison logic supplies that evidence.

## Failure handling

An external URL can be unavailable, unsupported, empty, fail to retrieve, or retrieve successfully while yielding unusable source content. The research run continues using the HN submission and discussion. External retrieval/usability state is preserved in the saved story record and displayed in the report. When every requested external page fails with a Decodo authentication/configuration error, the backend persists a run-level source-enrichment warning; the report renders it prominently with a direct link to the editable Decodo credential in Settings and Markdown/JSON exports preserve it. The run remains usable as an HN-only report rather than aborting.

A failed individual story-analysis call falls back to a minimal evidence-safe record rather than aborting the whole run. Structured LLM stages retry once when they return malformed or incomplete JSON. Final synthesis has a larger first-pass output ceiling plus stricter section/count limits so normal runs should finish without max-token retries. The backend logs the failure and any provider stop reason before retrying with a stricter request for shorter valid JSON.

## Local services

Compose runs MongoDB only. Hacker News retrieval uses the public API directly. Decodo and LLM credentials can be saved from the Settings UI; saved credentials override the corresponding environment variables at runtime, while `.env` remains the fallback/bootstrap path. Secret fields are excluded from normal Mongoose selections and are never returned by the Settings API. Settings also exposes backend connection tests for Anthropic, OpenAI, Gemini, and Decodo (the Decodo test performs a small `example.com` scrape).


## UI theme

The frontend defaults to an HN-inspired dark palette: `#ff6600` is the primary/link accent, backgrounds use warm charcoal rather than blue-black, metadata uses warm gray, and active navigation/filter states use muted orange surfaces. Light mode mirrors Hacker News' warm `#f6f6ef` background while preserving the same orange accent.


## Monitor creation

A monitor can be created without triggering an immediate research run. The frontend also offers a separate create-and-run-now path. Both persist the same monitor plan; scheduled execution continues to use the stored `nextRunAt`.

Each persisted research query records its run origin (`manual`, `scheduled`, or `manual-monitor`). Monitor-triggered runs also snapshot the monitor name so History can identify automatic reports even if the monitor is later renamed or deleted; older saved runs fall back to the current monitor name when available.


## Desktop density

The ordinary application pages use a compact desktop layout so Research, loading/progress, History, Monitors, Settings, and Dashboard fit comfortably in a typical laptop viewport. Long report pages intentionally retain document-style spacing and scrolling.
