# #430 C0-A — non-Production feasibility only

Authorization: #430 comment 6117199149. Scope: only `/ranking`, synthetic tests, local workerd, one Draft PR. **Never merge, deploy, or send HTTP to Production.**

The local gate is a copy of *semantics*, not a patch to existing App/Public runtime. It checks expected SHA, trusted revision, four-route manifest declaration, exact time windows, asset hashes, private asset path, and the captured RSC fingerprint. Unsupported router state fails closed without Vinext SSR fallback. The Public simulation uses only a fixed App Service Binding and blocks private asset URLs.

`capture.mjs` captures genuine Next HTML and Flight from 127.0.0.1 (real content-type + byte SHA256). It does **not** manufacture an RSC response. It records two router-state probes. Unfortunately, existing Next sample mode does not inject the *same* 237/123/241 fixture used in the independent data checks. Consequently `fixture_binding_proven:false` is explicitly encoded in the manifest; the gate must return **503**, not misleading 200. This is an unresolved HQ integration blocker; no successful end-to-end C0 can be claimed from an unrelated sample page.

Local workerd probes are wall-timing only. Self sampled CPU, startup/import sampled CPU, browser Next Link/prefetch/back/forward and Cloudflare Free billable CPU remain **NOT_PROVEN**. A correct raw Flight response does not prove compatibility with arbitrary Router states.

A9R's 52 definitions remain unchanged; `coverage.mjs` reports 3 **SIMULATED**, 49 **NOT_RUN**, no 52/52 claim. Safe fixture tests can pass even while whole experiment remains **NOT_PROVEN**.

For future HQ decision: obtain a separately authorized fixture injection path for the *real* renderer, genuine browser/router-state parity, atomic generation/invalidation feed with trusted revision, and budgeted workerd per-invocation CPU evidence. The new workflow is pull-request-only, with no Production URI or dispatch.
