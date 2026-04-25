"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  MicrophoneIcon,
  ArrowUpTrayIcon,
  PlayIcon,
  PauseIcon,
  ChartBarIcon,
} from "@heroicons/react/24/outline";
import { Activity, Waves, TrendingUp } from "lucide-react";
import VoiceVisualizer from "@/components/animated/VoiceVisualizer";

const WAVEFORM_HEIGHTS = Array(120)
  .fill(0)
  .map((_, i) => {
    const noise = ((i * 7 + 13) % 17) / 17;
    return Math.sin(i * 0.15) * 30 + Math.sin(i * 0.08) * 20 + noise * 10 + 10;
  });

interface MetricCard {
  label: string;
  value: string;
  unit: string;
  trend?: "up" | "down" | "stable";
}

const SAMPLE_METRICS: MetricCard[] = [
  { label: "Fundamental Freq", value: "185", unit: "Hz", trend: "stable" },
  { label: "Spectral Centroid", value: "2840", unit: "Hz", trend: "up" },
  { label: "RMS Energy", value: "-12.4", unit: "dB", trend: "stable" },
  { label: "Zero Crossing Rate", value: "0.083", unit: "/sample", trend: "down" },
  { label: "Spectral Rolloff", value: "6200", unit: "Hz", trend: "up" },
  { label: "MFCC Coefficients", value: "13", unit: "bands", trend: "stable" },
];

const ANALYSIS_FEATURES = [
  {
    title: "Pitch Analysis",
    description: "Fundamental frequency tracking with octave mapping",
    icon: TrendingUp,
  },
  {
    title: "Spectral Analysis",
    description: "Frequency domain decomposition and harmonic profiling",
    icon: ChartBarIcon,
  },
  {
    title: "Voice Quality",
    description: "Jitter, shimmer, and HNR measurements",
    icon: Activity,
  },
  {
    title: "Audio Restoration",
    description: "Noise reduction, remastering, and enhancement",
    icon: Waves,
  },
];

export default function VoiceAnalysisPage() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Upload / Record Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recorder */}
        <div className="uvb-card">
          <h3 className="text-sm font-semibold mb-4 text-uvb-text-primary font-[family-name:var(--font-display)]">
            Voice Input
          </h3>
          <div className="border-2 border-dashed border-uvb-border/60 rounded-xl p-8 text-center hover:border-uvb-neon-green/30 transition-colors">
            <div className="flex flex-col items-center gap-4">
              <VoiceVisualizer isActive={isRecording} />
              <div className="flex gap-3">
                <motion.button
                  onClick={() => {
                    setIsRecording(!isRecording);
                    if (!isRecording) setHasAudio(true);
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    isRecording
                      ? "bg-red-500/20 border border-red-500/40 text-red-400"
                      : "btn-primary"
                  }`}
                  whileTap={{ scale: 0.95 }}
                >
                  <MicrophoneIcon className="w-4 h-4" />
                  {isRecording ? "Stop Recording" : "Record Voice"}
                </motion.button>
                <label className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium btn-ghost cursor-pointer">
                  <ArrowUpTrayIcon className="w-4 h-4" />
                  Upload
                  <input type="file" className="hidden" accept="audio/*" />
                </label>
              </div>
              <p className="text-xs text-uvb-text-muted">
                Supports WAV, MP3, FLAC, OGG, M4A
              </p>
            </div>
          </div>

          {/* Playback */}
          {hasAudio && (
            <motion.div
              className="mt-4 flex items-center gap-3 p-3 rounded-lg bg-uvb-dark-gray/60"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="p-2 rounded-lg bg-uvb-deep-teal/30 text-uvb-neon-green"
              >
                {isPlaying ? (
                  <PauseIcon className="w-4 h-4" />
                ) : (
                  <PlayIcon className="w-4 h-4" />
                )}
              </button>
              <div className="flex-1 h-1 bg-uvb-light-gray rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-uvb-neon-green to-uvb-deep-teal rounded-full"
                  initial={{ width: "0%" }}
                  animate={{ width: isPlaying ? "100%" : "35%" }}
                  transition={{ duration: isPlaying ? 30 : 0.3 }}
                />
              </div>
              <span className="text-xs text-uvb-text-muted">0:00 / 0:30</span>
            </motion.div>
          )}
        </div>

        {/* Metrics */}
        <div className="uvb-card">
          <h3 className="text-sm font-semibold mb-4 text-uvb-text-primary font-[family-name:var(--font-display)]">
            Analysis Metrics
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {SAMPLE_METRICS.map((metric) => (
              <div
                key={metric.label}
                className="p-3 rounded-lg bg-uvb-dark-gray/40 border border-uvb-border/20"
              >
                <p className="text-[10px] text-uvb-text-muted mb-1 uppercase tracking-wider">
                  {metric.label}
                </p>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-bold text-uvb-text-primary font-[family-name:var(--font-mono)]">
                    {metric.value}
                  </span>
                  <span className="text-xs text-uvb-text-muted">
                    {metric.unit}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Analysis Features */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {ANALYSIS_FEATURES.map((feature, i) => (
          <motion.div
            key={feature.title}
            className="uvb-card cursor-pointer group"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            whileHover={{ y: -4 }}
          >
            <feature.icon className="w-8 h-8 text-uvb-steel-blue mb-3 group-hover:text-uvb-neon-green transition-colors" />
            <h4 className="text-sm font-semibold text-uvb-text-primary mb-1">
              {feature.title}
            </h4>
            <p className="text-xs text-uvb-text-muted">{feature.description}</p>
          </motion.div>
        ))}
      </div>

      {/* Waveform display */}
      <div className="uvb-card">
        <h3 className="text-sm font-semibold mb-4 text-uvb-text-primary font-[family-name:var(--font-display)]">
          Waveform Visualization
        </h3>
        <div className="h-32 flex items-center gap-[2px]">
          {WAVEFORM_HEIGHTS.map((height, i) => (
                <motion.div
                  key={i}
                  className="flex-1 rounded-t-sm"
                  style={{
                    background: `linear-gradient(180deg, #39ff14 0%, #0d4f4f 100%)`,
                    opacity: 0.6,
                  }}
                  initial={{ height: 4 }}
                  animate={{ height: hasAudio ? height : 4 }}
                  transition={{ delay: i * 0.01, duration: 0.3 }}
                />
              ))}
        </div>
      </div>
    </div>
  );
}
