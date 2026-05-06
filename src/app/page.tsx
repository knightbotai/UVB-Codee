"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/stores/appStore";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import GalaxyBackground from "@/components/animated/GalaxyBackground";
import { GlowOrb } from "@/components/animated/UIEffects";
import ChatInterface from "@/app/chat/ChatInterface";
import VoiceAnalysisPage from "@/app/voice-analysis/VoiceAnalysisPage";
import MediaStudioPage from "@/app/media/MediaStudioPage";
import PodcastStudioPage from "@/app/podcast/PodcastStudioPage";
import MemoryBankPage from "@/app/memory/MemoryBankPage";
import SettingsPage from "@/app/settings/SettingsPage";
import { useEffect, useState } from "react";

function SectionRenderer({ section }: { section: string }) {
  switch (section) {
    case "chat":
      return <ChatInterface />;
    case "voice":
      return <VoiceAnalysisPage />;
    case "media":
      return <MediaStudioPage />;
    case "podcast":
      return <PodcastStudioPage />;
    case "memory":
      return <MemoryBankPage />;
    case "settings":
      return <SettingsPage />;
    default:
      return <ChatInterface />;
  }
}

export default function Home() {
  const { activeSection, sidebarOpen } = useAppStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const mountFrame = window.requestAnimationFrame(() => setMounted(true));

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        useAppStore.getState().setShowCommandPalette(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(mountFrame);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  if (!mounted) {
    return (
      <div className="galaxy-bg min-h-screen relative overflow-hidden">
        <div className="relative z-10 flex min-h-screen items-center justify-center">
          <div className="glass-panel px-6 py-4 text-center">
            <p className="font-[family-name:var(--font-display)] text-sm text-uvb-text-primary">
              UVB KnightBot
            </p>
            <p className="mt-1 text-xs text-uvb-text-muted">Loading local cockpit...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="galaxy-bg min-h-screen relative overflow-hidden">
      {/* Background effects */}
      <GalaxyBackground />
      <GlowOrb color="#39ff14" size={300} x="10%" y="20%" delay={0} />
      <GlowOrb color="#6b1fa0" size={250} x="80%" y="60%" delay={2} />
      <GlowOrb color="#4a6fa5" size={200} x="60%" y="10%" delay={4} />

      {/* Main layout */}
      <div className="relative z-10 flex min-h-screen">
        <Sidebar />

        {/* Main content area */}
        <motion.div
          className="flex min-h-screen min-w-0 flex-col overflow-hidden"
          animate={{
            marginLeft: sidebarOpen ? 256 : 64,
            width: sidebarOpen ? "calc(100% - 256px)" : "calc(100% - 64px)",
          }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
        >
          <Header />

          {/* Page content */}
          <main className="min-w-0 flex-1 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSection}
                className="h-full min-w-0 overflow-hidden"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <SectionRenderer section={activeSection} />
              </motion.div>
            </AnimatePresence>
          </main>
        </motion.div>
      </div>

      {/* Command Palette overlay */}
      <CommandPalette />
    </div>
  );
}

function CommandPalette() {
  const { showCommandPalette, setShowCommandPalette, setActiveSection } =
    useAppStore();

  useEffect(() => {
    if (showCommandPalette) {
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === "Escape") setShowCommandPalette(false);
      };
      window.addEventListener("keydown", handleEsc);
      return () => window.removeEventListener("keydown", handleEsc);
    }
  }, [showCommandPalette, setShowCommandPalette]);

  const commands = [
    { label: "Open Chat", action: () => setActiveSection("chat") },
    { label: "Voice Analysis", action: () => setActiveSection("voice") },
    { label: "Media Studio", action: () => setActiveSection("media") },
    { label: "Podcast Suite", action: () => setActiveSection("podcast") },
    { label: "Memory Bank", action: () => setActiveSection("memory") },
    { label: "Settings", action: () => setActiveSection("settings") },
  ];

  return (
    <AnimatePresence>
      {showCommandPalette && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setShowCommandPalette(false)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <motion.div
            className="relative w-full max-w-md glass-panel p-2"
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="text"
              placeholder="Type a command..."
              className="input-field mb-2"
              autoFocus
            />
            <div className="space-y-0.5">
              {commands.map((cmd) => (
                <button
                  key={cmd.label}
                  onClick={() => {
                    cmd.action();
                    setShowCommandPalette(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm text-uvb-text-secondary hover:text-uvb-text-primary hover:bg-uvb-light-gray/30 transition-colors"
                >
                  {cmd.label}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
