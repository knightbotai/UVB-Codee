import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadRuntimeSettings } from "@/lib/serverRuntimeSettings";
import { deleteMemoryEntry, upsertMemoryEntry } from "@/lib/serverMemory";

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
  createdAt: number;
  updatedAt: number;
}

interface ReferenceGalleryStore {
  entries: ReferenceImageEntry[];
}

const STORE_PATH = path.join(process.cwd(), ".uvb", "profile-reference-gallery.json");
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

function normalizeBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim();
  if (/^https?:\/\/[^/]+:\d+v1$/i.test(trimmed)) return trimmed.replace(/v1$/i, "/v1");
  return trimmed.replace(/\/+$/, "");
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
  if (entry?.memoryId) await deleteMemoryEntry(entry.memoryId);
}
