"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowPathIcon,
  ArrowUpTrayIcon,
  MicrophoneIcon,
  PauseIcon,
  PlayIcon,
  StopIcon,
} from "@heroicons/react/24/outline";
import { Activity, FileAudio, Gauge, Waves } from "lucide-react";
import VoiceVisualizer from "@/components/animated/VoiceVisualizer";
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

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const wholeSeconds = Math.floor(seconds % 60);
  return `${minutes}:${String(wholeSeconds).padStart(2, "0")}`;
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
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [audioUrl]);

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
