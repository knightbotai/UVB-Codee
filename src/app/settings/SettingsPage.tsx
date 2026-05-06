"use client";

import { useEffect, useRef, useState } from "react";
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
import {
  DEFAULT_UI_SETTINGS,
  UI_ACCENTS,
  UI_THEMES,
  loadUiSettings,
  saveUiSettings,
  type UiSettings,
} from "@/lib/uiSettings";
import {
  AGENT_JOB_KIND_LABELS,
  type AgentJob,
  type AgentJobKind,
} from "@/lib/agentJobs";
import type {
  AgentSkillCandidate,
  AgentSkillRegistry,
  AgentSkillTrustTier,
} from "@/lib/agentSkills";
import {
  DEFAULT_REMOTE_DOMAINS,
  type PublicUserProfile,
  type UserAuthProvider,
  type UserProfileAccessMode,
  type UserProfileRole,
} from "@/lib/userProfiles";

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

const AGENT_CAPABILITY_READINESS = [
  {
    title: "Web Research",
    status: "configured",
    detail: "Permissions, domains, and network scope are saved. Needs the supervised browser runner to execute from Sophia.",
  },
  {
    title: "Browser Use",
    status: "configured",
    detail: "Browser-use permission is modeled. Next step is a Playwright/browser-use job queue with screenshots and approvals.",
  },
  {
    title: "Local Coding",
    status: "configured",
    detail: "Workspace, file, terminal, git, and provider preferences are saved. Needs the agent execution adapter before Sophia can patch code herself.",
  },
  {
    title: "Kilo Code Gateway",
    status: "optional",
    detail: "Kilo gateway URL, model, API key, and free-model preference are stored as a fallback provider option.",
  },
  {
    title: "Computer Use",
    status: "staged",
    detail: "Permission exists, but OS-level automation should wait for approval queues, audit trails, and browser tools to be stable.",
  },
  {
    title: "Memory Retrieval",
    status: "partial",
    detail: "Local memories and Telegram/imported chat logs are searchable and editable. Automatic RAG injection into prompts is still staged.",
  },
];

interface VoiceStackItem {
  id: string;
  kind: "stt" | "tts" | "framework";
  name: string;
  role: string;
  status: "wired" | "candidate" | "future";
  installed: boolean;
  sidecarPath?: string;
  repo?: { repo: string; directory: string; priority: number };
  local?: Array<{ path: string; exists: boolean; type?: string; updatedAt?: string; error?: string }>;
}

interface VoiceStackResponse {
  sidecarRoot: string;
  summary: { total: number; installed: number; wired: number; candidates: number };
  items: VoiceStackItem[];
}

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
  const [agentJobs, setAgentJobs] = useState<AgentJob[]>([]);
  const [agentJobStatus, setAgentJobStatus] = useState("Loading agent job queue...");
  const [agentJobKind, setAgentJobKind] = useState<AgentJobKind>("deep-research");
  const [agentJobTitle, setAgentJobTitle] = useState("");
  const [agentJobPrompt, setAgentJobPrompt] = useState("");
  const [agentSkillRegistries, setAgentSkillRegistries] = useState<AgentSkillRegistry[]>([]);
  const [agentSkills, setAgentSkills] = useState<AgentSkillCandidate[]>([]);
  const [agentSkillStatus, setAgentSkillStatus] = useState("Loading agent skill registry...");
  const [skillName, setSkillName] = useState("");
  const [skillSourceUrl, setSkillSourceUrl] = useState("");
  const [skillRegistry, setSkillRegistry] = useState("manual");
  const [skillTrustTier, setSkillTrustTier] = useState<AgentSkillTrustTier>("community");
  const [skillDescription, setSkillDescription] = useState("");
  const [skillMd, setSkillMd] = useState("");
  const [userProfiles, setUserProfiles] = useState<PublicUserProfile[]>([]);
  const [userProfileStatus, setUserProfileStatus] = useState("Loading user profiles...");
  const [profileDraftId, setProfileDraftId] = useState("");
  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [profileUsername, setProfileUsername] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileRole, setProfileRole] = useState<UserProfileRole>("collaborator");
  const [profileTelegramChatId, setProfileTelegramChatId] = useState("");
  const [profileRemoteDomains, setProfileRemoteDomains] = useState(DEFAULT_REMOTE_DOMAINS.join(", "));
  const [profileAccessModes, setProfileAccessModes] = useState<UserProfileAccessMode[]>([
    "local-browser",
    "telegram",
  ]);
  const [profileAuthProviders, setProfileAuthProviders] = useState<UserAuthProvider[]>(["local-password"]);
  const [profileGoogleSubject, setProfileGoogleSubject] = useState("");
  const [profilePassword, setProfilePassword] = useState("");
  const [profileNotes, setProfileNotes] = useState("");
  const [authReadiness, setAuthReadiness] = useState<{
    publicUrl?: string;
    providers?: Array<{ id: string; name: string; configured: boolean; notes: string; callbackUrl?: string; rpId?: string; origin?: string }>;
  } | null>(null);
  const [uiSettings, setUiSettings] = useState<UiSettings>(() => loadUiSettings());
  const [uiStatus, setUiStatus] = useState("");
  const [voiceStack, setVoiceStack] = useState<VoiceStackResponse | null>(null);
  const [voiceStackStatus, setVoiceStackStatus] = useState("Loading voice stack...");
  const importInputRef = useRef<HTMLInputElement>(null);
  const userPortraitInputRef = useRef<HTMLInputElement>(null);
  const assistantPortraitInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const loadVoiceStack = async () => {
      try {
        const response = await fetch("/api/voice/stack", { cache: "no-store" });
        const data = (await response.json()) as VoiceStackResponse;
        if (cancelled) return;
        setVoiceStack(data);
        setVoiceStackStatus(
          `${data.summary.installed}/${data.summary.total} voice stack entries have local assets or sidecar code.`
        );
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Could not load voice stack.";
        setVoiceStackStatus(message);
      }
    };

    void loadVoiceStack();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadAgentJobs = async () => {
    try {
      const response = await fetch("/api/agent/jobs", { cache: "no-store" });
      const data = (await response.json()) as { jobs?: AgentJob[]; error?: string };
      if (!response.ok) throw new Error(data.error || `Agent jobs failed with ${response.status}.`);
      const jobs = Array.isArray(data.jobs) ? data.jobs : [];
      setAgentJobs(jobs);
      setAgentJobStatus(jobs.length ? `${jobs.length} local agent job(s) tracked.` : "No local agent jobs yet.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load agent jobs.";
      setAgentJobStatus(message);
    }
  };

  useEffect(() => {
    void loadAgentJobs();
  }, []);

  const loadAgentSkills = async () => {
    try {
      const response = await fetch("/api/agent/skills", { cache: "no-store" });
      const data = (await response.json()) as {
        registries?: AgentSkillRegistry[];
        skills?: AgentSkillCandidate[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || `Agent skills failed with ${response.status}.`);
      setAgentSkillRegistries(Array.isArray(data.registries) ? data.registries : []);
      const skills = Array.isArray(data.skills) ? data.skills : [];
      setAgentSkills(skills);
      setAgentSkillStatus(skills.length ? `${skills.length} skill candidate(s) staged.` : "No skill candidates staged yet.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load agent skills.";
      setAgentSkillStatus(message);
    }
  };

  useEffect(() => {
    void loadAgentSkills();
  }, []);

  const loadUserProfiles = async () => {
    try {
      const response = await fetch("/api/profiles", { cache: "no-store" });
      const data = (await response.json()) as { profiles?: PublicUserProfile[]; error?: string };
      if (!response.ok) throw new Error(data.error || `Profiles failed with ${response.status}.`);
      const profiles = Array.isArray(data.profiles) ? data.profiles : [];
      setUserProfiles(profiles);
      setUserProfileStatus(profiles.length ? `${profiles.length} user profile(s) configured.` : "No separate user profiles yet.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load user profiles.";
      setUserProfileStatus(message);
    }
  };

  useEffect(() => {
    void loadUserProfiles();
  }, []);

  const loadAuthReadiness = async () => {
    try {
      const response = await fetch("/api/auth/readiness", { cache: "no-store" });
      const data = await response.json();
      if (response.ok) setAuthReadiness(data);
    } catch {
      setAuthReadiness(null);
    }
  };

  useEffect(() => {
    void loadAuthReadiness();
  }, []);

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

  const updateUiSettings = (updates: Partial<UiSettings>) => {
    setUiSettings((current) => ({ ...current, ...updates }));
    setUiStatus("Unsaved local interface preferences.");
  };

  const saveCurrentUiSettings = () => {
    saveUiSettings(uiSettings);
    setUiStatus("Saved local interface, privacy, and notification preferences.");
  };

  const saveCurrentAgentToolSettings = () => {
    saveAgentToolSettings(agentToolSettings);
    setAgentToolStatus("Saved Sophia agent tool permissions locally.");
  };

  const createAgentJob = async () => {
    const prompt = agentJobPrompt.trim();
    if (!prompt) {
      setAgentJobStatus("Describe the job Sophia should prepare first.");
      return;
    }
    setAgentJobStatus("Creating supervised agent job...");
    try {
      const response = await fetch("/api/agent/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          kind: agentJobKind,
          title: agentJobTitle,
          prompt,
          requestedBy: "local",
          settings: agentToolSettings,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { job?: AgentJob; error?: string };
      if (!response.ok || !data.job) {
        throw new Error(data.error || `Could not create job (${response.status}).`);
      }
      setAgentJobs((current) => [data.job as AgentJob, ...current.filter((job) => job.id !== data.job?.id)]);
      setAgentJobPrompt("");
      setAgentJobTitle("");
      setAgentJobStatus(`${AGENT_JOB_KIND_LABELS[data.job.kind]} job queued.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create agent job.";
      setAgentJobStatus(message);
    }
  };

  const updateAgentJobAction = async (id: string, action: "approve" | "cancel" | "delete") => {
    setAgentJobStatus(
      `${action === "approve" ? "Approving" : action === "delete" ? "Deleting" : "Cancelling"} agent job...`
    );
    try {
      const response = await fetch("/api/agent/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      const data = (await response.json().catch(() => ({}))) as { job?: AgentJob; jobs?: AgentJob[]; error?: string };
      if (!response.ok || (!data.job && !data.jobs)) {
        throw new Error(data.error || `Could not update job (${response.status}).`);
      }
      if (data.jobs) {
        setAgentJobs(data.jobs);
        setAgentJobStatus("Job deleted.");
      } else {
        setAgentJobs((current) => current.map((job) => (job.id === data.job?.id ? data.job : job)));
        setAgentJobStatus(`Job ${action === "approve" ? "approved" : "cancelled"}.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update agent job.";
      setAgentJobStatus(message);
    }
  };

  const importAgentSkill = async () => {
    if (!skillName.trim() || !skillSourceUrl.trim()) {
      setAgentSkillStatus("Skill name and source URL are required.");
      return;
    }
    setAgentSkillStatus("Staging skill candidate with security scan...");
    try {
      const response = await fetch("/api/agent/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "import",
          name: skillName,
          sourceUrl: skillSourceUrl,
          registry: skillRegistry,
          trustTier: skillTrustTier,
          description: skillDescription,
          skillMd,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { skill?: AgentSkillCandidate; error?: string };
      if (!response.ok || !data.skill) {
        throw new Error(data.error || `Could not import skill (${response.status}).`);
      }
      setAgentSkills((current) => [data.skill as AgentSkillCandidate, ...current]);
      setSkillName("");
      setSkillSourceUrl("");
      setSkillDescription("");
      setSkillMd("");
      setAgentSkillStatus(`Staged ${data.skill.name} for review.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not import skill.";
      setAgentSkillStatus(message);
    }
  };

  const updateAgentSkillStatus = async (id: string, action: "approve" | "block") => {
    setAgentSkillStatus(`${action === "approve" ? "Approving" : "Blocking"} skill candidate...`);
    try {
      const response = await fetch("/api/agent/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      const data = (await response.json().catch(() => ({}))) as { skill?: AgentSkillCandidate; error?: string };
      if (!response.ok || !data.skill) {
        throw new Error(data.error || `Could not update skill (${response.status}).`);
      }
      setAgentSkills((current) => current.map((skill) => (skill.id === data.skill?.id ? data.skill : skill)));
      setAgentSkillStatus(`Skill ${action === "approve" ? "approved" : "blocked"}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update skill.";
      setAgentSkillStatus(message);
    }
  };

  const clearUserProfileDraft = () => {
    setProfileDraftId("");
    setProfileDisplayName("");
    setProfileUsername("");
    setProfileEmail("");
    setProfileRole("collaborator");
    setProfileTelegramChatId("");
    setProfileRemoteDomains(DEFAULT_REMOTE_DOMAINS.join(", "));
    setProfileAccessModes(["local-browser", "telegram"]);
    setProfileAuthProviders(["local-password"]);
    setProfileGoogleSubject("");
    setProfilePassword("");
    setProfileNotes("");
  };

  const loadUserProfileDraft = (profile: PublicUserProfile) => {
    setProfileDraftId(profile.id);
    setProfileDisplayName(profile.displayName);
    setProfileUsername(profile.username);
    setProfileEmail(profile.email);
    setProfileRole(profile.role);
    setProfileTelegramChatId(profile.telegramChatId);
    setProfileRemoteDomains(profile.remoteDomains.join(", "));
    setProfileAccessModes(profile.accessModes);
    setProfileAuthProviders(profile.authProviders);
    setProfileGoogleSubject(profile.googleSubject);
    setProfilePassword("");
    setProfileNotes(profile.notes);
    setUserProfileStatus(`Loaded ${profile.displayName}.`);
  };

  const toggleProfileAccessMode = (mode: UserProfileAccessMode) => {
    setProfileAccessModes((current) =>
      current.includes(mode) ? current.filter((item) => item !== mode) : [...current, mode]
    );
  };

  const toggleProfileAuthProvider = (provider: UserAuthProvider) => {
    setProfileAuthProviders((current) =>
      current.includes(provider) ? current.filter((item) => item !== provider) : [...current, provider]
    );
  };

  const saveUserProfileDraft = async () => {
    setUserProfileStatus("Saving user profile...");
    try {
      const response = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert",
          id: profileDraftId,
          displayName: profileDisplayName,
          username: profileUsername,
          email: profileEmail,
          role: profileRole,
          telegramChatId: profileTelegramChatId,
          remoteDomains: profileRemoteDomains,
          accessModes: profileAccessModes,
          authProviders: profileAuthProviders,
          googleSubject: profileGoogleSubject,
          password: profilePassword,
          notes: profileNotes,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        profiles?: PublicUserProfile[];
        profile?: PublicUserProfile;
        error?: string;
      };
      if (!response.ok || !data.profile) {
        throw new Error(data.error || `Could not save profile (${response.status}).`);
      }
      setUserProfiles(Array.isArray(data.profiles) ? data.profiles : [data.profile]);
      setUserProfileStatus(`Saved profile for ${data.profile.displayName}.`);
      clearUserProfileDraft();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save user profile.";
      setUserProfileStatus(message);
    }
  };

  const deleteUserProfile = async (id: string) => {
    setUserProfileStatus("Deleting user profile...");
    try {
      const response = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        profiles?: PublicUserProfile[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || `Could not delete profile (${response.status}).`);
      setUserProfiles(Array.isArray(data.profiles) ? data.profiles : []);
      if (profileDraftId === id) clearUserProfileDraft();
      setUserProfileStatus("Deleted user profile.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not delete user profile.";
      setUserProfileStatus(message);
    }
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
      uiSettings,
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
        uiSettings?: Partial<UiSettings>;
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

      if (data.uiSettings) {
        const nextUiSettings = { ...DEFAULT_UI_SETTINGS, ...data.uiSettings };
        setUiSettings(nextUiSettings);
        saveUiSettings(nextUiSettings);
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

                <div className="uvb-card">
                  <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-uvb-text-primary font-[family-name:var(--font-display)]">
                        Account Profiles
                      </h3>
                      <p className="mt-1 text-xs text-uvb-text-muted">
                        Local-first user identities for future Cloudflare remote access, Telegram linking, and separate Sophia sessions.
                      </p>
                    </div>
                    <button onClick={loadUserProfiles} className="btn-ghost text-sm">
                      Refresh Profiles
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs text-uvb-text-muted">Display Name</label>
                      <input
                        value={profileDisplayName}
                        onChange={(event) => setProfileDisplayName(event.target.value)}
                        className="input-field"
                        placeholder="Jusstin"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs text-uvb-text-muted">Username</label>
                      <input
                        value={profileUsername}
                        onChange={(event) => setProfileUsername(event.target.value)}
                        className="input-field"
                        placeholder="jusstin"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs text-uvb-text-muted">Email</label>
                      <input
                        type="email"
                        value={profileEmail}
                        onChange={(event) => setProfileEmail(event.target.value)}
                        className="input-field"
                        placeholder="name@daplab.net"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs text-uvb-text-muted">Role</label>
                      <select
                        value={profileRole}
                        onChange={(event) => setProfileRole(event.target.value as UserProfileRole)}
                        className="input-field"
                      >
                        <option value="owner">Owner</option>
                        <option value="collaborator">Collaborator</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs text-uvb-text-muted">Telegram Chat ID</label>
                      <input
                        value={profileTelegramChatId}
                        onChange={(event) => setProfileTelegramChatId(event.target.value)}
                        className="input-field"
                        placeholder="Optional Telegram user/chat id"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs text-uvb-text-muted">Password</label>
                      <input
                        type="password"
                        value={profilePassword}
                        onChange={(event) => setProfilePassword(event.target.value)}
                        className="input-field"
                        placeholder={profileDraftId ? "Leave blank to keep current password" : "Stored as PBKDF2 hash"}
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="mb-1.5 block text-xs text-uvb-text-muted">Remote Domains</label>
                    <input
                      value={profileRemoteDomains}
                      onChange={(event) => setProfileRemoteDomains(event.target.value)}
                      className="input-field"
                      placeholder="daplab.net, tacimpulse.net"
                    />
                  </div>
                  <div className="mt-3 rounded-lg border border-uvb-border/30 bg-uvb-dark-gray/40 p-3">
                    <div className="mb-3 flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-uvb-text-primary">Authentication Providers</p>
                        <p className="text-xs text-uvb-text-muted">
                          Google and passkeys become active after the callback domain and WebAuthn origin are configured.
                        </p>
                      </div>
                      <button onClick={loadAuthReadiness} className="btn-ghost text-xs">
                        Check Auth
                      </button>
                    </div>
                    <div className="mb-3 grid grid-cols-1 gap-2 xl:grid-cols-3">
                      {(authReadiness?.providers ?? []).map((provider) => (
                        <div key={provider.id} className="rounded-md border border-uvb-border/20 bg-black/10 p-2">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-uvb-text-primary">{provider.name}</span>
                            <span
                              className={`rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${
                                provider.configured
                                  ? "border-uvb-neon-green/30 text-uvb-neon-green"
                                  : "border-uvb-accent-yellow/30 text-uvb-accent-yellow"
                              }`}
                            >
                              {provider.configured ? "ready" : "setup"}
                            </span>
                          </div>
                          <p className="text-[10px] leading-relaxed text-uvb-text-muted">{provider.notes}</p>
                          {provider.callbackUrl && (
                            <p className="mt-1 break-all text-[10px] text-uvb-text-muted">{provider.callbackUrl}</p>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {[
                        ["local-password", "Password"],
                        ["google-oidc", "Google"],
                        ["passkey", "Passkey"],
                      ].map(([provider, label]) => (
                        <button
                          key={provider}
                          onClick={() => toggleProfileAuthProvider(provider as UserAuthProvider)}
                          className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                            profileAuthProviders.includes(provider as UserAuthProvider)
                              ? "border-uvb-neon-green/30 bg-uvb-deep-teal/25 text-uvb-neon-green"
                              : "border-uvb-border/30 text-uvb-text-muted hover:text-uvb-text-secondary"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <input
                      value={profileGoogleSubject}
                      onChange={(event) => setProfileGoogleSubject(event.target.value)}
                      className="input-field mt-3"
                      placeholder="Optional Google subject id after first OAuth link"
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[
                      ["local-browser", "Local Browser"],
                      ["telegram", "Telegram"],
                      ["remote-browser", "Remote Browser"],
                    ].map(([mode, label]) => (
                      <button
                        key={mode}
                        onClick={() => toggleProfileAccessMode(mode as UserProfileAccessMode)}
                        className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                          profileAccessModes.includes(mode as UserProfileAccessMode)
                            ? "border-uvb-neon-green/30 bg-uvb-deep-teal/25 text-uvb-neon-green"
                            : "border-uvb-border/30 text-uvb-text-muted hover:text-uvb-text-secondary"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={profileNotes}
                    onChange={(event) => setProfileNotes(event.target.value)}
                    className="input-field mt-3 min-h-20 resize-y"
                    placeholder="Access notes, Cloudflare tunnel route, allowed workflows..."
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button onClick={saveUserProfileDraft} className="btn-primary">
                      {profileDraftId ? "Update Account Profile" : "Create Account Profile"}
                    </button>
                    {profileDraftId && (
                      <button onClick={clearUserProfileDraft} className="btn-ghost">
                        Cancel Edit
                      </button>
                    )}
                    <span className="text-xs text-uvb-text-muted">{userProfileStatus}</span>
                  </div>

                  <div className="mt-5 space-y-3">
                    {userProfiles.map((profile) => (
                      <div key={profile.id} className="rounded-lg border border-uvb-border/30 bg-uvb-dark-gray/40 p-3">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-sm font-semibold text-uvb-text-primary">{profile.displayName}</h4>
                              <span className="rounded-full border border-uvb-steel-blue/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-uvb-steel-blue">
                                {profile.role}
                              </span>
                              <span className="rounded-full border border-uvb-border/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-uvb-text-muted">
                                {profile.passwordConfigured ? "password set" : "no password"}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-uvb-text-muted">
                              @{profile.username} · {profile.email}
                            </p>
                            <p className="mt-1 text-xs text-uvb-text-muted">
                              {profile.accessModes.join(", ")} · {profile.remoteDomains.join(", ")}
                            </p>
                            <p className="mt-1 text-xs text-uvb-text-muted">
                              Auth: {profile.authProviders.join(", ")}
                              {profile.googleSubject ? ` · Google linked` : ""}
                              {profile.passkeyCredentialCount ? ` · ${profile.passkeyCredentialCount} passkey(s)` : ""}
                            </p>
                            {profile.telegramChatId && (
                              <p className="mt-1 text-xs text-uvb-text-muted">Telegram: {profile.telegramChatId}</p>
                            )}
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <button onClick={() => loadUserProfileDraft(profile)} className="btn-ghost text-xs">
                              Edit
                            </button>
                            <button onClick={() => deleteUserProfile(profile.id)} className="btn-ghost text-xs text-red-300">
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {!userProfiles.length && (
                      <div className="rounded-lg border border-uvb-border/30 bg-uvb-dark-gray/40 p-4 text-sm text-uvb-text-muted">
                        No extra account profiles yet. Create one for Jusstin, yourself, or any future remote user.
                      </div>
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

                <div className="uvb-card">
                  <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-uvb-text-primary font-[family-name:var(--font-display)]">
                        Voice Stack Infrastructure
                      </h3>
                      <p className="mt-1 text-xs text-uvb-text-muted">{voiceStackStatus}</p>
                    </div>
                    <span className="rounded-full border border-uvb-border/30 px-3 py-1 text-[10px] uppercase tracking-wider text-uvb-text-muted">
                      {voiceStack?.sidecarRoot ?? "Z:\\Models\\_uvb-sidecars"}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {(voiceStack?.items ?? [])
                      .filter((item) => item.status !== "future")
                      .sort((a, b) => {
                        const priorityA = a.repo?.priority ?? 9;
                        const priorityB = b.repo?.priority ?? 9;
                        return priorityA - priorityB || Number(b.installed) - Number(a.installed);
                      })
                      .slice(0, 12)
                      .map((item) => (
                        <div
                          key={item.id}
                          className="rounded-lg border border-uvb-border/25 bg-uvb-dark-gray/40 p-3"
                        >
                          <div className="mb-2 flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-uvb-text-primary">
                                {item.name}
                              </p>
                              <p className="mt-0.5 text-xs text-uvb-text-muted">{item.role}</p>
                            </div>
                            <span
                              className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-wider ${
                                item.installed
                                  ? "border-uvb-neon-green/30 text-uvb-neon-green"
                                  : "border-uvb-border/30 text-uvb-text-muted"
                              }`}
                            >
                              {item.installed ? "local" : "staged"}
                            </span>
                          </div>
                          <div className="space-y-1 text-[11px] text-uvb-text-muted">
                            <p>
                              <span className="text-uvb-text-secondary">Kind:</span> {item.kind} / {item.status}
                            </p>
                            {item.repo && (
                              <p className="break-all">
                                <span className="text-uvb-text-secondary">Repo:</span> {item.repo.repo}
                              </p>
                            )}
                            {item.sidecarPath && (
                              <p className="break-all">
                                <span className="text-uvb-text-secondary">Sidecar:</span> {item.sidecarPath}
                              </p>
                            )}
                            {item.local?.find((entry) => entry.exists) && (
                              <p className="break-all">
                                <span className="text-uvb-text-secondary">Found:</span>{" "}
                                {item.local.find((entry) => entry.exists)?.path}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                  <div className="mt-4 rounded-lg border border-uvb-steel-blue/20 bg-uvb-steel-blue/10 p-3">
                    <p className="text-xs text-uvb-text-secondary">
                      Bootstrap command: <span className="font-[family-name:var(--font-mono)] text-uvb-text-primary">
                        bun run voice:bootstrap
                      </span>
                    </p>
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
                    Capability Readiness
                  </h3>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {AGENT_CAPABILITY_READINESS.map((item) => {
                      const enabled =
                        item.title === "Web Research"
                          ? agentToolSettings.webResearchEnabled && agentToolSettings.networkEnabled
                          : item.title === "Browser Use"
                            ? agentToolSettings.browserUseEnabled
                            : item.title === "Local Coding"
                              ? agentToolSettings.codingTasksEnabled
                              : item.title === "Kilo Code Gateway"
                                ? agentToolSettings.codingProvider === "kilo-gateway"
                                : item.title === "Computer Use"
                                  ? agentToolSettings.localComputerUseEnabled
                                  : true;
                      const tone =
                        item.status === "configured"
                          ? "border-uvb-steel-blue/30 text-uvb-steel-blue"
                          : item.status === "partial"
                            ? "border-uvb-accent-yellow/30 text-uvb-accent-yellow"
                            : item.status === "optional"
                              ? "border-uvb-royal-purple/30 text-uvb-royal-purple"
                              : "border-uvb-border/30 text-uvb-text-muted";
                      return (
                        <div
                          key={item.title}
                          className={`rounded-lg border p-3 ${
                            enabled ? "border-uvb-border/30 bg-uvb-dark-gray/40" : "border-uvb-border/20 bg-uvb-dark-gray/20 opacity-70"
                          }`}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <h4 className="text-sm font-semibold text-uvb-text-primary">{item.title}</h4>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${tone}`}>
                              {enabled ? item.status : "disabled"}
                            </span>
                          </div>
                          <p className="text-xs leading-relaxed text-uvb-text-muted">{item.detail}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="uvb-card">
                  <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-uvb-text-primary font-[family-name:var(--font-display)]">
                        Supervised Agent Job Queue
                      </h3>
                      <p className="mt-1 text-xs text-uvb-text-muted">
                        Create approved work packets for Sophia research, browser, coding, and computer-use runners.
                      </p>
                    </div>
                    <button onClick={loadAgentJobs} className="btn-ghost text-sm">
                      Refresh Queue
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
                    <div>
                      <label className="mb-1.5 block text-xs text-uvb-text-muted">Job Type</label>
                      <select
                        value={agentJobKind}
                        onChange={(event) => setAgentJobKind(event.target.value as AgentJobKind)}
                        className="input-field"
                      >
                        {(Object.entries(AGENT_JOB_KIND_LABELS) as Array<[AgentJobKind, string]>).map(([kind, label]) => (
                          <option key={kind} value={kind}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs text-uvb-text-muted">Title</label>
                      <input
                        value={agentJobTitle}
                        onChange={(event) => setAgentJobTitle(event.target.value)}
                        className="input-field"
                        placeholder="Optional short label"
                      />
                    </div>
                  </div>
                  <textarea
                    value={agentJobPrompt}
                    onChange={(event) => setAgentJobPrompt(event.target.value)}
                    className="input-field mt-3 min-h-28 resize-y"
                    placeholder="Describe the research, browser workflow, coding task, or local action Sophia should prepare."
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button onClick={createAgentJob} className="btn-primary">
                      Queue Agent Job
                    </button>
                    <span className="text-xs text-uvb-text-muted">{agentJobStatus}</span>
                  </div>

                  <div className="mt-5 space-y-3">
                    {agentJobs.slice(0, 6).map((job) => (
                      <div key={job.id} className="rounded-lg border border-uvb-border/30 bg-uvb-dark-gray/40 p-3">
                        <div className="mb-2 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-sm font-semibold text-uvb-text-primary">{job.title}</h4>
                              <span className="rounded-full border border-uvb-steel-blue/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-uvb-steel-blue">
                                {AGENT_JOB_KIND_LABELS[job.kind]}
                              </span>
                              <span className="rounded-full border border-uvb-border/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-uvb-text-muted">
                                {job.status}
                              </span>
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-uvb-text-muted">{job.prompt}</p>
                          </div>
                          {job.status === "pending-approval" && (
                            <div className="flex shrink-0 gap-2">
                              <button onClick={() => updateAgentJobAction(job.id, "approve")} className="btn-primary text-xs">
                                Approve
                              </button>
                              <button onClick={() => updateAgentJobAction(job.id, "cancel")} className="btn-ghost text-xs">
                                Cancel
                              </button>
                            </div>
                          )}
                          {job.status !== "pending-approval" && (
                            <button onClick={() => updateAgentJobAction(job.id, "delete")} className="btn-ghost shrink-0 text-xs">
                              Delete
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                          {job.executionPlan.slice(0, 4).map((step, index) => (
                            <p key={`${job.id}:${index}`} className="rounded-md border border-uvb-border/20 bg-black/10 p-2 text-[11px] text-uvb-text-muted">
                              {index + 1}. {step}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                    {!agentJobs.length && (
                      <div className="rounded-lg border border-uvb-border/30 bg-uvb-dark-gray/40 p-4 text-sm text-uvb-text-muted">
                        No jobs queued yet. Create one to stage Sophia&apos;s next supervised action.
                      </div>
                    )}
                  </div>
                </div>

                <div className="uvb-card">
                  <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-uvb-text-primary font-[family-name:var(--font-display)]">
                        Agent Skill Intake
                      </h3>
                      <p className="mt-1 text-xs text-uvb-text-muted">
                        Stage SKILL.md-style capabilities from open registries without auto-installing untrusted code.
                      </p>
                    </div>
                    <button onClick={loadAgentSkills} className="btn-ghost text-sm">
                      Refresh Skills
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                    {agentSkillRegistries.slice(0, 6).map((registry) => (
                      <a
                        key={registry.id}
                        href={registry.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-uvb-border/30 bg-uvb-dark-gray/40 p-3 transition-colors hover:border-uvb-steel-blue/40"
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <h4 className="text-sm font-semibold text-uvb-text-primary">{registry.name}</h4>
                          <span className="rounded-full border border-uvb-border/30 px-2 py-0.5 text-[9px] uppercase tracking-wider text-uvb-text-muted">
                            registry
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed text-uvb-text-muted">{registry.notes}</p>
                      </a>
                    ))}
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs text-uvb-text-muted">Skill Name</label>
                      <input
                        value={skillName}
                        onChange={(event) => setSkillName(event.target.value)}
                        className="input-field"
                        placeholder="Browser research playbook"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs text-uvb-text-muted">Source URL</label>
                      <input
                        value={skillSourceUrl}
                        onChange={(event) => setSkillSourceUrl(event.target.value)}
                        className="input-field"
                        placeholder="https://github.com/org/repo/tree/main/skill"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs text-uvb-text-muted">Registry</label>
                      <select
                        value={skillRegistry}
                        onChange={(event) => setSkillRegistry(event.target.value)}
                        className="input-field"
                      >
                        <option value="manual">Manual / direct URL</option>
                        {agentSkillRegistries.map((registry) => (
                          <option key={registry.id} value={registry.id}>
                            {registry.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs text-uvb-text-muted">Trust Tier</label>
                      <select
                        value={skillTrustTier}
                        onChange={(event) => setSkillTrustTier(event.target.value as AgentSkillTrustTier)}
                        className="input-field"
                      >
                        <option value="community">Community</option>
                        <option value="reviewed">Reviewed</option>
                        <option value="verified">Verified</option>
                        <option value="local">Local</option>
                      </select>
                    </div>
                  </div>
                  <input
                    value={skillDescription}
                    onChange={(event) => setSkillDescription(event.target.value)}
                    className="input-field mt-3"
                    placeholder="What this skill should let Sophia do"
                  />
                  <textarea
                    value={skillMd}
                    onChange={(event) => setSkillMd(event.target.value)}
                    className="input-field mt-3 min-h-28 resize-y"
                    placeholder="Optional SKILL.md content for local security scan before approval"
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button onClick={importAgentSkill} className="btn-primary">
                      Stage Skill Candidate
                    </button>
                    <span className="text-xs text-uvb-text-muted">{agentSkillStatus}</span>
                  </div>

                  <div className="mt-5 space-y-3">
                    {agentSkills.slice(0, 6).map((skill) => (
                      <div key={skill.id} className="rounded-lg border border-uvb-border/30 bg-uvb-dark-gray/40 p-3">
                        <div className="mb-2 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-sm font-semibold text-uvb-text-primary">{skill.name}</h4>
                              <span className="rounded-full border border-uvb-border/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-uvb-text-muted">
                                {skill.trustTier}
                              </span>
                              <span className="rounded-full border border-uvb-steel-blue/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-uvb-steel-blue">
                                {skill.status}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-uvb-text-muted">{skill.description || skill.sourceUrl}</p>
                          </div>
                          {skill.status === "candidate" && (
                            <div className="flex shrink-0 gap-2">
                              <button onClick={() => updateAgentSkillStatus(skill.id, "approve")} className="btn-primary text-xs">
                                Approve
                              </button>
                              <button onClick={() => updateAgentSkillStatus(skill.id, "block")} className="btn-ghost text-xs">
                                Block
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {skill.risks.map((risk, index) => (
                            <span
                              key={`${skill.id}:risk:${index}`}
                              className={`rounded-md border px-2 py-1 text-[10px] ${
                                risk.level === "high"
                                  ? "border-red-500/30 text-red-300"
                                  : risk.level === "medium"
                                    ? "border-uvb-accent-yellow/30 text-uvb-accent-yellow"
                                    : "border-uvb-neon-green/30 text-uvb-neon-green"
                              }`}
                            >
                              {risk.level}: {risk.reason}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                    {!agentSkills.length && (
                      <div className="rounded-lg border border-uvb-border/30 bg-uvb-dark-gray/40 p-4 text-sm text-uvb-text-muted">
                        No external skills staged yet. Stage metadata first, then approve only after review.
                      </div>
                    )}
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
                  <h3 className="mb-4 text-sm font-semibold text-uvb-text-primary font-[family-name:var(--font-display)]">
                    Infrastructure Priority Stack
                  </h3>
                  <div className="space-y-3">
                    {[
                      {
                        priority: "P0",
                        title: "Approval Queue + Audit Trail",
                        detail:
                          "Before Sophia can execute local actions, every browser/computer/coding tool call needs a visible queued approval, result, and rollback note.",
                      },
                      {
                        priority: "P0",
                        title: "Browser-Use Runtime",
                        detail:
                          "Wire a Playwright/browser-use style runner for page navigation, screenshots, forms, and logged-in web workflows inside the configured domain scope.",
                      },
                      {
                        priority: "P1",
                        title: "Coding Agent Adapter",
                        detail:
                          "Add an adapter that can route coding jobs to Local UVB, Kilo Gateway, Kilo CLI/ACP, or OpenHands-style sandbox execution.",
                      },
                      {
                        priority: "P1",
                        title: "Workspace Patch Sandbox",
                        detail:
                          "Keep Sophia's file edits inside a declared workspace, show diffs before applying, and block secrets or dangerous paths by default.",
                      },
                      {
                        priority: "P2",
                        title: "Computer-Use Bridge",
                        detail:
                          "Add Windows UI Automation or a supervised desktop bridge after browser tools are stable, because OS-level control has higher risk.",
                      },
                      {
                        priority: "P2",
                        title: "Memory Retrieval Into Chat",
                        detail:
                          "Promote the Memory Bank from searchable storage into opt-in context retrieval with citations to the source thread or pinned memory.",
                      },
                      {
                        priority: "P3",
                        title: "Provider Health + Fallbacks",
                        detail:
                          "Probe local/Kilo/custom providers, display latency/errors, and select free or local fallbacks before paid quota is touched.",
                      },
                    ].map((item) => (
                      <div
                        key={item.title}
                        className="rounded-lg border border-uvb-border/30 bg-uvb-dark-gray/40 p-3"
                      >
                        <div className="mb-1 flex items-center gap-2">
                          <span className="rounded-full border border-uvb-neon-green/30 px-2 py-0.5 text-[10px] font-semibold text-uvb-neon-green">
                            {item.priority}
                          </span>
                          <h4 className="text-sm font-semibold text-uvb-text-primary">
                            {item.title}
                          </h4>
                        </div>
                        <p className="text-xs leading-relaxed text-uvb-text-muted">
                          {item.detail}
                        </p>
                      </div>
                    ))}
                  </div>
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
                    {UI_THEMES.map(
                      (theme) => (
                        <button
                          key={theme.id}
                          onClick={() => updateUiSettings({ theme: theme.id })}
                          className={`p-4 rounded-lg border text-center transition-all ${
                            uiSettings.theme === theme.id
                              ? "border-uvb-neon-green/40 bg-uvb-deep-teal/10"
                              : "border-uvb-border/30 hover:border-uvb-border"
                          }`}
                        >
                          <div
                            className="w-full h-16 rounded-lg mb-2"
                            style={{ background: theme.preview }}
                          />
                          <span className="text-xs text-uvb-text-secondary">
                            {theme.name}
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
                    {UI_ACCENTS.map((accent) => (
                      <button
                        key={accent.name}
                        onClick={() =>
                          updateUiSettings({ accentName: accent.name, accentColor: accent.color })
                        }
                        className="flex flex-col items-center gap-1.5"
                      >
                        <span
                          className={`w-8 h-8 rounded-full border-2 ${
                            uiSettings.accentName === accent.name
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
                    <button
                      onClick={() => updateUiSettings({ particlesEnabled: !uiSettings.particlesEnabled })}
                      className={`w-11 h-6 rounded-full relative ${
                        uiSettings.particlesEnabled ? "bg-uvb-neon-green/30" : "bg-uvb-light-gray"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-5 h-5 rounded-full shadow transition-all ${
                          uiSettings.particlesEnabled
                            ? "right-0.5 bg-uvb-neon-green"
                            : "left-0.5 bg-uvb-text-muted"
                        }`}
                      />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button onClick={saveCurrentUiSettings} className="btn-primary">
                    Save Interface Settings
                  </button>
                  <button
                    onClick={() => {
                      setUiSettings(DEFAULT_UI_SETTINGS);
                      saveUiSettings(DEFAULT_UI_SETTINGS);
                      setUiStatus("Restored and saved default interface settings.");
                    }}
                    className="btn-ghost"
                  >
                    Reset
                  </button>
                  {uiStatus && <span className="text-xs text-uvb-text-muted">{uiStatus}</span>}
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
                          Memory Retrieval
                        </p>
                        <p className="text-xs text-uvb-text-muted">
                          Staged until embeddings and chat injection are wired
                        </p>
                      </div>
                      <button
                        onClick={() =>
                          updateUiSettings({ ragRetrievalEnabled: !uiSettings.ragRetrievalEnabled })
                        }
                        className={`w-11 h-6 rounded-full relative ${
                          uiSettings.ragRetrievalEnabled ? "bg-uvb-accent-yellow/30" : "bg-uvb-light-gray"
                        }`}
                        title="Preference saved locally; retrieval pipeline is staged."
                      >
                        <span
                          className={`absolute top-0.5 w-5 h-5 rounded-full shadow transition-all ${
                            uiSettings.ragRetrievalEnabled
                              ? "right-0.5 bg-uvb-accent-yellow"
                              : "left-0.5 bg-uvb-text-muted"
                          }`}
                        />
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
                        enabled: uiSettings.localDataOnly,
                        locked: true,
                        update: () => undefined,
                      },
                      {
                        label: "Encrypted Storage",
                        desc: "Preference saved; encrypted thread storage is staged",
                        enabled: uiSettings.encryptedStorage,
                        update: () =>
                          updateUiSettings({ encryptedStorage: !uiSettings.encryptedStorage }),
                      },
                      {
                        label: "Auto-Save Threads",
                        desc: "Conversation text is persisted locally; attachment payloads are pruned for quota safety",
                        enabled: uiSettings.autoSaveThreads,
                        locked: true,
                        update: () => undefined,
                      },
                      {
                        label: "Telemetry",
                        desc: "No telemetry is sent by UVB",
                        enabled: uiSettings.telemetryEnabled,
                        locked: true,
                        update: () => undefined,
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
                          onClick={setting.update}
                          disabled={setting.locked}
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
                <div className="flex flex-wrap items-center gap-3">
                  <button onClick={saveCurrentUiSettings} className="btn-primary">
                    Save Security Preferences
                  </button>
                  {uiStatus && <span className="text-xs text-uvb-text-muted">{uiStatus}</span>}
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
                        enabled: uiSettings.notifyTaskComplete,
                        update: () =>
                          updateUiSettings({ notifyTaskComplete: !uiSettings.notifyTaskComplete }),
                      },
                      {
                        label: "Voice Ready",
                        desc: "When voice processing is complete",
                        enabled: uiSettings.notifyVoiceReady,
                        update: () =>
                          updateUiSettings({ notifyVoiceReady: !uiSettings.notifyVoiceReady }),
                      },
                      {
                        label: "System Alerts",
                        desc: "Critical system notifications",
                        enabled: uiSettings.notifySystemAlerts,
                        update: () =>
                          updateUiSettings({ notifySystemAlerts: !uiSettings.notifySystemAlerts }),
                      },
                      {
                        label: "Sound Effects",
                        desc: "Audio feedback for interactions",
                        enabled: uiSettings.soundEffectsEnabled,
                        update: () =>
                          updateUiSettings({ soundEffectsEnabled: !uiSettings.soundEffectsEnabled }),
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
                          onClick={setting.update}
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
                <div className="flex flex-wrap items-center gap-3">
                  <button onClick={saveCurrentUiSettings} className="btn-primary">
                    Save Notification Preferences
                  </button>
                  {uiStatus && <span className="text-xs text-uvb-text-muted">{uiStatus}</span>}
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
