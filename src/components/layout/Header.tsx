"use client";

import { motion } from "framer-motion";
import { useAppStore } from "@/stores/appStore";
import {
  BellIcon,
  MagnifyingGlassIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";

export default function Header() {
  const { activeSection } = useAppStore();

  const sectionTitles: Record<string, string> = {
    chat: "KnightBot Chat",
    voice: "Voice Analysis",
    media: "Media Studio",
    podcast: "Podcast Suite",
    memory: "Memory Bank",
    settings: "Settings",
  };

  return (
    <header className="h-16 flex items-center justify-between px-6 border-b border-uvb-border/40">
      <div className="flex items-center gap-4">
        <motion.h2
          key={activeSection}
          className="text-lg font-semibold text-uvb-text-primary font-[family-name:var(--font-display)]"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {sectionTitles[activeSection] || "UVB Dashboard"}
        </motion.h2>
      </div>

      <div className="flex items-center gap-3">
        {/* Search */}
        <button className="p-2 rounded-lg hover:bg-uvb-light-gray/40 text-uvb-text-secondary hover:text-uvb-text-primary transition-colors">
          <MagnifyingGlassIcon className="w-5 h-5" />
        </button>

        {/* Notifications */}
        <button className="relative p-2 rounded-lg hover:bg-uvb-light-gray/40 text-uvb-text-secondary hover:text-uvb-text-primary transition-colors">
          <BellIcon className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-uvb-neon-green status-pulse" />
        </button>

        {/* Status indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-uvb-deep-teal/20 border border-uvb-deep-teal/30">
          <span className="w-2 h-2 rounded-full bg-uvb-neon-green status-pulse" />
          <span className="text-xs text-uvb-text-secondary">Online</span>
        </div>

        {/* Profile */}
        <button className="p-1 rounded-lg hover:bg-uvb-light-gray/40 transition-colors">
          <UserCircleIcon className="w-7 h-7 text-uvb-text-secondary hover:text-uvb-text-primary" />
        </button>
      </div>
    </header>
  );
}
