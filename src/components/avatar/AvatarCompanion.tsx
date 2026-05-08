"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useAppStore, type AvatarActivity, type ChatMessage } from "@/stores/appStore";
import {
  AVATAR_SETTINGS_UPDATED_EVENT,
  DEFAULT_SOPHIA_AVATAR_ASSET_URL,
  loadAvatarSettings,
  saveAvatarSettings,
  type AvatarMood,
  type AvatarRuntime,
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
const EXTERNAL_RUNTIME_MIN_WIDTH = 360;
const EXTERNAL_RUNTIME_MAX_WIDTH = 680;

type Point = { x: number; y: number };
type CompanionBounds = { width: number; height: number };

function getBuiltInBounds(size: number): CompanionBounds {
  return {
    width: Math.max(160, size + 52),
    height: size + 58,
  };
}

function getExternalRuntimeBounds(size: number): CompanionBounds {
  const width = Math.round(
    Math.min(EXTERNAL_RUNTIME_MAX_WIDTH, Math.max(EXTERNAL_RUNTIME_MIN_WIDTH, size * 2.85))
  );
  return {
    width,
    height: Math.round(Math.min(760, Math.max(420, width * 1.18))) + 58,
  };
}

function clampPoint(point: Point, bounds: CompanionBounds): Point {
  if (typeof window === "undefined") return point;
  return {
    x: Math.min(
      Math.max(AVATAR_POSITION_PADDING, point.x),
      Math.max(AVATAR_POSITION_PADDING, window.innerWidth - bounds.width - AVATAR_POSITION_PADDING)
    ),
    y: Math.min(
      Math.max(AVATAR_POSITION_PADDING, point.y),
      Math.max(AVATAR_POSITION_PADDING, window.innerHeight - bounds.height - AVATAR_POSITION_PADDING)
    ),
  };
}

function presetToPoint(position: AvatarSettings["position"], bounds: CompanionBounds): Point {
  if (typeof window === "undefined") return { x: 20, y: 20 };
  const offsets = POSITION_OFFSETS[position];
  return clampPoint(
    {
      x: offsets.left ?? window.innerWidth - bounds.width - (offsets.right ?? 20),
      y: offsets.top ?? window.innerHeight - bounds.height - (offsets.bottom ?? 20),
    },
    bounds
  );
}

function getLatestMessage(messages: ChatMessage[]) {
  return messages.reduce<ChatMessage | null>((latest, message) => {
    if (!latest || message.timestamp > latest.timestamp) return message;
    return latest;
  }, null);
}

function runtimeUrlForSettings(settings: AvatarSettings): string {
  if (settings.runtime === "openavatarchat") return settings.openAvatarChatUrl.trim();
  if (settings.runtime === "liteavatar") return settings.liteAvatarRuntimeUrl.trim();
  if (settings.runtime === "custom") return settings.desktopRuntimeUrl.trim();
  return "";
}

function runtimeLabel(runtime: AvatarRuntime): string {
  if (runtime === "openavatarchat") return "OpenAvatarChat";
  if (runtime === "liteavatar") return "LiteAvatar";
  if (runtime === "live2d") return "Live2D";
  if (runtime === "vrm") return "VRM";
  if (runtime === "custom") return "Custom";
  return "Built-in";
}

function moodFromActivity(
  settings: AvatarSettings,
  avatarActivity: AvatarActivity,
  latestMessage: ChatMessage | null,
  isVoiceActive: boolean,
  isRecording: boolean,
  now: number
): AvatarMood {
  if (avatarActivity === "listening" || avatarActivity === "transcribing") return "listening";
  if (avatarActivity === "pondering" || avatarActivity === "writing") return "thinking";
  if (avatarActivity === "speaking") return "speaking";
  if (avatarActivity === "celebrating") return "celebrating";
  if (avatarActivity === "alert") return "alert";
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
  activity,
  mood,
  color,
  glowColor,
  glowIntensity,
  size,
  onAssetError,
}: {
  assetUrl: string;
  isStyleSheet: boolean;
  activity: AvatarActivity;
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
  const isWriting = activity === "writing";
  const isPondering = activity === "pondering" || (mood === "thinking" && activity === "idle");
  const safeGlowIntensity = Math.min(1.25, Math.max(0, glowIntensity));

  return (
    <motion.div
      className="relative rounded-[30px] p-[1px]"
      style={{
        width: size,
        height: Math.round(size * 1.24),
        background: `linear-gradient(145deg, ${color}aa, rgba(255,255,255,0.18) 28%, rgba(14,20,31,0.95) 72%)`,
        filter: `drop-shadow(0 0 ${Math.round(24 * safeGlowIntensity)}px ${glowColor}${Math.round(
          130 * safeGlowIntensity
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
        style={{ backgroundColor: glowColor, opacity: Math.min(0.42, 0.2 * safeGlowIntensity) }}
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
        {(isWriting || isPondering) && (
          <motion.div
            className="absolute bottom-7 right-4 flex gap-1"
            aria-hidden="true"
          >
            {[0, 1, 2].map((item) => (
              <motion.span
                key={item}
                className="h-1.5 w-1.5 rounded-full bg-white/80"
                animate={
                  isWriting
                    ? { y: [0, -5, 0], opacity: [0.35, 1, 0.35] }
                    : { scale: [0.82, 1.25, 0.82], opacity: [0.28, 0.88, 0.28] }
                }
                transition={{ duration: isWriting ? 0.7 : 1.05, delay: item * 0.12, repeat: Infinity }}
              />
            ))}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

function ExternalAvatarRuntime({
  settings,
  mood,
  color,
  glowColor,
  glowIntensity,
  statusLabel,
  onCollapse,
}: {
  settings: AvatarSettings;
  mood: AvatarMood;
  color: string;
  glowColor: string;
  glowIntensity: number;
  statusLabel: string;
  onCollapse: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const runtimeUrl = runtimeUrlForSettings(settings);
  const safeGlowIntensity = Math.min(1.25, Math.max(0, glowIntensity));
  const frameWidth = Math.round(
    Math.min(EXTERNAL_RUNTIME_MAX_WIDTH, Math.max(EXTERNAL_RUNTIME_MIN_WIDTH, settings.size * 2.85))
  );
  const frameHeight = getExternalRuntimeBounds(settings.size).height - 58;
  const hasRuntimeUrl = runtimeUrl.startsWith("http://") || runtimeUrl.startsWith("https://");

  return (
    <motion.div
      className="overflow-hidden rounded-[24px] border border-white/15 bg-[#05080d]/92 shadow-2xl backdrop-blur-xl"
      style={{
        width: frameWidth,
        height: frameHeight,
        boxShadow: `0 0 ${Math.round(42 * safeGlowIntensity)}px ${glowColor}${Math.round(
          115 * safeGlowIntensity
        )
          .toString(16)
          .padStart(2, "0")}`,
      }}
      animate={{
        y: mood === "speaking" ? [0, -2, 0] : [0, -1, 0],
        borderColor: `${color}66`,
      }}
      transition={{ duration: mood === "speaking" ? 0.9 : 3.2, repeat: Infinity, ease: "easeInOut" }}
    >
      <div className="flex h-10 items-center justify-between border-b border-white/10 bg-black/55 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <span className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-white/82">
            {settings.displayName} · {runtimeLabel(settings.runtime)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-[10px] uppercase tracking-[0.14em] text-white/45 sm:inline">
            {statusLabel}
          </span>
          {hasRuntimeUrl && (
            <a
              href={runtimeUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-white/62 transition-colors hover:border-white/25 hover:text-white"
              title={`Open ${runtimeLabel(settings.runtime)} in a full tab`}
            >
              open
            </a>
          )}
          <button
            type="button"
            onClick={onCollapse}
            className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-white/62 transition-colors hover:border-white/25 hover:text-white"
            title="Collapse to built-in Sophia portrait"
          >
            mini
          </button>
        </div>
      </div>
      <div className="relative h-[calc(100%-2.5rem)] bg-black">
        {hasRuntimeUrl ? (
          <>
            {!loaded && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[#05080d] px-5 text-center">
                <div
                  className="h-8 w-8 rounded-full border border-white/10"
                  style={{ boxShadow: `0 0 28px ${color}88`, backgroundColor: `${color}33` }}
                />
                <p className="text-xs font-semibold text-white/78">Connecting {runtimeLabel(settings.runtime)}...</p>
                <p className="max-w-72 text-[11px] leading-relaxed text-white/42">
                  Start it with <span className="font-mono text-white/65">bun run avatar:openavatarchat</span> if the
                  frame stays empty.
                </p>
              </div>
            )}
            <iframe
              key={runtimeUrl}
              src={runtimeUrl}
              title={`${settings.displayName} ${runtimeLabel(settings.runtime)} runtime`}
              className="h-full w-full border-0"
              allow="camera; microphone; autoplay; clipboard-write; fullscreen; display-capture"
              referrerPolicy="no-referrer"
              onLoad={() => setLoaded(true)}
            />
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-5 text-center">
            <p className="text-xs font-semibold text-white/80">{runtimeLabel(settings.runtime)} needs a local URL.</p>
            <p className="max-w-72 text-[11px] leading-relaxed text-white/42">
              Add the runtime URL in Settings, then save avatar settings.
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function AvatarCompanion() {
  const [settings, setSettings] = useState<AvatarSettings>(() => loadAvatarSettings());
  const [now, setNow] = useState(() => Date.now());
  const [failedAssetUrl, setFailedAssetUrl] = useState("");
  const [externalCollapsed, setExternalCollapsed] = useState(false);
  const activeThreadId = useAppStore((state) => state.activeThreadId);
  const threads = useAppStore((state) => state.threads);
  const isRecording = useAppStore((state) => state.isRecording);
  const isVoiceActive = useAppStore((state) => state.isVoiceActive);
  const avatarActivity = useAppStore((state) => state.avatarActivity);
  const dragOffsetRef = useRef<Point>({ x: 0, y: 0 });
  const dragPositionRef = useRef<Point | null>(settings.customPosition);
  const [dragging, setDragging] = useState(false);
  const [customPosition, setCustomPosition] = useState<Point | null>(() => settings.customPosition);

  useEffect(() => {
    const refresh = () => {
      const nextSettings = loadAvatarSettings();
      setSettings(nextSettings);
      setFailedAssetUrl("");
      setExternalCollapsed(false);
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

  const effectiveMood = moodFromActivity(
    settings,
    avatarActivity,
    latestMessage,
    isVoiceActive,
    isRecording,
    now
  );
  const effectiveColor = MOOD_COLORS[effectiveMood];
  const statusLabel = avatarActivity === "idle" ? effectiveMood : avatarActivity;
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
  const usesStyleSheetCrop = visibleAssetUrl.includes("sophia-knight-pixar.png");
  const shouldUseExternalRuntime =
    !externalCollapsed &&
    (settings.runtime === "openavatarchat" || settings.runtime === "liteavatar" || settings.runtime === "custom");
  const companionBounds = shouldUseExternalRuntime
    ? getExternalRuntimeBounds(settings.size)
    : getBuiltInBounds(settings.size);
  const position = customPosition
    ? clampPoint(customPosition, companionBounds)
    : presetToPoint(settings.position, companionBounds);

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
              companionBounds
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
        {shouldUseExternalRuntime ? (
          <ExternalAvatarRuntime
            settings={settings}
            mood={effectiveMood}
            color={effectiveColor}
            glowColor={glowColor}
            glowIntensity={glowIntensity}
            statusLabel={statusLabel}
            onCollapse={() => setExternalCollapsed(true)}
          />
        ) : visibleAssetUrl ? (
          <AvatarPortraitStage
            assetUrl={visibleAssetUrl}
            isStyleSheet={usesStyleSheetCrop}
            activity={avatarActivity}
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
        <div className="flex items-center gap-2">
          <div className="rounded-full border border-white/10 bg-black/50 px-3 py-1 text-[10px] uppercase tracking-wider text-white/80 shadow-lg backdrop-blur-md">
            {settings.displayName} · {statusLabel}
          </div>
          {externalCollapsed && settings.runtime !== "built-in" && (
            <button
              type="button"
              onClick={() => setExternalCollapsed(false)}
              className="rounded-full border border-white/10 bg-black/50 px-3 py-1 text-[10px] uppercase tracking-wider text-white/70 shadow-lg backdrop-blur-md transition-colors hover:border-white/25 hover:text-white"
            >
              live
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
