# C0-C final scoped localhost feasibility attempt

**HQ #430 comment 6117993425 — one amendment, one push, one natural PR CI. DO NOT MERGE.**

Production App/Public/runtime, public A9R definition and existing data files **remain untouched in Git**.

## Disposable renderer / immutable identity
The CI creates a detached Git worktree under the runner's temp directory. Within that temporary worktree **only**, `overlay.mjs` replaces:
- `lib/data/mock-gacha-records.js` with the exact 237 variants / 123 series / 241 listings / active 66 / sold 0 `synthetic-fixture.mjs`;
- `lib/data/official-input.js` with explicitly empty official product/schedule arrays, making `hasOfficialInput()` false. This selects `getMockRecords()` from `lib/series.js`; it is not a real data-provider action.

The pristine checkout's official and mock files are never modified. The overlay evidence records original SHA256 and modified SHA256 for **both** files, fixture SHA256 and revision. `immutable_git_commit` refers to the Git checkout, not the modified renderer worktree: the two identities must never be equated.

The runner uses an independent physical copy of `node_modules` inside the temporary Next project root, instead of the earlier out-of-root symlink. Next gets `WORKERS_CI_COMMIT_SHA` pinned to the PR head; `readiness.mjs` validates the value exposed by `next.config.mjs` as `GACHA_RELEASE_SOURCE_SHA`. This tests the config contract and **does not** by itself prove an identical unmodified Production build.

## First-failure safety
`readiness.mjs` runs the actual local Next dev renderer and records bounded, sanitized child spawn/exit/signal, TCP connect/refuse, HTTP status including 000, curl rc 7/22/28/52/56, coarse timing, server phase and allowlisted error class + repository-relative source line. **It does not preserve the raw Next log or any HTTP response body in artifacts.** It stops at the first fatal response or a bounded startup deadline; a bare 200 is only renderer reachability, not full fixture proof.

After a successful readiness check, unmodified `browser-capture.mjs` performs real Chromium CDP Next Link/prefetch/history requests, and `capture.mjs` verifies actual fixture-bound Next HTML and non-bootstrap Flight. Any failed browser state fails the experiment. Only then does isolated local workerd perform Public→App gated asset probes. CPU figures in server-timing are wall-time, not Cloudflare billable CPU.

Artifact upload is restricted to top-level diagnostic JSON (not raw HTML/Flight/assets or temp stdout/stderr). A final C0-only CI step fails if **any** required stage failed or was skipped. No manual workflow dispatch/rerun/Production calls. A9R's 52 assertion definitions and order remain unchanged; untested assertions remain NOT_RUN.

**After this one natural run, failure means STOP and HQ should switch architecture proof path; no further #517 retries under this authorization.**
