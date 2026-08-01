import fs from "node:fs";

export function loadOptionalEnvFile(fileName = ".env.local") {
  if (!fs.existsSync(fileName)) return false;
  if (typeof process.loadEnvFile !== "function") {
    throw new Error("process.loadEnvFile is unavailable for an existing env file.");
  }

  try {
    process.loadEnvFile(fileName);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}
