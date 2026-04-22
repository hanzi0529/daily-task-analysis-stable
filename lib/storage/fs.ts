import { promises as fs } from "fs";
import path from "path";

import { storagePaths } from "@/config/app";

export async function ensureDataDirectories() {
  await Promise.all(
    [
      storagePaths.uploadsDir,
      storagePaths.parsedDir,
      storagePaths.cacheDir
    ].map((dir) => fs.mkdir(dir, { recursive: true }))
  );
}

// Write queue to serialize concurrent writes to the same file.
// Without this, multiple AI review saves (cancel + continue + batch progress)
// can race and cause EPERM/ENOENT on Windows, or stale data overwriting new data.
const writeQueues = new Map<string, Promise<void>>();

// Generate a unique tmp file name to avoid collision when multiple writes queue up.
function generateTmpPath(filePath: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 10);
  return `${filePath}.${timestamp}.${random}.tmp`;
}

// Windows rename retry: On Windows, rename can fail with EPERM if another process
// (antivirus, file indexer) has the file open. Retry with exponential backoff.
const RENAME_MAX_RETRIES = 3;
const RENAME_BASE_DELAY_MS = 50;

async function renameWithRetry(tmpPath: string, filePath: string): Promise<void> {
  for (let attempt = 1; attempt <= RENAME_MAX_RETRIES; attempt += 1) {
    try {
      await fs.rename(tmpPath, filePath);
      return;
    } catch (error) {
      const isEperm = error instanceof Error && "code" in error && error.code === "EPERM";
      if (isEperm && attempt < RENAME_MAX_RETRIES) {
        const delay = RENAME_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}

// Atomic write: write to a unique .tmp file, then rename over the target.
// On the same filesystem partition, rename(2) is atomic — readers always see
// either the old complete file or the new complete file, never partial data.
// This prevents the "Unterminated string in JSON" / "Unexpected end of JSON"
// errors that occur when a concurrent read catches a file mid-write.
//
// Write queue ensures that concurrent writes to the same file are serialized,
// preventing EPERM/ENOENT errors and stale data overwriting new data.
export async function writeJsonFile(filePath: string, data: unknown) {
  // Get or create a write queue for this file path
  const currentQueue = writeQueues.get(filePath) ?? Promise.resolve();

  // Create a new write task that waits for the previous one to complete
  const writeTask = currentQueue.then(async () => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tmpPath = generateTmpPath(filePath);
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf8");
    await renameWithRetry(tmpPath, filePath);
  });

  // Update the queue with the new task (catch to prevent unhandled rejection)
  const queuedTask = writeTask.catch(() => {});
  writeQueues.set(filePath, queuedTask);

  // Wait for this write to complete
  await writeTask;
}

// Throws on read or parse error — use when the caller already handles errors.
export async function readJsonFile<T>(filePath: string) {
  const buffer = await fs.readFile(filePath, "utf8");
  return JSON.parse(buffer) as T;
}

// Returns null on any error (ENOENT, parse failure, etc.).
// Use for resilient reads where a missing or corrupt file should be treated
// as "not available" rather than a fatal error.
export async function tryReadJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const buffer = await fs.readFile(filePath, "utf8");
    return JSON.parse(buffer) as T;
  } catch {
    return null;
  }
}

export async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function listFilesSorted(dirPath: string) {
  const names = await fs.readdir(dirPath);
  const withStats = await Promise.all(
    names.map(async (name) => {
      const filePath = path.join(dirPath, name);
      const stat = await fs.stat(filePath);
      return { name, filePath, stat };
    })
  );

  return withStats
    .filter((entry) => entry.stat.isFile())
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
}
