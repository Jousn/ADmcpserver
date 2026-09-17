/**
 * Knowledge Base Search
 *
 * Provides semantic search over the TF-IDF index built by kbIndexer.
 * Uses a multi-signal ranking approach:
 *   - TF-IDF cosine similarity (40% weight)
 *   - Keyword overlap (30% weight)
 *   - Entity tag matching (20% weight)
 *   - Category bonus (10% weight)
 *
 * The index is loaded lazily from kb-index.json on first search and cached
 * in memory for subsequent calls.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  tokenize,
  extractEntityTags,
  type KBChunk,
  type KBIndex,
} from "./kbIndexer.js";

// ============================================================================
// Types
// ============================================================================

export interface SearchOptions {
  /** Filter results by knowledge base category (e.g., "classic-circuits"). */
  category?: string;
  /** Maximum number of results to return (default: 5). */
  limit?: number;
  /** Minimum relevance score to include in results (default: 0.1). */
  minScore?: number;
}

export interface SearchResult {
  id: string;
  file: string;
  category: string;
  title: string;
  content: string;
  keywords: string[];
  score: number;
  matchedTerms: string[];
}

// ============================================================================
// Scoring Weights
// ============================================================================

const WEIGHT_COSINE = 0.40;
const WEIGHT_KEYWORD = 0.30;
const WEIGHT_ENTITY = 0.20;
const WEIGHT_CATEGORY = 0.10;

// ============================================================================
// Category keyword mapping (for category bonus scoring)
// ============================================================================

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "classic-circuits": [
    "ldo", "buck", "boost", "opamp", "op-amp", "运放", "mcu", "usb",
    "uart", "rs485", "spi", "i2c", "tvs", "fuse", "比较器", "放大器",
    "滤波器", "稳压", "线性稳压", "低压差", "interface", "接口",
    "保护", "esd", "瞬态", "二极管", "晶体管",
  ],
  "component-selection": [
    "选型", "capacitor", "电容选型", "mosfet", "场效应管", "connector",
    "连接器", "opamp selection", "运放选型", "电阻选型", "器件选型",
    "component", "selection", "电容", "电阻",
  ],
  "design-rules": [
    "去耦", "decoupling", "grounding", "接地", "走线", "track",
    "差分", "differential", "emc", "emi", "铺铜", "copper",
    "阻抗", "impedance", "回流", "return path", "电源完整性",
    "pi", "si", "信号完整性", "layer stackup", "叠层",
  ],
  "drc-templates": [
    "drc", "规则", "rule", "高速", "high-speed", "analog",
    "模拟", "混合信号", "mixed-signal", "电源规则", "template",
    "模板", "design rule check",
  ],
  "schematic-design": [
    "原理图", "schematic", "布局", "layout", "规划", "planning",
    "轨道", "rail", "间距", "spacing", "朝向", "orientation",
    "旋转", "rotation", "锚点", "anchor", "布线", "wiring",
    "连线", "网络标签", "net label", "位号", "designator",
    "命名", "naming", "电源符号", "power port", "结点", "junction",
    "交叉", "crossing", "可读性", "readability", "优雅", "elegant",
    "双轨", "two-rail", "分压", "divider", "反馈", "feedback",
    "禁入区", "keep-out", "标签重叠", "overlap", "绘制前",
  ],
  "power-supply": [
    "电源", "power", "emi filter", "pfc", "dc-dc", "拓扑",
    "topology", "整流", "rectification", "保护", "protection",
    "散热", "thermal", "磁性", "magnetic", "控制", "control",
    "宽禁带", "wide-bandgap", "gan", "sic", "pcb layout",
    "数字电源", "digital power", "隔离", "isolation", "环路补偿",
    "loop compensation", "snubber", "缓冲", "均流", "current sharing",
    "三相位", "three-phase", "synchronous", "同步整流",
  ],
  "gjb5000b": [
    "gjb", "5000b", "5000", "军用软件", "能力成熟度", "成熟度模型",
    "实践域", "成熟度等级", "初始级", "规范级", "全面级", "量化级",
    "卓越级", "组织管理", "项目管理", "工程类", "支持类",
    // 实践域缩写与中文名（便于按缩写检索）
    "ld", "领导作用", "opi", "组织过程改进", "oad", "组织资产开发",
    "ot", "组织培训", "ii", "实施基础",
    "pp", "项目策划", "pmc", "项目监控", "rom", "风险与机遇管理",
    "esm", "外部供方管理",
    "dem", "立项论证", "rdm", "需求开发与管理", "ts", "技术解决方案",
    "pid", "产品集成与交付", "pr", "同行评审", "vv", "验证与确认",
    "mt", "运行维护",
    "cm", "配置管理", "qa", "质量保证", "dar", "决策分析",
    "car", "原因分析", "mpm", "测量与绩效管理",
    // 通用过程改进词汇
    "过程改进", "过程资产", "标准过程", "组织级方针", "业务目标",
    "测量目标", "量化管理", "同行评价", "配置项", "基线",
  ],
};

// ============================================================================
// Index Loading (lazy singleton)
// ============================================================================

let cachedIndex: KBIndex | null = null;
let cachedChunkMap: Map<string, KBChunk> | null = null;
let cachedChunkNorms: Map<string, number> | null = null;

/**
 * Resolve the index file path.
 * Tries (in order): env var, relative to module, relative to cwd.
 */
function resolveIndexPath(): string {
  // 1. Environment variable override
  const envPath = process.env.ALTIUM_MCP_KB_INDEX?.trim();
  if (envPath) return envPath;

  // 2. Relative to this module file (works for both dist/ and src/)
  // dist/knowledge-base/kbSearch.js -> ../../knowledge-base/kb-index.json
  // src/knowledge-base/kbSearch.ts -> ../../knowledge-base/kb-index.json
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const relativePath = join(moduleDir, "..", "..", "knowledge-base", "kb-index.json");
  if (existsSync(relativePath)) return relativePath;

  // 3. Relative to current working directory
  const cwdPath = join(process.cwd(), "knowledge-base", "kb-index.json");
  return cwdPath;
}

/**
 * Load the index from disk (lazy, cached).
 * Returns null if the index file is not found or cannot be parsed.
 */
function getIndex(): KBIndex | null {
  if (cachedIndex) return cachedIndex;

  const indexPath = resolveIndexPath();
  if (!existsSync(indexPath)) {
    console.error(
      `[kb-search] Index file not found: ${indexPath}. Run "npm run build-kb" to generate it.`,
    );
    return null;
  }

  try {
    const raw = readFileSync(indexPath, "utf8");
    const index = JSON.parse(raw) as KBIndex;
    cachedIndex = index;

    // Build chunk lookup map
    cachedChunkMap = new Map();
    for (const chunk of index.chunks) {
      cachedChunkMap.set(chunk.id, chunk);
    }

    // Precompute L2 norms of TF-IDF vectors for cosine similarity
    cachedChunkNorms = new Map();
    for (const chunk of index.chunks) {
      let sumSquares = 0;
      for (const score of Object.values(chunk.tfidfVector)) {
        sumSquares += score * score;
      }
      cachedChunkNorms.set(chunk.id, Math.sqrt(sumSquares));
    }

    return index;
  } catch (err) {
    console.error(`[kb-search] Failed to load index: ${indexPath}`, err);
    return null;
  }
}

// ============================================================================
// Scoring Functions
// ============================================================================

/**
 * Build a TF-IDF vector for the query using the vocabulary's IDF values.
 */
function buildQueryVector(
  queryTokens: string[],
  vocabulary: Record<string, { df: number; idf: number }>,
): Map<string, number> {
  const queryVector = new Map<string, number>();
  if (queryTokens.length === 0) return queryVector;

  // Term frequency in query
  const termFreq = new Map<string, number>();
  for (const token of queryTokens) {
    termFreq.set(token, (termFreq.get(token) ?? 0) + 1);
  }

  const totalTerms = queryTokens.length;
  for (const [term, count] of termFreq) {
    const vocabEntry = vocabulary[term];
    if (vocabEntry) {
      const tf = count / totalTerms;
      const tfidf = tf * vocabEntry.idf;
      if (tfidf > 0) {
        queryVector.set(term, tfidf);
      }
    }
  }

  return queryVector;
}

/**
 * Compute L2 norm of a sparse vector.
 */
function vectorNorm(vec: Map<string, number>): number {
  let sumSquares = 0;
  for (const val of vec.values()) {
    sumSquares += val * val;
  }
  return Math.sqrt(sumSquares);
}

/**
 * Compute cosine similarity between query vector and chunk TF-IDF vector.
 * Iterates over the smaller vector for efficiency.
 */
function cosineSimilarity(
  queryVector: Map<string, number>,
  queryNorm: number,
  chunk: KBChunk,
  chunkNorm: number,
): number {
  if (queryNorm === 0 || chunkNorm === 0) return 0;

  let dotProduct = 0;
  for (const [term, queryScore] of queryVector) {
    const chunkScore = chunk.tfidfVector[term];
    if (chunkScore !== undefined) {
      dotProduct += queryScore * chunkScore;
    }
  }

  return dotProduct / (queryNorm * chunkNorm);
}

/**
 * Compute keyword overlap score: fraction of query terms that appear
 * in the chunk's top keywords list.
 */
function keywordOverlapScore(queryTokens: string[], keywords: string[]): number {
  if (queryTokens.length === 0 || keywords.length === 0) return 0;

  const keywordSet = new Set(keywords);
  let matches = 0;
  const uniqueQueryTerms = new Set(queryTokens);
  for (const term of uniqueQueryTerms) {
    if (keywordSet.has(term)) {
      matches++;
    }
  }

  return matches / uniqueQueryTerms.size;
}

/**
 * Compute entity tag matching score: fraction of query entity tags
 * found in the chunk's tags. Returns 0 if query has no entity tags.
 */
function entityTagScore(queryTags: string[], chunkTags: string[]): number {
  if (queryTags.length === 0) return 0;
  if (chunkTags.length === 0) return 0;

  const chunkTagSet = new Set(chunkTags.map((t) => t.toLowerCase()));
  let matches = 0;
  for (const tag of queryTags) {
    if (chunkTagSet.has(tag.toLowerCase())) {
      matches++;
    }
  }

  return matches / queryTags.length;
}

/**
 * Compute category bonus: returns 1.0 if the query mentions keywords
 * associated with the chunk's category, 0.0 otherwise.
 * If multiple categories match, returns a proportional score.
 */
function categoryBonusScore(query: string, chunkCategory: string): number {
  const queryLower = query.toLowerCase();
  let maxScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let matchCount = 0;
    for (const kw of keywords) {
      if (queryLower.includes(kw.toLowerCase())) {
        matchCount++;
      }
    }
    if (matchCount > 0) {
      // Score: proportional to match count, normalized
      const score = Math.min(1, matchCount / 3);
      if (category === chunkCategory) {
        maxScore = Math.max(maxScore, score);
      }
    }
  }

  return maxScore;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Search the knowledge base using TF-IDF + keyword scoring.
 *
 * Ranking combines four signals:
 *   1. TF-IDF cosine similarity (40%)
 *   2. Keyword overlap (30%)
 *   3. Entity tag matching (20%)
 *   4. Category bonus (10%)
 *
 * Results are sorted by combined score, descending.
 *
 * @param query - Natural language search query (English or Chinese)
 * @param options - Optional filters: category, limit, minScore
 * @returns Ranked search results
 */
export function searchKnowledgeBase(
  query: string,
  options?: SearchOptions,
): SearchResult[] {
  if (!query || query.trim().length === 0) return [];

  const index = getIndex();
  if (!index) return [];

  const limit = options?.limit ?? 5;
  const minScore = options?.minScore ?? 0.1;
  const categoryFilter = options?.category?.trim().toLowerCase();

  // Tokenize the query
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  // Build query TF-IDF vector
  const queryVector = buildQueryVector(queryTokens, index.vocabulary);
  const queryNorm = vectorNorm(queryVector);

  // Extract entity tags from the query
  const queryTags = extractEntityTags(query);

  // Track matched terms (terms from query that appear in chunk keywords/vectors)
  const uniqueQueryTerms = new Set(queryTokens);

  // Score each chunk
  const scored: SearchResult[] = [];

  for (const chunk of index.chunks) {
    // Apply category filter
    if (categoryFilter && chunk.category.toLowerCase() !== categoryFilter) {
      continue;
    }

    // Skip chunks with no TF-IDF vector
    const chunkNorm = cachedChunkNorms?.get(chunk.id) ?? 0;
    if (chunkNorm === 0 && queryNorm > 0) continue;

    // Compute individual scores
    const cosSim = cosineSimilarity(queryVector, queryNorm, chunk, chunkNorm);
    const kwOverlap = keywordOverlapScore(queryTokens, chunk.keywords);
    const entityMatch = entityTagScore(queryTags, chunk.tags);
    const catBonus = categoryBonusScore(query, chunk.category);

    // Combined weighted score
    const score =
      WEIGHT_COSINE * cosSim +
      WEIGHT_KEYWORD * kwOverlap +
      WEIGHT_ENTITY * entityMatch +
      WEIGHT_CATEGORY * catBonus;

    if (score < minScore) continue;

    // Collect matched terms
    const matchedTerms: string[] = [];
    for (const term of uniqueQueryTerms) {
      if (chunk.tfidfVector[term] !== undefined || chunk.keywords.includes(term)) {
        matchedTerms.push(term);
      }
    }

    // Truncate content to 500 chars for search results
    const truncatedContent =
      chunk.content.length > 500
        ? chunk.content.substring(0, 500) + "..."
        : chunk.content;

    scored.push({
      id: chunk.id,
      file: chunk.file,
      category: chunk.category,
      title: chunk.title,
      content: truncatedContent,
      keywords: chunk.keywords,
      score: Math.round(score * 10000) / 10000,
      matchedTerms,
    });
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit);
}

/**
 * List all knowledge base categories.
 */
export function listKnowledgeBaseCategories(): string[] {
  const index = getIndex();
  if (!index) return [];
  return [...index.categories];
}

/**
 * Get knowledge base statistics.
 */
export function getKnowledgeBaseStats(): {
  totalChunks: number;
  totalFiles: number;
  categories: string[];
} {
  const index = getIndex();
  if (!index) {
    return { totalChunks: 0, totalFiles: 0, categories: [] };
  }
  return {
    totalChunks: index.totalChunks,
    totalFiles: index.totalFiles,
    categories: [...index.categories],
  };
}

/**
 * Retrieve a specific chunk by its ID.
 * Returns null if the index is not loaded or the chunk is not found.
 */
export function getChunkById(id: string): SearchResult | null {
  const index = getIndex();
  if (!index) return null;

  const chunk = cachedChunkMap?.get(id);
  if (!chunk) return null;

  const truncatedContent =
    chunk.content.length > 500
      ? chunk.content.substring(0, 500) + "..."
      : chunk.content;

  return {
    id: chunk.id,
    file: chunk.file,
    category: chunk.category,
    title: chunk.title,
    content: truncatedContent,
    keywords: chunk.keywords,
    score: 1.0,
    matchedTerms: [],
  };
}
