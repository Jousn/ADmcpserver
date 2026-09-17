/**
 * Build script for the knowledge base TF-IDF index.
 *
 * Usage:  node scripts/build-kb-index.mjs
 *
 * Requires the TypeScript to be compiled first:  npm run build
 *
 * This script imports the compiled indexer from dist/knowledge-base/kbIndexer.js,
 * discovers all markdown files in knowledge-base/, chunks them by H2 headers,
 * builds a TF-IDF index, and saves it to knowledge-base/kb-index.json.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distIndexer = join(root, "dist", "knowledge-base", "kbIndexer.js");

// Ensure TypeScript has been compiled
if (!existsSync(distIndexer)) {
  console.error(
    "[build-kb] dist/knowledge-base/kbIndexer.js not found. Run `npm run build` first.",
  );
  process.exit(1);
}

// Import the compiled indexer module
const { buildIndex } = await import(pathToFileURL(distIndexer).href);

const knowledgeBasePath = join(root, "knowledge-base");
const outputPath = join(knowledgeBasePath, "kb-index.json");

console.log("=".repeat(60));
console.log("  Knowledge Base Index Builder");
console.log("=".repeat(60));
console.log(`  KB directory : ${knowledgeBasePath}`);
console.log(`  Output file  : ${outputPath}`);
console.log("=".repeat(60));
console.log("");

try {
  const index = buildIndex({
    knowledgeBasePath,
    outputPath,
  });

  console.log("");
  console.log("=".repeat(60));
  console.log("  Index Build Complete");
  console.log("=".repeat(60));
  console.log(`  Version       : ${index.version}`);
  console.log(`  Generated at  : ${index.generatedAt}`);
  console.log(`  Total files   : ${index.totalFiles}`);
  console.log(`  Total chunks  : ${index.totalChunks}`);
  console.log(`  Categories    : ${index.categories.join(", ")}`);
  console.log(`  Vocabulary    : ${Object.keys(index.vocabulary).length} terms`);

  // Print per-category chunk counts
  const categoryCounts = {};
  for (const chunk of index.chunks) {
    categoryCounts[chunk.category] = (categoryCounts[chunk.category] ?? 0) + 1;
  }
  console.log("");
  console.log("  Chunks per category:");
  for (const [cat, count] of Object.entries(categoryCounts)) {
    console.log(`    ${cat.padEnd(22)} ${count} chunks`);
  }
  console.log("=".repeat(60));
} catch (err) {
  console.error("");
  console.error("[build-kb] ERROR:", err.message ?? err);
  process.exit(1);
}
