# Hacker News Intelligence MVP plan

## Milestone 1: end-to-end research run

- [x] Reuse the existing React, NestJS, MongoDB, LLM, settings, history, monitor, and export infrastructure.
- [x] Replace GitHub collection with the official Hacker News API.
- [x] Support Front page, New HN submissions, Ask HN, and Show HN as research sources; clarify that New means newly submitted to HN, not newly published.
- [x] Deduplicate stories and ignore non-story items such as jobs.
- [x] Keep triage lightweight by using HN metadata/submission text before fetching comments.
- [x] Add an LLM triage stage that selects promising research leads.
- [x] Add Quick, Standard, and Deep research budgets.
- [x] Attempt every external link belonging to a selected research lead through Decodo Web Scraping API.
- [x] Request external content with `proxy_pool: "premium"`, `headless: "html"`, and `markdown: true`.
- [x] Continue the run when an external page cannot be retrieved.
- [x] Separate successful retrieval from usable source evidence, hard-reject clear login/challenge/error/thin-page failures, route ambiguous JavaScript/app-shell responses through semantic validation, and report requested/retrieved/usable counts separately.
- [x] Fetch comments only for shortlisted leads.
- [x] Compact large external Markdown before LLM analysis.
- [x] Analyze each shortlisted story in an isolated LLM call so source details cannot leak between stories, and pipeline each analysis behind that story's own scrape completion so slow pages do not block the whole batch.
- [x] Synthesize developer themes, technologies, problems, and content opportunities from structured per-story analyses.
- [x] Record provider-reported LLM token usage per run.
- [x] Keep HN story IDs attached to synthesized findings as evidence.
- [x] Use the same four evidence labels for detailed leads and synthesized findings: Source-backed, Source + discussion, Discussion-only, and HN submission only.
- [x] Make synthesized findings return explicit source/discussion/submission provenance by story ID, validate it against the underlying records, and derive finding-level evidence labels deterministically.
- [x] Scope single-story/commenter claims instead of generalizing them to developers broadly.
- [x] Remove the redundant notable-stories summary block.
- [x] Raise synthesis headroom while tightening section counts to avoid routine max-token retries.
- [x] Save runs to History and preserve recurring monitors.
- [x] Create recurring monitors without forcing an immediate research run, while retaining a create-and-run-now option.
- [x] Label History entries created by scheduled monitors with their monitor name, and distinguish manual monitor runs from automatic scheduled runs.
- [x] Keep Quick-mode investigation slots evidence-dense by excluding HN-native stories with no external URL and zero comments.

## Milestone 2: validate with live runs

- [x] Run Quick, Standard, and Deep against live HN data with real Decodo and LLM credentials; all three modes have now been exercised successfully.
- [x] Add automatic source-usability validation for obvious empty/shell/login/challenge/error responses plus a semantic second check in the existing per-story analysis call.
- [ ] Inspect external Markdown quality across articles, documentation, GitHub repositories, PDFs, project pages, and unusual targets.
- [ ] Tune candidate, external-page, comment, and Markdown budgets based on cost and latency.
- [ ] Review LLM triage false positives and false negatives.
- [ ] Verify that Ask HN and Show HN receive enough representation relative to Front page and New.
- [ ] Review failed Decodo targets and decide if any deserve special handling.
- [ ] Confirm the exact Decodo Markdown response shape against live API responses.

## Milestone 3: report quality

- [x] Split combined analysis/synthesis after live testing showed cross-story contamination.
- [x] Require at least two supporting stories for recurring themes and explicitly allow no theme when connections are weak.
- [x] Replace lexical theme overlap with canonical `topicKey` matching across independently analyzed stories, with narrower `issueKeys` describing each story's angle inside the shared subject family.
- [x] Add deterministic topic-key co-membership validation so exact key matches still require concrete shared subject evidence or at least two matching issue angles; reject merely analogous stories from the same theme.
- [x] Fall back to an independent-story executive summary when no validated recurring theme survives.
- [x] Preserve HN comment IDs in discussion claims so single-comment anecdotes keep explicit singular attribution through synthesis.
- [x] Add scope/quantifier guards so branch/version coverage, conditional exploitability, or isolated anecdotes cannot be escalated into broad prevalence claims.
- [x] Enforce temporal consistency in generated report prose by removing calendar years that are not supported by the cited story evidence.
- [x] Remove signal-count phrasing from fallback executive summaries and instruct synthesis not to count signals/stories.
- [x] Tune the isolated story-analysis and synthesis prompts across repeated live reports, including topic-key false positives, evidence-basis consistency, commenter attribution, and claim scope.
- [x] Show per-source candidate and investigated-story contribution in completed reports, with overlapping stories attributed once to their highest-ranked selected feed.
- [x] Make LLM and Decodo credentials editable/testable in Settings, with saved values overriding `.env`, explicit environment fallback controls, and no credential values returned by the API.
- [ ] Add richer evidence expansion if users need to inspect specific comments behind a finding.
- [ ] Decide if content opportunities should be a primary report section or an optional content-team view.
- [ ] Add per-story problem/question extraction to the UI if it proves useful.

## Milestone 4: real trend monitoring

- [ ] Compare matching concepts and technologies across stored runs.
- [ ] Add week-over-week or run-over-run mention and engagement changes only when historical evidence supports them.
- [ ] Cluster semantically equivalent topics across runs.
- [ ] Add monitor-specific longitudinal summaries.
- [ ] Consider keyword watchlists once the broad discovery workflow is proven.

## Milestone 5: release preparation

- [ ] Apply the final repository name and SEO positioning after the SEO brief arrives.
- [ ] Replace the working README with the final GitHub README structure and copy.
- [ ] Add screenshots or a demo GIF from a real successful run.
- [ ] Add tests for HN normalization, triage-output validation, Decodo response extraction, and report evidence filtering.
- [ ] Run the full Bun build, lint, and test suite before publishing.



### Refinements

- Deterministic external enrichment: triage selects research leads only; the backend automatically attempts every selected external URL within the depth budget.
- Canonical HN-native reporting copy prevents no-URL submissions from being described as merely “not analyzed.”
- Compact desktop density for ordinary non-report pages and loading states.
