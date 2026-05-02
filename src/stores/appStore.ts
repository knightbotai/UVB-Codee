import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  type: "text" | "voice" | "image" | "video";
  branch?: string;
  bookmarked?: boolean;
}

export interface ChatThread {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  context: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  createdAt: number;
}

export interface PodcastSeat {
  id: string;
  name: string;
  voiceProfileId?: string;
  isActive: boolean;
  isCustomVoice: boolean;
}

interface AppState {
  // Navigation
  sidebarOpen: boolean;
  activeSection: string;
  setSidebarOpen: (open: boolean) => void;
  setActiveSection: (section: string) => void;

  // Chat
  threads: ChatThread[];
  activeThreadId: string | null;
  isRecording: boolean;
  addThread: (thread: ChatThread) => void;
  setActiveThread: (id: string | null) => void;
  updateThread: (
    threadId: string,
    updates: Partial<Pick<ChatThread, "title" | "context">>
  ) => void;
  deleteThread: (threadId: string) => void;
  addMessage: (threadId: string, message: ChatMessage) => void;
  updateMessage: (threadId: string, messageId: string, updates: Partial<ChatMessage>) => void;
  setIsRecording: (recording: boolean) => void;

  // Voice
  isVoiceActive: boolean;
  voiceInputLevel: number;
  setIsVoiceActive: (active: boolean) => void;
  setVoiceInputLevel: (level: number) => void;

  // Podcast
  podcastSeats: PodcastSeat[];
  updatePodcastSeat: (id: string, seat: Partial<PodcastSeat>) => void;
  addPodcastSeat: (seat: PodcastSeat) => void;
  removePodcastSeat: (id: string) => void;

  // User
  currentUser: UserProfile | null;
  setCurrentUser: (user: UserProfile | null) => void;

  // UI
  showCommandPalette: boolean;
  setShowCommandPalette: (show: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Navigation
      sidebarOpen: true,
      activeSection: "chat",
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setActiveSection: (section) => set({ activeSection: section }),

      // Chat
      threads: [],
      activeThreadId: null,
      isRecording: false,
      addThread: (thread) =>
        set((state) => ({ threads: [...state.threads, thread] })),
      setActiveThread: (id) => set({ activeThreadId: id }),
      updateThread: (threadId, updates) =>
        set((state) => ({
          threads: state.threads.map((thread) =>
            thread.id === threadId
              ? { ...thread, ...updates, updatedAt: Date.now() }
              : thread
          ),
        })),
      deleteThread: (threadId) =>
        set((state) => {
          const nextThreads = state.threads.filter((thread) => thread.id !== threadId);
          const deletingActiveThread = state.activeThreadId === threadId;
          return {
            threads: nextThreads,
            activeThreadId: deletingActiveThread ? nextThreads[0]?.id ?? null : state.activeThreadId,
          };
        }),
      addMessage: (threadId, message) =>
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  messages: [...t.messages, message],
                  updatedAt: Date.now(),
                }
              : t
          ),
        })),
      updateMessage: (threadId, messageId, updates) =>
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  messages: t.messages.map((message) =>
                    message.id === messageId ? { ...message, ...updates } : message
                  ),
                  updatedAt: Date.now(),
                }
              : t
          ),
        })),
      setIsRecording: (recording) => set({ isRecording: recording }),

      // Voice
      isVoiceActive: false,
      voiceInputLevel: 0,
      setIsVoiceActive: (active) => set({ isVoiceActive: active }),
      setVoiceInputLevel: (level) => set({ voiceInputLevel: level }),

      // Podcast
      podcastSeats: [
        { id: "1", name: "Host", isActive: true, isCustomVoice: false },
        { id: "2", name: "Guest 1", isActive: false, isCustomVoice: false },
        { id: "3", name: "Guest 2", isActive: false, isCustomVoice: false },
      ],
      updatePodcastSeat: (id, seat) =>
        set((state) => ({
          podcastSeats: state.podcastSeats.map((s) =>
            s.id === id ? { ...s, ...seat } : s
          ),
        })),
      addPodcastSeat: (seat) =>
        set((state) => ({ podcastSeats: [...state.podcastSeats, seat] })),
      removePodcastSeat: (id) =>
        set((state) => ({
          podcastSeats: state.podcastSeats.filter((s) => s.id !== id),
        })),

      // User
      currentUser: null,
      setCurrentUser: (user) => set({ currentUser: user }),

      // UI
      showCommandPalette: false,
      setShowCommandPalette: (show) => set({ showCommandPalette: show }),
    }),
    {
      name: "uvb:app-store",
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        activeSection: state.activeSection,
        threads: state.threads,
        activeThreadId: state.activeThreadId,
        podcastSeats: state.podcastSeats,
        currentUser: state.currentUser,
      }),
    }
  )
);
