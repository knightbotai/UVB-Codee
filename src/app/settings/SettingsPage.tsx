"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  UserCircleIcon,
  LockClosedIcon,
  BellIcon,
  CpuChipIcon,
  EyeIcon,
  PaintBrushIcon,
  KeyIcon,
} from "@heroicons/react/24/outline";
import { Shield, Palette, Brain } from "lucide-react";
import {
  DEFAULT_MODEL_SETTINGS,
  loadModelSettings,
  saveModelSettings,
  type ModelSettings,
} from "@/lib/modelSettings";

const MODEL_PRESETS = [
  {
    label: "Local vLLM 8003",
    provider: "Local vLLM",
    baseUrl: "http://127.0.0.1:8003/v1",
    model: "qwen36-35b-a3b-heretic-nvfp4",
    apiKey: "uvb-local",
  },
  {
    label: "LM Studio",
    provider: "LM Studio",
    baseUrl: "http://127.0.0.1:1234/v1",
    model: "local-model",
    apiKey: "lm-studio",
  },
  {
    label: "Ollama OpenAI",
    provider: "Ollama",
    baseUrl: "http://127.0.0.1:11434/v1",
    model: "llama3.1",
    apiKey: "ollama",
  },
  {
    label: "Custom OpenAI-compatible",
    provider: "Custom",
    baseUrl: "",
    model: "",
    apiKey: "",
  },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("profile");
  const [modelSettings, setModelSettings] = useState<ModelSettings>(() => loadModelSettings());
  const [modelStatus, setModelStatus] = useState<{
    state: "idle" | "testing" | "connected" | "error" | "saved";
    message: string;
  }>({ state: "idle", message: "" });

  const tabs = [
    { id: "profile", label: "Profile", icon: UserCircleIcon },
    { id: "voice", label: "Voice & Audio", icon: CpuChipIcon },
    { id: "appearance", label: "Appearance", icon: Palette },
    { id: "security", label: "Security", icon: Shield },
    { id: "ai", label: "AI Settings", icon: Brain },
    { id: "notifications", label: "Notifications", icon: BellIcon },
  ];

  const updateModelSettings = (updates: Partial<ModelSettings>) => {
    setModelSettings((current) => ({ ...current, ...updates }));
    setModelStatus({ state: "idle", message: "" });
  };

  const testModelConnection = async (settings = modelSettings) => {
    setModelStatus({ state: "testing", message: "Testing connection..." });

    try {
      const params = new URLSearchParams({
        baseUrl: settings.baseUrl,
        model: settings.model,
        apiKey: settings.apiKey,
      });
      const response = await fetch(`/api/chat/config?${params.toString()}`);
      const data = (await response.json()) as {
        connected?: boolean;
        error?: string;
        model?: string;
      };

      if (!response.ok || !data.connected) {
        setModelStatus({
          state: "error",
          message: data.error ?? "Could not connect to the selected model endpoint.",
        });
        return false;
      }

      setModelStatus({
        state: "connected",
        message: `Connected to ${data.model ?? settings.model}`,
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown connection error.";
      setModelStatus({ state: "error", message });
      return false;
    }
  };

  const saveCurrentModelSettings = () => {
    saveModelSettings(modelSettings);
    setModelStatus({ state: "saved", message: "Saved. Chat will use this model now." });
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex gap-6">
          {/* Tabs */}
          <div className="w-48 flex-shrink-0 space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                  activeTab === tab.id
                    ? "bg-uvb-deep-teal/30 text-uvb-neon-green border border-uvb-neon-green/10"
                    : "text-uvb-text-secondary hover:text-uvb-text-primary hover:bg-uvb-light-gray/20"
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 space-y-6">
            {activeTab === "profile" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                <div className="uvb-card">
                  <h3 className="text-sm font-semibold mb-4 text-uvb-text-primary font-[family-name:var(--font-display)]">
                    User Profile
                  </h3>
                  <div className="flex items-center gap-6 mb-6">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-uvb-royal-purple to-uvb-steel-blue flex items-center justify-center">
                      <UserCircleIcon className="w-10 h-10 text-uvb-brushed-silver" />
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-uvb-text-primary">
                        Knight User
                      </h4>
                      <p className="text-sm text-uvb-text-muted">
                        knight@uvb.local
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-uvb-text-muted block mb-1.5">
                        Display Name
                      </label>
                      <input
                        type="text"
                        defaultValue="Knight User"
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-uvb-text-muted block mb-1.5">
                        Email
                      </label>
                      <input
                        type="email"
                        defaultValue="knight@uvb.local"
                        className="input-field"
                      />
                    </div>
                  </div>
                </div>

                <div className="uvb-card">
                  <h3 className="text-sm font-semibold mb-4 text-uvb-text-primary font-[family-name:var(--font-display)]">
                    Password
                  </h3>
                  <div className="grid grid-cols-1 gap-4 max-w-sm">
                    <div>
                      <label className="text-xs text-uvb-text-muted block mb-1.5">
                        Current Password
                      </label>
                      <div className="relative">
                        <LockClosedIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-uvb-text-muted" />
                        <input
                          type="password"
                          className="input-field pl-10"
                          placeholder="Enter current password"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-uvb-text-muted block mb-1.5">
                        New Password
                      </label>
                      <div className="relative">
                        <KeyIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-uvb-text-muted" />
                        <input
                          type="password"
                          className="input-field pl-10"
                          placeholder="Enter new password"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "voice" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                <div className="uvb-card">
                  <h3 className="text-sm font-semibold mb-4 text-uvb-text-primary font-[family-name:var(--font-display)]">
                    Voice Configuration
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs text-uvb-text-muted block mb-1.5">
                        TTS Engine
                      </label>
                      <select className="input-field">
                        <option>Local (Piper TTS)</option>
                        <option>Neural Cloud TTS</option>
                        <option>Edge TTS</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-uvb-text-muted block mb-1.5">
                        Voice Profile
                      </label>
                      <select className="input-field">
                        <option>Neural-Natural-Female-v3</option>
                        <option>Neural-Natural-Male-v2</option>
                        <option>Custom Voice Clone</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-uvb-text-muted block mb-1.5">
                        Speech Rate
                      </label>
                      <input
                        type="range"
                        min="0.5"
                        max="2"
                        step="0.1"
                        defaultValue="1.0"
                        className="w-full accent-uvb-neon-green"
                      />
                      <div className="flex justify-between text-[10px] text-uvb-text-muted">
                        <span>0.5x</span>
                        <span>1.0x</span>
                        <span>2.0x</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-uvb-text-muted block mb-1.5">
                        STT Engine
                      </label>
                      <select className="input-field">
                        <option>Whisper (Local)</option>
                        <option>Whisper.cpp (GPU)</option>
                        <option>faster-whisper</option>
                      </select>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-uvb-dark-gray/40">
                      <div>
                        <p className="text-sm text-uvb-text-primary">
                          Barge-in Support
                        </p>
                        <p className="text-xs text-uvb-text-muted">
                          Allow interrupting the AI while speaking
                        </p>
                      </div>
                      <button className="w-11 h-6 rounded-full bg-uvb-neon-green/30 relative">
                        <span className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-uvb-neon-green shadow" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "appearance" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                <div className="uvb-card">
                  <h3 className="text-sm font-semibold mb-4 text-uvb-text-primary font-[family-name:var(--font-display)]">
                    Theme
                  </h3>
                  <div className="grid grid-cols-3 gap-3">
                    {["Galaxy Dark", "Deep Space", "Neon Night"].map(
                      (theme, i) => (
                        <button
                          key={theme}
                          className={`p-4 rounded-lg border text-center transition-all ${
                            i === 0
                              ? "border-uvb-neon-green/40 bg-uvb-deep-teal/10"
                              : "border-uvb-border/30 hover:border-uvb-border"
                          }`}
                        >
                          <div
                            className="w-full h-16 rounded-lg mb-2"
                            style={{
                              background:
                                i === 0
                                  ? "linear-gradient(135deg, #0a0a1a, #1a0a2e, #0a1a2e)"
                                  : i === 1
                                  ? "linear-gradient(135deg, #0a0a0a, #0a0a14, #0a1420)"
                                  : "linear-gradient(135deg, #0a0a0a, #1a0030, #000a1a)",
                            }}
                          />
                          <span className="text-xs text-uvb-text-secondary">
                            {theme}
                          </span>
                        </button>
                      )
                    )}
                  </div>
                </div>
                <div className="uvb-card">
                  <h3 className="text-sm font-semibold mb-4 text-uvb-text-primary font-[family-name:var(--font-display)]">
                    Accent Color
                  </h3>
                  <div className="flex gap-3">
                    {[
                      { name: "Neon Green", color: "#39ff14" },
                      { name: "Steel Blue", color: "#4a6fa5" },
                      { name: "Royal Purple", color: "#6b1fa0" },
                      { name: "Deep Teal", color: "#1a7a7a" },
                      { name: "Accent Orange", color: "#ff6b35" },
                    ].map((accent) => (
                      <button
                        key={accent.name}
                        className="flex flex-col items-center gap-1.5"
                      >
                        <span
                          className={`w-8 h-8 rounded-full border-2 ${
                            accent.name === "Neon Green"
                              ? "border-white/40"
                              : "border-transparent"
                          }`}
                          style={{
                            backgroundColor: accent.color,
                            boxShadow: `0 0 8px ${accent.color}40`,
                          }}
                        />
                        <span className="text-[9px] text-uvb-text-muted">
                          {accent.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="uvb-card">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-uvb-text-primary">
                        Particle Effects
                      </p>
                      <p className="text-xs text-uvb-text-muted">
                        Galaxy particle background animation
                      </p>
                    </div>
                    <button className="w-11 h-6 rounded-full bg-uvb-neon-green/30 relative">
                      <span className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-uvb-neon-green shadow" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "ai" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                <div className="uvb-card">
                  <h3 className="text-sm font-semibold mb-4 text-uvb-text-primary font-[family-name:var(--font-display)]">
                    LLM Configuration
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs text-uvb-text-muted block mb-1.5">
                        Model Backend
                      </label>
                      <select
                        className="input-field"
                        value={modelSettings.provider}
                        onChange={(event) => {
                          const preset = MODEL_PRESETS.find(
                            (item) => item.provider === event.target.value
                          );
                          if (!preset) return;
                          updateModelSettings({
                            provider: preset.provider,
                            baseUrl: preset.baseUrl || modelSettings.baseUrl,
                            model: preset.model || modelSettings.model,
                            apiKey: preset.apiKey || modelSettings.apiKey,
                          });
                        }}
                      >
                        {MODEL_PRESETS.map((preset) => (
                          <option key={preset.provider} value={preset.provider}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-uvb-text-muted block mb-1.5">
                        Base URL
                      </label>
                      <input
                        type="url"
                        value={modelSettings.baseUrl}
                        onChange={(event) =>
                          updateModelSettings({ baseUrl: event.target.value })
                        }
                        className="input-field"
                        placeholder="http://127.0.0.1:8003/v1"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-uvb-text-muted block mb-1.5">
                        Model Name
                      </label>
                      <input
                        type="text"
                        value={modelSettings.model}
                        onChange={(event) =>
                          updateModelSettings({ model: event.target.value })
                        }
                        className="input-field"
                        placeholder="qwen36-35b-a3b-heretic-nvfp4"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-uvb-text-muted block mb-1.5">
                        API Key
                      </label>
                      <input
                        type="password"
                        value={modelSettings.apiKey}
                        onChange={(event) =>
                          updateModelSettings({ apiKey: event.target.value })
                        }
                        className="input-field"
                        placeholder="Required by OpenAI-compatible servers"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-uvb-text-muted block mb-1.5">
                        Temperature
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={modelSettings.temperature}
                        onChange={(event) =>
                          updateModelSettings({ temperature: Number(event.target.value) })
                        }
                        className="w-full accent-uvb-neon-green"
                      />
                      <div className="flex justify-between text-[10px] text-uvb-text-muted">
                        <span>Focused</span>
                        <span>{modelSettings.temperature.toFixed(1)}</span>
                        <span>Creative</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-uvb-text-muted block mb-1.5">
                        Max Response Tokens
                      </label>
                      <input
                        type="number"
                        min="64"
                        max="8192"
                        step="64"
                        value={modelSettings.maxTokens}
                        onChange={(event) =>
                          updateModelSettings({ maxTokens: Number(event.target.value) })
                        }
                        className="input-field"
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-uvb-dark-gray/40">
                      <div>
                        <p className="text-sm text-uvb-text-primary">
                          Qwen Thinking Mode
                        </p>
                        <p className="text-xs text-uvb-text-muted">
                          Leave off for chat-style responses from thinking models
                        </p>
                      </div>
                      <button
                        onClick={() =>
                          updateModelSettings({
                            enableThinking: !modelSettings.enableThinking,
                          })
                        }
                        className={`w-11 h-6 rounded-full relative ${
                          modelSettings.enableThinking
                            ? "bg-uvb-neon-green/30"
                            : "bg-uvb-light-gray"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 w-5 h-5 rounded-full shadow transition-all ${
                            modelSettings.enableThinking
                              ? "right-0.5 bg-uvb-neon-green"
                              : "left-0.5 bg-uvb-text-muted"
                          }`}
                        />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 pt-2">
                      <button
                        onClick={() => testModelConnection()}
                        className="btn-ghost"
                        disabled={modelStatus.state === "testing"}
                      >
                        Test Connection
                      </button>
                      <button onClick={saveCurrentModelSettings} className="btn-primary">
                        Save Model Settings
                      </button>
                      {modelStatus.message && (
                        <span
                          className={`text-xs ${
                            modelStatus.state === "error"
                              ? "text-red-400"
                              : "text-uvb-neon-green"
                          }`}
                        >
                          {modelStatus.message}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-uvb-dark-gray/40">
                      <div>
                        <p className="text-sm text-uvb-text-primary">
                          RAG Retrieval
                        </p>
                        <p className="text-xs text-uvb-text-muted">
                          Auto-retrieve relevant memories
                        </p>
                      </div>
                      <button className="w-11 h-6 rounded-full bg-uvb-neon-green/30 relative">
                        <span className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-uvb-neon-green shadow" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "security" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                <div className="uvb-card">
                  <h3 className="text-sm font-semibold mb-4 text-uvb-text-primary font-[family-name:var(--font-display)]">
                    Data & Privacy
                  </h3>
                  <div className="space-y-3">
                    {[
                      {
                        label: "Local Data Only",
                        desc: "All data stays on your machine",
                        enabled: true,
                      },
                      {
                        label: "Encrypted Storage",
                        desc: "AES-256 encryption for stored threads",
                        enabled: true,
                      },
                      {
                        label: "Auto-Save Threads",
                        desc: "Automatically save conversation history",
                        enabled: true,
                      },
                      {
                        label: "Telemetry",
                        desc: "Anonymous usage analytics",
                        enabled: false,
                      },
                    ].map((setting) => (
                      <div
                        key={setting.label}
                        className="flex items-center justify-between p-3 rounded-lg bg-uvb-dark-gray/40"
                      >
                        <div>
                          <p className="text-sm text-uvb-text-primary">
                            {setting.label}
                          </p>
                          <p className="text-xs text-uvb-text-muted">
                            {setting.desc}
                          </p>
                        </div>
                        <button
                          className={`w-11 h-6 rounded-full relative ${
                            setting.enabled
                              ? "bg-uvb-neon-green/30"
                              : "bg-uvb-light-gray"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 w-5 h-5 rounded-full shadow transition-all ${
                              setting.enabled
                                ? "right-0.5 bg-uvb-neon-green"
                                : "left-0.5 bg-uvb-text-muted"
                            }`}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "notifications" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                <div className="uvb-card">
                  <h3 className="text-sm font-semibold mb-4 text-uvb-text-primary font-[family-name:var(--font-display)]">
                    Notifications
                  </h3>
                  <div className="space-y-3">
                    {[
                      {
                        label: "Task Complete",
                        desc: "When AI finishes a long-running task",
                        enabled: true,
                      },
                      {
                        label: "Voice Ready",
                        desc: "When voice processing is complete",
                        enabled: true,
                      },
                      {
                        label: "System Alerts",
                        desc: "Critical system notifications",
                        enabled: true,
                      },
                      {
                        label: "Sound Effects",
                        desc: "Audio feedback for interactions",
                        enabled: false,
                      },
                    ].map((setting) => (
                      <div
                        key={setting.label}
                        className="flex items-center justify-between p-3 rounded-lg bg-uvb-dark-gray/40"
                      >
                        <div>
                          <p className="text-sm text-uvb-text-primary">
                            {setting.label}
                          </p>
                          <p className="text-xs text-uvb-text-muted">
                            {setting.desc}
                          </p>
                        </div>
                        <button
                          className={`w-11 h-6 rounded-full relative ${
                            setting.enabled
                              ? "bg-uvb-neon-green/30"
                              : "bg-uvb-light-gray"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 w-5 h-5 rounded-full shadow transition-all ${
                              setting.enabled
                                ? "right-0.5 bg-uvb-neon-green"
                                : "left-0.5 bg-uvb-text-muted"
                            }`}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
