"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  CircleStackIcon,
  MagnifyingGlassIcon,
  FolderIcon,
  ClockIcon,
  TagIcon,
  TrashIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";
import { Database, Brain, Search, HardDrive } from "lucide-react";

interface MemoryEntry {
  id: string;
  title: string;
  type: "conversation" | "knowledge" | "context" | "preference";
  content: string;
  timestamp: number;
  tags: string[];
  size: string;
}

const SAMPLE_ENTRIES: MemoryEntry[] = [
  {
    id: "1",
    title: "Project Architecture Discussion",
    type: "conversation",
    content: "Discussed the UVB system architecture including the modular plugin system, memory persistence layer, and voice processing pipeline...",
    timestamp: Date.now() - 3600000,
    tags: ["architecture", "planning"],
    size: "2.4 KB",
  },
  {
    id: "2",
    title: "User Voice Profile - Default",
    type: "preference",
    content: "Voice settings: TTS speed 1.2x, pitch +2, preferred voice: Neural-Natural-Female-v3, barge-in sensitivity: medium",
    timestamp: Date.now() - 86400000,
    tags: ["voice", "settings"],
    size: "0.8 KB",
  },
  {
    id: "3",
    title: "Code Analysis: Next.js App Router",
    type: "knowledge",
    content: "Key findings about the App Router pattern: Server Components by default, layout persistence, streaming with Suspense, parallel routes...",
    timestamp: Date.now() - 172800000,
    tags: ["code", "nextjs"],
    size: "4.1 KB",
  },
  {
    id: "4",
    title: "System Context: Windows Environment",
    type: "context",
    content: "Windows 11 Home 64bit, i9 14900KF, 64GB RAM, RTX 5090 32GB. Primary dev path: C:\\Users\\Knight\\Projects\\UVB",
    timestamp: Date.now() - 259200000,
    tags: ["system", "hardware"],
    size: "0.5 KB",
  },
];

const TYPE_COLORS: Record<string, string> = {
  conversation: "#4a6fa5",
  knowledge: "#39ff14",
  context: "#f5a623",
  preference: "#6b1fa0",
};

export default function MemoryBankPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [entries] = useState<MemoryEntry[]>(SAMPLE_ENTRIES);

  const filteredEntries = entries.filter((entry) => {
    const matchesSearch =
      !searchQuery ||
      entry.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = !activeFilter || entry.type === activeFilter;
    return matchesSearch && matchesFilter;
  });

  const stats = [
    { label: "Total Entries", value: entries.length, icon: Database },
    { label: "Storage Used", value: "7.8 KB", icon: HardDrive },
    {
      label: "Indexed",
      value: entries.reduce((acc, e) => acc + e.tags.length, 0),
      icon: Search,
    },
    { label: "Active Context", value: "3", icon: Brain },
  ];

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Stats */}
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

      {/* Search and filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-uvb-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search memory bank..."
            className="input-field pl-10"
          />
        </div>
        <div className="flex gap-2">
          {["conversation", "knowledge", "context", "preference"].map((type) => (
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
                  ? { backgroundColor: TYPE_COLORS[type] + "40", border: `1px solid ${TYPE_COLORS[type]}60` }
                  : {}
              }
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Entries */}
      <div className="space-y-3">
        {filteredEntries.map((entry, i) => (
          <motion.div
            key={entry.id}
            className="uvb-card group cursor-pointer"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <div className="flex items-start gap-4">
              <div
                className="w-1 h-full rounded-full flex-shrink-0 self-stretch"
                style={{ backgroundColor: TYPE_COLORS[entry.type] }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-sm font-semibold text-uvb-text-primary truncate">
                    {entry.title}
                  </h4>
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded-full uppercase tracking-wider font-medium"
                    style={{
                      backgroundColor: TYPE_COLORS[entry.type] + "20",
                      color: TYPE_COLORS[entry.type],
                    }}
                  >
                    {entry.type}
                  </span>
                </div>
                <p className="text-xs text-uvb-text-secondary line-clamp-2 mb-2">
                  {entry.content}
                </p>
                <div className="flex items-center gap-4 text-[10px] text-uvb-text-muted">
                  <span className="flex items-center gap-1">
                    <ClockIcon className="w-3 h-3" />
                    {new Date(entry.timestamp).toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1">
                    <FolderIcon className="w-3 h-3" />
                    {entry.size}
                  </span>
                  <span className="flex items-center gap-1">
                    <TagIcon className="w-3 h-3" />
                    {entry.tags.join(", ")}
                  </span>
                </div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-1.5 rounded-lg hover:bg-uvb-light-gray/30 text-uvb-text-muted">
                  <ArrowDownTrayIcon className="w-4 h-4" />
                </button>
                <button className="p-1.5 rounded-lg hover:bg-uvb-light-gray/30 text-uvb-text-muted hover:text-red-400">
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* RAG info */}
      <div className="uvb-card">
        <div className="flex items-center gap-3 mb-3">
          <Brain className="w-5 h-5 text-uvb-royal-purple-light" />
          <h4 className="text-sm font-semibold text-uvb-text-primary font-[family-name:var(--font-display)]">
            Retrieval-Augmented Generation
          </h4>
        </div>
        <p className="text-xs text-uvb-text-secondary leading-relaxed">
          The memory bank uses RAG for intelligent context retrieval. Entries are
          automatically indexed and vectorized for semantic search. When
          KnightBot needs context, it retrieves the most relevant memories using
          cosine similarity matching against the current conversation embedding.
        </p>
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="p-2 rounded-lg bg-uvb-dark-gray/40 text-center">
            <p className="text-lg font-bold text-uvb-neon-green font-[family-name:var(--font-mono)]">
              1536
            </p>
            <p className="text-[10px] text-uvb-text-muted">Dimensions</p>
          </div>
          <div className="p-2 rounded-lg bg-uvb-dark-gray/40 text-center">
            <p className="text-lg font-bold text-uvb-steel-blue font-[family-name:var(--font-mono)]">
              98.2%
            </p>
            <p className="text-[10px] text-uvb-text-muted">Recall</p>
          </div>
          <div className="p-2 rounded-lg bg-uvb-dark-gray/40 text-center">
            <p className="text-lg font-bold text-uvb-accent-yellow font-[family-name:var(--font-mono)]">
              &lt;5ms
            </p>
            <p className="text-[10px] text-uvb-text-muted">Retrieval</p>
          </div>
        </div>
      </div>
    </div>
  );
}
