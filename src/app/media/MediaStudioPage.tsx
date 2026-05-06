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

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}

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

    const payload = new FormData();
    payload.append("file", file, file.name);
    payload.append(
      "prompt",
      "Describe the essence of this video with attention to timeline, scene changes, mood, actions, visual details, and audio."
    );

    try {
      if (activeTab === "image") {
        const dataUrl = await fileToDataUrl(file);
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: "Analyze this image for UVB Media Studio. Describe the scene, notable objects, visible text, mood, and any uncertainty.",
                  },
                  { type: "image_url", image_url: { url: dataUrl, detail: "auto" } },
                ],
              },
            ],
          }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          content?: string;
          error?: string;
        };
        if (!response.ok || !data.content) {
          throw new Error(data.error || `Image analysis failed with ${response.status}.`);
        }
        setResults([{ type: "Sophia Image Analysis", content: data.content }]);
        return;
      }

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
                    mediaPreviewUrl && activeTab === "image" ? (
                      <Image
                        src={mediaPreviewUrl}
                        alt={selectedFileName || "Uploaded image"}
                        width={960}
                        height={540}
                        unoptimized
                        className="h-full w-full object-contain"
                      />
                    ) : mediaPreviewUrl && activeTab === "video" ? (
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
                Upload {activeTab === "image" ? "an image" : "a video"} to see analysis results
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
