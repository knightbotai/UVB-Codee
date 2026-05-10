import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadRuntimeSettings } from "@/lib/serverRuntimeSettings";
import { deleteMemoryEntry, upsertMemoryEntry } from "@/lib/serverMemory";
import { VISUAL_EMBEDDING_DIMENSIONS, VISUAL_EMBEDDING_MODEL } from "@/lib/visualEmbeddings";

export interface ReferenceImageEntry {
  id: string;
  personName: string;
  title: string;
  relationship: string;
  fileName: string;
  imageMimeType: string;
  imageDataUrl: string;
  caption: string;
  notes: string;
  tags: string[];
  memoryId: string;
  analysisModel: string;
  visualEmbedding: number[];
  visualEmbeddingModel: string;
  createdAt: number;
  updatedAt: number;
}

export interface ReferenceImageMatch extends ReferenceImageEntry {
  visualScore: number;
  matchedBy: "qdrant-visual" | "local-visual";
}

interface ReferenceGalleryStore {
  entries: ReferenceImageEntry[];
}

const STORE_PATH = path.join(process.cwd(), ".uvb", "profile-reference-gallery.json");
const DEFAULT_QDRANT_BASE_URL = "http://127.0.0.1:6333";
const DEFAULT_QDRANT_VECTOR_NAME = "visual";
const DEFAULT_VISUAL_COLLECTION = "aria_knight_reference_visual_v1";
const LLM_BASE_URL = process.env.UVB_LLM_BASE_URL ?? "http://127.0.0.1:8003/v1";
const LLM_MODEL = process.env.UVB_LLM_MODEL ?? "qwen36-35b-a3b-heretic-nvfp4";
const LLM_API_KEY = process.env.UVB_LLM_API_KEY ?? "uvb-local";
const MAX_REFERENCE_IMAGE_DATA_URL_CHARS = 7_500_000;
const MAX_REFERENCE_ENTRIES = 500;

function safeText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function safeTags(value: unknown) {
  if (Array.isArray(value)) return value.map((tag) => safeText(tag)).filter(Boolean).slice(0, 24);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 24);
  }
  return [];
}

function safeEmbedding(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "number" && Number.isFinite(item) ? item : 0))
    .slice(0, VISUAL_EMBEDDING_DIMENSIONS);
}

function cosineSimilarity(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  if (!length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  return dot / ((Math.sqrt(leftNorm) || 1) * (Math.sqrt(rightNorm) || 1));
}

function pointIdForReference(id: string) {
  const chars = createHash("sha256").update(`reference:${id}`).digest("hex").slice(0, 32).split("");
  chars[12] = "4";
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function normalizeBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim();
  if (/^https?:\/\/[^/]+:\d+v1$/i.test(trimmed)) return trimmed.replace(/v1$/i, "/v1");
  return trimmed.replace(/\/+$/, "");
}

async function readLocalEnv() {
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
    return parsed;
  }
  return parsed;
}

async function configValue(keys: string[], fallback = "") {
  for (const key of keys) {
    if (process.env[key]?.trim()) return process.env[key]!.trim();
  }
  const localEnv = await readLocalEnv();
  for (const key of keys) {
    if (localEnv[key]?.trim()) return localEnv[key].trim();
  }
  return fallback;
}

async function visualQdrantConfig() {
  return {
    baseUrl: (await configValue(["UVB_QDRANT_BASE_URL", "QDRANT_BASE_URL"], DEFAULT_QDRANT_BASE_URL)).replace(/\/+$/, ""),
    apiKey: await configValue(["UVB_QDRANT_API_KEY", "QDRANT_API_KEY", "QDRANT__SERVICE__API_KEY"]),
    collection: await configValue(["UVB_QDRANT_VISUAL_COLLECTION"], DEFAULT_VISUAL_COLLECTION),
    vectorName: await configValue(["UVB_QDRANT_VISUAL_VECTOR_NAME"], DEFAULT_QDRANT_VECTOR_NAME),
  };
}

async function qdrantFetch(pathname: string, init: RequestInit = {}) {
  const config = await visualQdrantConfig();
  const headers = new Headers(init.headers);
  if (config.apiKey) headers.set("api-key", config.apiKey);
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");
  return fetch(`${config.baseUrl}${pathname}`, { ...init, headers, cache: "no-store" });
}

function normalizeEntry(entry: Partial<ReferenceImageEntry>): ReferenceImageEntry {
  const now = Date.now();
  const id = safeText(entry.id, `reference:${randomUUID()}`);
  const personName = safeText(entry.personName, "Unassigned person");
  const title = safeText(entry.title, `${personName} reference photo`);
  const imageDataUrl = safeText(entry.imageDataUrl);
  if (imageDataUrl.length > MAX_REFERENCE_IMAGE_DATA_URL_CHARS) {
    throw new Error("Reference image is too large. Resize it before saving.");
  }

  return {
    id,
    personName,
    title,
    relationship: safeText(entry.relationship, "profile-reference"),
    fileName: safeText(entry.fileName, "reference-image.jpg"),
    imageMimeType: safeText(entry.imageMimeType, "image/jpeg"),
    imageDataUrl,
    caption: safeText(entry.caption),
    notes: safeText(entry.notes),
    tags: safeTags(entry.tags),
    memoryId: safeText(entry.memoryId, `reference-memory:${id}`),
    analysisModel: safeText(entry.analysisModel),
    visualEmbedding: safeEmbedding(entry.visualEmbedding),
    visualEmbeddingModel: safeText(entry.visualEmbeddingModel, VISUAL_EMBEDDING_MODEL),
    createdAt: typeof entry.createdAt === "number" ? entry.createdAt : now,
    updatedAt: typeof entry.updatedAt === "number" ? entry.updatedAt : now,
  };
}

async function readStore(): Promise<ReferenceGalleryStore> {
  try {
    const parsed = JSON.parse(await readFile(STORE_PATH, "utf8")) as Partial<ReferenceGalleryStore>;
    return {
      entries: Array.isArray(parsed.entries)
        ? parsed.entries.map(normalizeEntry).filter((entry) => entry.imageDataUrl)
        : [],
    };
  } catch {
    return { entries: [] };
  }
}

async function writeStore(store: ReferenceGalleryStore) {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  const entries = store.entries
    .map(normalizeEntry)
    .filter((entry) => entry.imageDataUrl)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_REFERENCE_ENTRIES);
  await writeFile(STORE_PATH, JSON.stringify({ entries }, null, 2), "utf8");
}

export async function listReferenceImages() {
  return (await readStore()).entries.sort((a, b) => b.updatedAt - a.updatedAt);
}

async function ensureVisualCollection(vectorSize = VISUAL_EMBEDDING_DIMENSIONS) {
  const config = await visualQdrantConfig();
  const response = await qdrantFetch(`/collections/${encodeURIComponent(config.collection)}`);
  if (response.ok) return;
  if (response.status !== 404) throw new Error(`Visual collection check returned ${response.status}.`);
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
  if (!createResponse.ok) throw new Error(`Visual collection create returned ${createResponse.status}.`);
}

async function upsertVisualQdrant(entry: ReferenceImageEntry) {
  if (entry.visualEmbedding.length !== VISUAL_EMBEDDING_DIMENSIONS) return;
  const config = await visualQdrantConfig();
  await ensureVisualCollection(entry.visualEmbedding.length);
  const response = await qdrantFetch(`/collections/${encodeURIComponent(config.collection)}/points?wait=true`, {
    method: "PUT",
    body: JSON.stringify({
      points: [
        {
          id: pointIdForReference(entry.id),
          vector: { [config.vectorName]: entry.visualEmbedding },
          payload: {
            id: entry.id,
            personName: entry.personName,
            title: entry.title,
            relationship: entry.relationship,
            caption: entry.caption,
            notes: entry.notes,
            tags: entry.tags,
            memoryId: entry.memoryId,
            visualEmbeddingModel: entry.visualEmbeddingModel,
            project: "uvb",
            agent: "Sophia Knight",
          },
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Visual Qdrant upsert returned ${response.status}.`);
}

async function deleteVisualQdrant(id: string) {
  const config = await visualQdrantConfig();
  const response = await qdrantFetch(`/collections/${encodeURIComponent(config.collection)}/points/delete?wait=true`, {
    method: "POST",
    body: JSON.stringify({ points: [pointIdForReference(id)] }),
  });
  if (!response.ok && response.status !== 404) throw new Error(`Visual Qdrant delete returned ${response.status}.`);
}

async function captionReferenceImage(imageDataUrl: string, personName: string, notes: string) {
  const runtime = await loadRuntimeSettings();
  const settings = runtime.modelSettings;
  const baseUrl = normalizeBaseUrl(settings.baseUrl || LLM_BASE_URL);
  const model = settings.model?.trim() || LLM_MODEL;
  const apiKey = settings.apiKey?.trim() || LLM_API_KEY;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are UVB's local visual memory captioner. Create a factual, compact reference description for future retrieval. Describe visible appearance, clothing, hair/facial hair, build, pose, and uncertainty. Do not claim biometric certainty.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Create a profile reference caption for ${personName}. User notes: ${notes || "none"}`,
            },
            { type: "image_url", image_url: { url: imageDataUrl, detail: "auto" } },
          ],
        },
      ],
      temperature: 0.2,
      max_tokens: 900,
      stream: false,
      chat_template_kwargs: { enable_thinking: false },
    }),
    cache: "no-store",
  });
  const rawText = await response.text();
  const data = rawText
    ? (JSON.parse(rawText) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } })
    : {};
  if (!response.ok) {
    throw new Error(data.error?.message || rawText || `Caption request returned ${response.status}.`);
  }
  return {
    caption: data.choices?.[0]?.message?.content?.trim() ?? "",
    model,
  };
}

function referenceMemoryContent(entry: ReferenceImageEntry) {
  return [
    "VISUAL REFERENCE GALLERY ENTRY",
    `Person/profile: ${entry.personName}`,
    `Relationship: ${entry.relationship}`,
    `Title: ${entry.title}`,
    entry.caption ? `Local visual caption: ${entry.caption}` : "",
    entry.notes ? `User notes: ${entry.notes}` : "",
    entry.tags.length ? `Tags: ${entry.tags.join(", ")}` : "",
    entry.visualEmbedding.length
      ? `Visual embedding: ${entry.visualEmbeddingModel} (${entry.visualEmbedding.length} dimensions) indexed in the reference visual collection.`
      : "",
    "Use this as a user-approved visual/descriptive reference for candidate recognition and continuity. It is not biometric proof; describe uncertainty when matching a new image.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function upsertReferenceImage(entry: Partial<ReferenceImageEntry>, options: { analyze?: boolean } = {}) {
  const store = await readStore();
  const existing = entry.id ? store.entries.find((item) => item.id === entry.id) : undefined;
  let normalized = normalizeEntry({
    ...existing,
    ...entry,
    createdAt: existing?.createdAt ?? entry.createdAt,
    updatedAt: Date.now(),
  });

  if (options.analyze !== false && normalized.imageDataUrl && !normalized.caption) {
    try {
      const analysis = await captionReferenceImage(
        normalized.imageDataUrl,
        normalized.personName,
        normalized.notes
      );
      normalized = normalizeEntry({
        ...normalized,
        caption: analysis.caption,
        analysisModel: analysis.model,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "caption failed";
      normalized = normalizeEntry({
        ...normalized,
        caption: normalized.notes || `Caption pending. Local visual analysis failed: ${message}`,
        analysisModel: "caption-pending",
      });
    }
  }

  const nextEntries = [normalized, ...store.entries.filter((item) => item.id !== normalized.id)];
  await writeStore({ entries: nextEntries });
  await upsertVisualQdrant(normalized).catch(() => undefined);
  await upsertMemoryEntry({
    id: normalized.memoryId,
    title: `Visual reference: ${normalized.personName} - ${normalized.title}`,
    type: "context",
    content: referenceMemoryContent(normalized),
    source: "manual",
    tags: [
      "visual-reference",
      "profile-reference",
      "reference-gallery",
      normalized.personName,
      ...normalized.tags,
    ],
    timestamp: normalized.createdAt,
    updatedAt: normalized.updatedAt,
  });

  return normalized;
}

export async function deleteReferenceImage(id: string) {
  const store = await readStore();
  const entry = store.entries.find((item) => item.id === id);
  await writeStore({ entries: store.entries.filter((item) => item.id !== id) });
  await deleteVisualQdrant(id).catch(() => undefined);
  if (entry?.memoryId) await deleteMemoryEntry(entry.memoryId);
}

export async function matchReferenceImages(visualEmbedding: number[], limit = 5): Promise<ReferenceImageMatch[]> {
  const cleanEmbedding = safeEmbedding(visualEmbedding);
  if (cleanEmbedding.length !== VISUAL_EMBEDDING_DIMENSIONS) return [];
  const entries = await listReferenceImages();
  const byId = new Map<string, ReferenceImageMatch>();

  try {
    const config = await visualQdrantConfig();
    const response = await qdrantFetch(`/collections/${encodeURIComponent(config.collection)}/points/search`, {
      method: "POST",
      body: JSON.stringify({
        vector: { name: config.vectorName, vector: cleanEmbedding },
        limit: Math.max(limit * 2, 8),
        with_payload: true,
        with_vector: false,
      }),
    });
    const rawText = await response.text();
    const data = rawText
      ? (JSON.parse(rawText) as { result?: Array<{ score?: number; payload?: { id?: string } }> })
      : {};
    if (response.ok) {
      for (const point of data.result ?? []) {
        const entry = entries.find((item) => item.id === point.payload?.id);
        if (!entry) continue;
        byId.set(entry.id, {
          ...entry,
          visualScore: typeof point.score === "number" ? point.score : 0,
          matchedBy: "qdrant-visual",
        });
      }
    }
  } catch {
    // The disk gallery remains searchable even if Qdrant is offline or the visual collection is rebuilding.
  }

  for (const entry of entries) {
    if (entry.visualEmbedding.length !== VISUAL_EMBEDDING_DIMENSIONS) continue;
    const score = cosineSimilarity(cleanEmbedding, entry.visualEmbedding);
    const existing = byId.get(entry.id);
    if (!existing || score > existing.visualScore) {
      byId.set(entry.id, { ...entry, visualScore: score, matchedBy: existing?.matchedBy ?? "local-visual" });
    }
  }

  return [...byId.values()]
    .sort((a, b) => b.visualScore - a.visualScore || b.updatedAt - a.updatedAt)
    .slice(0, Math.max(1, Math.min(limit, 12)));
}
