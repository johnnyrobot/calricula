import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { gzipSync } from "node:zlib";

import { findSecrets } from "./secret-scan.mjs";

const directory = path.resolve(process.cwd(), ".wrangler", "dry-run");
const COMPRESSED_WORKER_LIMIT = 3 * 1024 * 1024;

async function collectFiles(currentDirectory) {
  const entries = await readdir(currentDirectory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(currentDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(absolutePath)));
    } else if (entry.isFile()) {
      files.push(absolutePath);
    }
  }
  return files;
}

let files;
try {
  files = await collectFiles(directory);
} catch (error) {
  console.error(
    `[worker-validator] Cannot inspect dry-run output: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
}

const moduleFiles = files.filter((file) =>
  [".js", ".mjs", ".cjs", ".wasm", ".bin"].includes(path.extname(file)),
);
if (moduleFiles.length === 0) {
  console.error("[worker-validator] Dry run produced no Worker module.");
  process.exit(1);
}

let estimatedCompressedBytes = 0;
const failures = [];

for (const file of moduleFiles) {
  const content = await readFile(file);
  const extension = path.extname(file);
  estimatedCompressedBytes +=
    extension === ".wasm" || extension === ".bin"
      ? content.byteLength
      : gzipSync(content, { level: 9 }).byteLength;
}

// Bindings and upload metadata can be emitted separately from the executable
// module. Scan every dry-run artifact, including binary modules, so neither a
// large text file nor an embedded ASCII secret can evade the bundle check.
for (const file of files) {
  const content = await readFile(file);
  const text = content.toString("latin1");
  for (const name of findSecrets(text)) {
    failures.push(
      `Secret-like value (${name}) found in ${path.relative(
        directory,
        file,
      )}.`,
    );
  }
}

if (estimatedCompressedBytes > COMPRESSED_WORKER_LIMIT) {
  failures.push(
    `Estimated compressed Worker modules are ${(
      estimatedCompressedBytes /
      1024 /
      1024
    ).toFixed(2)} MiB; Workers Free permits 3 MiB.`,
  );
}

console.log(
  `[worker-validator] ${moduleFiles.length} module(s), approximately ${(
    estimatedCompressedBytes /
    1024 /
    1024
  ).toFixed(2)} MiB compressed.`,
);

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`[worker-validator] ${failure}`);
  }
  process.exit(1);
}

console.log("[worker-validator] Bundle size and secret checks passed.");
