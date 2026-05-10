"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowDownTrayIcon,
  ClockIcon,
  FolderIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  PhotoIcon,
  PlusIcon,
  TagIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Brain, Camera, Database, HardDrive, ImageIcon, Search, Sparkles } from "lucide-react";
import { useAppStore, type ChatThread } from "@/stores/appStore";
import {
  DEFAULT_ALIAS_RULES,
  loadAliasRules,
  saveAliasRules,
  type AliasRule,
} from "@/lib/nameAliases";
import { dataUrlToVisualEmbedding, VISUAL_EMBEDDING_MODEL } from "@/lib/visualEmbeddings";

type MemoryType = "conversation" | "knowledge" | "context" | "preference";
type MemorySource = "chat" | "manual" | "telegram" | "system";

interface MemoryEntry {
  id: string;
  title: string;
  type: MemoryType;
  content: string;
  timestamp: number;
  tags: string[];
  sizeBytes: number;
  source: MemorySource;
  updatedAt: number;
  score?: number;
  matchedBy?: "qdrant" | "lexical" | "recent";
}

interface MemoryBackendStatus {
  qdrantOnline: boolean;
  embeddingOnline: boolean;
  rerankerOnline: boolean;
  collection: string;
  pointCount: number;
  vectorSize: number;
  storeCount: number;
  lastError?: string;
}

interface ReferenceImageEntry {
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

const LOCAL_MEMORY_KEY = "uvb:manual-memory-bank";
const TYPE_COLORS: Record<MemoryType, string> = {
  conversation: "#4a6fa5",
  knowledge: "#39ff14",
  context: "#f5a623",
  preference: "#6b1fa0",
};

function generateId() {
  return Math.random().toString(36).substring(2, 11);
}

function byteSize(value: string) {
  return new Blob([value]).size;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function threadToMemory(thread: ChatThread): MemoryEntry {
  const messages = thread.messages.filter((message) => message.role !== "system");
  const content = messages
    .slice(-12)
    .map((message) => {
      const attachments = message.attachments?.length
        ? ` [${message.attachments.length} attachment(s)]`
        : "";
      return `${message.role.toUpperCase()}${attachments}: ${message.content}`;
    })
    .join("\n\n");

  const fallbackTitle = messages.find((message) => message.role === "user")?.content.slice(0, 64);
  const title = safeText(thread.title) || fallbackTitle || "Untitled conversation";
  const tags = [
    "chat",
    messages.some((message) => message.attachments?.some((item) => item.kind === "image")) ? "image" : "",
    messages.some((message) => message.type === "voice") ? "voice" : "",
    messages.some((message) => message.attachments?.some((item) => item.kind === "file")) ? "file" : "",
  ].filter(Boolean);

  return {
    id: `thread:${thread.id}`,
    title,
    type: "conversation",
    content: content || "No messages yet.",
    timestamp: thread.updatedAt || thread.createdAt || Date.now(),
    tags,
    sizeBytes: byteSize(content),
    source: "chat",
    updatedAt: thread.updatedAt || thread.createdAt || Date.now(),
  };
}

function loadManualMemories(): MemoryEntry[] {
  if (typeof window === "undefined") return [];

  try {
    const rawValue = window.localStorage.getItem(LOCAL_MEMORY_KEY);
    const parsed = rawValue ? (JSON.parse(rawValue) as Partial<MemoryEntry>[]) : [];
    return Array.isArray(parsed)
      ? parsed
          .map((entry) => ({
            id: safeText(entry.id) || generateId(),
            title: safeText(entry.title) || "Untitled memory",
            type:
              entry.type === "knowledge" || entry.type === "context" || entry.type === "preference"
                ? entry.type
                : "knowledge",
            content: safeText(entry.content),
            timestamp: typeof entry.timestamp === "number" ? entry.timestamp : Date.now(),
            tags: Array.isArray(entry.tags) ? entry.tags.map(safeText).filter(Boolean) : [],
            sizeBytes: typeof entry.sizeBytes === "number" ? entry.sizeBytes : byteSize(safeText(entry.content)),
            source: "manual" as const,
            updatedAt: typeof entry.updatedAt === "number" ? entry.updatedAt : Date.now(),
          }))
          .filter((entry) => entry.content)
      : [];
  } catch {
    return [];
  }
}

function saveManualMemories(entries: MemoryEntry[]) {
  window.localStorage.setItem(LOCAL_MEMORY_KEY, JSON.stringify(entries));
}

async function imageFileToReferenceDataUrl(file: File, maxSide = 1200) {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("Could not decode image."));
    element.src = dataUrl;
  });
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight, 1));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare image canvas.");
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.88);
}

export default function MemoryBankPage() {
  const threads = useAppStore((state) => state.threads);
  const [activeView, setActiveView] = useState<"memories" | "references" | "aliases">("memories");
  const [serverEntries, setServerEntries] = useState<MemoryEntry[]>([]);
  const [referenceEntries, setReferenceEntries] = useState<ReferenceImageEntry[]>([]);
  const [memoryBackend, setMemoryBackend] = useState<MemoryBackendStatus | null>(null);
  const [memoryStatus, setMemoryStatus] = useState("Loading server Memory Bank...");
  const [referenceStatus, setReferenceStatus] = useState("Loading Reference Gallery...");
  const [aliasRules, setAliasRules] = useState<AliasRule[]>(loadAliasRules);
  const [aliasStatus, setAliasStatus] = useState("");
  const [aliasLabel, setAliasLabel] = useState("");
  const [aliasPattern, setAliasPattern] = useState("");
  const [aliasReplacement, setAliasReplacement] = useState("");
  const [aliasNotes, setAliasNotes] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<MemoryType | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newType, setNewType] = useState<MemoryType>("knowledge");
  const [newTags, setNewTags] = useState("");
  const [editingId, setEditingId] = useState("");
  const [referenceEditingId, setReferenceEditingId] = useState("");
  const [referencePersonName, setReferencePersonName] = useState("");
  const [referenceTitle, setReferenceTitle] = useState("");
  const [referenceRelationship, setReferenceRelationship] = useState("profile-reference");
  const [referenceNotes, setReferenceNotes] = useState("");
  const [referenceTags, setReferenceTags] = useState("");
  const [referenceImageDataUrl, setReferenceImageDataUrl] = useState("");
  const [referenceFileName, setReferenceFileName] = useState("");
  const [referenceCaption, setReferenceCaption] = useState("");
  const [referenceSaving, setReferenceSaving] = useState(false);

  const loadServerMemories = async (importLegacy = false) => {
    try {
      setMemoryStatus("Loading server Memory Bank...");
      const response = await fetch("/api/memory", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as {
        entries?: MemoryEntry[];
        status?: MemoryBackendStatus;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || `Memory API returned ${response.status}.`);

      let entries = Array.isArray(data.entries) ? data.entries : [];
      if (importLegacy) {
        const legacyEntries = loadManualMemories().filter(
          (entry) => !entries.some((serverEntry) => serverEntry.id === entry.id)
        );
        if (legacyEntries.length) {
          const syncResponse = await fetch("/api/memory", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "sync", entries: legacyEntries }),
          });
          const syncData = (await syncResponse.json().catch(() => ({}))) as {
            entries?: MemoryEntry[];
            status?: MemoryBackendStatus;
            error?: string;
          };
          if (syncResponse.ok) {
            entries = Array.isArray(syncData.entries) ? syncData.entries : entries;
            setMemoryBackend(syncData.status ?? data.status ?? null);
          }
        } else {
          setMemoryBackend(data.status ?? null);
        }
      } else {
        setMemoryBackend(data.status ?? null);
      }

      setServerEntries(entries);
      setMemoryStatus(`Loaded ${entries.length} durable server memor${entries.length === 1 ? "y" : "ies"}.`);
    } catch (error) {
      setMemoryStatus(error instanceof Error ? error.message : "Could not load Memory Bank.");
    }
  };

  useEffect(() => {
    void loadServerMemories(true);
  }, []);

  const loadReferenceGallery = async () => {
    try {
      setReferenceStatus("Loading Reference Gallery...");
      const response = await fetch("/api/memory/references", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as {
        entries?: ReferenceImageEntry[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || `Reference Gallery returned ${response.status}.`);
      const entries = Array.isArray(data.entries) ? data.entries : [];
      setReferenceEntries(entries);
      setReferenceStatus(`Loaded ${entries.length} reference image${entries.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setReferenceStatus(error instanceof Error ? error.message : "Could not load Reference Gallery.");
    }
  };

  useEffect(() => {
    void loadReferenceGallery();
  }, []);

  const entries = useMemo(
    () =>
      [...serverEntries, ...threads.map(threadToMemory)].sort(
        (a, b) => b.updatedAt - a.updatedAt
      ),
    [serverEntries, threads]
  );

  const filteredEntries = entries.filter((entry) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      !query ||
      entry.title.toLowerCase().includes(query) ||
      entry.content.toLowerCase().includes(query) ||
      entry.tags.some((tag) => tag.toLowerCase().includes(query));
    const matchesFilter = !activeFilter || entry.type === activeFilter;
    return matchesSearch && matchesFilter;
  });

  const stats = [
    { label: "Entries", value: entries.length, icon: Database },
    { label: "Indexed", value: memoryBackend?.pointCount ?? 0, icon: Brain },
    { label: "Chat Threads", value: threads.length, icon: Search },
    {
      label: "Storage",
      value: formatBytes(entries.reduce((total, entry) => total + entry.sizeBytes, 0)),
      icon: HardDrive,
    },
  ];

  const saveAliases = (rules = aliasRules, status = "Saved alias rules.") => {
    setAliasRules(rules);
    saveAliasRules(rules);
    setAliasStatus(status);
  };

  const addAliasRule = () => {
    const pattern = aliasPattern.trim();
    const replacement = aliasReplacement.trim();
    if (!pattern || !replacement) {
      setAliasStatus("Pattern and replacement are required.");
      return;
    }
    saveAliases(
      [
        {
          id: `alias:${generateId()}`,
          label: aliasLabel.trim() || replacement,
          pattern,
          replacement,
          enabled: true,
          notes: aliasNotes.trim(),
        },
        ...aliasRules,
      ],
      `Added alias rule for ${replacement}.`
    );
    setAliasLabel("");
    setAliasPattern("");
    setAliasReplacement("");
    setAliasNotes("");
  };

  const updateAliasRule = (id: string, updates: Partial<AliasRule>) => {
    saveAliases(
      aliasRules.map((rule) => (rule.id === id ? { ...rule, ...updates } : rule)),
      "Updated alias rule."
    );
  };

  const deleteAliasRule = (id: string) => {
    saveAliases(aliasRules.filter((rule) => rule.id !== id), "Deleted alias rule.");
  };

  const clearMemoryForm = () => {
    setNewTitle("");
    setNewContent("");
    setNewTags("");
    setNewType("knowledge");
    setEditingId("");
  };

  const clearReferenceForm = () => {
    setReferenceEditingId("");
    setReferencePersonName("");
    setReferenceTitle("");
    setReferenceRelationship("profile-reference");
    setReferenceNotes("");
    setReferenceTags("");
    setReferenceImageDataUrl("");
    setReferenceFileName("");
    setReferenceCaption("");
  };

  const loadReferenceFile = async (file?: File) => {
    if (!file) return;
    try {
      setReferenceStatus("Preparing reference image preview...");
      const dataUrl = await imageFileToReferenceDataUrl(file);
      setReferenceImageDataUrl(dataUrl);
      setReferenceFileName(file.name || "reference-image.jpg");
      setReferenceStatus("Reference image ready. Save to caption, embed, and index it.");
    } catch (error) {
      setReferenceStatus(error instanceof Error ? error.message : "Could not prepare reference image.");
    }
  };

  const saveReference = async () => {
    if (!referencePersonName.trim()) {
      setReferenceStatus("Person/profile name is required.");
      return;
    }
    if (!referenceImageDataUrl) {
      setReferenceStatus("Add a reference image first.");
      return;
    }
    const existing = referenceEntries.find((entry) => entry.id === referenceEditingId);
    const now = Date.now();
    const entry: Partial<ReferenceImageEntry> = {
      id: existing?.id,
      personName: referencePersonName.trim(),
      title: referenceTitle.trim() || `${referencePersonName.trim()} reference photo`,
      relationship: referenceRelationship.trim() || "profile-reference",
      fileName: referenceFileName || existing?.fileName || "reference-image.jpg",
      imageMimeType: "image/jpeg",
      imageDataUrl: referenceImageDataUrl,
      caption: referenceCaption.trim(),
      notes: referenceNotes.trim(),
      tags: referenceTags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      memoryId: existing?.memoryId,
      visualEmbedding: await dataUrlToVisualEmbedding(referenceImageDataUrl),
      visualEmbeddingModel: VISUAL_EMBEDDING_MODEL,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    try {
      setReferenceSaving(true);
      setReferenceStatus("Captioning reference image locally and indexing caption plus visual embedding...");
      const response = await fetch("/api/memory/references", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "upsert", entry, analyze: !referenceCaption.trim() }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        entries?: ReferenceImageEntry[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || `Reference save returned ${response.status}.`);
      setReferenceEntries(Array.isArray(data.entries) ? data.entries : referenceEntries);
      clearReferenceForm();
      setReferenceStatus("Saved visual reference and linked durable memory.");
      void loadServerMemories();
    } catch (error) {
      setReferenceStatus(error instanceof Error ? error.message : "Could not save reference image.");
    } finally {
      setReferenceSaving(false);
    }
  };

  const editReference = (entry: ReferenceImageEntry) => {
    setReferenceEditingId(entry.id);
    setReferencePersonName(entry.personName);
    setReferenceTitle(entry.title);
    setReferenceRelationship(entry.relationship);
    setReferenceNotes(entry.notes);
    setReferenceTags(entry.tags.join(", "));
    setReferenceImageDataUrl(entry.imageDataUrl);
    setReferenceFileName(entry.fileName);
    setReferenceCaption(entry.caption);
    setActiveView("references");
  };

  const deleteReference = async (id: string) => {
    try {
      setReferenceStatus("Deleting reference image and linked memory...");
      const response = await fetch("/api/memory/references", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        entries?: ReferenceImageEntry[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || `Reference delete returned ${response.status}.`);
      setReferenceEntries(Array.isArray(data.entries) ? data.entries : referenceEntries.filter((entry) => entry.id !== id));
      setReferenceStatus("Deleted reference image and vector memory.");
      void loadServerMemories();
    } catch (error) {
      setReferenceStatus(error instanceof Error ? error.message : "Could not delete reference image.");
    }
  };

  const saveMemory = async () => {
    const content = newContent.trim();
    if (!content) return;

    const tags = newTags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const existing = serverEntries.find((entry) => entry.id === editingId);
    const now = Date.now();
    const entry: MemoryEntry = {
      id: existing?.id || `manual:${generateId()}`,
      title: newTitle.trim() || content.slice(0, 64) || "Untitled memory",
      type: newType,
      content,
      timestamp: existing?.timestamp || now,
      tags,
      sizeBytes: byteSize(content),
      source: "manual",
      updatedAt: now,
    };

    try {
      setMemoryStatus("Saving durable memory and embedding it into Qdrant...");
      const response = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "upsert", entry }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        entries?: MemoryEntry[];
        status?: MemoryBackendStatus;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || `Memory save returned ${response.status}.`);
      const nextEntries = Array.isArray(data.entries) ? data.entries : [entry, ...serverEntries];
      setServerEntries(nextEntries);
      setMemoryBackend(data.status ?? memoryBackend);
      saveManualMemories(nextEntries.filter((item) => item.source === "manual"));
      clearMemoryForm();
      setMemoryStatus(`Saved "${entry.title}" to disk and vector memory.`);
    } catch (error) {
      setMemoryStatus(error instanceof Error ? error.message : "Could not save memory.");
    }
  };

  const editMemory = (entry: MemoryEntry) => {
    if (entry.source !== "manual") return;
    setEditingId(entry.id);
    setNewTitle(entry.title);
    setNewContent(entry.content);
    setNewType(entry.type === "conversation" ? "knowledge" : entry.type);
    setNewTags(entry.tags.join(", "));
  };

  const deleteMemory = async (id: string) => {
    try {
      setMemoryStatus("Deleting memory from disk and Qdrant...");
      const response = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        entries?: MemoryEntry[];
        status?: MemoryBackendStatus;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || `Memory delete returned ${response.status}.`);
      const nextEntries = Array.isArray(data.entries) ? data.entries : serverEntries.filter((entry) => entry.id !== id);
      setServerEntries(nextEntries);
      setMemoryBackend(data.status ?? memoryBackend);
      saveManualMemories(nextEntries.filter((item) => item.source === "manual"));
      setMemoryStatus("Deleted memory from server store and vector index.");
    } catch (error) {
      setMemoryStatus(error instanceof Error ? error.message : "Could not delete memory.");
    }
  };

  const exportMemories = () => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `uvb-memory-bank-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div className="flex flex-wrap gap-2">
        {[
          ["memories", "Memory Bank"],
          ["references", "Reference Gallery"],
          ["aliases", "Alias Rules"],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveView(id as "memories" | "references" | "aliases")}
            className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
              activeView === id
                ? "border-uvb-neon-green/30 bg-uvb-deep-teal/25 text-uvb-neon-green"
                : "border-uvb-border/30 text-uvb-text-muted hover:text-uvb-text-secondary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeView === "references" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          <div className="uvb-card">
            <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-uvb-text-primary font-[family-name:var(--font-display)]">
                  <Camera className="h-4 w-4 text-uvb-neon-green" />
                  {referenceEditingId ? "Edit Visual Reference" : "Add Visual Reference"}
                </h3>
                <p className="mt-1 text-xs text-uvb-text-muted">
                  Save user-approved reference photos with local captions, Qdrant retrieval, and editable notes.
                </p>
              </div>
              <button onClick={() => void loadReferenceGallery()} className="btn-ghost text-sm">
                Refresh
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[280px_1fr]">
              <div className="space-y-3">
                <div className="flex aspect-[4/5] items-center justify-center overflow-hidden rounded-lg border border-uvb-border/40 bg-uvb-dark-gray/40">
                  {referenceImageDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={referenceImageDataUrl}
                      alt="Reference preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-xs text-uvb-text-muted">
                      <PhotoIcon className="h-8 w-8" />
                      Reference image
                    </div>
                  )}
                </div>
                <label className="btn-ghost flex cursor-pointer items-center justify-center gap-2 text-sm">
                  <ImageIcon className="h-4 w-4" />
                  Choose Photo
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => void loadReferenceFile(event.target.files?.[0])}
                  />
                </label>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <input
                    value={referencePersonName}
                    onChange={(event) => setReferencePersonName(event.target.value)}
                    className="input-field"
                    placeholder="Person/profile, e.g. Richard / TacImpulse"
                  />
                  <input
                    value={referenceTitle}
                    onChange={(event) => setReferenceTitle(event.target.value)}
                    className="input-field"
                    placeholder="Title, e.g. Richard cap and beard reference"
                  />
                  <input
                    value={referenceRelationship}
                    onChange={(event) => setReferenceRelationship(event.target.value)}
                    className="input-field"
                    placeholder="Relationship, e.g. owner, friend, profile-reference"
                  />
                  <input
                    value={referenceTags}
                    onChange={(event) => setReferenceTags(event.target.value)}
                    className="input-field"
                    placeholder="Tags, comma separated"
                  />
                </div>
                <textarea
                  value={referenceNotes}
                  onChange={(event) => setReferenceNotes(event.target.value)}
                  className="input-field min-h-20 resize-y"
                  placeholder="Your trusted notes about this reference image."
                />
                <textarea
                  value={referenceCaption}
                  onChange={(event) => setReferenceCaption(event.target.value)}
                  className="input-field min-h-28 resize-y"
                  placeholder="Optional: leave blank and Sophia will caption it locally before indexing."
                />
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={saveReference}
                    disabled={referenceSaving}
                    className="btn-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Sparkles className="h-4 w-4" />
                    {referenceSaving ? "Saving..." : referenceEditingId ? "Update Reference" : "Caption & Save"}
                  </button>
                  {referenceEditingId && (
                    <button onClick={clearReferenceForm} className="btn-ghost">
                      Cancel
                    </button>
                  )}
                  <span className="text-xs text-uvb-text-muted">{referenceStatus}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {referenceEntries.map((entry) => (
              <div key={entry.id} className="uvb-card">
                <div className="flex gap-4">
                  <div className="h-32 w-24 flex-shrink-0 overflow-hidden rounded-lg border border-uvb-border/40 bg-uvb-dark-gray/40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={entry.imageDataUrl} alt={entry.title} className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-semibold text-uvb-text-primary">{entry.personName}</h4>
                        <p className="text-xs text-uvb-text-muted">{entry.title}</p>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => editReference(entry)}
                          className="p-1.5 rounded-lg text-uvb-text-muted hover:bg-uvb-light-gray/30 hover:text-uvb-steel-blue"
                          title="Edit reference"
                          aria-label="Edit reference"
                        >
                          <PencilSquareIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => void deleteReference(entry.id)}
                          className="p-1.5 rounded-lg text-uvb-text-muted hover:bg-uvb-light-gray/30 hover:text-red-400"
                          title="Delete reference"
                          aria-label="Delete reference"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <p className="line-clamp-4 whitespace-pre-wrap text-xs leading-relaxed text-uvb-text-secondary">
                      {entry.caption || entry.notes || "No caption yet."}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-uvb-text-muted">
                      <span className="rounded-full bg-uvb-dark-gray/60 px-2 py-1">{entry.relationship}</span>
                      <span className="rounded-full bg-uvb-dark-gray/60 px-2 py-1">
                        {entry.analysisModel || "manual caption"}
                      </span>
                      <span className="rounded-full bg-uvb-dark-gray/60 px-2 py-1">
                        {entry.visualEmbedding?.length ? `${entry.visualEmbedding.length}d visual` : "no visual vector"}
                      </span>
                      {entry.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-uvb-dark-gray/60 px-2 py-1">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {!referenceEntries.length && (
              <div className="uvb-card py-10 text-center text-sm text-uvb-text-muted">
                No visual references yet. Add Richard, Jusstin, Sophia style sheets, or other approved anchors here.
              </div>
            )}
          </div>
        </motion.div>
      )}

      {activeView === "aliases" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          <div className="uvb-card">
            <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-uvb-text-primary font-[family-name:var(--font-display)]">
                  Alias Rules
                </h3>
                <p className="mt-1 text-xs text-uvb-text-muted">
                  Canonical spellings and phrases are injected into chat, voice, STT prompts, and response cleanup.
                </p>
              </div>
              <button
                onClick={() => saveAliases(DEFAULT_ALIAS_RULES, "Restored default alias rules.")}
                className="btn-ghost text-sm"
              >
                Restore Defaults
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <input
                value={aliasLabel}
                onChange={(event) => setAliasLabel(event.target.value)}
                className="input-field"
                placeholder="Label, e.g. Preferred nickname"
              />
              <input
                value={aliasPattern}
                onChange={(event) => setAliasPattern(event.target.value)}
                className="input-field"
                placeholder="Regex pattern, e.g. \\bcody\\b"
              />
              <input
                value={aliasReplacement}
                onChange={(event) => setAliasReplacement(event.target.value)}
                className="input-field"
                placeholder="Replacement, e.g. Codee"
              />
              <input
                value={aliasNotes}
                onChange={(event) => setAliasNotes(event.target.value)}
                className="input-field"
                placeholder="Notes for Sophia and STT"
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button onClick={addAliasRule} className="btn-primary">
                Add Alias
              </button>
              {aliasStatus && <span className="text-xs text-uvb-text-muted">{aliasStatus}</span>}
            </div>
          </div>

          <div className="space-y-3">
            {aliasRules.map((rule) => (
              <div key={rule.id} className="uvb-card">
                <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-uvb-text-primary">{rule.label}</h4>
                    <p className="mt-1 text-xs text-uvb-text-muted">
                      {rule.pattern} {"->"} {rule.replacement}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateAliasRule(rule.id, { enabled: !rule.enabled })}
                      className={`rounded-lg border px-3 py-1.5 text-xs ${
                        rule.enabled
                          ? "border-uvb-neon-green/30 text-uvb-neon-green"
                          : "border-uvb-border/30 text-uvb-text-muted"
                      }`}
                    >
                      {rule.enabled ? "Enabled" : "Disabled"}
                    </button>
                    <button onClick={() => deleteAliasRule(rule.id)} className="btn-ghost text-xs text-red-300">
                      Delete
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <input
                    value={rule.label}
                    onChange={(event) => updateAliasRule(rule.id, { label: event.target.value })}
                    className="input-field"
                  />
                  <input
                    value={rule.pattern}
                    onChange={(event) => updateAliasRule(rule.id, { pattern: event.target.value })}
                    className="input-field"
                  />
                  <input
                    value={rule.replacement}
                    onChange={(event) => updateAliasRule(rule.id, { replacement: event.target.value })}
                    className="input-field"
                  />
                  <input
                    value={rule.notes}
                    onChange={(event) => updateAliasRule(rule.id, { notes: event.target.value })}
                    className="input-field"
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {activeView === "memories" && (
        <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="uvb-card flex items-center gap-3">
            <div className="p-2 rounded-lg bg-uvb-deep-teal/20">
              <stat.icon className="w-5 h-5 text-uvb-steel-blue" />
            </div>
            <div>
              <p className="text-lg font-bold text-uvb-text-primary font-[family-name:var(--font-mono)]">
                {stat.value}
              </p>
              <p className="text-[10px] text-uvb-text-muted uppercase tracking-wider">
                {stat.label}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="uvb-card space-y-3">
        <div className="flex items-center gap-2">
          <PlusIcon className="h-4 w-4 text-uvb-neon-green" />
          <h3 className="text-sm font-semibold text-uvb-text-primary font-[family-name:var(--font-display)]">
            {editingId ? "Edit Memory" : "Add Memory"}
          </h3>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_160px]">
          <input
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            className="input-field"
            placeholder="Title"
          />
          <select
            value={newType}
            onChange={(event) => setNewType(event.target.value as MemoryType)}
            className="input-field"
          >
            <option value="knowledge">Knowledge</option>
            <option value="context">Context</option>
            <option value="preference">Preference</option>
          </select>
        </div>
        <textarea
          value={newContent}
          onChange={(event) => setNewContent(event.target.value)}
          className="input-field min-h-24 resize-y"
          placeholder="What should Sophia remember?"
        />
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={newTags}
            onChange={(event) => setNewTags(event.target.value)}
            className="input-field flex-1"
            placeholder="Tags, comma separated"
          />
          <button onClick={saveMemory} className="btn-primary inline-flex items-center justify-center gap-2">
            {editingId ? <PencilSquareIcon className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />}
            {editingId ? "Update Memory" : "Save Memory"}
          </button>
          {editingId && (
            <button onClick={clearMemoryForm} className="btn-ghost inline-flex items-center justify-center">
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-uvb-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search local memories and chat threads..."
            className="input-field pl-10"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(["conversation", "knowledge", "context", "preference"] as MemoryType[]).map((type) => (
            <button
              key={type}
              onClick={() => setActiveFilter(activeFilter === type ? null : type)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeFilter === type
                  ? "text-white"
                  : "text-uvb-text-muted hover:text-uvb-text-secondary bg-uvb-dark-gray/40"
              }`}
              style={
                activeFilter === type
                  ? { backgroundColor: `${TYPE_COLORS[type]}40`, border: `1px solid ${TYPE_COLORS[type]}60` }
                  : {}
              }
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
          <button
            onClick={exportMemories}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-uvb-text-muted hover:text-uvb-text-secondary bg-uvb-dark-gray/40"
          >
            Export
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {filteredEntries.map((entry, index) => (
          <motion.div
            key={entry.id}
            className="uvb-card group"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index * 0.03, 0.24) }}
          >
            <div className="flex items-start gap-4">
              <div
                className="w-1 rounded-full flex-shrink-0 self-stretch"
                style={{ backgroundColor: TYPE_COLORS[entry.type] }}
              />
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-semibold text-uvb-text-primary">
                    {entry.title}
                  </h4>
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded-full uppercase tracking-wider font-medium"
                    style={{
                      backgroundColor: `${TYPE_COLORS[entry.type]}20`,
                      color: TYPE_COLORS[entry.type],
                    }}
                  >
                    {entry.type}
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full uppercase tracking-wider text-uvb-text-muted bg-uvb-dark-gray/50">
                    {entry.source}
                  </span>
                </div>
                <p className="mb-2 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-uvb-text-secondary">
                  {entry.content}
                </p>
                <div className="flex flex-wrap items-center gap-4 text-[10px] text-uvb-text-muted">
                  <span className="flex items-center gap-1">
                    <ClockIcon className="w-3 h-3" />
                    {new Date(entry.timestamp).toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1">
                    <FolderIcon className="w-3 h-3" />
                    {formatBytes(entry.sizeBytes)}
                  </span>
                  <span className="flex items-center gap-1">
                    <TagIcon className="w-3 h-3" />
                    {entry.tags.length ? entry.tags.join(", ") : "untagged"}
                  </span>
                </div>
              </div>
              <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(entry.content);
                  }}
                  className="p-1.5 rounded-lg hover:bg-uvb-light-gray/30 text-uvb-text-muted"
                  title="Copy memory"
                  aria-label="Copy memory"
                >
                  <ArrowDownTrayIcon className="w-4 h-4" />
                </button>
                {entry.source === "manual" && (
                  <>
                    <button
                      onClick={() => editMemory(entry)}
                      className="p-1.5 rounded-lg hover:bg-uvb-light-gray/30 text-uvb-text-muted hover:text-uvb-steel-blue"
                      title="Edit memory"
                      aria-label="Edit memory"
                    >
                      <PencilSquareIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteMemory(entry.id)}
                      className="p-1.5 rounded-lg hover:bg-uvb-light-gray/30 text-uvb-text-muted hover:text-red-400"
                      title="Delete memory"
                      aria-label="Delete memory"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        ))}
        {!filteredEntries.length && (
          <div className="uvb-card py-10 text-center text-sm text-uvb-text-muted">
            No local memories match this search.
          </div>
        )}
      </div>

      <div className="uvb-card">
        <div className="mb-3 flex items-center gap-3">
          <Brain className="w-5 h-5 text-uvb-royal-purple-light" />
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold text-uvb-text-primary font-[family-name:var(--font-display)]">
              Durable RAG Memory Status
            </h4>
            <p className="mt-1 text-xs text-uvb-text-muted">{memoryStatus}</p>
          </div>
          <button onClick={() => void loadServerMemories()} className="btn-ghost text-xs">
            Refresh
          </button>
        </div>
        {memoryBackend && (
          <div className="mb-3 grid grid-cols-1 gap-2 text-[11px] text-uvb-text-muted md:grid-cols-4">
            <span className="rounded-lg border border-uvb-border/30 bg-uvb-dark-gray/40 px-3 py-2">
              Qdrant: {memoryBackend.qdrantOnline ? "online" : "offline"}
            </span>
            <span className="rounded-lg border border-uvb-border/30 bg-uvb-dark-gray/40 px-3 py-2">
              Embeddings: {memoryBackend.embeddingOnline ? `${memoryBackend.vectorSize}d` : "offline"}
            </span>
            <span className="rounded-lg border border-uvb-border/30 bg-uvb-dark-gray/40 px-3 py-2">
              Reranker: {memoryBackend.rerankerOnline ? "online" : "offline"}
            </span>
            <span className="rounded-lg border border-uvb-border/30 bg-uvb-dark-gray/40 px-3 py-2">
              Collection: {memoryBackend.collection}
            </span>
          </div>
        )}
        <p className="text-xs leading-relaxed text-uvb-text-secondary">
          Manual memories are saved to UVB&apos;s server-side memory store, embedded through the local BGE-M3 endpoint,
          indexed into Qdrant, reranked on retrieval, and injected into Sophia&apos;s chat context through the server chat bridge.
          Local browser chat threads remain visible here as convenience context while new turns are auto-captured into durable memory.
        </p>
      </div>
        </>
      )}
    </div>
  );
}
