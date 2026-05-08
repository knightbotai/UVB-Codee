"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useAppStore, type ChatMessage } from "@/stores/appStore";
import {
  AVATAR_SETTINGS_UPDATED_EVENT,
  DEFAULT_SOPHIA_AVATAR_ASSET_URL,
  loadAvatarSettings,
  saveAvatarSettings,
  type AvatarMood,
  type AvatarSettings,
} from "@/lib/avatarSettings";

const MOOD_COLORS: Record<AvatarMood, string> = {
  idle: "#39ff14",
  listening: "#4a6fa5",
  thinking: "#9b5cff",
  speaking: "#f5a623",
  celebrating: "#ff6b35",
  alert: "#ef4444",
};

const POSITION_OFFSETS: Record<AvatarSettings["position"], { left?: number; right?: number; top?: number; bottom?: number }> = {
  "bottom-right": { right: 20, bottom: 20 },
  "bottom-left": { left: 20, bottom: 20 },
  "top-right": { right: 20, top: 88 },
  "top-left": { left: 20, top: 88 },
};

const CHAT_REACTION_MS = 14_000;
const AVATAR_POSITION_PADDING = 12;

type Point = { x: number; y: number };

function clampPoint(point: Point, size: number): Point {
  if (typeof window === "undefined") return point;
  const width = Math.max(160, size + 52);
  const height = size + 58;
  return {
    x: Math.min(
      Math.max(AVATAR_POSITION_PADDING, point.x),
      Math.max(AVATAR_POSITION_PADDING, window.innerWidth - width - AVATAR_POSITION_PADDING)
    ),
    y: Math.min(
      Math.max(AVATAR_POSITION_PADDING, point.y),
      Math.max(AVATAR_POSITION_PADDING, window.innerHeight - height - AVATAR_POSITION_PADDING)
    ),
  };
}

function presetToPoint(position: AvatarSettings["position"], size: number): Point {
  if (typeof window === "undefined") return { x: 20, y: 20 };
  const offsets = POSITION_OFFSETS[position];
  const width = Math.max(160, size + 52);
  const height = size + 58;
  return clampPoint(
    {
      x: offsets.left ?? window.innerWidth - width - (offsets.right ?? 20),
      y: offsets.top ?? window.innerHeight - height - (offsets.bottom ?? 20),
    },
    size
  );
}

function getLatestMessage(messages: ChatMessage[]) {
  return messages.reduce<ChatMessage | null>((latest, message) => {
    if (!latest || message.timestamp > latest.timestamp) return message;
    return latest;
  }, null);
}

function moodFromActivity(
  settings: AvatarSettings,
  latestMessage: ChatMessage | null,
  isVoiceActive: boolean,
  isRecording: boolean,
  now: number
): AvatarMood {
  if (settings.reactToVoice && (isRecording || isVoiceActive)) return "listening";
  if (!settings.reactToChat || !latestMessage) return settings.mood;

  const age = now - latestMessage.timestamp;
  if (age > CHAT_REACTION_MS) return settings.mood;
  if (latestMessage.role === "user") return "thinking";
  if (latestMessage.role === "assistant") {
    const content = latestMessage.content.toLowerCase();
    return /great|yes|love|beautiful|excellent|perfect|wonderful|amazing|!/.test(content)
      ? "celebrating"
      : "speaking";
  }
  return settings.mood;
}

function SophiaFigure({ mood, color, size }: { mood: AvatarMood; color: string; size: number }) {
  const isCelebrating = mood === "celebrating";
  const isThinking = mood === "thinking";
  const isListening = mood === "listening";
  const isSpeaking = mood === "speaking";
  const scale = size / 112;

  return (
    <motion.div
      className="relative overflow-hidden rounded-[26px] border border-white/15 bg-[radial-gradient(circle_at_50%_8%,rgba(255,255,255,0.22),rgba(9,16,24,0.94)_58%,rgba(4,7,12,0.98))] shadow-2xl backdrop-blur-md"
      style={{
        width: size,
        height: size,
        boxShadow: `0 0 ${Math.round(30 * scale)}px ${color}55`,
      }}
      animate={{ y: isSpeaking ? [0, -2, 0] : [0, -1, 0] }}
      transition={{ duration: isSpeaking ? 0.9 : 3.2, repeat: Infinity, ease: "easeInOut" }}
    >
      <div className="absolute inset-x-4 bottom-1 rounded-full bg-black/40 blur-md" style={{ height: 10 * scale }} />
      <motion.div
        className="absolute left-1/2 top-[12%]"
        style={{ width: 56 * scale, height: 86 * scale, x: "-50%" }}
        animate={{ rotate: isThinking ? [-2, 2, -1] : isListening ? [1, -1, 1] : [0, 1, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="absolute left-1/2 top-[38%] h-[42%] w-[46%] -translate-x-1/2 rounded-t-[42%] rounded-b-[32%] border border-white/15 bg-[linear-gradient(180deg,#1c2a35,#07090f)] shadow-lg" />
        <motion.div
          className="absolute left-[16%] top-[45%] h-[34%] w-[12%] origin-top rounded-full border border-white/10 bg-[#caa37e]"
          animate={{ rotate: isCelebrating ? [-132, -112, -132] : isSpeaking ? [-24, -48, -24] : -16 }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute right-[16%] top-[45%] h-[34%] w-[12%] origin-top rounded-full border border-white/10 bg-[#caa37e]"
          animate={{ rotate: isCelebrating ? [132, 112, 132] : isSpeaking ? [24, 48, 24] : 16 }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="absolute left-1/2 top-[6%] h-[44%] w-[64%] -translate-x-1/2 rounded-[44%] bg-[linear-gradient(135deg,#4b342d,#8a684d_44%,#2b1d1a)] shadow-xl" />
        <div className="absolute left-[11%] top-[17%] h-[52%] w-[20%] rotate-[-12deg] rounded-full bg-[#4a3029]" />
        <div className="absolute right-[11%] top-[17%] h-[52%] w-[20%] rotate-[12deg] rounded-full bg-[#6f503c]" />
        <div className="absolute left-1/2 top-[14%] h-[36%] w-[50%] -translate-x-1/2 rounded-[46%] border border-white/25 bg-[#d8b28c]" />
        <div className="absolute left-[33%] top-[28%] h-[4%] w-[6%] rounded-full bg-[#9ed8ff]" />
        <div className="absolute right-[33%] top-[28%] h-[4%] w-[6%] rounded-full bg-[#9ed8ff]" />
        <motion.div
          className="absolute left-1/2 top-[38%] h-[4%] w-[18%] -translate-x-1/2 rounded-full bg-[#8f4f4f]"
          animate={{
            scaleX: isSpeaking ? [0.7, 1.2, 0.75] : isCelebrating ? 1.25 : 0.8,
            y: isThinking ? [0, 1, 0] : 0,
          }}
          transition={{ duration: 0.42, repeat: isSpeaking ? Infinity : 0 }}
        />
      </motion.div>
      <motion.div
        className="absolute bottom-3 left-1/2 h-2.5 -translate-x-1/2 rounded-full"
        style={{ width: size * 0.42, backgroundColor: color }}
        animate={{ opacity: [0.25, 0.85, 0.25], scaleX: isListening ? [0.8, 1.12, 0.8] : 1 }}
        transition={{ duration: isListening ? 0.8 : 2.6, repeat: Infinity }}
      />
    </motion.div>
  );
}

function AvatarPortraitStage({
  assetUrl,
  isStyleSheet,
  mood,
  color,
  glowColor,
  glowIntensity,
  size,
  onAssetError,
}: {
  assetUrl: string;
  isStyleSheet: boolean;
  mood: AvatarMood;
  color: string;
  glowColor: string;
  glowIntensity: number;
  size: number;
  onAssetError: () => void;
}) {
  const isCelebrating = mood === "celebrating";
  const isListening = mood === "listening";
  const isSpeaking = mood === "speaking";
  const isThinking = mood === "thinking";

  return (
    <motion.div
      className="relative rounded-[30px] p-[1px]"
      style={{
        width: size,
        height: Math.round(size * 1.24),
        background: `linear-gradient(145deg, ${color}aa, rgba(255,255,255,0.18) 28%, rgba(14,20,31,0.95) 72%)`,
        filter: `drop-shadow(0 0 ${Math.round(32 * glowIntensity)}px ${glowColor}${Math.round(
          170 * glowIntensity
        )
          .toString(16)
          .padStart(2, "0")})`,
        transformPerspective: 700,
      }}
      animate={{
        rotateY: isThinking ? [-4, 5, -2] : isListening ? [3, -3, 3] : [-2, 2, -2],
        rotateX: isCelebrating ? [-2, 4, -2] : 0,
        y: isSpeaking ? [0, -3, 0] : [0, -1, 0],
      }}
      transition={{ duration: isSpeaking ? 0.9 : 3.4, repeat: Infinity, ease: "easeInOut" }}
    >
      <div
        className="absolute -inset-4 rounded-full blur-2xl"
        style={{ backgroundColor: glowColor, opacity: Math.min(0.55, 0.28 * glowIntensity) }}
      />
      <div className="relative h-full w-full overflow-hidden rounded-[29px] border border-white/15 bg-[#070b12] shadow-2xl">
        <img
          src={assetUrl}
          alt=""
          draggable={false}
          onError={onAssetError}
          className="absolute select-none"
          style={
            isStyleSheet
              ? {
                  height: "200%",
                  left: 0,
                  maxWidth: "none",
                  objectFit: "cover",
                  objectPosition: "top left",
                  top: 0,
                  width: "200%",
                }
              : {
                  height: "100%",
                  left: 0,
                  objectFit: "cover",
                  objectPosition: "50% 22%",
                  top: 0,
                  width: "100%",
                }
          }
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_10%,rgba(255,255,255,0.30),transparent_28%),linear-gradient(180deg,transparent_48%,rgba(4,8,13,0.72)_100%)]" />
        <motion.div
          className="absolute bottom-3 left-1/2 h-2 -translate-x-1/2 rounded-full"
          style={{ width: size * 0.46, backgroundColor: color }}
          animate={{ opacity: [0.35, 0.95, 0.35], scaleX: isListening ? [0.75, 1.18, 0.75] : 1 }}
          transition={{ duration: isListening ? 0.72 : 2.4, repeat: Infinity }}
        />
        {isCelebrating && (
          <motion.div
            className="absolute right-4 top-4 h-6 w-6 rounded-full border border-white/30 bg-white/20"
            animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          />
        )}
      </div>
    </motion.div>
  );
}

export default function AvatarCompanion() {
  const [settings, setSettings] = useState<AvatarSettings>(() => loadAvatarSettings());
  const [now, setNow] = useState(() => Date.now());
  const [failedAssetUrl, setFailedAssetUrl] = useState("");
  const activeThreadId = useAppStore((state) => state.activeThreadId);
  const threads = useAppStore((state) => state.threads);
  const isRecording = useAppStore((state) => state.isRecording);
  const isVoiceActive = useAppStore((state) => state.isVoiceActive);
  const dragOffsetRef = useRef<Point>({ x: 0, y: 0 });
  const dragPositionRef = useRef<Point | null>(settings.customPosition);
  const [dragging, setDragging] = useState(false);
  const [customPosition, setCustomPosition] = useState<Point | null>(() => settings.customPosition);

  useEffect(() => {
    const refresh = () => {
      const nextSettings = loadAvatarSettings();
      setSettings(nextSettings);
      setFailedAssetUrl("");
      setCustomPosition(nextSettings.customPosition);
      dragPositionRef.current = nextSettings.customPosition;
    };
    window.addEventListener(AVATAR_SETTINGS_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(AVATAR_SETTINGS_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const latestMessage = useMemo(() => {
    const activeThread = threads.find((thread) => thread.id === activeThreadId);
    return activeThread ? getLatestMessage(activeThread.messages) : null;
  }, [activeThreadId, threads]);

  if (!settings.enabled || settings.mode !== "browser-overlay") return null;

  const color = MOOD_COLORS[settings.mood];
  const effectiveMood = moodFromActivity(settings, latestMessage, isVoiceActive, isRecording, now);
  const effectiveColor = MOOD_COLORS[effectiveMood];
  const glowColor = settings.glowColor || effectiveColor;
  const glowIntensity = settings.glowIntensity;
  const avatarAssetUrl =
    settings.assetUrl === "__generated__"
      ? ""
      : settings.assetUrl || DEFAULT_SOPHIA_AVATAR_ASSET_URL;
  const visibleAssetUrl =
    avatarAssetUrl && avatarAssetUrl !== failedAssetUrl
      ? avatarAssetUrl
      : avatarAssetUrl !== DEFAULT_SOPHIA_AVATAR_ASSET_URL && failedAssetUrl !== DEFAULT_SOPHIA_AVATAR_ASSET_URL
        ? DEFAULT_SOPHIA_AVATAR_ASSET_URL
        : "";
  const usesDefaultStyleSheet = visibleAssetUrl === DEFAULT_SOPHIA_AVATAR_ASSET_URL;
  const position = customPosition
    ? clampPoint(customPosition, settings.size)
    : presetToPoint(settings.position, settings.size);

  const savePosition = (point: Point) => {
    const nextSettings = { ...settings, customPosition: point };
    setSettings(nextSettings);
    saveAvatarSettings(nextSettings);
  };

  return (
    <motion.div
      className="fixed z-50 select-none"
      style={{ left: position.x, top: position.y, opacity: settings.opacity }}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: settings.opacity, scale: dragging ? 1.03 : 1 }}
      transition={{ duration: 0.18 }}
    >
      <div className="relative flex flex-col items-center gap-2">
        <button
          type="button"
          className="flex cursor-grab items-center gap-1 rounded-full border border-white/10 bg-black/50 px-2.5 py-1 text-[10px] uppercase tracking-wider text-white/75 shadow-lg backdrop-blur-md active:cursor-grabbing"
          title="Drag Sophia"
          aria-label="Drag Sophia avatar"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            dragOffsetRef.current = {
              x: event.clientX - position.x,
              y: event.clientY - position.y,
            };
            setDragging(true);
          }}
          onPointerMove={(event) => {
            if (!dragging) return;
            const next = clampPoint(
              {
                x: event.clientX - dragOffsetRef.current.x,
                y: event.clientY - dragOffsetRef.current.y,
              },
              settings.size
            );
            setCustomPosition(next);
            dragPositionRef.current = next;
          }}
          onPointerUp={(event) => {
            event.currentTarget.releasePointerCapture(event.pointerId);
            setDragging(false);
            savePosition(dragPositionRef.current ?? position);
          }}
          onPointerCancel={() => setDragging(false)}
          onDoubleClick={() => {
            const nextSettings = { ...settings, customPosition: null };
            setCustomPosition(null);
            setSettings(nextSettings);
            saveAvatarSettings(nextSettings);
          }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: effectiveColor }} />
          drag
        </button>
        {visibleAssetUrl ? (
          <AvatarPortraitStage
            assetUrl={visibleAssetUrl}
            isStyleSheet={usesDefaultStyleSheet}
            mood={effectiveMood}
            color={effectiveColor}
            glowColor={glowColor}
            glowIntensity={glowIntensity}
            size={settings.size}
            onAssetError={() => setFailedAssetUrl(visibleAssetUrl)}
          />
        ) : (
          <SophiaFigure mood={effectiveMood} color={effectiveColor} size={settings.size} />
        )}
        <div className="rounded-full border border-white/10 bg-black/50 px-3 py-1 text-[10px] uppercase tracking-wider text-white/80 shadow-lg backdrop-blur-md">
          {settings.displayName} · {effectiveMood}
        </div>
      </div>
    </motion.div>
  );
}
