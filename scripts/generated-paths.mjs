import os from "node:os";
import path from "node:path";

export function getGeneratedDataPath(fileName) {
  const baseDir = process.env.INGEST_GENERATED_DIR
    || (process.env.VERCEL ? path.join(os.tmpdir(), "gacha-generated") : path.join(process.cwd(), "data", "generated"));

  return path.join(baseDir, fileName);
}
