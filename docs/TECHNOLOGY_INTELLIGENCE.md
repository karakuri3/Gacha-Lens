# Gacha Lens Technology Intelligence Gate

Status: repository operating procedure for external AI/development techniques

## Purpose

External posts, repositories, videos, newsletters, and AI-development advice are treated as **hypothesis sources**, not authority. The goal is to capture useful new techniques quickly without turning the repository into a collection of fashionable tools, brittle hacks, duplicated Agent OS features, or unmeasured complexity.

This procedure is intentionally subordinate to `AGENTS.md`, `docs/AGENT_OS.md`, canonical product/state documents, Auto-Merge policy, Production Release policy, and all current Production hard stops.

## Core rule

Never adopt a technique because a creator is popular, a post has high impressions, an anecdote claims large efficiency gains, or a tool is newly available.

Use this path instead:

`discover -> verify primary source -> compare with current system -> bounded experiment -> measure -> adopt/reject -> encode durable learning`

## Seven-question intake gate

Score every candidate YES/NO.

1. **Problem** — does it solve a current, concrete Gacha Lens problem or bottleneck?
2. **Evidence** — is there primary-source documentation, code, or reproducible evidence beyond the social post/secondary explanation?
3. **Delta** — is the capability actually missing from the current Agent OS / repository / toolchain?
4. **Benefit** — which measurable outcome should improve: elapsed time, human interventions, validation quality, failure rate, model/tool cost, or revenue-enabling throughput?
5. **Measurement** — can a Before/After comparison be observed without Production risk?
6. **Risk** — is it compatible with security, privacy, provider policy, Production boundaries, and repository-specific constraints?
7. **Maintenance** — is ongoing dependency, configuration, context, and failure-recovery burden acceptable?

Decision:

- **6–7 YES:** eligible for a bounded non-Production experiment.
- **4–5 YES:** hold for more evidence; do not integrate yet.
- **0–3 YES:** reject for now.

A rejected technique may be reconsidered if the underlying problem or evidence changes.

## Required evidence hierarchy

Prefer evidence in this order:

1. official provider/product documentation or release notes;
2. source repository / exact implementation / reproducible code;
3. controlled local or Preview experiment;
4. high-quality independent technical analysis;
5. social post, video, newsletter, or anecdotal claim.

Secondary content is useful for discovery. It is not sufficient to override primary evidence or repository reality.

## Existing-system delta check

Before creating anything new, search the current repository for equivalent capability.

In particular, Gacha Lens already has:

- Lead / Orchestrator, Scout, Builder, Verifier, Reviewer roles;
- branch/worktree isolation;
- bounded autonomous repair;
- Agent Done Gate;
- Agent Queue / resumable work;
- Auto-Merge and Production Release policy;
- canonical HANDOFF / STATUS / DECISIONS / TODO state;
- exact-head validation and independent-review concepts.

Do not create a second framework with different names if the useful idea can be expressed as a small extension to these existing mechanisms.

## Routing and agent-count rule

The optimization target is **validated progress per unit of human attention, elapsed time, and model/tool cost**, not number of agents or agent-turn volume.

Use the smallest sufficient execution shape:

- **solo:** one agent for small, low-risk, well-bounded work;
- **delegate:** one bounded helper when independent parallel work materially helps;
- **audit:** fresh independent context for meaningful correctness/security/Production-risk review;
- **full:** Lead + Scout + disjoint Builders + independent Verifier/Reviewer only when scope/risk justifies it.

Existing `docs/AGENT_OS.md` role and worktree rules remain authoritative. These routing labels are a decision aid, not a parallel Agent OS.

## Just-in-time tool loading

Installed tools/plugins/MCPs are an available inventory, not a mandatory context bundle.

Use only what the task requires. Examples:

- repository/code/PR work -> GitHub + local repository tooling;
- UI implementation/QA -> add browser/design tools only when needed;
- Supabase concern -> add Supabase only for the exact database task and within current approval boundaries;
- Vercel runtime/deployment concern -> add Vercel only when relevant;
- SEO/traffic investigation -> add the relevant search/analytics source only when needed.

Do not load unrelated tools solely because they are installed. Context/tool surface area is itself a cost and failure source.

## Context compaction rule

Long tasks should preserve evidence, not conversational exhaust.

Keep in active/durable state:

- Goal and acceptance criteria;
- exact base/head SHAs;
- PR/Issue IDs;
- authoritative decisions;
- unresolved risks and blockers;
- validation commands/results;
- Production/destructive/paid-operation boundaries;
- next resumable action.

Compress or discard duplicated logs, superseded hypotheses, repeated explanations, and already-resolved investigation once durable evidence is recorded.

Never compact away a safety constraint, unresolved reviewer finding, acceptance criterion, canonical decision, or Production gate.

## Bounded experiment contract

A 6–7 YES candidate must define before implementation:

### Hypothesis
What specifically should improve?

### Baseline
What is the current measurable behavior/process?

### Scope
Smallest reversible non-Production slice.

### Metrics
Prefer one or more of:

- human intervention/approval count;
- elapsed time from task acceptance to validated PR;
- repeated/failing tool calls or validation attempts;
- task-induced regression count;
- independent-review findings;
- model/tool usage when observable;
- duplicated investigation/rework;
- user-facing or revenue-enabling throughput where causally relevant.

### Safety
Explicitly state Production actions, destructive actions, Secrets changes, paid operations, and provider-policy risk. Default should be zero for an experiment.

### Rollback
Define how the experiment is removed without Production mutation.

### Adoption threshold
State what evidence would justify making the technique standard.

## Adopt / reject outcome

### Adopt
If measured evidence supports the hypothesis and maintenance/risk remains acceptable:

1. integrate the smallest durable change into the existing Agent OS/tooling/docs;
2. add tests/checks when applicable;
3. update canonical operating documentation if behavior materially changed;
4. remove temporary/duplicate experiment scaffolding;
5. record the reason and evidence, not just the conclusion.

### Reject
If the technique does not materially improve the target metric, duplicates current capability, creates excessive context/tool burden, weakens review/safety, or depends on fragile workarounds:

1. do not normalize it into company infrastructure;
2. remove temporary experiment scaffolding;
3. record the failure mode briefly so the same idea is not repeatedly rediscovered without new evidence.

## Permanent rejection classes unless policy/evidence materially changes

Do not make these standard infrastructure merely for efficiency:

- usage-limit bypasses or schemes whose primary purpose is evading provider limits;
- credential/session scraping or browser hacks used as a substitute for supported APIs/integrations;
- workflows that weaken independent review, exact-head validation, or Production gates;
- tooling that requires committing/sharing secrets;
- unbounded multi-agent spawning;
- paid operations without explicit approval;
- destructive cleanup as a convenience shortcut;
- duplicate frameworks that compete with the canonical Agent OS.

## External source register

When an external source materially influences a repository change, the PR/Issue should record enough provenance to reproduce the reasoning without depending on the influencer:

- source/idea name;
- primary-source verification used;
- existing-system delta found;
- experiment/baseline if any;
- adoption/rejection rationale.

Do not store copied promotional claims as fact. Attribute uncertain performance claims and replace them with local measurements whenever possible.

## Current first-use interpretation

For the recent Codex/AI workflow research, the reusable parts are:

- selective `solo / delegate / audit / full` routing;
- independent fresh review for material-risk changes;
- Just-in-Time tool loading;
- context compaction around canonical evidence;
- external-tech intake through primary-source verification and measured local experiments.

Gacha Lens should **not** be rebuilt around a second multi-agent framework because the existing Agent OS already covers most orchestration, worktree isolation, validation, review, queueing, and safety needs.
