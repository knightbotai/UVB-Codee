"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/stores/appStore";
import {
  ChatBubbleLeftRightIcon,
  MicrophoneIcon,
  PhotoIcon,
  SpeakerWaveIcon,
  Cog6ToothIcon,
  Bars3Icon,
  XMarkIcon,
  CommandLineIcon,
  CircleStackIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import {
  Brain,
  Radio,
} from "lucide-react";

const NAV_ITEMS = [
  { id: "chat", label: "KnightBot Chat", icon: ChatBubbleLeftRightIcon, lucideIcon: Brain },
  { id: "voice", label: "Voice Analysis", icon: MicrophoneIcon, lucideIcon: null },
  { id: "media", label: "Media Studio", icon: PhotoIcon, lucideIcon: null },
  { id: "podcast", label: "Podcast Suite", icon: SpeakerWaveIcon, lucideIcon: Radio },
  { id: "memory", label: "Memory Bank", icon: CircleStackIcon, lucideIcon: null },
  { id: "settings", label: "Settings", icon: Cog6ToothIcon, lucideIcon: null },
];

export default function Sidebar() {
  const { sidebarOpen, setSidebarOpen, activeSection, setActiveSection } =
    useAppStore();

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            className="fixed inset-0 bg-black/60 z-30 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        className={`fixed top-0 left-0 h-full z-40 flex flex-col ${
          sidebarOpen ? "w-64" : "w-16"
        }`}
        style={{
          background: "rgba(10, 10, 16, 0.9)",
          backdropFilter: "blur(20px)",
          borderRight: "1px solid rgba(42, 42, 58, 0.6)",
        }}
        animate={{ width: sidebarOpen ? 256 : 64 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
      >
        {/* Logo / Header */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-uvb-border/40">
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div
                className="flex items-center gap-2 overflow-hidden"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-uvb-deep-teal to-uvb-steel-blue flex items-center justify-center flex-shrink-0">
                  <SparklesIcon className="w-5 h-5 text-uvb-neon-green" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-sm font-bold text-uvb-text-primary truncate font-[family-name:var(--font-display)]">
                    UVB
                  </h1>
                  <p className="text-[10px] text-uvb-text-muted truncate">
                    KnightBot v0.1
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-lg hover:bg-uvb-light-gray/50 text-uvb-text-secondary hover:text-uvb-text-primary transition-colors flex-shrink-0"
          >
            {sidebarOpen ? (
              <XMarkIcon className="w-5 h-5" />
            ) : (
              <Bars3Icon className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = activeSection === item.id;
            const IconComponent = item.icon;

            return (
              <motion.button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative ${
                  isActive
                    ? "text-uvb-neon-green"
                    : "text-uvb-text-secondary hover:text-uvb-text-primary hover:bg-uvb-light-gray/30"
                }`}
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.98 }}
              >
                {isActive && (
                  <motion.div
                    className="absolute inset-0 rounded-lg bg-uvb-deep-teal/30 border border-uvb-neon-green/20"
                    layoutId="sidebar-active"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                  />
                )}
                <div className="relative z-10 flex items-center gap-3 w-full">
                  {item.lucideIcon ? (
                    <item.lucideIcon className="w-5 h-5 flex-shrink-0" />
                  ) : (
                    <IconComponent className="w-5 h-5 flex-shrink-0" />
                  )}
                  <AnimatePresence>
                    {sidebarOpen && (
                      <motion.span
                        className="text-sm font-medium truncate"
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: "auto" }}
                        exit={{ opacity: 0, width: 0 }}
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
                {isActive && (
                  <motion.div
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full bg-uvb-neon-green"
                    layoutId="sidebar-indicator"
                    style={{ boxShadow: "0 0 8px #39ff1460" }}
                  />
                )}
              </motion.button>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="p-3 border-t border-uvb-border/40">
          <button
            onClick={() => {
              useAppStore.getState().setShowCommandPalette(true);
            }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-uvb-text-muted hover:text-uvb-text-secondary hover:bg-uvb-light-gray/30 transition-colors"
          >
            <CommandLineIcon className="w-5 h-5 flex-shrink-0" />
            <AnimatePresence>
              {sidebarOpen && (
                <motion.div
                  className="flex items-center justify-between w-full overflow-hidden"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <span className="text-sm">Command</span>
                  <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-uvb-dark-gray border border-uvb-border text-uvb-text-muted">
                    ⌘K
                  </kbd>
                </motion.div>
              )}
            </AnimatePresence>
          </button>
        </div>
      </motion.aside>
    </>
  );
}
