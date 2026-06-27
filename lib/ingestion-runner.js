import { spawn } from "node:child_process";
import path from "node:path";

export const INGESTION_TASKS = {
  official: { name: "official", script: "run-official-ingestion.mjs" },
  market: { name: "market", script: "run-market-ingestion.mjs" },
  x: { name: "x", script: "run-x-ingestion.mjs" },
  stock: { name: "stock", script: "run-stock-ingestion.mjs" },
};

export const INGESTION_ORDER = ["official", "market", "x", "stock"];

export function getIngestionTaskNames() {
  return [...INGESTION_ORDER];
}

export async function runIngestionTask(taskName, options = {}) {
  const task = INGESTION_TASKS[taskName];
  if (!task) {
    const error = new Error(`Unknown ingestion task: ${taskName}`);
    error.code = "UNKNOWN_INGESTION_TASK";
    throw error;
  }

  const startedAt = new Date();
  const scriptPath = path.join(process.cwd(), "scripts", task.script);
  const result = await runNodeScript(scriptPath, {
    ...options,
    taskName,
    startedAt,
  });
  const finishedAt = new Date();

  return {
    name: taskName,
    ok: true,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt - startedAt,
    ...result,
  };
}

export async function runIngestionSequence(taskNames = INGESTION_ORDER, options = {}) {
  const startedAt = new Date();
  const results = [];

  try {
    for (const taskName of taskNames) {
      results.push(await runIngestionTask(taskName, options));
    }
  } catch (error) {
    const failedAt = new Date();
    error.summary = {
      ok: false,
      startedAt: startedAt.toISOString(),
      failedAt: failedAt.toISOString(),
      durationMs: failedAt - startedAt,
      completedSteps: results,
      failedStep: error.stepName || "unknown",
      message: error.message,
      nextAction: "Open ingestion logs, fix the failed source or env, then rerun the failed task. Check /review after the rerun.",
    };
    throw error;
  }

  const finishedAt = new Date();
  return {
    ok: true,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt - startedAt,
    steps: results,
    nextAction: "Open /review and handle high or medium import issues first.",
  };
}

function runNodeScript(scriptPath, options) {
  const { taskName, startedAt, captureOutput = false } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      stdio: captureOutput ? ["ignore", "pipe", "pipe"] : "inherit",
      env: process.env,
      shell: false,
    });

    const stdout = [];
    const stderr = [];

    if (captureOutput) {
      child.stdout?.on("data", (chunk) => stdout.push(chunk));
      child.stderr?.on("data", (chunk) => stderr.push(chunk));
    }

    child.on("error", (error) => {
      error.stepName = taskName;
      reject(error);
    });

    child.on("close", (code) => {
      const finishedAt = new Date();
      const output = captureOutput ? bufferToLimitedText(stdout) : "";
      const errorOutput = captureOutput ? bufferToLimitedText(stderr) : "";

      if (code === 0) {
        resolve({
          exitCode: code,
          output,
          errorOutput,
          parsedOutput: parseLastJsonObject(output),
        });
        return;
      }

      const error = new Error(`${taskName} exited with code ${code}`);
      error.stepName = taskName;
      error.summary = {
        ok: false,
        startedAt: startedAt.toISOString(),
        failedAt: finishedAt.toISOString(),
        durationMs: finishedAt - startedAt,
        failedStep: taskName,
        exitCode: code,
        output,
        errorOutput,
      };
      reject(error);
    });
  });
}

function bufferToLimitedText(chunks) {
  const text = Buffer.concat(chunks).toString("utf8");
  return text.length > 12000 ? `${text.slice(-12000)}\n[truncated]` : text;
}

function parseLastJsonObject(value = "") {
  const text = String(value).trim();
  if (!text) return null;

  const end = text.lastIndexOf("}");
  if (end < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = end; index >= 0; index -= 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "}") {
      depth += 1;
      continue;
    }
    if (char === "{") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(index, end + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}
