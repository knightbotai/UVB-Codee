export type MemoryType = "conversation" | "knowledge" | "context" | "preference";

export interface MemoryEntry {
  id: string;
  title: string;
  type: MemoryType;
  content: string;
  timestamp: number;
  tags: string[];
  sizeBytes: number;
  source: "chat" | "manual" | "telegram" | "system";
}

export const LOCAL_MEMORY_KEY = "uvb:manual-memory-bank";

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeMemoryType(value: unknown): MemoryType {
  return value === "conversation" ||
    value === "knowledge" ||
    value === "context" ||
    value === "preference"
    ? value
    : "knowledge";
}

function compactMemoryText(value: string, maxChars = 900) {
  if (value.length <= maxChars) return value;
  const headChars = Math.floor(maxChars * 0.55);
  const tailChars = Math.floor(maxChars * 0.45);
  return `${value.slice(0, headChars).trim()} ... ${value.slice(-tailChars).trim()}`;
}

export function loadManualMemoryEntries(): MemoryEntry[] {
  if (typeof window === "undefined") return [];

  try {
    const rawValue = window.localStorage.getItem(LOCAL_MEMORY_KEY);
    const parsed = rawValue ? (JSON.parse(rawValue) as Partial<MemoryEntry>[]) : [];
    return Array.isArray(parsed)
      ? parsed
          .map((entry, index) => ({
            id: safeText(entry.id) || `memory:${index}`,
            title: safeText(entry.title) || "Untitled memory",
            type: safeMemoryType(entry.type),
            content: safeText(entry.content),
            timestamp: typeof entry.timestamp === "number" ? entry.timestamp : Date.now(),
            tags: Array.isArray(entry.tags) ? entry.tags.map(safeText).filter(Boolean) : [],
            sizeBytes: typeof entry.sizeBytes === "number" ? entry.sizeBytes : 0,
            source:
              entry.source === "chat" ||
              entry.source === "telegram" ||
              entry.source === "system"
                ? entry.source
                : ("manual" as const),
          }))
          .filter((entry) => entry.content)
      : [];
  } catch {
    return [];
  }
}

export function buildMemorySystemNote(entries: MemoryEntry[] = loadManualMemoryEntries()) {
  const activeEntries = entries
    .filter((entry) => entry.content.trim())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 14);

  if (!activeEntries.length) return "";

  return [
    "Memory Bank context: treat these as durable user-approved memories unless the user corrects them. Use them to preserve continuity across new chats, Telegram, voice, and local browser sessions.",
    ...activeEntries.map(
      (entry) =>
        `- ${entry.type.toUpperCase()}: ${entry.title} :: ${compactMemoryText(entry.content)}`
    ),
  ].join("\n");
}

export function appendMemorySystemNote(systemPrompt: string, entries?: MemoryEntry[]) {
  const trimmed = systemPrompt.trim();
  if (trimmed.includes("Memory Bank context:")) return trimmed;
  const note = buildMemorySystemNote(entries);
  return [trimmed, note].filter(Boolean).join("\n\n");
}
