"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore, type PodcastSeat } from "@/stores/appStore";
import {
  PlayIcon,
  PauseIcon,
  StopIcon,
  MicrophoneIcon,
  PlusIcon,
  TrashIcon,
  Cog6ToothIcon,
  SpeakerWaveIcon,
} from "@heroicons/react/24/outline";
import { Radio, Mic2, Headphones, Users } from "lucide-react";
import VoiceVisualizer from "@/components/animated/VoiceVisualizer";
import { VOICE_MODEL_CATALOG } from "@/lib/voiceModelCatalog";

const VOICE_CLONE_STORAGE_KEY = "uvb:voice-clone-profiles";
const VOICE_CLONE_UPDATED_EVENT = "uvb:voice-clone-profiles-updated";

interface CloneProfileSummary {
  id: string;
  name: string;
  provider: string;
}

function loadCloneProfiles(): CloneProfileSummary[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(VOICE_CLONE_STORAGE_KEY) || "[]") as Array<Partial<CloneProfileSummary>>;
    return Array.isArray(parsed)
      ? parsed
          .map((profile) => ({
            id: typeof profile.id === "string" ? profile.id : "",
            name: typeof profile.name === "string" ? profile.name : "Unnamed Clone",
            provider: typeof profile.provider === "string" ? profile.provider : "local",
          }))
          .filter((profile) => profile.id)
      : [];
  } catch {
    return [];
  }
}

export default function PodcastStudioPage() {
  const { podcastSeats, updatePodcastSeat, addPodcastSeat, removePodcastSeat } =
    useAppStore();
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [masterVolume, setMasterVolume] = useState(80);
  const [noiseGate, setNoiseGate] = useState(-30);
  const [outputFormat, setOutputFormat] = useState("WAV 48kHz / 24-bit");
  const [synthesisEngine, setSynthesisEngine] = useState("vibevoice-tts-1.5b");
  const [renderMode, setRenderMode] = useState("Long-form multi-speaker");
  const [cloneProfiles, setCloneProfiles] = useState<CloneProfileSummary[]>(loadCloneProfiles);
  const [recordingStatus, setRecordingStatus] = useState("Ready for local session capture.");
  const [recordingUrl, setRecordingUrl] = useState("");
  const [recordingName, setRecordingName] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const podcastVoiceEngines = VOICE_MODEL_CATALOG.filter(
    (item) =>
      item.kind === "tts" &&
      ["wired", "candidate"].includes(item.status) &&
      (item.id.includes("vibevoice") ||
        item.id.includes("chatterbox") ||
        item.id.includes("kokoro") ||
        item.id.includes("cosyvoice") ||
        item.id.includes("spark"))
  );

  useEffect(() => {
    if (!isRecording || isPaused) return;
    const interval = window.setInterval(() => setRecordingTime((current) => current + 1), 1000);
    return () => window.clearInterval(interval);
  }, [isRecording, isPaused]);

  useEffect(() => {
    const refreshProfiles = () => setCloneProfiles(loadCloneProfiles());
    window.addEventListener("storage", refreshProfiles);
    window.addEventListener(VOICE_CLONE_UPDATED_EVENT, refreshProfiles);
    return () => {
      window.removeEventListener("storage", refreshProfiles);
      window.removeEventListener(VOICE_CLONE_UPDATED_EVENT, refreshProfiles);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [recordingUrl]);

  const startSessionRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const nextUrl = URL.createObjectURL(blob);
        if (recordingUrl) URL.revokeObjectURL(recordingUrl);
        setRecordingUrl(nextUrl);
        setRecordingName(`uvb-podcast-session-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`);
        setRecordingStatus("Local session recording ready.");
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.start(1000);
      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);
      setRecordingStatus("Recording local microphone session...");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Microphone capture failed.";
      setRecordingStatus(message);
      setIsRecording(false);
    }
  };

  const stopSessionRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setIsRecording(false);
    setIsPaused(false);
  };

  const togglePauseRecording = () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") {
      recorder.pause();
      setIsPaused(true);
      setRecordingStatus("Recording paused.");
    } else if (recorder.state === "paused") {
      recorder.resume();
      setIsPaused(false);
      setRecordingStatus("Recording local microphone session...");
    }
  };

  const addSeat = () => {
    if (podcastSeats.length < 6) {
      addPodcastSeat({
        id: Math.random().toString(36).substring(2, 9),
        name: `Guest ${podcastSeats.length}`,
        isActive: false,
        isCustomVoice: false,
      });
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Header with controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <Radio className="w-6 h-6 text-uvb-neon-green" />
            <h3 className="text-lg font-bold text-uvb-text-primary font-[family-name:var(--font-display)]">
              Podcast Studio
            </h3>
          </div>
          {isRecording && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/30">
              <span className="w-2 h-2 rounded-full bg-red-500 status-pulse" />
              <span className="text-xs text-red-400 font-mono">
                {Math.floor(recordingTime / 60)
                  .toString()
                  .padStart(2, "0")}
                :{(recordingTime % 60).toString().padStart(2, "0")}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={isRecording ? stopSessionRecording : startSessionRecording}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              isRecording
                ? "bg-red-500/20 border border-red-500/40 text-red-400"
                : "btn-primary"
            }`}
          >
            {isRecording ? (
              <>
                <StopIcon className="w-4 h-4" /> Stop
              </>
            ) : (
              <>
                <PlayIcon className="w-4 h-4" /> Start Recording
              </>
            )}
          </button>
          {isRecording && (
            <button
              onClick={togglePauseRecording}
              className="btn-ghost flex items-center gap-2"
            >
              {isPaused ? (
                <PlayIcon className="w-4 h-4" />
              ) : (
                <PauseIcon className="w-4 h-4" />
              )}
              {isPaused ? "Resume" : "Pause"}
            </button>
          )}
        </div>
      </div>

      <div className="uvb-card">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h4 className="text-sm font-semibold text-uvb-text-primary font-[family-name:var(--font-display)]">
              Local Session Capture
            </h4>
            <p className="mt-1 text-xs text-uvb-text-muted">{recordingStatus}</p>
          </div>
          {recordingUrl && (
            <a
              href={recordingUrl}
              download={recordingName || "uvb-podcast-session.webm"}
              className="btn-ghost text-sm"
            >
              Export Recording
            </a>
          )}
        </div>
        {recordingUrl && <audio src={recordingUrl} controls className="mt-4 w-full" />}
      </div>

      {/* Seats grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence>
          {podcastSeats.map((seat, index) => (
            <motion.div
              key={seat.id}
              className="uvb-card relative"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ delay: index * 0.1 }}
            >
              {/* Seat header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      index === 0
                        ? "bg-uvb-royal-purple/30"
                        : "bg-uvb-deep-teal/30"
                    }`}
                  >
                    {index === 0 ? (
                      <Mic2 className="w-4 h-4 text-uvb-accent-yellow" />
                    ) : (
                      <Headphones className="w-4 h-4 text-uvb-steel-blue" />
                    )}
                  </div>
                  <input
                    type="text"
                    value={seat.name}
                    onChange={(e) =>
                      updatePodcastSeat(seat.id, { name: e.target.value })
                    }
                    className="bg-transparent text-sm font-semibold text-uvb-text-primary outline-none border-b border-transparent hover:border-uvb-border focus:border-uvb-neon-green/40 transition-colors w-28"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() =>
                      updatePodcastSeat(seat.id, { isActive: !seat.isActive })
                    }
                    className={`p-1.5 rounded-lg transition-colors ${
                      seat.isActive
                        ? "bg-uvb-neon-green/10 text-uvb-neon-green"
                        : "text-uvb-text-muted hover:text-uvb-text-secondary"
                    }`}
                  >
                    <MicrophoneIcon className="w-4 h-4" />
                  </button>
                  {index > 0 && (
                    <button
                      onClick={() => removePodcastSeat(seat.id)}
                      className="p-1.5 rounded-lg text-uvb-text-muted hover:text-red-400 transition-colors"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Voice visualizer */}
              <div className="mb-4">
                <VoiceVisualizer isActive={seat.isActive && isRecording} />
              </div>

              {/* Voice profile */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-uvb-text-muted uppercase tracking-wider">
                    Voice Profile
                  </span>
                  <button className="p-1 rounded text-uvb-text-muted hover:text-uvb-text-secondary">
                    <Cog6ToothIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className="input-field text-xs py-1.5 flex-1"
                    value={seat.voiceProfileId ?? (seat.isCustomVoice ? "custom" : "default")}
                    onChange={(e) =>
                      updatePodcastSeat(seat.id, {
                        isCustomVoice: e.target.value === "custom",
                        voiceProfileId: e.target.value,
                      })
                    }
                  >
                    <option value="default">Default Voice</option>
                    <option value="custom">Custom Clone</option>
                    {cloneProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        Clone: {profile.name}
                      </option>
                    ))}
                    <option value="preset-1">Preset: Warm Male</option>
                    <option value="preset-2">Preset: Bright Female</option>
                    <option value="preset-3">Preset: Deep Narrator</option>
                  </select>
                </div>
                {seat.isCustomVoice && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="p-2 rounded-lg bg-uvb-dark-gray/40 border border-uvb-border/20"
                  >
                    <p className="text-[10px] text-uvb-text-muted mb-2">
                      Create and save clone profiles in Voice Analysis, then select them here.
                    </p>
                    <button
                      onClick={() => useAppStore.getState().setActiveSection("voice")}
                      className="btn-ghost text-xs cursor-pointer inline-flex items-center gap-1"
                    >
                      <SpeakerWaveIcon className="w-3 h-3" />
                      Open Clone Lab
                    </button>
                  </motion.div>
                )}
              </div>

              {/* Status indicator */}
              <div className="absolute top-3 right-3">
                <span
                  className={`w-2.5 h-2.5 rounded-full block ${
                    seat.isActive
                      ? "bg-uvb-neon-green status-pulse"
                      : "bg-uvb-text-muted/30"
                  }`}
                />
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Add seat button */}
        {podcastSeats.length < 6 && (
          <motion.button
            onClick={addSeat}
            className="border-2 border-dashed border-uvb-border/40 rounded-xl p-8 flex flex-col items-center justify-center gap-2 hover:border-uvb-neon-green/30 transition-colors group"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <PlusIcon className="w-8 h-8 text-uvb-text-muted group-hover:text-uvb-neon-green transition-colors" />
            <span className="text-sm text-uvb-text-muted group-hover:text-uvb-text-secondary">
              Add Seat
            </span>
          </motion.button>
        )}
      </div>

      {/* Mix controls */}
      <div className="uvb-card">
        <h4 className="text-sm font-semibold mb-4 text-uvb-text-primary font-[family-name:var(--font-display)]">
          Mix Controls
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-6">
          <div>
            <label className="text-xs text-uvb-text-muted block mb-2">
              Master Volume
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={masterVolume}
              onChange={(event) => setMasterVolume(Number(event.target.value))}
              className="w-full accent-uvb-neon-green"
            />
            <div className="flex justify-between text-[10px] text-uvb-text-muted mt-1">
              <span>0</span>
              <span>{masterVolume}</span>
              <span>100</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-uvb-text-muted block mb-2">
              Output Format
            </label>
            <select
              className="input-field text-sm"
              value={outputFormat}
              onChange={(event) => setOutputFormat(event.target.value)}
            >
              <option>WAV 48kHz / 24-bit</option>
              <option>FLAC 44.1kHz / 16-bit</option>
              <option>MP3 320kbps</option>
              <option>OGG Vorbis</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-uvb-text-muted block mb-2">
              Noise Gate
            </label>
            <input
              type="range"
              min="-60"
              max="0"
              value={noiseGate}
              onChange={(event) => setNoiseGate(Number(event.target.value))}
              className="w-full accent-uvb-steel-blue"
            />
            <div className="flex justify-between text-[10px] text-uvb-text-muted mt-1">
              <span>-60dB</span>
              <span>{noiseGate}dB</span>
              <span>0dB</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-uvb-text-muted block mb-2">
              Synthesis Engine
            </label>
            <select
              className="input-field text-sm"
              value={synthesisEngine}
              onChange={(event) => setSynthesisEngine(event.target.value)}
            >
              {podcastVoiceEngines.map((engine) => (
                <option key={engine.id} value={engine.id}>
                  {engine.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-uvb-text-muted block mb-2">
              Render Mode
            </label>
            <select
              className="input-field text-sm"
              value={renderMode}
              onChange={(event) => setRenderMode(event.target.value)}
            >
              <option>Long-form multi-speaker</option>
              <option>Realtime streaming</option>
              <option>Agent voice reply</option>
              <option>Clone quality benchmark</option>
            </select>
          </div>
        </div>
      </div>

      <div className="uvb-card">
        <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h4 className="text-sm font-semibold text-uvb-text-primary font-[family-name:var(--font-display)]">
              Podcast Voice Pipeline
            </h4>
            <p className="mt-1 text-xs text-uvb-text-muted">
              VibeVoice is the long-form podcast lane. Chatterbox Turbo is the low-latency clone lane. Kokoro remains the fast fallback.
            </p>
          </div>
          <span className="rounded-full border border-uvb-steel-blue/30 px-3 py-1 text-[10px] uppercase tracking-wider text-uvb-steel-blue">
            {renderMode}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {podcastVoiceEngines.slice(0, 6).map((engine) => (
            <button
              key={engine.id}
              onClick={() => setSynthesisEngine(engine.id)}
              className={`rounded-lg border p-3 text-left transition-colors ${
                synthesisEngine === engine.id
                  ? "border-uvb-neon-green/35 bg-uvb-deep-teal/30"
                  : "border-uvb-border/25 bg-uvb-dark-gray/40 hover:border-uvb-steel-blue/35"
              }`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-uvb-text-primary">{engine.name}</span>
                <span className="rounded-full border border-uvb-border/30 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-uvb-text-muted">
                  {engine.status}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-uvb-text-muted">{engine.notes}</p>
              {engine.localPaths?.length ? (
                <p className="mt-2 truncate text-[10px] text-uvb-text-muted">{engine.localPaths[0]}</p>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {/* Info */}
      <div className="flex items-center gap-3 p-4 rounded-lg bg-uvb-deep-teal/10 border border-uvb-deep-teal/20">
        <Users className="w-5 h-5 text-uvb-steel-blue flex-shrink-0" />
        <p className="text-xs text-uvb-text-secondary">
          Podcast creation with up to 6 configurable seats, real local session
          capture, saved clone-profile selection, and staged routing for
          VibeVoice, Chatterbox Turbo, and Kokoro provider backends.
        </p>
      </div>
    </div>
  );
}
