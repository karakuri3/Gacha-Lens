# Vercel cost control

- `vercel.json` uses `ignoreCommand` so Markdown-only commits skip Vercel builds.
- Code, configuration, dependency, asset, and other non-Markdown changes still build normally.
- This policy exists to prevent canonical-state and handoff documentation updates from consuming Build CPU Minutes.
- Do not remove the guard without an explicit reason and cost review.
