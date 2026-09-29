import fs from "node:fs";
import path from "node:path";

const marker = "gacha-lens.vinext-fallback-loaded";
const serverDir = path.resolve("dist/server");
const wranglerPath = path.join(serverDir, "wrangler.json");

if (!fs.existsSync(wranglerPath)) throw new Error("Missing dist/server/wrangler.json");
const config = JSON.parse(fs.readFileSync(wranglerPath, "utf8"));
if (!config.main) throw new Error("Generated Cloudflare config is missing main");
if (!config.assets?.directory) throw new Error("Generated Cloudflare config is missing assets.directory");
if (config.assets.run_worker_first === true) throw new Error("Static Assets must remain asset-first for Phase A1");

const entryPath = path.resolve(serverDir, config.main);
if (!fs.existsSync(entryPath)) throw new Error(`Generated Worker entrypoint does not exist: ${entryPath}`);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(absolute));
    else out.push(absolute);
  }
  return out;
}

const jsFiles = walk(serverDir).filter((file) => /\.(?:m?js|cjs)$/.test(file));
const markerFiles = jsFiles.filter((file) => fs.readFileSync(file, "utf8").includes(marker));
if (markerFiles.length !== 1) {
  throw new Error(`Expected exactly one isolated vinext fallback marker chunk, found ${markerFiles.length}: ${markerFiles.join(", ")}`);
}

const markerFile = markerFiles[0];
if (path.resolve(markerFile) === path.resolve(entryPath)) throw new Error("vinext fallback marker was bundled into the public Worker entrypoint");
const entry = fs.readFileSync(entryPath, "utf8");
if (entry.includes(marker)) throw new Error("vinext fallback marker leaked into public entrypoint");

const relativeMarker = "./" + path.relative(path.dirname(entryPath), markerFile).replaceAll(path.sep, "/");
const baseMarker = path.basename(markerFile);
const staticForms = [
  `from "${relativeMarker}"`,
  `from '${relativeMarker}'`,
  `import "${relativeMarker}"`,
  `import '${relativeMarker}'`,
];
if (staticForms.some((form) => entry.includes(form))) throw new Error(`vinext fallback chunk is statically imported by entrypoint: ${relativeMarker}`);
if (!entry.includes(relativeMarker) && !entry.includes(baseMarker)) throw new Error("Public entrypoint does not reference isolated fallback chunk; dynamic split cannot be proven");

const assetsDir = path.resolve(serverDir, config.assets.directory);
console.log(JSON.stringify({
  entry: path.relative(process.cwd(), entryPath),
  vinextFallbackChunk: path.relative(process.cwd(), markerFile),
  assetsDirectory: path.relative(process.cwd(), assetsDir),
  runWorkerFirst: config.assets.run_worker_first ?? false,
}, null, 2));
