/**
 * Knowledge Base Indexer
 *
 * Builds a TF-IDF index from markdown files in the knowledge base directory.
 * Chunks files by H2 (##) headers and extracts keywords, entity tags,
 * and TF-IDF vectors for semantic search.
 *
 * Uses only Node.js built-in modules (no external dependencies).
 * For Chinese text, uses character 2-grams (bigrams) since we have no
 * dedicated Chinese tokenizer.
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { join, relative, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ============================================================================
// Types
// ============================================================================

export interface KBChunk {
  id: string;
  file: string;
  category: string;
  title: string;
  content: string;
  keywords: string[];
  tags: string[];
  tfidfVector: Record<string, number>;
}

export interface KBVocabularyEntry {
  df: number;
  idf: number;
}

export interface KBIndex {
  version: string;
  generatedAt: string;
  totalChunks: number;
  totalFiles: number;
  categories: string[];
  chunks: KBChunk[];
  vocabulary: Record<string, KBVocabularyEntry>;
}

export interface BuildIndexOptions {
  knowledgeBasePath: string;
  outputPath: string;
}

interface RawChunk {
  id: string;
  file: string;
  category: string;
  title: string;
  content: string;
  tokens: string[];
  termFreq: Map<string, number>;
}

// ============================================================================
// Constants
// ============================================================================

const INDEX_VERSION = "1.0.0";
const MAX_KEYWORDS = 30;
const MAX_FORMULA_TAGS = 10;
const MAX_MEASUREMENT_TAGS = 25;
const MAX_PART_NUMBER_TAGS = 30;

/** Common English stop words to filter from tokenization. */
const STOP_WORDS = new Set<string>([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "as", "is", "are", "was", "were", "be",
  "been", "being", "have", "has", "had", "do", "does", "did", "will",
  "would", "could", "should", "may", "might", "can", "this", "that",
  "these", "those", "i", "you", "he", "she", "it", "we", "they",
  "what", "which", "who", "when", "where", "why", "how", "all", "each",
  "every", "both", "few", "more", "most", "other", "some", "such", "no",
  "nor", "not", "only", "own", "same", "so", "than", "too", "very",
  "just", "now", "if", "then", "else", "about", "into", "out", "up",
  "down", "over", "under", "again", "further", "once", "here", "there",
  "also", "via", "per", "etc", "eg", "ie", "vs", "any", "shall",
]);

// Regex patterns for entity tag extraction

/** Part numbers: e.g., AMS1117, LM358, TPS5430 */
const PART_NUMBER_REGEX = /(?<![A-Za-z0-9])[A-Z]{2,4}[0-9]{2,4}[A-Z]?(?![A-Za-z0-9])/g;

/** Measurement values: e.g., 3.3V, 100nF, 10MHz, 50Ω */
const MEASUREMENT_REGEX =
  /\b\d+(?:\.\d+)?\s*(?:MHz|GHz|kHz|Hz|mil|mm|ohm|Ohm|mV|kV|mA|uA|mW|nF|uF|pF|nH|uH|ns|us|ms|dB|ppm|°C|Ω|V|A|W|F|H|s)(?![a-zA-Z])/g;

// ============================================================================
// Tokenizer
// ============================================================================

/**
 * Tokenize text into terms for TF-IDF analysis.
 *
 * - ASCII alphanumeric sequences become lowercase word tokens (min length 2)
 * - CJK character runs become 2-gram (bigram) tokens
 * - Stop words are filtered out
 * - Single-character tokens are excluded
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const len = text.length;
  let i = 0;

  while (i < len) {
    const code = text.charCodeAt(i);

    // ASCII alphanumeric (0-9, A-Z, a-z)
    if (isAsciiAlnum(code)) {
      let j = i + 1;
      while (j < len && isAsciiAlnum(text.charCodeAt(j))) {
        j++;
      }
      const word = text.slice(i, j).toLowerCase();
      if (word.length >= 2 && !STOP_WORDS.has(word)) {
        tokens.push(word);
      }
      i = j;
    }
    // CJK Unified Ideographs (U+4E00–U+9FFF) and Extension A (U+3400–U+4DBF)
    else if (isCjk(code)) {
      let j = i + 1;
      while (j < len && isCjk(text.charCodeAt(j))) {
        j++;
      }
      const cjkRun = text.slice(i, j);
      // Create 2-grams (bigrams)
      for (let k = 0; k <= cjkRun.length - 2; k++) {
        tokens.push(cjkRun.slice(k, k + 2));
      }
      // Single CJK char: skip (too noisy for bigram approach)
      i = j;
    } else {
      i++;
    }
  }

  return tokens;
}

function isAsciiAlnum(code: number): boolean {
  return (
    (code >= 48 && code <= 57) || // 0-9
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122)   // a-z
  );
}

function isCjk(code: number): boolean {
  return (
    (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
    (code >= 0x3400 && code <= 0x4dbf)     // CJK Extension A
  );
}

// ============================================================================
// Entity Tag Extractor
// ============================================================================

/**
 * Extract entity tags from content using regex patterns.
 *
 * - Part numbers: e.g., AMS1117, LM358, TPS5430
 * - Formulas: lines containing `=` and mathematical operators
 * - Measurements: e.g., 3.3V, 100nF, 10MHz
 */
export function extractEntityTags(content: string): string[] {
  const tags = new Set<string>();

  // --- Part numbers ---
  const partNumbers = new Set<string>();
  let m: RegExpExecArray | null;
  PART_NUMBER_REGEX.lastIndex = 0;
  while ((m = PART_NUMBER_REGEX.exec(content)) !== null) {
    partNumbers.add(m[0]);
  }
  for (const pn of partNumbers) {
    if (tags.size >= MAX_PART_NUMBER_TAGS) break;
    tags.add(pn);
  }

  // --- Formulas (lines containing = and math operators) ---
  const formulaTags: string[] = [];
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.length > 5 &&
      trimmed.length < 200 &&
      trimmed.includes("=") &&
      /[+\-*/^×÷]/.test(trimmed) &&
      !trimmed.startsWith("|") // skip table rows
    ) {
      // Extract the formula portion (variable = expression)
      const formulaMatch = trimmed.match(
        /([A-Za-z_][A-Za-z0-9_]*(?:\s*[\^_]*)?)\s*=\s*[A-Za-z0-9_+\-*/^().\s×÷√π]+/,
      );
      if (formulaMatch) {
        const formula = formulaMatch[0].trim().substring(0, 80);
        if (formula.length > 5) {
          formulaTags.push(formula);
        }
      }
    }
  }
  // Deduplicate and cap
  const formulaSet = new Set<string>();
  for (const f of formulaTags) {
    if (formulaSet.size >= MAX_FORMULA_TAGS) break;
    formulaSet.add(f);
  }
  for (const f of formulaSet) {
    tags.add(f);
  }

  // --- Measurements ---
  const measurements = new Set<string>();
  MEASUREMENT_REGEX.lastIndex = 0;
  while ((m = MEASUREMENT_REGEX.exec(content)) !== null) {
    measurements.add(m[0].trim());
  }
  let count = 0;
  for (const ms of measurements) {
    if (count >= MAX_MEASUREMENT_TAGS) break;
    tags.add(ms);
    count++;
  }

  return Array.from(tags);
}

// ============================================================================
// File Discovery
// ============================================================================

/**
 * Recursively find all .md files in a directory.
 */
function findMarkdownFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(fullPath);
    }
  }
  return results;
}

// ============================================================================
// Chunking
// ============================================================================

/**
 * Chunk a markdown file's content by H2 (##) headers.
 *
 * Each chunk includes the H2 header line and all content until the next
 * H2 or end of file. Content before the first H2 (preamble with H1 title,
 * metadata, etc.) becomes its own chunk.
 *
 * Code blocks (``` fences) are tracked so that `##` inside code blocks
 * is not treated as a header.
 */
function chunkFile(
  content: string,
  category: string,
  relativePath: string,
): RawChunk[] {
  const lines = content.split("\n");
  const chunks: { title: string; lines: string[] }[] = [];
  let preambleLines: string[] = [];
  let h1Title = "";

  let currentChunk: { title: string; lines: string[] } | null = null;
  let inCodeBlock = false;

  for (const line of lines) {
    // Track fenced code blocks
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
    }

    // Detect H1 (but not inside code blocks)
    if (!inCodeBlock && line.startsWith("# ") && !line.startsWith("## ")) {
      h1Title = line.slice(2).trim();
    }

    // Detect H2 (but not inside code blocks, and not H3+)
    if (!inCodeBlock && line.startsWith("## ") && !line.startsWith("### ")) {
      // Flush previous chunk
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      // Start new chunk
      currentChunk = {
        title: line.slice(3).trim(),
        lines: [line],
      };
    } else if (currentChunk) {
      currentChunk.lines.push(line);
    } else {
      // Content before first H2
      preambleLines.push(line);
    }
  }

  // Flush last chunk
  if (currentChunk) {
    chunks.push(currentChunk);
  }

  // Build the raw chunk list: preamble (if any) + H2 sections
  const rawChunks: RawChunk[] = [];

  // Handle preamble (content before first H2)
  const preambleContent = preambleLines.join("\n").trim();
  if (preambleContent.length > 0) {
    rawChunks.push({
      id: "",
      file: "",
      category,
      title: h1Title || basename(relativePath, ".md"),
      content: preambleContent,
      tokens: [],
      termFreq: new Map(),
    });
  }

  // Add H2-based chunks (skip empty ones for clean sequential numbering)
  for (const chunk of chunks) {
    const chunkContent = chunk.lines.join("\n").trim();
    if (chunkContent.length === 0) continue;
    rawChunks.push({
      id: "",
      file: "",
      category,
      title: chunk.title,
      content: chunkContent,
      tokens: [],
      termFreq: new Map(),
    });
  }

  // If no chunks at all, create one for the entire file
  if (rawChunks.length === 0) {
    rawChunks.push({
      id: "",
      file: "",
      category,
      title: h1Title || basename(relativePath, ".md"),
      content: content.trim(),
      tokens: [],
      termFreq: new Map(),
    });
  }

  // Assign sequential IDs and file paths, then tokenize
  const basenameWithoutExt = basename(relativePath, ".md");
  const normalizedFile = relativePath.replace(/\\/g, "/");
  for (let idx = 0; idx < rawChunks.length; idx++) {
    rawChunks[idx].id = `${category}/${basenameWithoutExt}/section-${idx}`;
    rawChunks[idx].file = normalizedFile;
    // Tokenize and compute term frequencies
    const tokens = tokenize(rawChunks[idx].content);
    rawChunks[idx].tokens = tokens;
    rawChunks[idx].termFreq = computeTermFrequencies(tokens);
  }

  return rawChunks;
}

/**
 * Compute term frequency (count) map from a token list.
 */
function computeTermFrequencies(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const token of tokens) {
    freq.set(token, (freq.get(token) ?? 0) + 1);
  }
  return freq;
}

// ============================================================================
// TF-IDF Computation
// ============================================================================

/**
 * Round a number to 4 decimal places.
 */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Build the complete TF-IDF index from the knowledge base directory.
 *
 * Steps:
 * 1. Discover all .md files recursively
 * 2. Chunk each file by H2 headers
 * 3. Tokenize each chunk and compute term frequencies
 * 4. Build vocabulary (document frequency for each term)
 * 5. Compute IDF for each term
 * 6. Compute TF-IDF vectors for each chunk
 * 7. Extract keywords (top N by TF-IDF) and entity tags
 */
export function buildIndex(options: BuildIndexOptions): KBIndex {
  const { knowledgeBasePath, outputPath } = options;

  if (!existsSync(knowledgeBasePath)) {
    throw new Error(`Knowledge base directory not found: ${knowledgeBasePath}`);
  }

  // Step 1: Discover markdown files
  const files = findMarkdownFiles(knowledgeBasePath);
  if (files.length === 0) {
    throw new Error(`No markdown files found in: ${knowledgeBasePath}`);
  }

  console.log(`[kb-indexer] Found ${files.length} markdown files`);

  // Step 2-3: Read, chunk, and tokenize each file
  const allRawChunks: RawChunk[] = [];
  const categoriesSet = new Set<string>();

  for (const file of files) {
    const relPath = relative(knowledgeBasePath, file);
    const category = relPath.split(/[\\/]/)[0] || "uncategorized";
    categoriesSet.add(category);

    const content = readFileSync(file, "utf8");
    const rawChunks = chunkFile(content, category, relPath);
    allRawChunks.push(...rawChunks);

    console.log(
      `  [chunked] ${relPath} -> ${rawChunks.length} chunks (category: ${category})`,
    );
  }

  const totalChunks = allRawChunks.length;
  console.log(`[kb-indexer] Total chunks: ${totalChunks}`);

  // Step 4: Build vocabulary (document frequency)
  const dfMap = new Map<string, number>();
  for (const chunk of allRawChunks) {
    for (const term of chunk.termFreq.keys()) {
      dfMap.set(term, (dfMap.get(term) ?? 0) + 1);
    }
  }

  // Step 5: Compute IDF for each term
  // IDF = log(totalChunks / df)
  const vocabulary: Record<string, KBVocabularyEntry> = {};
  for (const [term, df] of dfMap) {
    const idf = Math.log(totalChunks / df);
    vocabulary[term] = { df, idf: round4(idf) };
  }

  console.log(`[kb-indexer] Vocabulary size: ${Object.keys(vocabulary).length}`);

  // Step 6-7: Compute TF-IDF vectors, extract keywords and entity tags
  const chunks: KBChunk[] = [];
  for (const raw of allRawChunks) {
    const totalTerms = raw.tokens.length;

    // Compute TF-IDF vector
    const tfidfVector: Record<string, number> = {};
    if (totalTerms > 0) {
      for (const [term, count] of raw.termFreq) {
        const tf = count / totalTerms;
        const vocabEntry = vocabulary[term];
        if (vocabEntry) {
          const tfidf = tf * vocabEntry.idf;
          if (tfidf > 0) {
            tfidfVector[term] = round4(tfidf);
          }
        }
      }
    }

    // Extract top keywords by TF-IDF score
    const sortedTerms = Object.entries(tfidfVector)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_KEYWORDS)
      .map(([term]) => term);

    // Extract entity tags
    const tags = extractEntityTags(raw.content);

    chunks.push({
      id: raw.id,
      file: raw.file,
      category: raw.category,
      title: raw.title,
      content: raw.content,
      keywords: sortedTerms,
      tags,
      tfidfVector,
    });
  }

  const index: KBIndex = {
    version: INDEX_VERSION,
    generatedAt: new Date().toISOString(),
    totalChunks,
    totalFiles: files.length,
    categories: Array.from(categoriesSet).sort(),
    chunks,
    vocabulary,
  };

  // Save the index
  saveIndex(index, outputPath);

  return index;
}

/**
 * Save the index to a JSON file.
 */
export function saveIndex(index: KBIndex, outputPath: string): void {
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const json = JSON.stringify(index, null, 2);
  writeFileSync(outputPath, json, "utf8");

  const sizeMB = (json.length / 1024 / 1024).toFixed(2);
  console.log(
    `[kb-indexer] Index saved to ${outputPath} (${sizeMB} MB)`,
  );
}

// ============================================================================
// Default export for CLI usage
// ============================================================================

/**
 * Resolve the default knowledge base path relative to the project root.
 */
export function getDefaultKnowledgeBasePath(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  // From dist/knowledge-base/ or src/knowledge-base/, go up 2 levels to project root
  return join(moduleDir, "..", "..", "knowledge-base");
}

/**
 * Resolve the default index output path.
 */
export function getDefaultOutputPath(): string {
  return join(getDefaultKnowledgeBasePath(), "kb-index.json");
}
