"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowDownTrayIcon,
  ClockIcon,
  FolderIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  PlusIcon,
  TagIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Brain, Database, HardDrive, Search } from "lucide-react";
import { useAppStore, type ChatThread } from "@/stores/appStore";

type MemoryType = "conversation" | "knowledge" | "context" | "preference";

interface MemoryEntry {
  id: string;
  title: string;
  type: MemoryType;
  content: string;
  timestamp: number;
  tags: string[];
  sizeBytes: number;
  source: "chat" | "manual";
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

export default function MemoryBankPage() {
  const threads = useAppStore((state) => state.threads);
  const [manualEntries, setManualEntries] = useState<MemoryEntry[]>(loadManualMemories);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<MemoryType | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newType, setNewType] = useState<MemoryType>("knowledge");
  const [newTags, setNewTags] = useState("");
  const [editingId, setEditingId] = useState("");

  const entries = useMemo(
    () =>
      [...manualEntries, ...threads.map(threadToMemory)].sort(
        (a, b) => b.timestamp - a.timestamp
      ),
    [manualEntries, threads]
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
    { label: "Manual", value: manualEntries.length, icon: Brain },
    { label: "Chat Threads", value: threads.length, icon: Search },
    {
      label: "Storage",
      value: formatBytes(entries.reduce((total, entry) => total + entry.sizeBytes, 0)),
      icon: HardDrive,
    },
  ];

  const clearMemoryForm = () => {
    setNewTitle("");
    setNewContent("");
    setNewTags("");
    setNewType("knowledge");
    setEditingId("");
  };

  const saveMemory = () => {
    const content = newContent.trim();
    if (!content) return;

    const tags = newTags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const nextEntries = editingId
      ? manualEntries.map((entry) =>
          entry.id === editingId
            ? {
                ...entry,
                title: newTitle.trim() || content.slice(0, 64) || "Untitled memory",
                type: newType,
                content,
                timestamp: Date.now(),
                tags,
                sizeBytes: byteSize(content),
              }
            : entry
        )
      : [
          {
            id: `manual:${generateId()}`,
            title: newTitle.trim() || content.slice(0, 64) || "Untitled memory",
            type: newType,
            content,
            timestamp: Date.now(),
            tags,
            sizeBytes: byteSize(content),
            source: "manual" as const,
          },
          ...manualEntries,
        ];
    setManualEntries(nextEntries);
    saveManualMemories(nextEntries);
    clearMemoryForm();
  };

  const editMemory = (entry: MemoryEntry) => {
    if (entry.source !== "manual") return;
    setEditingId(entry.id);
    setNewTitle(entry.title);
    setNewContent(entry.content);
    setNewType(entry.type === "conversation" ? "knowledge" : entry.type);
    setNewTags(entry.tags.join(", "));
  };

  const deleteMemory = (id: string) => {
    const nextEntries = manualEntries.filter((entry) => entry.id !== id);
    setManualEntries(nextEntries);
    saveManualMemories(nextEntries);
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
          <h4 className="text-sm font-semibold text-uvb-text-primary font-[family-name:var(--font-display)]">
            Local Memory Status
          </h4>
        </div>
        <p className="text-xs leading-relaxed text-uvb-text-secondary">
          This page now reflects actual local UVB data: saved chat threads plus pinned memories stored in browser localStorage.
          Manual memories can be created, edited, deleted, searched, and exported. Semantic embeddings and automatic retrieval into chat are still future work.
        </p>
      </div>
    </div>
  );
}
