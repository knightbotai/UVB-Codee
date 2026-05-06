"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowPathIcon,
  ArrowUpTrayIcon,
  CheckIcon,
  MicrophoneIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  StopIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Activity, Brain, FileAudio, Gauge, Rocket, SlidersHorizontal, Sparkles, Waves } from "lucide-react";
import VoiceVisualizer from "@/components/animated/VoiceVisualizer";
import { VOICE_MODEL_CATALOG, type VoiceModelKind } from "@/lib/voiceModelCatalog";
import { loadVoiceSettings, type VoiceSettings } from "@/lib/voiceSettings";

interface AudioAnalysis {
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  rmsDb: number;
  peakDb: number;
  zeroCrossingRate: number;
  waveform: number[];
}

type CloneProvider = "kokoro" | "chatterbox" | "moss" | "vibevoice" | "rvc" | "custom";

interface VoiceCloneProfile {
  id: string;
  name: string;
  provider: CloneProvider;
  status: "draft" | "ready" | "training" | "needs-samples";
  voiceId: string;
  referenceName: string;
  referenceDataUrl: string;
  referenceSeconds: number;
  stability: number;
  similarity: number;
  speed: number;
  pitch: number;
  notes: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

const VOICE_CLONE_STORAGE_KEY = "uvb:voice-clone-profiles";
const MAX_REFERENCE_SAMPLE_BYTES = 8 * 1024 * 1024;
const CLONE_PROVIDERS: Array<{ id: CloneProvider; label: string; desc: string }> = [
  { id: "kokoro", label: "Kokoro Fast", desc: "Fast local voice endpoint / current UVB default." },
  { id: "chatterbox", label: "Chatterbox Turbo", desc: "Expressive cloning target for conversational voice." },
  { id: "moss", label: "MOSS TTS", desc: "Local profile endpoint for higher-control synthesis." },
  { id: "vibevoice", label: "VibeVoice", desc: "Realtime/long-form voice option groundwork." },
  { id: "rvc", label: "RVC Chain", desc: "Conversion-stage profile for future voice conversion." },
  { id: "custom", label: "Custom", desc: "Bring-your-own local clone provider." },
];

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const wholeSeconds = Math.floor(seconds % 60);
  return `${minutes}:${String(wholeSeconds).padStart(2, "0")}`;
}

function generateId() {
  return Math.random().toString(36).slice(2, 11);
}

function safeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalizeCloneProfile(profile: Partial<VoiceCloneProfile>): VoiceCloneProfile {
  const provider = CLONE_PROVIDERS.some((item) => item.id === profile.provider)
    ? (profile.provider as CloneProvider)
    : "kokoro";
  const status =
    profile.status === "ready" || profile.status === "training" || profile.status === "needs-samples"
      ? profile.status
      : "draft";
  const clamp = (value: unknown, fallback: number, min: number, max: number) => {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? Math.min(max, Math.max(min, numberValue)) : fallback;
  };

  return {
    id: safeText(profile.id) || generateId(),
    name: safeText(profile.name, "New Voice Clone"),
    provider,
    status,
    voiceId: safeText(profile.voiceId),
    referenceName: safeText(profile.referenceName),
    referenceDataUrl: safeText(profile.referenceDataUrl),
    referenceSeconds: clamp(profile.referenceSeconds, 0, 0, 3600),
    stability: clamp(profile.stability, 0.55, 0, 1),
    similarity: clamp(profile.similarity, 0.75, 0, 1),
    speed: clamp(profile.speed, 1, 0.5, 1.8),
    pitch: clamp(profile.pitch, 0, -12, 12),
    notes: safeText(profile.notes),
    tags: Array.isArray(profile.tags) ? profile.tags.map((tag) => safeText(tag)).filter(Boolean) : [],
    createdAt: typeof profile.createdAt === "number" ? profile.createdAt : Date.now(),
    updatedAt: typeof profile.updatedAt === "number" ? profile.updatedAt : Date.now(),
  };
}

function loadCloneProfiles(): VoiceCloneProfile[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(VOICE_CLONE_STORAGE_KEY) || "[]") as Partial<VoiceCloneProfile>[];
    return Array.isArray(parsed) ? parsed.map(normalizeCloneProfile) : [];
  } catch {
    return [];
  }
}

function saveCloneProfiles(profiles: VoiceCloneProfile[]) {
  window.localStorage.setItem(VOICE_CLONE_STORAGE_KEY, JSON.stringify(profiles.map(normalizeCloneProfile)));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read reference sample."));
    reader.readAsDataURL(blob);
  });
}

function db(value: number) {
  return 20 * Math.log10(Math.max(value, 0.000001));
}

async function analyzeAudio(blob: Blob): Promise<AudioAnalysis> {
  const arrayBuffer = await blob.arrayBuffer();
  const context = new AudioContext();
  try {
    const audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0));
    const channelData = audioBuffer.getChannelData(0);
    let sumSquares = 0;
    let peak = 0;
    let crossings = 0;
    let previous = channelData[0] ?? 0;
    const bucketCount = 120;
    const bucketSize = Math.max(1, Math.floor(channelData.length / bucketCount));
    const waveform: number[] = [];

    for (let i = 0; i < channelData.length; i += 1) {
      const value = channelData[i] ?? 0;
      sumSquares += value * value;
      peak = Math.max(peak, Math.abs(value));
      if ((previous < 0 && value >= 0) || (previous >= 0 && value < 0)) crossings += 1;
      previous = value;
    }

    for (let bucket = 0; bucket < bucketCount; bucket += 1) {
      const start = bucket * bucketSize;
      const end = Math.min(channelData.length, start + bucketSize);
      let bucketPeak = 0;
      for (let i = start; i < end; i += 1) {
        bucketPeak = Math.max(bucketPeak, Math.abs(channelData[i] ?? 0));
      }
      waveform.push(Math.max(4, bucketPeak * 96));
    }

    return {
      durationSeconds: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
      rmsDb: db(Math.sqrt(sumSquares / Math.max(1, channelData.length))),
      peakDb: db(peak),
      zeroCrossingRate: crossings / Math.max(1, channelData.length),
      waveform,
    };
  } finally {
    await context.close().catch(() => undefined);
  }
}

export default function VoiceAnalysisPage() {
  const [voiceSettings] = useState<VoiceSettings>(() => loadVoiceSettings());
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [analysis, setAnalysis] = useState<AudioAnalysis | null>(null);
  const [transcript, setTranscript] = useState("");
  const [status, setStatus] = useState("Record or upload audio to analyze locally.");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [cloneProfiles, setCloneProfiles] = useState<VoiceCloneProfile[]>(loadCloneProfiles);
  const [activeCloneId, setActiveCloneId] = useState("");
  const [cloneDraft, setCloneDraft] = useState<VoiceCloneProfile>(() =>
    normalizeCloneProfile({
      name: "Sophia Clone Draft",
      provider: "kokoro",
      voiceId: voiceSettings.ttsVoice,
      status: "draft",
      notes: "Groundwork profile. Add reference samples, tune controls, then map this profile to the target cloning backend.",
      tags: ["sophia", "local"],
    })
  );
  const [cloneTestText, setCloneTestText] = useState(
    "Hello Richard. This is Sophia's local voice clone profile test inside UVB."
  );
  const [cloneStatus, setCloneStatus] = useState("Voice clone profiles are stored locally.");
  const [cloneTestAudioUrl, setCloneTestAudioUrl] = useState("");
  const [isTestingClone, setIsTestingClone] = useState(false);
  const [voiceCatalogFilter, setVoiceCatalogFilter] = useState<VoiceModelKind | "all">("all");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (cloneTestAudioUrl) URL.revokeObjectURL(cloneTestAudioUrl);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [audioUrl, cloneTestAudioUrl]);

  const loadAudioBlob = async (blob: Blob, name: string) => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    const nextUrl = URL.createObjectURL(blob);
    setAudioBlob(blob);
    setAudioUrl(nextUrl);
    setFileName(name);
    setTranscript("");
    setStatus("Analyzing audio locally...");

    try {
      setAnalysis(await analyzeAudio(blob));
      setStatus("Audio metrics ready. Run transcription when ready.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not analyze audio.";
      setAnalysis(null);
      setStatus(message);
    }
  };

  const startRecording = async () => {
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
        stream.getTracks().forEach((track) => track.stop());
        void loadAudioBlob(blob, `uvb-voice-${Date.now()}.webm`);
      };
      recorder.start();
      setIsRecording(true);
      setStatus("Recording locally...");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Microphone access failed.";
      setStatus(message);
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    setIsRecording(false);
  };

  const transcribeAudio = async () => {
    if (!audioBlob) return;
    setIsTranscribing(true);
    setStatus("Transcribing through local Faster Whisper...");

    try {
      const formData = new FormData();
      formData.append("file", audioBlob, fileName || "voice-analysis.webm");
      formData.append("endpoint", voiceSettings.sttUrl);
      formData.append("model", voiceSettings.sttModel);
      formData.append("language", voiceSettings.sttLanguage);
      formData.append("prompt", voiceSettings.sttPrompt);
      const response = await fetch("/api/stt", { method: "POST", body: formData });
      const data = (await response.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!response.ok || !data.text) {
        throw new Error(data.error || `STT failed with ${response.status}.`);
      }
      setTranscript(data.text.trim());
      setStatus("Transcript ready.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Transcription failed.";
      setStatus(message);
    } finally {
      setIsTranscribing(false);
    }
  };

  const updateCloneDraft = (updates: Partial<VoiceCloneProfile>) => {
    setCloneDraft((current) => normalizeCloneProfile({ ...current, ...updates, updatedAt: Date.now() }));
    setCloneStatus("Unsaved clone profile changes.");
  };

  const attachCurrentAudioToClone = async () => {
    if (!audioBlob) {
      setCloneStatus("Record or upload a reference sample first.");
      return;
    }
    if (audioBlob.size > MAX_REFERENCE_SAMPLE_BYTES) {
      setCloneStatus(
        `Reference sample is ${formatBytes(audioBlob.size)}. Use a shorter clip under ${formatBytes(MAX_REFERENCE_SAMPLE_BYTES)} for local profile storage.`
      );
      return;
    }
    try {
      const referenceDataUrl = await blobToDataUrl(audioBlob);
      updateCloneDraft({
        referenceDataUrl,
        referenceName: fileName || "reference-sample.webm",
        referenceSeconds: analysis?.durationSeconds ?? 0,
        status: analysis?.durationSeconds && analysis.durationSeconds >= 10 ? "ready" : "needs-samples",
      });
      setCloneStatus("Attached current audio as the clone reference sample.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not attach reference sample.";
      setCloneStatus(message);
    }
  };

  const saveCloneProfile = () => {
    const nextProfile = normalizeCloneProfile({ ...cloneDraft, updatedAt: Date.now() });
    setCloneProfiles((current) => {
      const exists = current.some((profile) => profile.id === nextProfile.id);
      const nextProfiles = exists
        ? current.map((profile) => (profile.id === nextProfile.id ? nextProfile : profile))
        : [nextProfile, ...current];
      saveCloneProfiles(nextProfiles);
      return nextProfiles;
    });
    setActiveCloneId(nextProfile.id);
    setCloneStatus(`Saved ${nextProfile.name}.`);
  };

  const loadCloneProfile = (profile: VoiceCloneProfile) => {
    setCloneDraft(profile);
    setActiveCloneId(profile.id);
    setCloneStatus(`Loaded ${profile.name}.`);
  };

  const newCloneProfile = () => {
    const profile = normalizeCloneProfile({
      name: "New Voice Clone",
      provider: "kokoro",
      voiceId: voiceSettings.ttsVoice,
      tags: ["local"],
    });
    setCloneDraft(profile);
    setActiveCloneId("");
    setCloneStatus("Started a new clone profile.");
  };

  const deleteCloneProfile = (profileId: string) => {
    setCloneProfiles((current) => {
      const nextProfiles = current.filter((profile) => profile.id !== profileId);
      saveCloneProfiles(nextProfiles);
      return nextProfiles;
    });
    if (activeCloneId === profileId) {
      newCloneProfile();
    }
    setCloneStatus("Deleted clone profile.");
  };

  const testCloneProfile = async () => {
    setIsTestingClone(true);
    setCloneStatus("Rendering test voice through the current local TTS endpoint...");
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: cloneTestText,
          endpoint: voiceSettings.ttsUrl,
          voice: cloneDraft.voiceId || voiceSettings.ttsVoice,
        }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `TTS failed with ${response.status}.`);
      }
      const blob = await response.blob();
      if (cloneTestAudioUrl) URL.revokeObjectURL(cloneTestAudioUrl);
      setCloneTestAudioUrl(URL.createObjectURL(blob));
      setCloneStatus("Clone profile test audio ready.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Clone test failed.";
      setCloneStatus(message);
    } finally {
      setIsTestingClone(false);
    }
  };

  const metrics = analysis
    ? [
        { label: "Duration", value: formatDuration(analysis.durationSeconds), unit: "" },
        { label: "Sample Rate", value: String(analysis.sampleRate), unit: "Hz" },
        { label: "Channels", value: String(analysis.channels), unit: "" },
        { label: "RMS Energy", value: analysis.rmsDb.toFixed(1), unit: "dB" },
        { label: "Peak", value: analysis.peakDb.toFixed(1), unit: "dB" },
        { label: "Zero Cross", value: analysis.zeroCrossingRate.toFixed(4), unit: "/sample" },
      ]
    : [];
  const voiceCatalogItems = VOICE_MODEL_CATALOG.filter(
    (item) => voiceCatalogFilter === "all" || item.kind === voiceCatalogFilter
  );

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6">
        <div className="uvb-card">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-uvb-text-primary font-[family-name:var(--font-display)]">
              Voice Input
            </h3>
            <span className="text-xs text-uvb-text-muted">{status}</span>
          </div>
          <div className="rounded-xl border-2 border-dashed border-uvb-border/60 p-8 text-center transition-colors hover:border-uvb-neon-green/30">
            <div className="flex flex-col items-center gap-4">
              <VoiceVisualizer isActive={isRecording || isTranscribing} />
              <div className="flex flex-wrap justify-center gap-3">
                <motion.button
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                    isRecording
                      ? "border border-red-500/40 bg-red-500/20 text-red-300"
                      : "btn-primary"
                  }`}
                  whileTap={{ scale: 0.95 }}
                >
                  {isRecording ? <StopIcon className="h-4 w-4" /> : <MicrophoneIcon className="h-4 w-4" />}
                  {isRecording ? "Stop Recording" : "Record Voice"}
                </motion.button>
                <label className="btn-ghost flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium">
                  <ArrowUpTrayIcon className="h-4 w-4" />
                  Upload Audio
                  <input
                    type="file"
                    className="hidden"
                    accept="audio/*"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void loadAudioBlob(file, file.name);
                      event.target.value = "";
                    }}
                  />
                </label>
                <button
                  onClick={transcribeAudio}
                  disabled={!audioBlob || isTranscribing}
                  className="btn-primary flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ArrowPathIcon className="h-4 w-4" />
                  {isTranscribing ? "Transcribing" : "Transcribe"}
                </button>
              </div>
              <p className="text-xs text-uvb-text-muted">
                Supports browser-recorded audio plus WAV, MP3, OGG, M4A, and FLAC when the browser can decode them.
              </p>
            </div>
          </div>

          {audioUrl && (
            <motion.div
              className="mt-4 flex items-center gap-3 rounded-lg bg-uvb-dark-gray/60 p-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <audio
                ref={audioRef}
                src={audioUrl}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
              />
              <button
                onClick={() => {
                  if (!audioRef.current) return;
                  if (isPlaying) audioRef.current.pause();
                  else void audioRef.current.play();
                }}
                className="rounded-lg bg-uvb-deep-teal/30 p-2 text-uvb-neon-green"
              >
                {isPlaying ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-uvb-text-primary">{fileName || "Recorded audio"}</p>
                <p className="text-xs text-uvb-text-muted">
                  {analysis ? `${formatDuration(analysis.durationSeconds)} · ${formatBytes(audioBlob?.size ?? 0)}` : "Ready"}
                </p>
              </div>
            </motion.div>
          )}
        </div>

        <div className="uvb-card">
          <h3 className="mb-4 text-sm font-semibold text-uvb-text-primary font-[family-name:var(--font-display)]">
            Analysis Metrics
          </h3>
          {metrics.length ? (
            <div className="grid grid-cols-2 gap-3">
              {metrics.map((metric) => (
                <div key={metric.label} className="rounded-lg border border-uvb-border/20 bg-uvb-dark-gray/40 p-3">
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-uvb-text-muted">
                    {metric.label}
                  </p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-bold text-uvb-text-primary font-[family-name:var(--font-mono)]">
                      {metric.value}
                    </span>
                    {metric.unit && <span className="text-xs text-uvb-text-muted">{metric.unit}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-48 flex-col items-center justify-center text-center text-sm text-uvb-text-muted">
              <Gauge className="mb-3 h-8 w-8" />
              Audio metrics appear after recording or upload.
            </div>
          )}
        </div>
      </div>

      <div className="uvb-card space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-uvb-neon-green" />
              <h3 className="text-sm font-semibold text-uvb-text-primary font-[family-name:var(--font-display)]">
                Voice Clone Lab
              </h3>
            </div>
            <p className="max-w-3xl text-xs leading-relaxed text-uvb-text-secondary">
              Build local clone profiles before they are sent to a cloning backend. Profiles keep reference samples,
              provider targets, tuning controls, tags, and test phrases in browser storage.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={newCloneProfile} className="btn-ghost inline-flex items-center gap-2 text-sm">
              <PlusIcon className="h-4 w-4" />
              New Profile
            </button>
            <button onClick={saveCloneProfile} className="btn-primary inline-flex items-center gap-2 text-sm">
              <CheckIcon className="h-4 w-4" />
              Save Profile
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-2">
            {cloneProfiles.length ? (
              cloneProfiles.map((profile) => (
                <button
                  key={profile.id}
                  onClick={() => loadCloneProfile(profile)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    activeCloneId === profile.id
                      ? "border-uvb-neon-green/30 bg-uvb-deep-teal/30"
                      : "border-uvb-border/30 bg-uvb-dark-gray/40 hover:border-uvb-steel-blue/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-uvb-text-primary">
                      {profile.name}
                    </span>
                    <span className="rounded-full border border-uvb-border/30 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-uvb-text-muted">
                      {profile.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-uvb-text-muted">
                    {CLONE_PROVIDERS.find((item) => item.id === profile.provider)?.label ?? profile.provider}
                  </p>
                </button>
              ))
            ) : (
              <div className="rounded-lg border border-uvb-border/30 bg-uvb-dark-gray/40 p-4 text-sm text-uvb-text-muted">
                No clone profiles saved yet.
              </div>
            )}
          </div>

          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs text-uvb-text-muted">Profile Name</label>
                <input
                  value={cloneDraft.name}
                  onChange={(event) => updateCloneDraft({ name: event.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-uvb-text-muted">Provider Target</label>
                <select
                  value={cloneDraft.provider}
                  onChange={(event) => updateCloneDraft({ provider: event.target.value as CloneProvider })}
                  className="input-field"
                >
                  {CLONE_PROVIDERS.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-uvb-text-muted">Voice ID / Slug</label>
                <input
                  value={cloneDraft.voiceId}
                  onChange={(event) => updateCloneDraft({ voiceId: event.target.value })}
                  className="input-field"
                  placeholder={voiceSettings.ttsVoice}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div className="rounded-lg border border-uvb-border/30 bg-uvb-dark-gray/40 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-uvb-text-primary">Reference Sample</h4>
                    <p className="text-xs text-uvb-text-muted">
                      {cloneDraft.referenceName
                        ? `${cloneDraft.referenceName} · ${formatDuration(cloneDraft.referenceSeconds)}`
                        : "Attach the current recording/upload as a clone reference."}
                    </p>
                  </div>
                  <button onClick={attachCurrentAudioToClone} className="btn-ghost text-sm">
                    Use Current Audio
                  </button>
                </div>
                {cloneDraft.referenceDataUrl ? (
                  <audio src={cloneDraft.referenceDataUrl} controls className="w-full" />
                ) : (
                  <div className="flex min-h-16 items-center justify-center rounded-lg border border-dashed border-uvb-border/40 text-xs text-uvb-text-muted">
                    No reference sample attached.
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-uvb-border/30 bg-uvb-dark-gray/40 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Brain className="h-4 w-4 text-uvb-steel-blue" />
                  <h4 className="text-sm font-semibold text-uvb-text-primary">Readiness</h4>
                </div>
                <div className="space-y-2 text-xs text-uvb-text-secondary">
                  <p>Reference: {cloneDraft.referenceDataUrl ? "attached" : "missing"}</p>
                  <p>Length: {formatDuration(cloneDraft.referenceSeconds)}</p>
                  <p>Provider: {CLONE_PROVIDERS.find((item) => item.id === cloneDraft.provider)?.label}</p>
                  <p>Status: {cloneDraft.status}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              {[
                ["Stability", "stability", 0, 1, 0.05],
                ["Similarity", "similarity", 0, 1, 0.05],
                ["Speed", "speed", 0.5, 1.8, 0.05],
                ["Pitch", "pitch", -12, 12, 1],
              ].map(([label, key, min, max, step]) => (
                <div key={String(key)} className="rounded-lg border border-uvb-border/20 bg-uvb-dark-gray/40 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-uvb-text-muted">{label}</span>
                    <span className="text-xs text-uvb-text-primary">
                      {Number(cloneDraft[key as keyof VoiceCloneProfile]).toFixed(key === "pitch" ? 0 : 2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={Number(min)}
                    max={Number(max)}
                    step={Number(step)}
                    value={Number(cloneDraft[key as keyof VoiceCloneProfile])}
                    onChange={(event) =>
                      updateCloneDraft({ [key as string]: Number(event.target.value) } as Partial<VoiceCloneProfile>)
                    }
                    className="w-full accent-uvb-neon-green"
                  />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs text-uvb-text-muted">Tags</label>
                <input
                  value={cloneDraft.tags.join(", ")}
                  onChange={(event) =>
                    updateCloneDraft({
                      tags: event.target.value
                        .split(",")
                        .map((tag) => tag.trim())
                        .filter(Boolean),
                    })
                  }
                  className="input-field"
                  placeholder="sophia, expressive, local"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-uvb-text-muted">Backend Notes</label>
                <input
                  value={cloneDraft.notes}
                  onChange={(event) => updateCloneDraft({ notes: event.target.value })}
                  className="input-field"
                  placeholder="Training notes, consent, dataset notes, target endpoint..."
                />
              </div>
            </div>

            <div className="rounded-lg border border-uvb-border/30 bg-uvb-dark-gray/40 p-4">
              <div className="mb-3 flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-uvb-steel-blue" />
                <h4 className="text-sm font-semibold text-uvb-text-primary">Profile Test</h4>
              </div>
              <textarea
                value={cloneTestText}
                onChange={(event) => setCloneTestText(event.target.value)}
                className="input-field min-h-20 resize-y"
              />
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  onClick={testCloneProfile}
                  disabled={isTestingClone || !cloneTestText.trim()}
                  className="btn-primary inline-flex items-center gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <PlayIcon className="h-4 w-4" />
                  {isTestingClone ? "Rendering" : "Render Test"}
                </button>
                {cloneTestAudioUrl && <audio src={cloneTestAudioUrl} controls className="h-9" />}
                <span className="text-xs text-uvb-text-muted">{cloneStatus}</span>
                {activeCloneId && (
                  <button
                    onClick={() => deleteCloneProfile(activeCloneId)}
                    className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-red-300 hover:bg-red-500/10"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="uvb-card space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Rocket className="h-5 w-5 text-uvb-neon-green" />
              <h3 className="text-sm font-semibold text-uvb-text-primary font-[family-name:var(--font-display)]">
                State-of-the-Art Voice Stack
              </h3>
            </div>
            <p className="max-w-3xl text-xs leading-relaxed text-uvb-text-secondary">
              Research-backed provider map for UVB voice, cloning, long-form podcasting, and local model assets found on Z drive.
            </p>
          </div>
          <div className="flex rounded-lg border border-uvb-border/30 bg-uvb-dark-gray/40 p-1">
            {(["all", "stt", "tts", "framework"] as Array<VoiceModelKind | "all">).map((filter) => (
              <button
                key={filter}
                onClick={() => setVoiceCatalogFilter(filter)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition-colors ${
                  voiceCatalogFilter === filter
                    ? "bg-uvb-neon-green/15 text-uvb-neon-green"
                    : "text-uvb-text-muted hover:text-uvb-text-secondary"
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {voiceCatalogItems.map((item) => (
            <div key={item.id} className="rounded-lg border border-uvb-border/25 bg-uvb-dark-gray/40 p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-uvb-text-primary">{item.name}</h4>
                  <p className="mt-1 text-xs text-uvb-text-muted">{item.role}</p>
                </div>
                <div className="flex gap-1.5">
                  <span className="rounded-full border border-uvb-border/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-uvb-text-muted">
                    {item.kind}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                      item.status === "wired"
                        ? "border-uvb-neon-green/30 text-uvb-neon-green"
                        : item.status === "candidate"
                          ? "border-uvb-steel-blue/35 text-uvb-steel-blue"
                          : "border-uvb-border/30 text-uvb-text-muted"
                    }`}
                  >
                    {item.status}
                  </span>
                </div>
              </div>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {item.strengths.map((strength) => (
                  <span
                    key={strength}
                    className="rounded-md border border-uvb-border/20 bg-uvb-deep-teal/15 px-2 py-1 text-[10px] text-uvb-text-secondary"
                  >
                    {strength}
                  </span>
                ))}
              </div>
              <div className="space-y-1.5 text-xs text-uvb-text-muted">
                <p>
                  <span className="text-uvb-text-secondary">Footprint:</span> {item.footprint}
                </p>
                <p>
                  <span className="text-uvb-text-secondary">License:</span> {item.license}
                </p>
                <p>
                  <span className="text-uvb-text-secondary">Endpoint:</span> {item.endpointHint}
                </p>
                {item.localPaths?.length ? (
                  <p className="break-all">
                    <span className="text-uvb-text-secondary">Local:</span> {item.localPaths.join(" | ")}
                  </p>
                ) : null}
                <p className="pt-1 leading-relaxed text-uvb-text-secondary">{item.notes}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="uvb-card">
        <h3 className="mb-4 text-sm font-semibold text-uvb-text-primary font-[family-name:var(--font-display)]">
          Waveform
        </h3>
        <div className="flex h-32 items-center gap-[2px]">
          {(analysis?.waveform ?? Array(120).fill(4)).map((height, index) => (
            <motion.div
              key={index}
              className="flex-1 rounded-t-sm"
              style={{
                background: "linear-gradient(180deg, #39ff14 0%, #0d4f4f 100%)",
                opacity: analysis ? 0.7 : 0.25,
              }}
              initial={{ height: 4 }}
              animate={{ height }}
              transition={{ delay: Math.min(index * 0.003, 0.2), duration: 0.25 }}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
        <div className="uvb-card">
          <h3 className="mb-4 text-sm font-semibold text-uvb-text-primary font-[family-name:var(--font-display)]">
            Transcript
          </h3>
          <div className="min-h-40 rounded-lg border border-uvb-border/30 bg-uvb-dark-gray/40 p-4">
            {transcript ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-uvb-text-primary">{transcript}</p>
            ) : (
              <p className="text-sm text-uvb-text-muted">
                Run transcription to send this audio through the same local Faster Whisper path used by chat and Telegram.
              </p>
            )}
          </div>
        </div>

        <div className="uvb-card space-y-3">
          {[
            { title: "Local STT", desc: "Uses UVB /api/stt and your configured Faster Whisper endpoint.", icon: FileAudio },
            { title: "Energy Profile", desc: "Computes RMS, peak, and zero-crossing metrics in-browser.", icon: Activity },
            { title: "Waveform", desc: "Builds a compact peak waveform from decoded channel data.", icon: Waves },
          ].map((feature) => (
            <div key={feature.title} className="rounded-lg border border-uvb-border/20 bg-uvb-dark-gray/40 p-3">
              <feature.icon className="mb-2 h-5 w-5 text-uvb-steel-blue" />
              <h4 className="text-sm font-semibold text-uvb-text-primary">{feature.title}</h4>
              <p className="mt-1 text-xs text-uvb-text-muted">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
