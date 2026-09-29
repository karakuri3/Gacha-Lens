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

const normalize = (value) => value.replaceAll("\\", "/");

function dynamicImportSpecifiers(source) {
  const output = [];
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf("import(", cursor);
    if (start < 0) break;
    const quoteIndex = start + "import(".length;
    const quote = source[quoteIndex];
    if (quote === "`" || quote === "'" || quote === '"') {
      const end = source.indexOf(quote + ")", quoteIndex + 1);
      if (end >= 0) output.push(source.slice(quoteIndex + 1, end));
    }
    cursor = quoteIndex + 1;
  }
  return output;
}

function staticImportSpecifiers(source) {
  const specs = new Set();
  const fromPattern = /\bfrom\s*["'`]([^"'`]+)["'`]/g;
  const barePattern = /\bimport\s*["'`]([^"'`]+)["'`]/g;
  for (const match of source.matchAll(fromPattern)) specs.add(match[1]);
  for (const match of source.matchAll(barePattern)) specs.add(match[1]);
  return [...specs];
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
    for (const specifier of staticImportSpecifiers(source)) {
      const resolved = resolveLocal(current, specifier);
      if (resolved) queue.push(resolved);
    }
  }
  return seen;
}

const vinextMarkers = [
  "virtual:vinext",
  "[vinext]",
  "vinext/server/",
  "__vite_rsc",
  "react-server-dom",
];

const mainSource = fs.readFileSync(mainPath, "utf8");
const dynamicSpecs = dynamicImportSpecifiers(mainSource);
const fallbackSpec = dynamicSpecs.find((specifier) => /\/vinext-fallback-[^/]+\.js$/.test(specifier));
if (!fallbackSpec) {
  throw new Error(
    "Generated Worker entrypoint has no emitted vinext fallback dynamic import. main=" +
    config.main + "; dynamic imports=" + (dynamicSpecs.join(", ") || "none")
  );
}

const fallbackPath = resolveLocal(mainPath, fallbackSpec);
if (!fallbackPath) {
  throw new Error("Generated vinext fallback module does not exist: " + fallbackSpec);
}

const mainStatic = staticClosure(mainPath);
const fallbackStatic = staticClosure(fallbackPath);

if (mainStatic.has(fallbackPath)) {
  throw new Error("vinext fallback chunk is statically reachable from the Worker entrypoint");
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
  main_bytes: Buffer.byteLength(mainSource),
  main_static_module_count: mainStatic.size,
  dynamic_fallback: normalize(path.relative(buildRoot, fallbackPath)),
  fallback_static_module_count: fallbackStatic.size,
  public_entry_contains_vinext_markers: false,
  assets: config.assets ?? null
}, null, 2));
