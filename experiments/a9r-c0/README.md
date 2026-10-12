# C0-B localhost-only genuine fixture / Next Flight experiment

Authorization: #430 comment `6117690581`. Existing Draft PR #517 only. This experiment is **not Production integration**, not a deploy and not an A9R 52/52 release proof.

## Provenance
The GitHub checkout stays byte-for-byte unchanged for all existing Production `app/**`, `lib/**`, `components/**`, Workers and configs. The C0 workflow creates a **separate detached disposable Git worktree** within the GitHub runner temporary directory and patches **only that copy** of `lib/data/mock-gacha-records.js` to import the exact `experiments/a9r-c0/synthetic-fixture.mjs`. `overlay-provenance.json` identifies the original commit SHA, original/mock overlay SHA256 and fixture JSON SHA256, plus an explicit `modified_worktree:true` flag. Its output must never be called the unmodified original source version.

Synthetic fixture counts are 237 variants, 123 series, 241 listings, 66 active, 0 sold. The real sample-data renderer is started in the disposable worktree, not the pristine checkout. The capture gate inspects actual Next HTML and Chrome-rendered data; merely writing counts into a manifest never proves identity.

## Genuine browser requests
Existing browser binary from the ubuntu runner is used without new packages, with Chrome DevTools Protocol over localhost. Direct document, Next Link from home and series, client navigation, browser Back/Forward, two distinct *observed* Flight router states and real Flight response bodies are required. A bootstrap-only 81-byte response is insufficient; flight must contain ranking data and have a distinct router fingerprint. **Any HTTP 500 or invalid normal navigation fails the capture**; sanitized local Next error categories are stored in the artifact. No hand-authored Router state or mock RSC is used.

## Local Worker gate
Only after genuine renderer + browser capture passes can the local locked Wrangler workerd run the Public→App Service Binding with Worker-first static assets. Gate requires exact source SHA, trusted fixture revision, overlay data provenance, 90d/30d/JST-bounded freshness, exact Flight request fingerprint, immutable content hashes, and no unauthorized fallback. Unsupported state fails closed, but full browser compatibility is not proved by that alone.

Code-only pure function tests retain the signed-off fail-closed behavior. Real local workerd CPU attribution and Cloudflare billable Free 10ms are **NOT_PROVEN** unless independent instrumentation is available. Timing headers are wall duration, *not billable CPU*.

## Failure evidence
The C0-only workflow uploads artifacts and then **returns a failing CI conclusion** if any required capture, workerd or browser stage is unsuccessful. It does not rerun A9R, standing release proof, or deploy. C0 counts only inspected `/ranking`, and reports all 52 unchanged A9R assertions with individually classified LOCAL PASS, SIMULATED, NOT_RUN or FAIL. No 52/52 PASS claim.

All work stops at the first natural C0-B CI evidence set. Further amendments, retries and pushes require a fresh HQ scope.