"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  UserCircleIcon,
  BellIcon,
  CpuChipIcon,
  EyeIcon,
  PaintBrushIcon,
} from "@heroicons/react/24/outline";
import { Shield, Palette, Brain, Bot, Code2 } from "lucide-react";
import Image from "next/image";
import {
  DEFAULT_MODEL_SETTINGS,
  loadModelSettings,
  saveModelSettings,
  type ModelSettings,
} from "@/lib/modelSettings";
import {
  loadVoiceSettings,
  saveVoiceSettings,
  type VoiceSettings,
} from "@/lib/voiceSettings";
import {
  fileToIdentityDataUrl,
  loadIdentitySettings,
  saveIdentitySettings,
  type IdentitySettings,
} from "@/lib/identitySettings";
import {
  DEFAULT_AGENT_TOOL_SETTINGS,
  loadAgentToolSettings,
  saveAgentToolSettings,
  type AgentToolSettings,
} from "@/lib/agentToolSettings";

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
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(() => loadVoiceSettings());
  const [voiceStatus, setVoiceStatus] = useState<{
    state: "idle" | "saved" | "testing" | "connected" | "error";
    message: string;
  }>({ state: "idle", message: "" });
  const [profileStatus, setProfileStatus] = useState("");
  const [identitySettings, setIdentitySettings] = useState<IdentitySettings>(() =>
    loadIdentitySettings()
  );
  const [agentToolSettings, setAgentToolSettings] = useState<AgentToolSettings>(() =>
    loadAgentToolSettings()
  );
  const [agentToolStatus, setAgentToolStatus] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);
  const userPortraitInputRef = useRef<HTMLInputElement>(null);
  const assistantPortraitInputRef = useRef<HTMLInputElement>(null);

  const tabs = [
    { id: "profile", label: "Profile", icon: UserCircleIcon },
    { id: "voice", label: "Voice & Audio", icon: CpuChipIcon },
    { id: "appearance", label: "Appearance", icon: Palette },
    { id: "security", label: "Security", icon: Shield },
    { id: "tools", label: "Agent Tools", icon: Bot },
    { id: "ai", label: "AI Settings", icon: Brain },
    { id: "notifications", label: "Notifications", icon: BellIcon },
  ];

  const updateModelSettings = (updates: Partial<ModelSettings>) => {
    setModelSettings((current) => ({ ...current, ...updates }));
    setModelStatus({ state: "idle", message: "" });
  };

  const updateVoiceSettings = (updates: Partial<VoiceSettings>) => {
    setVoiceSettings((current) => ({ ...current, ...updates }));
    setVoiceStatus({ state: "idle", message: "" });
  };

  const updateIdentitySettings = (updates: Partial<IdentitySettings>) => {
    setIdentitySettings((current) => ({ ...current, ...updates }));
    setProfileStatus("");
  };

  const updateAgentToolSettings = (updates: Partial<AgentToolSettings>) => {
    setAgentToolSettings((current) => ({ ...current, ...updates }));
    setAgentToolStatus("");
  };

  const saveCurrentAgentToolSettings = () => {
    saveAgentToolSettings(agentToolSettings);
    setAgentToolStatus("Saved Sophia agent tool permissions locally.");
  };

  const saveCurrentIdentitySettings = () => {
    saveIdentitySettings(identitySettings);
    setProfileStatus("Saved local user and Sophia identity settings.");
  };

  const loadPortrait = async (file: File, target: "user" | "assistant") => {
    try {
      const dataUrl = await fileToIdentityDataUrl(file);
      updateIdentitySettings(
        target === "user" ? { userPortraitUrl: dataUrl } : { assistantPortraitUrl: dataUrl }
      );
      setProfileStatus("Portrait loaded. Save identity to apply everywhere.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load portrait.";
      setProfileStatus(message);
    }
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
    void fetch("/api/settings/runtime", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelSettings }),
    });
    setModelStatus({ state: "saved", message: "Saved. Chat will use this model now." });
  };

  const saveCurrentVoiceSettings = () => {
    saveVoiceSettings(voiceSettings);
    void fetch("/api/settings/runtime", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceSettings }),
    });
    setVoiceStatus({ state: "saved", message: "Saved. Chat voice will use these endpoints now." });
  };

  const testVoiceConnection = async () => {
    setVoiceStatus({ state: "testing", message: "Testing voice endpoints..." });

    try {
      const ttsResponse = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "UVB voice bridge is online.",
          endpoint: voiceSettings.ttsUrl,
          voice: voiceSettings.ttsVoice,
        }),
      });

      if (!ttsResponse.ok) {
        const data = (await ttsResponse.json().catch(() => ({}))) as { error?: string };
        setVoiceStatus({
          state: "error",
          message: data.error ?? "TTS endpoint did not respond cleanly.",
        });
        return false;
      }

      setVoiceStatus({
        state: "connected",
        message: "TTS responded. STT will be tested from the chat mic with real audio.",
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown voice endpoint error.";
      setVoiceStatus({ state: "error", message });
      return false;
    }
  };

  const exportProfile = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      app: "UVB KnightBot",
      identitySettings,
      agentToolSettings,
      modelSettings,
      voiceSettings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "uvb-knightbot-profile.json";
    link.click();
    URL.revokeObjectURL(url);
    setProfileStatus("Exported model and voice profile.");
  };

  const importProfile = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as {
        modelSettings?: Partial<ModelSettings>;
        voiceSettings?: Partial<VoiceSettings>;
        identitySettings?: Partial<IdentitySettings>;
        agentToolSettings?: Partial<AgentToolSettings>;
      };

      if (data.modelSettings) {
        const nextModelSettings = { ...DEFAULT_MODEL_SETTINGS, ...data.modelSettings };
        setModelSettings(nextModelSettings);
        saveModelSettings(nextModelSettings);
        void fetch("/api/settings/runtime", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modelSettings: nextModelSettings }),
        });
      }

      if (data.voiceSettings) {
        const nextVoiceSettings = { ...voiceSettings, ...data.voiceSettings };
        setVoiceSettings(nextVoiceSettings);
        saveVoiceSettings(nextVoiceSettings);
        void fetch("/api/settings/runtime", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voiceSettings: nextVoiceSettings }),
        });
      }

      if (data.identitySettings) {
        const nextIdentitySettings = { ...identitySettings, ...data.identitySettings };
        setIdentitySettings(nextIdentitySettings);
        saveIdentitySettings(nextIdentitySettings);
      }

      if (data.agentToolSettings) {
        const nextAgentToolSettings = {
          ...DEFAULT_AGENT_TOOL_SETTINGS,
          ...data.agentToolSettings,
        };
        setAgentToolSettings(nextAgentToolSettings);
        saveAgentToolSettings(nextAgentToolSettings);
      }

      setProfileStatus("Imported profile and applied settings.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not import profile.";
      setProfileStatus(message);
    }
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
                    <button
                      onClick={() => userPortraitInputRef.current?.click()}
                      className="h-20 w-20 overflow-hidden rounded-2xl bg-gradient-to-br from-uvb-royal-purple to-uvb-steel-blue flex items-center justify-center"
                    >
                      {identitySettings.userPortraitUrl ? (
                        <Image
                          src={identitySettings.userPortraitUrl}
                          alt={identitySettings.userName}
                          width={80}
                          height={80}
                          unoptimized
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <UserCircleIcon className="w-10 h-10 text-uvb-brushed-silver" />
                      )}
                    </button>
                    <div>
                      <h4 className="text-lg font-semibold text-uvb-text-primary">
                        {identitySettings.userName}
                      </h4>
                      <p className="text-sm text-uvb-text-muted">
                        {identitySettings.userEmail}
                      </p>
                      <button
                        onClick={() => userPortraitInputRef.current?.click()}
                        className="mt-2 text-xs text-uvb-neon-green hover:text-uvb-text-primary"
                      >
                        Choose portrait
                      </button>
                      <input
                        ref={userPortraitInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void loadPortrait(file, "user");
                          event.target.value = "";
                        }}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-uvb-text-muted block mb-1.5">
                        Display Name
                      </label>
                      <input
                        type="text"
                        value={identitySettings.userName}
                        onChange={(event) =>
                          updateIdentitySettings({ userName: event.target.value })
                        }
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-uvb-text-muted block mb-1.5">
                        Email
                      </label>
                      <input
                        type="email"
                        value={identitySettings.userEmail}
                        onChange={(event) =>
                          updateIdentitySettings({ userEmail: event.target.value })
                        }
                        className="input-field"
                      />
                    </div>
                  </div>
                </div>

                <div className="uvb-card">
                  <h3 className="text-sm font-semibold mb-4 text-uvb-text-primary font-[family-name:var(--font-display)]">
                    Sophia Identity
                  </h3>
                  <div className="flex items-center gap-6 mb-6">
                    <button
                      onClick={() => assistantPortraitInputRef.current?.click()}
                      className="h-20 w-20 overflow-hidden rounded-2xl border border-uvb-neon-green/20 bg-uvb-deep-teal/30 flex items-center justify-center"
                    >
                      {identitySettings.assistantPortraitUrl ? (
                        <Image
                          src={identitySettings.assistantPortraitUrl}
                          alt={identitySettings.assistantName}
                          width={80}
                          height={80}
                          unoptimized
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <CpuChipIcon className="w-10 h-10 text-uvb-neon-green" />
                      )}
                    </button>
                    <div>
                      <h4 className="text-lg font-semibold text-uvb-text-primary">
                        {identitySettings.assistantName}
                      </h4>
                      <p className="text-sm text-uvb-text-muted">
                        {identitySettings.assistantSubtitle}
                      </p>
                      <button
                        onClick={() => assistantPortraitInputRef.current?.click()}
                        className="mt-2 text-xs text-uvb-neon-green hover:text-uvb-text-primary"
                      >
                        Choose portrait
                      </button>
                      <input
                        ref={assistantPortraitInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void loadPortrait(file, "assistant");
                          event.target.value = "";
                        }}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-uvb-text-muted block mb-1.5">
                        Assistant Name
                      </label>
                      <input
                        value={identitySettings.assistantName}
                        onChange={(event) =>
                          updateIdentitySettings({ assistantName: event.target.value })
                        }
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-uvb-text-muted block mb-1.5">
                        App Name
                      </label>
                      <input
                        value={identitySettings.appName}
                        onChange={(event) =>
                          updateIdentitySettings({ appName: event.target.value })
                        }
                        className="input-field"
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className="text-xs text-uvb-text-muted block mb-1.5">
                      Assistant Subtitle
                    </label>
                    <input
                      value={identitySettings.assistantSubtitle}
                      onChange={(event) =>
                        updateIdentitySettings({ assistantSubtitle: event.target.value })
                      }
                      className="input-field"
                    />
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <button onClick={saveCurrentIdentitySettings} className="btn-primary">
                      Save Identity
                    </button>
                    {profileStatus && (
                      <span className="text-xs text-uvb-text-muted">{profileStatus}</span>
                    )}
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
                      <input
                        type="url"
                        value={voiceSettings.ttsUrl}
                        onChange={(event) =>
                          updateVoiceSettings({ ttsUrl: event.target.value })
                        }
                        className="input-field"
                        placeholder="http://127.0.0.1:8880/v1/audio/speech"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-uvb-text-muted block mb-1.5">
                        Voice Profile
                      </label>
                      <input
                        type="text"
                        value={voiceSettings.ttsVoice}
                        onChange={(event) =>
                          updateVoiceSettings({ ttsVoice: event.target.value })
                        }
                        className="input-field"
                        placeholder="af_nova"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-uvb-text-muted block mb-1.5">
                        Playback Volume
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={voiceSettings.volume}
                        onChange={(event) =>
                          updateVoiceSettings({ volume: Number(event.target.value) })
                        }
                        className="w-full accent-uvb-neon-green"
                      />
                      <div className="flex justify-between text-[10px] text-uvb-text-muted">
                        <span>Muted</span>
                        <span>{Math.round(voiceSettings.volume * 100)}%</span>
                        <span>Full</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-uvb-text-muted block mb-1.5">
                        STT Engine
                      </label>
                      <input
                        type="url"
                        value={voiceSettings.sttUrl}
                        onChange={(event) =>
                          updateVoiceSettings({ sttUrl: event.target.value })
                        }
                        className="input-field"
                        placeholder="http://127.0.0.1:8001/v1/audio/transcriptions"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-uvb-text-muted block mb-1.5">
                        STT Model
                      </label>
                      <input
                        type="text"
                        value={voiceSettings.sttModel}
                        onChange={(event) =>
                          updateVoiceSettings({ sttModel: event.target.value })
                        }
                        className="input-field"
                        placeholder="Systran/faster-whisper-large-v3"
                      />
                    </div>
                    <div className="rounded-lg border border-uvb-neon-green/10 bg-uvb-deep-teal/10 p-4">
                      <div className="mb-4">
                        <p className="text-sm font-semibold text-uvb-text-primary">
                          Live Voice Pipeline
                        </p>
                        <p className="mt-1 text-xs text-uvb-text-muted">
                          Pipecat-ready sidecar controls for realtime STT, turn handling,
                          local model replies, and streaming TTS upgrades.
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2 rounded-lg border border-uvb-neon-green/20 bg-uvb-neon-green/5 p-3">
                          <p className="text-xs font-semibold text-uvb-neon-green">
                            Active target: Pipecat SmallWebRTC
                          </p>
                          <p className="mt-1 text-[11px] leading-relaxed text-uvb-text-muted">
                            SmallWebRTC is the preferred live voice route. The legacy
                            WebSocket agent remains available only as a fallback/debug path.
                          </p>
                        </div>
                        <div className="col-span-2">
                          <label className="text-xs text-uvb-text-muted block mb-1.5">
                            Pipecat WebRTC Offer Endpoint
                          </label>
                          <input
                            type="url"
                            value={voiceSettings.liveWebRtcUrl}
                            onChange={(event) =>
                              updateVoiceSettings({ liveWebRtcUrl: event.target.value })
                            }
                            className="input-field"
                            placeholder="http://127.0.0.1:8766/api/offer"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="text-xs text-uvb-text-muted block mb-1.5">
                            Legacy Voice Agent WebSocket
                          </label>
                          <input
                            type="url"
                            value={voiceSettings.liveVoiceUrl}
                            onChange={(event) =>
                              updateVoiceSettings({ liveVoiceUrl: event.target.value })
                            }
                            className="input-field"
                            placeholder="ws://127.0.0.1:8765/live"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-uvb-text-muted block mb-1.5">
                            Transport
                          </label>
                          <select
                            className="input-field"
                            value={voiceSettings.liveTransport}
                            onChange={(event) =>
                              updateVoiceSettings({
                                liveTransport: event.target
                                  .value as VoiceSettings["liveTransport"],
                              })
                            }
                          >
                            <option value="websocket">WebSocket local first</option>
                            <option value="small-webrtc">Pipecat SmallWebRTC next</option>
                            <option value="webrtc">WebRTC staged</option>
                            <option value="livekit">LiveKit later</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-uvb-text-muted block mb-1.5">
                            Turn Detection / VAD
                          </label>
                          <select
                            className="input-field"
                            value={voiceSettings.liveVadProvider}
                            onChange={(event) =>
                              updateVoiceSettings({
                                liveVadProvider: event.target
                                  .value as VoiceSettings["liveVadProvider"],
                              })
                            }
                          >
                            <option value="browser-manual">Manual stop/send baseline</option>
                            <option value="silero">Silero VAD staged</option>
                            <option value="ten-vad">TEN VAD / Turn Detection staged</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-uvb-text-muted block mb-1.5">
                            Realtime STT Provider
                          </label>
                          <select
                            className="input-field"
                            value={voiceSettings.liveSttProvider}
                            onChange={(event) =>
                              updateVoiceSettings({
                                liveSttProvider: event.target
                                  .value as VoiceSettings["liveSttProvider"],
                              })
                            }
                          >
                            <option value="faster-whisper">Faster Whisper fallback</option>
                            <option value="parakeet-realtime-eou">
                              Parakeet Realtime EOU staged
                            </option>
                            <option value="custom">Custom provider</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-uvb-text-muted block mb-1.5">
                            Realtime TTS Provider
                          </label>
                          <select
                            className="input-field"
                            value={voiceSettings.liveTtsProvider}
                            onChange={(event) =>
                              updateVoiceSettings({
                                liveTtsProvider: event.target
                                  .value as VoiceSettings["liveTtsProvider"],
                              })
                            }
                          >
                            <option value="kokoro">Kokoro fallback</option>
                            <option value="moss-tts-nano">MOSS-TTS-Nano candidate</option>
                            <option value="moss-ttsd">MOSS-TTSD expressive candidate</option>
                            <option value="chatterbox-turbo">Chatterbox Turbo staged</option>
                            <option value="vibevoice-realtime">VibeVoice Realtime staged</option>
                            <option value="custom">Custom provider</option>
                          </select>
                        </div>
                        {(voiceSettings.liveTtsProvider === "moss-tts-nano" ||
                          voiceSettings.liveTtsProvider === "moss-ttsd") && (
                          <>
                            <div className="col-span-2 rounded-lg border border-uvb-steel-blue/20 bg-uvb-steel-blue/10 p-3">
                              <p className="text-xs font-semibold text-uvb-text-primary">
                                MOSS TTS provider slot
                              </p>
                              <p className="mt-1 text-[11px] leading-relaxed text-uvb-text-muted">
                                UVB will treat MOSS like an OpenAI-compatible speech endpoint
                                while we evaluate the runtime. Use Nano for the realtime candidate
                                and TTSD for expressive/dialogue experiments.
                              </p>
                            </div>
                            <div>
                              <label className="text-xs text-uvb-text-muted block mb-1.5">
                                MOSS TTS Endpoint
                              </label>
                              <input
                                type="url"
                                value={voiceSettings.mossTtsUrl}
                                onChange={(event) =>
                                  updateVoiceSettings({ mossTtsUrl: event.target.value })
                                }
                                className="input-field"
                                placeholder="http://127.0.0.1:8890/v1/audio/speech"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-uvb-text-muted block mb-1.5">
                                MOSS Voice / Profile
                              </label>
                              <input
                                type="text"
                                value={voiceSettings.mossTtsVoice}
                                onChange={(event) =>
                                  updateVoiceSettings({ mossTtsVoice: event.target.value })
                                }
                                className="input-field"
                                placeholder="default"
                              />
                            </div>
                          </>
                        )}
                        <div className="col-span-2 rounded-lg border border-uvb-neon-green/10 bg-uvb-matte-black/30 p-3">
                          <p className="text-xs font-semibold text-uvb-neon-green">
                            Latest realtime path
                          </p>
                          <p className="mt-1 text-[11px] leading-relaxed text-uvb-text-muted">
                            Keep WebSocket for the working baseline. Next landing zone:
                            Pipecat v1 sidecar with SmallWebRTC transport, then LiveKit
                            only when we need remote/mobile/multi-device routing.
                          </p>
                        </div>
                        <div className="col-span-2">
                          <label className="text-xs text-uvb-text-muted block mb-1.5">
                            Voice Profile / Clone Target
                          </label>
                          <input
                            type="text"
                            value={voiceSettings.voiceProfileName}
                            onChange={(event) =>
                              updateVoiceSettings({ voiceProfileName: event.target.value })
                            }
                            className="input-field"
                            placeholder="Sophia / KnightBot Default"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="text-xs text-uvb-text-muted block mb-1.5">
                            AI Voice Identity / System Prompt
                          </label>
                          <textarea
                            value={voiceSettings.systemPrompt}
                            onChange={(event) =>
                              updateVoiceSettings({ systemPrompt: event.target.value })
                            }
                            className="input-field min-h-28 resize-y"
                            placeholder="Define how KnightBot should behave in live voice."
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-uvb-dark-gray/40">
                      <div>
                        <p className="text-sm text-uvb-text-primary">
                          Speak Replies
                        </p>
                        <p className="text-xs text-uvb-text-muted">
                          Automatically play Kokoro audio after KnightBot responds
                        </p>
                      </div>
                      <button
                        onClick={() =>
                          updateVoiceSettings({ autoSpeak: !voiceSettings.autoSpeak })
                        }
                        className={`w-11 h-6 rounded-full relative ${
                          voiceSettings.autoSpeak
                            ? "bg-uvb-neon-green/30"
                            : "bg-uvb-light-gray"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 w-5 h-5 rounded-full shadow transition-all ${
                            voiceSettings.autoSpeak
                              ? "right-0.5 bg-uvb-neon-green"
                              : "left-0.5 bg-uvb-text-muted"
                          }`}
                        />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 pt-2">
                      <button
                        onClick={testVoiceConnection}
                        className="btn-ghost"
                        disabled={voiceStatus.state === "testing"}
                      >
                        Test TTS
                      </button>
                      <button onClick={saveCurrentVoiceSettings} className="btn-primary">
                        Save Voice Settings
                      </button>
                      {voiceStatus.message && (
                        <span
                          className={`text-xs ${
                            voiceStatus.state === "error"
                              ? "text-red-400"
                              : "text-uvb-neon-green"
                          }`}
                        >
                          {voiceStatus.message}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "tools" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                <div className="uvb-card">
                  <div className="mb-4 flex items-center gap-2">
                    <Bot className="h-5 w-5 text-uvb-neon-green" />
                    <h3 className="text-sm font-semibold text-uvb-text-primary font-[family-name:var(--font-display)]">
                      Sophia Agent Tools
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {[
                      ["browserUseEnabled", "Browser use", "Open pages, inspect UI, and operate browser workflows."],
                      ["webResearchEnabled", "Web research", "Search and cite sources for current information."],
                      ["localComputerUseEnabled", "Local computer use", "Operate local UI surfaces when explicitly allowed."],
                      ["codingTasksEnabled", "Coding tasks", "Read code, propose patches, and run focused checks."],
                      ["terminalEnabled", "Terminal commands", "Run shell commands inside approved scope."],
                      ["fileEditsEnabled", "File edits", "Write code/files inside the configured workspace."],
                      ["gitEnabled", "Git operations", "Stage, commit, push, and inspect repository history."],
                      ["networkEnabled", "Network access", "Allow HTTP/API calls for research and provider fallbacks."],
                    ].map(([key, label, description]) => (
                      <button
                        key={key}
                        onClick={() =>
                          updateAgentToolSettings({
                            [key]: !agentToolSettings[key as keyof AgentToolSettings],
                          } as Partial<AgentToolSettings>)
                        }
                        className={`rounded-lg border p-3 text-left transition-colors ${
                          agentToolSettings[key as keyof AgentToolSettings]
                            ? "border-uvb-neon-green/30 bg-uvb-deep-teal/20"
                            : "border-uvb-border/30 bg-uvb-dark-gray/40 hover:border-uvb-steel-blue/40"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-uvb-text-primary">{label}</span>
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${
                              agentToolSettings[key as keyof AgentToolSettings]
                                ? "bg-uvb-neon-green"
                                : "bg-uvb-text-muted"
                            }`}
                          />
                        </div>
                        <p className="mt-1 text-xs text-uvb-text-muted">{description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="uvb-card">
                  <h3 className="mb-4 text-sm font-semibold text-uvb-text-primary font-[family-name:var(--font-display)]">
                    Permission Model
                  </h3>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs text-uvb-text-muted">
                        Approval Mode
                      </label>
                      <select
                        value={agentToolSettings.approvalMode}
                        onChange={(event) =>
                          updateAgentToolSettings({
                            approvalMode: event.target.value as AgentToolSettings["approvalMode"],
                          })
                        }
                        className="input-field"
                      >
                        <option value="ask-every-time">Ask every time</option>
                        <option value="read-only-auto">Auto approve read-only actions</option>
                        <option value="workspace-auto">Auto approve approved workspace actions</option>
                        <option value="trusted-local">Trusted local mode</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs text-uvb-text-muted">
                        Workspace Root
                      </label>
                      <input
                        value={agentToolSettings.workspaceRoot}
                        onChange={(event) =>
                          updateAgentToolSettings({ workspaceRoot: event.target.value })
                        }
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs text-uvb-text-muted">
                        Allowed Domains
                      </label>
                      <textarea
                        value={agentToolSettings.allowedDomains}
                        onChange={(event) =>
                          updateAgentToolSettings({ allowedDomains: event.target.value })
                        }
                        className="input-field min-h-24 resize-y"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs text-uvb-text-muted">
                        Blocked Paths / Secrets
                      </label>
                      <textarea
                        value={agentToolSettings.blockedPaths}
                        onChange={(event) =>
                          updateAgentToolSettings({ blockedPaths: event.target.value })
                        }
                        className="input-field min-h-24 resize-y"
                      />
                    </div>
                  </div>
                  <label className="mt-4 flex items-center gap-3 rounded-lg border border-uvb-border/30 bg-uvb-dark-gray/40 p-3">
                    <input
                      type="checkbox"
                      checked={agentToolSettings.auditLogEnabled}
                      onChange={(event) =>
                        updateAgentToolSettings({ auditLogEnabled: event.target.checked })
                      }
                      className="accent-uvb-neon-green"
                    />
                    <span>
                      <span className="block text-sm text-uvb-text-primary">Audit log every tool action</span>
                      <span className="text-xs text-uvb-text-muted">
                        Keep a readable trail before Sophia gets broader local execution power.
                      </span>
                    </span>
                  </label>
                </div>

                <div className="uvb-card">
                  <div className="mb-4 flex items-center gap-2">
                    <Code2 className="h-5 w-5 text-uvb-steel-blue" />
                    <h3 className="text-sm font-semibold text-uvb-text-primary font-[family-name:var(--font-display)]">
                      Coding Provider Fallback
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs text-uvb-text-muted">
                        Provider
                      </label>
                      <select
                        value={agentToolSettings.codingProvider}
                        onChange={(event) =>
                          updateAgentToolSettings({
                            codingProvider: event.target.value as AgentToolSettings["codingProvider"],
                            providerBaseUrl:
                              event.target.value === "kilo-gateway"
                                ? "https://api.kilo.ai/api/gateway"
                                : agentToolSettings.providerBaseUrl,
                          })
                        }
                        className="input-field"
                      >
                        <option value="local-uvb">Local UVB model</option>
                        <option value="kilo-gateway">Kilo Code Gateway</option>
                        <option value="openai-compatible">Custom OpenAI-compatible</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs text-uvb-text-muted">
                        Base URL
                      </label>
                      <input
                        value={agentToolSettings.providerBaseUrl}
                        onChange={(event) =>
                          updateAgentToolSettings({ providerBaseUrl: event.target.value })
                        }
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs text-uvb-text-muted">
                        Model
                      </label>
                      <input
                        value={agentToolSettings.providerModel}
                        onChange={(event) =>
                          updateAgentToolSettings({ providerModel: event.target.value })
                        }
                        className="input-field"
                        placeholder="Leave blank to choose at runtime"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs text-uvb-text-muted">
                        API Key
                      </label>
                      <input
                        type="password"
                        value={agentToolSettings.providerApiKey}
                        onChange={(event) =>
                          updateAgentToolSettings({ providerApiKey: event.target.value })
                        }
                        className="input-field"
                        placeholder="Optional for free/BYOK gateway modes"
                      />
                    </div>
                  </div>
                  <label className="mt-4 flex items-center gap-3 rounded-lg border border-uvb-border/30 bg-uvb-dark-gray/40 p-3">
                    <input
                      type="checkbox"
                      checked={agentToolSettings.preferFreeModels}
                      onChange={(event) =>
                        updateAgentToolSettings({ preferFreeModels: event.target.checked })
                      }
                      className="accent-uvb-neon-green"
                    />
                    <span>
                      <span className="block text-sm text-uvb-text-primary">Prefer free models when available</span>
                      <span className="text-xs text-uvb-text-muted">
                        Useful for Kilo Gateway fallback before burning paid credits.
                      </span>
                    </span>
                  </label>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button onClick={saveCurrentAgentToolSettings} className="btn-primary">
                      Save Agent Tool Settings
                    </button>
                    {agentToolStatus && (
                      <span className="text-xs text-uvb-neon-green">{agentToolStatus}</span>
                    )}
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
                    <div className="rounded-lg bg-uvb-dark-gray/40 p-3">
                      <p className="text-sm text-uvb-text-primary">Portable Profile</p>
                      <p className="mt-1 text-xs text-uvb-text-muted">
                        Export or import model and voice settings so another local agent can pick up
                        the same UVB configuration quickly.
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <button onClick={exportProfile} className="btn-ghost">
                          Export Profile
                        </button>
                        <button
                          onClick={() => importInputRef.current?.click()}
                          className="btn-ghost"
                        >
                          Import Profile
                        </button>
                        <input
                          ref={importInputRef}
                          type="file"
                          accept="application/json"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void importProfile(file);
                            event.target.value = "";
                          }}
                        />
                        {profileStatus && (
                          <span className="text-xs text-uvb-neon-green">{profileStatus}</span>
                        )}
                      </div>
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
