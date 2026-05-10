import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type MemoryType = "conversation" | "knowledge" | "context" | "preference";
export type MemorySource = "manual" | "chat" | "telegram" | "system";

export interface MemoryEntry {
  id: string;
  title: string;
  type: MemoryType;
  content: string;
  timestamp: number;
  tags: string[];
  sizeBytes: number;
  source: MemorySource;
  updatedAt: number;
}

export interface MemorySearchResult extends MemoryEntry {
  score: number;
  vectorScore?: number;
  rerankScore?: number;
  matchedBy: "qdrant" | "lexical" | "recent";
}

export interface MemoryBackendStatus {
  qdrantOnline: boolean;
  embeddingOnline: boolean;
  rerankerOnline: boolean;
  collection: string;
  pointCount: number;
  vectorSize: number;
  storeCount: number;
  lastError?: string;
}

interface MemoryStore {
  entries: MemoryEntry[];
}

interface TombstoneStore {
  ids: string[];
}

interface UpsertOptions {
  index?: boolean;
}

const STORE_PATH = path.join(process.cwd(), ".uvb", "memory-bank.json");
const TOMBSTONE_PATH = path.join(process.cwd(), ".uvb", "memory-tombstones.json");
const DEFAULT_QDRANT_BASE_URL = "http://127.0.0.1:6333";
const DEFAULT_QDRANT_COLLECTION = "aria_knight_memory_bge_m3_v1";
const DEFAULT_QDRANT_VECTOR_NAME = "dense";
const DEFAULT_EMBEDDING_ENDPOINT = "http://127.0.0.1:1234/v1/embeddings";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-bge-m3";
const DEFAULT_RERANKER_URL = "http://127.0.0.1:8780/rerank";
const DEFAULT_VECTOR_SIZE = 1024;
const MAX_MEMORY_CONTENT_CHARS = 24_000;
const MAX_STORE_ENTRIES = 2_000;
const MAX_TOMBSTONES = 5_000;

let localEnvCache: Record<string, string> | null = null;

function safeText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function safeMemoryType(value: unknown): MemoryType {
  return value === "conversation" ||
    value === "knowledge" ||
    value === "context" ||
    value === "preference"
    ? value
    : "knowledge";
}

function safeMemorySource(value: unknown): MemorySource {
  return value === "chat" || value === "telegram" || value === "system" ? value : "manual";
}

function compactText(value: string, maxChars = MAX_MEMORY_CONTENT_CHARS) {
  const clean = value.replace(/\r\n/g, "\n").trim();
  if (clean.length <= maxChars) return clean;
  const headChars = Math.floor(maxChars * 0.48);
  const tailChars = Math.floor(maxChars * 0.52);
  return `${clean.slice(0, headChars).trim()}\n\n[...middle compacted for durable memory storage...]\n\n${clean
    .slice(-tailChars)
    .trim()}`;
}

function byteSize(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

async function readLocalEnv() {
  if (localEnvCache) return localEnvCache;
  const envPath = path.join(process.cwd(), ".env.local");
  const parsed: Record<string, string> = {};

  try {
    const raw = await readFile(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...rest] = trimmed.split("=");
      parsed[key.trim()] = rest.join("=").trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // .env.local is optional; process.env/defaults still cover normal operation.
  }

  localEnvCache = parsed;
  return parsed;
}

async function configValue(keys: string[], fallback = "") {
  for (const key of keys) {
    const envValue = process.env[key];
    if (envValue?.trim()) return envValue.trim();
  }
  const localEnv = await readLocalEnv();
  for (const key of keys) {
    const envValue = localEnv[key];
    if (envValue?.trim()) return envValue.trim();
  }
  return fallback;
}

async function qdrantConfig() {
  return {
    baseUrl: (await configValue(["UVB_QDRANT_BASE_URL", "QDRANT_BASE_URL"], DEFAULT_QDRANT_BASE_URL)).replace(/\/+$/, ""),
    apiKey: await configValue(["UVB_QDRANT_API_KEY", "QDRANT_API_KEY", "QDRANT__SERVICE__API_KEY"]),
    collection: await configValue(["UVB_QDRANT_COLLECTION", "QDRANT_COLLECTION_NAME"], DEFAULT_QDRANT_COLLECTION),
    vectorName: await configValue(["UVB_QDRANT_VECTOR_NAME", "QDRANT_VECTOR_NAME"], DEFAULT_QDRANT_VECTOR_NAME),
  };
}

async function embeddingConfig() {
  return {
    endpoint: await configValue(["UVB_EMBEDDING_ENDPOINT", "EMBEDDING_ENDPOINT"], DEFAULT_EMBEDDING_ENDPOINT),
    model: await configValue(["UVB_EMBEDDING_MODEL", "EMBEDDING_MODEL"], DEFAULT_EMBEDDING_MODEL),
    apiKey: await configValue(["UVB_EMBEDDING_API_KEY", "EMBEDDING_API_KEY"], "lm-studio"),
  };
}

async function rerankerUrl() {
  return configValue(["UVB_RERANKER_URL", "RERANKER_URL"], DEFAULT_RERANKER_URL);
}

function pointIdForMemory(id: string) {
  const chars = createHash("sha256").update(id).digest("hex").slice(0, 32).split("");
  chars[12] = "4";
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function normalizeEntry(entry: Partial<MemoryEntry>): MemoryEntry {
  const now = Date.now();
  const content = compactText(safeText(entry.content));
  const title = safeText(entry.title, content.slice(0, 72) || "Untitled memory");
  const timestamp = typeof entry.timestamp === "number" ? entry.timestamp : now;

  return {
    id: safeText(entry.id, `memory:${randomUUID()}`),
    title,
    type: safeMemoryType(entry.type),
    content,
    timestamp,
    tags: Array.isArray(entry.tags) ? entry.tags.map((tag) => safeText(tag)).filter(Boolean) : [],
    sizeBytes: byteSize(content),
    source: safeMemorySource(entry.source),
    updatedAt: typeof entry.updatedAt === "number" ? entry.updatedAt : now,
  };
}

async function readStore(): Promise<MemoryStore> {
  try {
    const parsed = JSON.parse(await readFile(STORE_PATH, "utf8")) as Partial<MemoryStore>;
    return {
      entries: Array.isArray(parsed.entries)
        ? parsed.entries.map(normalizeEntry).filter((entry) => entry.content)
        : [],
    };
  } catch {
    return { entries: [] };
  }
}

async function writeStore(store: MemoryStore) {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  const trimmed = {
    entries: store.entries
      .map(normalizeEntry)
      .filter((entry) => entry.content)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_STORE_ENTRIES),
  };
  await writeFile(STORE_PATH, JSON.stringify(trimmed, null, 2), "utf8");
}

async function readTombstones() {
  try {
    const parsed = JSON.parse(await readFile(TOMBSTONE_PATH, "utf8")) as Partial<TombstoneStore>;
    return new Set(Array.isArray(parsed.ids) ? parsed.ids.map((id) => safeText(id)).filter(Boolean) : []);
  } catch {
    return new Set<string>();
  }
}

async function writeTombstones(ids: Set<string>) {
  await mkdir(path.dirname(TOMBSTONE_PATH), { recursive: true });
  await writeFile(
    TOMBSTONE_PATH,
    JSON.stringify({ ids: [...ids].slice(-MAX_TOMBSTONES) }, null, 2),
    "utf8"
  );
}

async function markTombstoned(id: string) {
  const ids = await readTombstones();
  ids.add(id);
  await writeTombstones(ids);
}

async function clearTombstone(id: string) {
  const ids = await readTombstones();
  if (!ids.delete(id)) return;
  await writeTombstones(ids);
}

async function qdrantFetch(pathname: string, init: RequestInit = {}) {
  const config = await qdrantConfig();
  const headers = new Headers(init.headers);
  if (config.apiKey) headers.set("api-key", config.apiKey);
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");

  return fetch(`${config.baseUrl}${pathname}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}

async function embedText(text: string) {
  const config = await embeddingConfig();
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      input: [text],
    }),
    cache: "no-store",
  });
  const rawText = await response.text();
  const data = rawText ? JSON.parse(rawText) as { data?: Array<{ embedding?: number[] }> } : {};
  const embedding = data.data?.[0]?.embedding;
  if (!response.ok || !Array.isArray(embedding)) {
    throw new Error(`Embedding endpoint returned ${response.status}: ${rawText || response.statusText}`);
  }
  return embedding;
}

function vectorText(entry: MemoryEntry) {
  return [
    `Title: ${entry.title}`,
    `Type: ${entry.type}`,
    `Source: ${entry.source}`,
    entry.tags.length ? `Tags: ${entry.tags.join(", ")}` : "",
    entry.content,
  ]
    .filter(Boolean)
    .join("\n");
}

async function ensureCollection(vectorSize = DEFAULT_VECTOR_SIZE) {
  const config = await qdrantConfig();
  const response = await qdrantFetch(`/collections/${encodeURIComponent(config.collection)}`);
  if (response.ok) return;
  if (response.status !== 404) {
    const rawText = await response.text();
    throw new Error(`Qdrant collection check returned ${response.status}: ${rawText || response.statusText}`);
  }

  const createResponse = await qdrantFetch(`/collections/${encodeURIComponent(config.collection)}`, {
    method: "PUT",
    body: JSON.stringify({
      vectors: {
        [config.vectorName]: {
          size: vectorSize,
          distance: "Cosine",
        },
      },
      on_disk_payload: true,
    }),
  });
  if (!createResponse.ok) {
    const rawText = await createResponse.text();
    throw new Error(`Qdrant collection create returned ${createResponse.status}: ${rawText || createResponse.statusText}`);
  }
}

async function upsertQdrant(entry: MemoryEntry) {
  const config = await qdrantConfig();
  const vector = await embedText(vectorText(entry));
  await ensureCollection(vector.length);
  const response = await qdrantFetch(`/collections/${encodeURIComponent(config.collection)}/points?wait=true`, {
    method: "PUT",
    body: JSON.stringify({
      points: [
        {
          id: pointIdForMemory(entry.id),
          vector: { [config.vectorName]: vector },
          payload: {
            ...entry,
            memory_type: entry.type,
            created_at_ts: entry.timestamp,
            project: "uvb",
            agent: "Sophia Knight",
          },
        },
      ],
    }),
  });
  if (!response.ok) {
    const rawText = await response.text();
    throw new Error(`Qdrant upsert returned ${response.status}: ${rawText || response.statusText}`);
  }
}

async function deleteQdrant(id: string) {
  const config = await qdrantConfig();
  const response = await qdrantFetch(`/collections/${encodeURIComponent(config.collection)}/points/delete?wait=true`, {
    method: "POST",
    body: JSON.stringify({
      points: [pointIdForMemory(id)],
    }),
  });
  if (!response.ok && response.status !== 404) {
    const rawText = await response.text();
    throw new Error(`Qdrant delete returned ${response.status}: ${rawText || response.statusText}`);
  }
}

export async function listMemoryEntries() {
  return (await readStore()).entries.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function upsertMemoryEntry(entry: Partial<MemoryEntry>, options: UpsertOptions = {}) {
  const normalized = normalizeEntry(entry);
  if (!normalized.content) throw new Error("Memory content is required.");
  const store = await readStore();
  const nextEntries = [
    normalized,
    ...store.entries.filter((item) => item.id !== normalized.id),
  ];
  await writeStore({ entries: nextEntries });

  if (options.index !== false) {
    try {
      await upsertQdrant(normalized);
      await clearTombstone(normalized.id);
    } catch {
      // Disk is the durable source of truth; vector search can recover on the next sync/upsert.
    }
  }

  return normalized;
}

export async function deleteMemoryEntry(id: string) {
  const store = await readStore();
  await writeStore({ entries: store.entries.filter((entry) => entry.id !== id) });
  await markTombstoned(id);
  try {
    await deleteQdrant(id);
  } catch {
    // If Qdrant is temporarily offline, the disk store still reflects the user's delete.
  }
}

function tokenize(text: string) {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9']+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 2)
  );
}

function lexicalScore(query: string, entry: MemoryEntry) {
  const queryTokens = tokenize(query);
  if (!queryTokens.size) return 0;
  const haystack = `${entry.title} ${entry.tags.join(" ")} ${entry.content}`.toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (haystack.includes(token)) score += 1;
  }
  return score / queryTokens.size;
}

async function qdrantSearch(query: string, limit: number): Promise<MemorySearchResult[]> {
  const config = await qdrantConfig();
  const tombstones = await readTombstones();
  const vector = await embedText(query);
  const response = await qdrantFetch(`/collections/${encodeURIComponent(config.collection)}/points/search`, {
    method: "POST",
    body: JSON.stringify({
      vector: { name: config.vectorName, vector },
      limit,
      with_payload: true,
      with_vector: false,
    }),
  });
  const rawText = await response.text();
  const data = rawText ? JSON.parse(rawText) as { result?: Array<{ score?: number; payload?: Partial<MemoryEntry> }> } : {};
  if (!response.ok) {
    throw new Error(`Qdrant search returned ${response.status}: ${rawText || response.statusText}`);
  }
  const results: MemorySearchResult[] = [];
  for (const point of data.result ?? []) {
    const entry = normalizeEntry(point.payload ?? {});
    if (tombstones.has(entry.id)) continue;
    if (!entry.content) continue;
    results.push({
      ...entry,
      score: typeof point.score === "number" ? point.score : 0,
      vectorScore: typeof point.score === "number" ? point.score : 0,
      matchedBy: "qdrant",
    });
  }
  return results;
}

async function rerank(query: string, candidates: MemorySearchResult[], limit: number): Promise<MemorySearchResult[]> {
  if (!candidates.length) return candidates;
  const url = await rerankerUrl();
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      texts: candidates.map((entry) => vectorText(entry)),
      top_n: Math.min(limit, candidates.length),
      return_documents: false,
      normalize: true,
    }),
    cache: "no-store",
  });
  const rawText = await response.text();
  if (!response.ok) return candidates.slice(0, limit);
  const data = rawText ? JSON.parse(rawText) as { results?: Array<{ index: number; score: number }> } : {};
  const ranked: MemorySearchResult[] = [];
  for (const result of data.results ?? []) {
    const entry = candidates[result.index];
    if (!entry) continue;
    ranked.push({
      ...entry,
      score: Math.max(entry.score, result.score),
      rerankScore: result.score,
    });
  }
  return ranked.length ? ranked : candidates.slice(0, limit);
}

export async function searchMemoryEntries(query: string, limit = 8): Promise<MemorySearchResult[]> {
  const cleanQuery = query.trim();
  const storeEntries = await listMemoryEntries();
  const requestedLimit = Math.min(Math.max(limit, 1), 24);

  if (!cleanQuery) {
    return storeEntries.slice(0, requestedLimit).map((entry) => ({
      ...entry,
      score: 0,
      matchedBy: "recent" as const,
    }));
  }

  const byId = new Map<string, MemorySearchResult>();
  try {
    for (const result of await qdrantSearch(cleanQuery, Math.max(requestedLimit * 3, 12))) {
      byId.set(result.id, result);
    }
  } catch {
    // Disk-backed lexical search remains available when Qdrant or embeddings are down.
  }

  for (const entry of storeEntries) {
    const score = lexicalScore(cleanQuery, entry);
    if (score <= 0) continue;
    const existing = byId.get(entry.id);
    byId.set(entry.id, {
      ...entry,
      score: Math.max(existing?.score ?? 0, score),
      vectorScore: existing?.vectorScore,
      matchedBy: existing?.matchedBy ?? "lexical",
    });
  }

  const candidates = [...byId.values()]
    .sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt)
    .slice(0, Math.max(requestedLimit * 3, requestedLimit));
  return rerank(cleanQuery, candidates, requestedLimit);
}

export function buildRetrievedMemorySystemNote(results: MemorySearchResult[]) {
  const activeResults = results.filter((entry) => entry.content.trim()).slice(0, 8);
  if (!activeResults.length) return "";
  return [
    "Retrieved Memory Bank context: these are durable UVB memories retrieved with local embeddings/Qdrant and reranking when available. Treat them as continuity context, not as the current user's latest words. Prefer newer or higher-scoring memories if conflicts appear.",
    ...activeResults.map((entry, index) => {
      const score = Number.isFinite(entry.score) ? entry.score.toFixed(3) : "n/a";
      const tags = entry.tags.length ? ` tags=${entry.tags.join(",")}` : "";
      return `${index + 1}. [${entry.source}/${entry.type} score=${score}${tags}] ${entry.title}: ${compactText(entry.content, 1_000)}`;
    }),
  ].join("\n");
}

export function appendRetrievedMemorySystemNote(systemPrompt: string, results: MemorySearchResult[]) {
  const trimmed = systemPrompt.trim();
  if (trimmed.includes("Retrieved Memory Bank context:")) return trimmed;
  const note = buildRetrievedMemorySystemNote(results);
  return [trimmed, note].filter(Boolean).join("\n\n");
}

export async function upsertConversationMemory({
  userText,
  assistantText,
  source = "chat",
}: {
  userText: string;
  assistantText: string;
  source?: MemorySource;
}) {
  const cleanUser = safeText(userText);
  const cleanAssistant = safeText(assistantText);
  if (!cleanUser || !cleanAssistant) return null;
  const content = compactText(`USER: ${cleanUser}\n\nSOPHIA: ${cleanAssistant}`, 12_000);
  const hash = createHash("sha256").update(`${source}:${cleanUser}:${cleanAssistant}`).digest("hex").slice(0, 20);
  return upsertMemoryEntry({
    id: `${source}:turn:${hash}`,
    title: cleanUser.slice(0, 88) || "Conversation turn",
    type: "conversation",
    content,
    source,
    tags: [source, "auto-captured", "conversation"],
    timestamp: Date.now(),
  });
}

export async function memoryBackendStatus(): Promise<MemoryBackendStatus> {
  const store = await readStore();
  const config = await qdrantConfig();
  let qdrantOnline = false;
  let pointCount = 0;
  let vectorSize = DEFAULT_VECTOR_SIZE;
  let lastError = "";

  try {
    const response = await qdrantFetch(`/collections/${encodeURIComponent(config.collection)}`);
    const rawText = await response.text();
    const data = rawText ? JSON.parse(rawText) as {
      result?: { points_count?: number; config?: { params?: { vectors?: Record<string, { size?: number }> } } };
    } : {};
    qdrantOnline = response.ok;
    pointCount = data.result?.points_count ?? 0;
    vectorSize = data.result?.config?.params?.vectors?.[config.vectorName]?.size ?? DEFAULT_VECTOR_SIZE;
    if (!response.ok) lastError = `Qdrant returned ${response.status}`;
  } catch (error) {
    lastError = error instanceof Error ? error.message : "Qdrant status failed.";
  }

  let embeddingOnline = false;
  try {
    const embedding = await embedText("UVB memory health check");
    embeddingOnline = embedding.length > 0;
  } catch (error) {
    lastError ||= error instanceof Error ? error.message : "Embedding status failed.";
  }

  let rerankerOnline = false;
  try {
    const response = await fetch((await rerankerUrl()).replace(/\/rerank$/, "/health"), { cache: "no-store" });
    rerankerOnline = response.ok;
  } catch (error) {
    lastError ||= error instanceof Error ? error.message : "Reranker status failed.";
  }

  return {
    qdrantOnline,
    embeddingOnline,
    rerankerOnline,
    collection: config.collection,
    pointCount,
    vectorSize,
    storeCount: store.entries.length,
    lastError: lastError || undefined,
  };
}
