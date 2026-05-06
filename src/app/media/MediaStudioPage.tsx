"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import {
  PhotoIcon,
  FilmIcon,
  ArrowUpTrayIcon,
  SparklesIcon,
  EyeIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";
import { ImageIcon, Video, FileText } from "lucide-react";

type MediaTab = "image" | "video";

interface AnalysisResult {
  type: string;
  content: string;
}

interface StoryboardFrame {
  index: number;
  timestamp: string;
  dataUrl: string;
}

const IMAGE_CAPTION_SAMPLE =
  "A futuristic control room with holographic displays showing real-time data streams. Multiple workstations are arranged in a circular pattern, each with glowing cyan interfaces. The room has a dark metallic aesthetic with subtle blue accent lighting. A central holographic globe displays rotating network connections.";

const VIDEO_UNDERSTANDING_SAMPLE =
  "Scene 1 (0:00-0:05): Wide establishing shot of a technology workspace. Camera slowly pans across multiple monitors displaying code.\nScene 2 (0:05-0:12): Close-up of hands typing on a mechanical keyboard with RGB backlighting.\nScene 3 (0:12-0:20): Person interacting with a holographic interface, making gesture-based selections.\nScene 4 (0:20-0:30): Pull-back shot revealing the full command center with multiple AI dashboards active.";

export default function MediaStudioPage() {
  const [activeTab, setActiveTab] = useState<MediaTab>("image");
  const [hasMedia, setHasMedia] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState("");
  const [storyboardFrames, setStoryboardFrames] = useState<StoryboardFrame[]>([]);
  const [analysisError, setAnalysisError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
    };
  }, [mediaPreviewUrl]);

  const resetMedia = () => {
    if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
    setMediaPreviewUrl("");
    setSelectedFileName("");
    setStoryboardFrames([]);
    setResults([]);
    setHasMedia(false);
    setIsAnalyzing(false);
    setAnalysisError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const analyzeDemoImage = () => {
    setHasMedia(true);
    setIsAnalyzing(true);
    setTimeout(() => {
      setIsAnalyzing(false);
      setResults([
        { type: "Caption", content: IMAGE_CAPTION_SAMPLE },
        {
          type: "Objects Detected",
          content: "Monitors (6), Keyboard (1), Desk (1), Holographic display (1), Person (1), Globe model (1)",
        },
        {
          type: "Scene Classification",
          content: "Technology workspace / Command center (confidence: 96.2%)",
        },
        {
          type: "Dominant Colors",
          content: "Cyan (#00bcd4), Dark navy (#0a1628), Silver (#c0c0c0), Blue (#2196f3)",
        },
        {
          type: "Text Detected (OCR)",
          content: '"SYSTEMS ONLINE" - "KNIGHTBOT CORE v0.1" - "MEMORY: 64GB" - "GPU: ACTIVE"',
        },
      ]);
    }, 2000);
  };

  const handleAnalyze = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setAnalysisError("");
    setStoryboardFrames([]);
    setResults([]);
    setSelectedFileName(file.name);
    setHasMedia(true);
    setIsAnalyzing(true);
    if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
    setMediaPreviewUrl(URL.createObjectURL(file));

    if (activeTab === "image") {
      analyzeDemoImage();
      return;
    }

    const payload = new FormData();
    payload.append("file", file, file.name);
    payload.append(
      "prompt",
      "Describe the essence of this video with attention to timeline, scene changes, mood, actions, visual details, and audio."
    );

    try {
      const response = await fetch("/api/media/video", {
        method: "POST",
        body: payload,
      });
      const data = (await response.json().catch(() => ({}))) as {
        analysis?: string;
        transcript?: string;
        durationSeconds?: number;
        frames?: StoryboardFrame[];
        error?: string;
      };

      if (!response.ok || !data.analysis) {
        throw new Error(data.error || `Video analysis failed with ${response.status}.`);
      }

      setStoryboardFrames(data.frames ?? []);
      setResults([
        { type: "Sophia Video Analysis", content: data.analysis },
        {
          type: "Audio Transcript",
          content: data.transcript?.trim() || "No audio transcript was available.",
        },
        {
          type: "Storyboard",
          content: data.frames?.length
            ? `${data.frames.length} frames sampled across ${data.durationSeconds?.toFixed(1) ?? "unknown"} seconds.`
            : "No frames were extracted.",
        },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown video analysis error.";
      setAnalysisError(message);
      setResults([{ type: "Analysis Error", content: message }]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Tab switcher */}
      <div className="flex gap-2">
        <button
          onClick={() => {
            setActiveTab("image");
            resetMedia();
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "image"
              ? "bg-uvb-deep-teal/30 text-uvb-neon-green border border-uvb-neon-green/20"
              : "text-uvb-text-secondary hover:text-uvb-text-primary hover:bg-uvb-light-gray/30"
          }`}
        >
          <PhotoIcon className="w-4 h-4" />
          Image Captioning
        </button>
        <button
          onClick={() => {
            setActiveTab("video");
            resetMedia();
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "video"
              ? "bg-uvb-deep-teal/30 text-uvb-neon-green border border-uvb-neon-green/20"
              : "text-uvb-text-secondary hover:text-uvb-text-primary hover:bg-uvb-light-gray/30"
          }`}
        >
          <FilmIcon className="w-4 h-4" />
          Video Understanding
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload area */}
        <div className="uvb-card">
          <h3 className="text-sm font-semibold mb-4 text-uvb-text-primary font-[family-name:var(--font-display)]">
            {activeTab === "image" ? "Image Upload" : "Video Upload"}
          </h3>
          <div className="border-2 border-dashed border-uvb-border/60 rounded-xl p-12 text-center hover:border-uvb-neon-green/30 transition-colors">
            {!hasMedia ? (
              <div className="flex flex-col items-center gap-4">
                {activeTab === "image" ? (
                  <ImageIcon className="w-12 h-12 text-uvb-text-muted" />
                ) : (
                  <Video className="w-12 h-12 text-uvb-text-muted" />
                )}
                <div>
                  <p className="text-sm text-uvb-text-secondary mb-1">
                    Drop {activeTab} here or click to upload
                  </p>
                  <p className="text-xs text-uvb-text-muted">
                    {activeTab === "image"
                      ? "Supports JPG, PNG, WebP, GIF, BMP"
                      : "Supports MP4, WebM, MOV, AVI; local processing avoids Telegram cloud limits"}
                  </p>
                </div>
                <label className="btn-primary cursor-pointer inline-flex items-center gap-2">
                  <ArrowUpTrayIcon className="w-4 h-4" />
                  Choose {activeTab === "image" ? "Image" : "Video"}
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept={activeTab === "image" ? "image/*" : "video/*"}
                    onChange={handleAnalyze}
                  />
                </label>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="w-full aspect-video bg-uvb-dark-gray/60 rounded-lg flex items-center justify-center overflow-hidden">
                  {isAnalyzing ? (
                    <motion.div
                      className="flex flex-col items-center gap-3"
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <SparklesIcon className="w-10 h-10 text-uvb-neon-green" />
                      <span className="text-sm text-uvb-text-secondary">
                        Analyzing...
                      </span>
                    </motion.div>
                  ) : (
                    mediaPreviewUrl && activeTab === "video" ? (
                      <video
                        src={mediaPreviewUrl}
                        controls
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex items-center gap-2 text-uvb-neon-green">
                        {activeTab === "image" ? (
                        <EyeIcon className="w-8 h-8" />
                      ) : (
                        <FilmIcon className="w-8 h-8" />
                      )}
                        <span className="text-sm font-medium">
                          Analysis Complete
                        </span>
                      </div>
                    )
                  )}
                </div>
                {selectedFileName && (
                  <p className="max-w-full truncate text-xs text-uvb-text-muted">
                    {selectedFileName}
                  </p>
                )}
                <button
                  onClick={resetMedia}
                  className="btn-ghost text-sm"
                >
                  Upload New {activeTab === "image" ? "Image" : "Video"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="uvb-card">
          <h3 className="text-sm font-semibold mb-4 text-uvb-text-primary font-[family-name:var(--font-display)]">
            Analysis Results
          </h3>
          {results.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <FileText className="w-8 h-8 text-uvb-text-muted mb-2" />
              <p className="text-sm text-uvb-text-muted">
                Upload a {activeTab} to see analysis results
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {analysisError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                  {analysisError}
                </div>
              )}
              {results.map((result, i) => (
                <motion.div
                  key={result.type}
                  className="p-3 rounded-lg bg-uvb-dark-gray/40 border border-uvb-border/20"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.15 }}
                >
                  <p className="text-[10px] text-uvb-neon-green uppercase tracking-wider mb-1 font-semibold">
                    {result.type}
                  </p>
                  <p className="text-sm text-uvb-text-primary whitespace-pre-wrap leading-relaxed">
                    {result.content}
                  </p>
                </motion.div>
              ))}
              {storyboardFrames.length > 0 && (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  {storyboardFrames.map((frame) => (
                    <div
                      key={`${frame.index}-${frame.timestamp}`}
                      className="overflow-hidden rounded-lg border border-uvb-border/30 bg-uvb-dark-gray/40"
                    >
                      <Image
                        src={frame.dataUrl}
                        alt={`Storyboard frame ${frame.index} at ${frame.timestamp}`}
                        width={480}
                        height={270}
                        unoptimized
                        className="aspect-video w-full object-cover"
                      />
                      <div className="px-2 py-1 text-[10px] text-uvb-text-muted">
                        Frame {frame.index} · {frame.timestamp}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tools */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            icon: SparklesIcon,
            title: "Auto-Description",
            desc: "Generate detailed descriptions using vision models",
          },
          {
            icon: DocumentTextIcon,
            title: "OCR Extraction",
            desc: "Extract and transcribe all visible text",
          },
          {
            icon: EyeIcon,
            title: "Scene Understanding",
            desc: "Identify objects, actions, and spatial relationships",
          },
        ].map((tool) => (
          <div key={tool.title} className="uvb-card cursor-pointer group">
            <tool.icon className="w-6 h-6 text-uvb-steel-blue mb-2 group-hover:text-uvb-neon-green transition-colors" />
            <h4 className="text-sm font-semibold text-uvb-text-primary">
              {tool.title}
            </h4>
            <p className="text-xs text-uvb-text-muted mt-1">{tool.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
