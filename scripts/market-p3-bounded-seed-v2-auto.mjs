import { P3_BOUNDED_SEED_V2_AUTO_LIMIT, validateP3BoundedSeedV2AutoInvocation } from "../lib/domain/market-p3-bounded-seed-v2.js";
import { executeP3BoundedSeedV2 } from "./market-p3-bounded-seed-v2.mjs";

const options = parseOptions(process.argv.slice(2));

await executeP3BoundedSeedV2({
  options,
  fixed_limit: P3_BOUNDED_SEED_V2_AUTO_LIMIT,
  execution_mode: process.env.GITHUB_EVENT_NAME === "schedule" ? "scheduled-auto" : "manual-auto-canary",
  stage: "p3-bounded-seed-v2-auto",
  validate_invocation: () => validateP3BoundedSeedV2AutoInvocation({
    event_name: process.env.GITHUB_EVENT_NAME,
    ref: process.env.GITHUB_REF,
    confirmation: process.env.P3_BOUNDED_SEED_V2_AUTO_CANARY_CONFIRMATION,
    auto_enabled: process.env.P3_BOUNDED_SEED_V2_AUTO_ENABLED,
    auto_approval: process.env.P3_BOUNDED_SEED_V2_AUTO_APPROVAL,
    head_sha: process.env.GITHUB_SHA,
    origin_main_sha: process.env.P3_BOUNDED_SEED_V2_AUTO_ORIGIN_MAIN_SHA,
  }),
});

function parseOptions(args) {
  return Object.fromEntries(args.filter((arg) => arg.startsWith("--") && arg.includes("=")).map((arg) => {
    const [key, ...rest] = arg.slice(2).split("=");
    return [key, rest.join("=")];
  }));
}
