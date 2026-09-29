import fs from "node:fs";
import path from "node:path";

const configPath = path.resolve("dist/server/wrangler.json");
if (!fs.existsSync(configPath)) throw new Error("Missing dist/server/wrangler.json");

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
if (!config.main) throw new Error("Generated Cloudflare config is missing main");

const serverRoot = path.dirname(configPath);
const buildRoot = path.resolve("dist");
const mainPath = path.resolve(serverRoot, config.main);
if (!fs.existsSync(mainPath)) throw new Error("Generated Worker main does not exist: " + mainPath);

const normalize = (value) => value.replaceAll("\\\\", "/");
const jsFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\\.(?:m?js)$/.test(entry.name)) jsFiles.push(full);
  }
}
walk(buildRoot);

function moduleSpecifiers(source) {
  const staticSpecs = new Set();
  const dynamicSpecs = new Set();
  for (const match of source.matchAll(/(?:^|[;\\n])\\s*(?:import|export)\\s+(?:[^"'()]*?\\s+from\\s+)?["']([^"']+)["']/g)) {
    staticSpecs.add(match[1]);
  }
  for (const match of source.matchAll(/import\\(\\s*["']([^"']+)["']\\s*\\)/g)) {
    dynamicSpecs.add(match[1]);
  }
  return { staticSpecs: [...staticSpecs], dynamicSpecs: [...dynamicSpecs] };
}

function resolveLocal(importer, specifier) {
  if (!specifier.startsWith(".")) return null;
  const resolved = path.resolve(path.dirname(importer), specifier);
  const candidates = [resolved, resolved + ".js", resolved + ".mjs", path.join(resolved, "index.js")];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function staticClosure(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const current = queue.pop();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    const source = fs.readFileSync(current, "utf8");
    const { staticSpecs } = moduleSpecifiers(source);
    for (const specifier of staticSpecs) {
      const resolved = resolveLocal(current, specifier);
      if (resolved) queue.push(resolved);
    }
  }
  return seen;
}

const mainSource = fs.readFileSync(mainPath, "utf8");
const mainImports = moduleSpecifiers(mainSource);
const vinextMarkers = [
  "virtual:vinext",
  "[vinext]",
  "vinext/server/",
  "__vite_rsc",
  "react-server-dom",
];
const mainVinextMarkers = vinextMarkers.filter((marker) => mainSource.includes(marker));
const fallbackCandidates = jsFiles.filter((file) => /vinext-fallback/i.test(path.basename(file)));

if (fallbackCandidates.length !== 1) {
  throw new Error(
    "Expected exactly one emitted vinext-fallback chunk, found " + fallbackCandidates.length +
    ". generated main=" + config.main +
    "; main bytes=" + Buffer.byteLength(mainSource) +
    "; main vinext/RSC markers=" + (mainVinextMarkers.join(",") || "none") +
    "; main contains getVinextHandler=" + mainSource.includes("getVinextHandler") +
    "; main contains vinext-fallback=" + mainSource.includes("vinext-fallback") +
    "; JS files: " + jsFiles.map((file) => normalize(path.relative(buildRoot, file))).join(", ") +
    "; main dynamic imports: " + (mainImports.dynamicSpecs.join(", ") || "none")
  );
}

const fallbackPath = fallbackCandidates[0];
const mainStatic = staticClosure(mainPath);
const fallbackStatic = staticClosure(fallbackPath);

if (mainStatic.has(fallbackPath)) {
  throw new Error("vinext fallback chunk is statically reachable from the Worker entrypoint");
}

const dynamicTargets = mainImports.dynamicSpecs
  .map((specifier) => resolveLocal(mainPath, specifier))
  .filter(Boolean);
if (!dynamicTargets.includes(fallbackPath)) {
  throw new Error(
    "Worker entrypoint does not dynamically import emitted vinext fallback chunk. dynamic imports: " +
    (mainImports.dynamicSpecs.join(", ") || "none")
  );
}

const staticallyLoadedVinext = [...mainStatic].filter((file) => {
  const source = fs.readFileSync(file, "utf8");
  return vinextMarkers.some((marker) => source.includes(marker));
});

if (staticallyLoadedVinext.length) {
  throw new Error(
    "vinext/RSC markers remain in the public Worker static module closure: " +
    staticallyLoadedVinext.map((file) => normalize(path.relative(buildRoot, file))).join(", ")
  );
}

const fallbackHasVinext = [...fallbackStatic].some((file) => {
  const source = fs.readFileSync(file, "utf8");
  return vinextMarkers.some((marker) => source.includes(marker));
});
if (!fallbackHasVinext) {
  throw new Error("Could not prove the dynamic fallback closure contains vinext/RSC code");
}

console.log(JSON.stringify({
  main: normalize(path.relative(buildRoot, mainPath)),
  main_static_module_count: mainStatic.size,
  dynamic_fallback: normalize(path.relative(buildRoot, fallbackPath)),
  fallback_static_module_count: fallbackStatic.size,
  assets: config.assets ?? null,
  public_entry_contains_vinext_markers: false
}, null, 2));
