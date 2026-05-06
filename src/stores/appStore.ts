import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

const APP_STORE_KEY = "uvb:app-store";
const MAX_PERSISTED_STORE_CHARS = 4_000_000;

export interface ChatAttachment {
  id: string;
  name: string;
  mediaType: string;
  dataUrl?: string;
  size: number;
  kind: "image" | "file";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  type: "text" | "voice" | "image" | "video";
  attachments?: ChatAttachment[];
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

function timestampToNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? Date.now() : parsed;
  }
  if (value && typeof value === "object") {
    const record = value as { timestamp?: unknown; time?: unknown; value?: unknown };
    return timestampToNumber(record.timestamp ?? record.time ?? record.value);
  }
  return Date.now();
}

function safeText(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? `${value}` : fallback;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value == null) return fallback;

  try {
    const serialized = JSON.stringify(value);
    return serialized ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeRole(value: unknown): ChatMessage["role"] {
  return value === "user" || value === "assistant" || value === "system"
    ? value
    : "assistant";
}

function normalizeType(value: unknown): ChatMessage["type"] {
  return value === "text" || value === "voice" || value === "image" || value === "video"
    ? value
    : "text";
}

function normalizeAttachment(value: unknown): ChatAttachment | null {
  if (!value || typeof value !== "object") return null;

  const attachment = value as Partial<ChatAttachment>;
  const dataUrl = safeText(attachment.dataUrl);
  const mediaType = safeText(attachment.mediaType);
  if (!mediaType) return null;

  return {
    id: safeText(attachment.id) || Math.random().toString(36).substring(2, 11),
    name: safeText(attachment.name, "attachment"),
    mediaType,
    dataUrl: dataUrl || undefined,
    size: typeof attachment.size === "number" && Number.isFinite(attachment.size) ? attachment.size : 0,
    kind: attachment.kind === "image" ? "image" : "file",
  };
}

function stripAttachmentPayloads(thread: ChatThread): ChatThread {
  return {
    ...thread,
    messages: thread.messages.map((message) => ({
      ...message,
      attachments: message.attachments?.map((attachment) => ({
        ...attachment,
        dataUrl: undefined,
      })),
    })),
  };
}

function prunePersistedStore(rawValue: string): string {
  try {
    const parsed = JSON.parse(rawValue) as { state?: Partial<AppState> };
    if (!parsed.state) return rawValue;

    parsed.state = {
      ...parsed.state,
      threads: Array.isArray(parsed.state.threads)
        ? parsed.state.threads.map((thread) => stripAttachmentPayloads(normalizeThread(thread)))
        : [],
    };

    return JSON.stringify(parsed);
  } catch {
    return rawValue;
  }
}

function getAppStorage() {
  return {
    getItem: (name: string) => {
      const rawValue = window.localStorage.getItem(name);
      if (!rawValue || rawValue.length <= MAX_PERSISTED_STORE_CHARS) return rawValue;

      const prunedValue = prunePersistedStore(rawValue);
      try {
        window.localStorage.setItem(name, prunedValue);
      } catch {
        // Keep returning the pruned value so hydration can preserve text chats.
      }
      return prunedValue;
    },
    setItem: (name: string, value: string) => {
      const prunedValue = prunePersistedStore(value);
      try {
        window.localStorage.setItem(name, prunedValue);
      } catch (error) {
        if (error instanceof DOMException && error.name === "QuotaExceededError") {
          window.localStorage.setItem(name, prunedValue);
          return;
        }
        throw error;
      }
    },
    removeItem: (name: string) => window.localStorage.removeItem(name),
  };
}

function normalizeMessage(message: Partial<ChatMessage>): ChatMessage {
  const attachments = Array.isArray(message.attachments)
    ? message.attachments.map(normalizeAttachment).filter((item): item is ChatAttachment => Boolean(item))
    : undefined;

  return {
    id: safeText(message.id) || Math.random().toString(36).substring(2, 11),
    role: normalizeRole(message.role),
    content: safeText(message.content),
    timestamp: timestampToNumber(message.timestamp),
    type: normalizeType(message.type),
    attachments: attachments?.length ? attachments : undefined,
    branch: message.branch ? safeText(message.branch) : undefined,
    bookmarked: Boolean(message.bookmarked),
  };
}

function normalizeThread(thread: Partial<ChatThread>): ChatThread {
  return {
    id: safeText(thread.id) || Math.random().toString(36).substring(2, 11),
    title: safeText(thread.title, "New Conversation"),
    context: safeText(thread.context),
    createdAt: timestampToNumber(thread.createdAt),
    updatedAt: timestampToNumber(thread.updatedAt),
    messages: Array.isArray(thread.messages) ? thread.messages.map(normalizeMessage) : [],
  };
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
        set((state) => ({ threads: [...state.threads, normalizeThread(thread)] })),
      setActiveThread: (id) => set({ activeThreadId: safeText(id) || null }),
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
                  messages: [...t.messages, normalizeMessage(message)],
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
                    message.id === messageId
                      ? normalizeMessage({ ...message, ...updates })
                      : normalizeMessage(message)
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
      name: APP_STORE_KEY,
      storage: createJSONStorage(getAppStorage),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<AppState> | undefined;
        const persistedActiveThreadId = safeText(persisted?.activeThreadId);
        return {
          ...currentState,
          ...persisted,
          threads: persisted?.threads?.map(normalizeThread) ?? currentState.threads,
          activeThreadId: persistedActiveThreadId || currentState.activeThreadId,
        };
      },
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        activeSection: state.activeSection,
        threads: state.threads.map(stripAttachmentPayloads),
        activeThreadId: state.activeThreadId,
        podcastSeats: state.podcastSeats,
        currentUser: state.currentUser,
      }),
    }
  )
);
