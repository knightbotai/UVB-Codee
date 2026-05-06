"use client";

export const AGENT_TOOL_SETTINGS_UPDATED_EVENT = "uvb:agent-tool-settings-updated";

export type AgentApprovalMode =
  | "ask-every-time"
  | "read-only-auto"
  | "workspace-auto"
  | "trusted-local";

export type AgentCodingProvider = "local-uvb" | "kilo-gateway" | "openai-compatible";

export interface AgentToolSettings {
  browserUseEnabled: boolean;
  webResearchEnabled: boolean;
  localComputerUseEnabled: boolean;
  codingTasksEnabled: boolean;
  terminalEnabled: boolean;
  fileEditsEnabled: boolean;
  gitEnabled: boolean;
  networkEnabled: boolean;
  approvalMode: AgentApprovalMode;
  workspaceRoot: string;
  allowedDomains: string;
  blockedPaths: string;
  codingProvider: AgentCodingProvider;
  providerBaseUrl: string;
  providerModel: string;
  providerApiKey: string;
  preferFreeModels: boolean;
  auditLogEnabled: boolean;
}

export const DEFAULT_AGENT_TOOL_SETTINGS: AgentToolSettings = {
  browserUseEnabled: true,
  webResearchEnabled: true,
  localComputerUseEnabled: false,
  codingTasksEnabled: true,
  terminalEnabled: false,
  fileEditsEnabled: false,
  gitEnabled: false,
  networkEnabled: true,
  approvalMode: "ask-every-time",
  workspaceRoot: "D:\\UVB-KnightBot-Export",
  allowedDomains: "kilo.ai, docs.kilo.ai, github.com, npmjs.com",
  blockedPaths: ".env*, **/node_modules/**, C:\\Users\\*\\AppData\\Roaming\\Telegram Desktop\\tdata",
  codingProvider: "local-uvb",
  providerBaseUrl: "https://api.kilo.ai/api/gateway",
  providerModel: "",
  providerApiKey: "",
  preferFreeModels: true,
  auditLogEnabled: true,
};

const STORAGE_KEY = "uvb:agent-tool-settings";

function safeString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function safeBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeAgentToolSettings(
  settings: Partial<AgentToolSettings> = {}
): AgentToolSettings {
  const approvalMode: AgentApprovalMode =
    settings.approvalMode === "read-only-auto" ||
    settings.approvalMode === "workspace-auto" ||
    settings.approvalMode === "trusted-local"
      ? settings.approvalMode
      : "ask-every-time";
  const codingProvider: AgentCodingProvider =
    settings.codingProvider === "kilo-gateway" ||
    settings.codingProvider === "openai-compatible"
      ? settings.codingProvider
      : "local-uvb";

  return {
    browserUseEnabled: safeBoolean(
      settings.browserUseEnabled,
      DEFAULT_AGENT_TOOL_SETTINGS.browserUseEnabled
    ),
    webResearchEnabled: safeBoolean(
      settings.webResearchEnabled,
      DEFAULT_AGENT_TOOL_SETTINGS.webResearchEnabled
    ),
    localComputerUseEnabled: safeBoolean(
      settings.localComputerUseEnabled,
      DEFAULT_AGENT_TOOL_SETTINGS.localComputerUseEnabled
    ),
    codingTasksEnabled: safeBoolean(
      settings.codingTasksEnabled,
      DEFAULT_AGENT_TOOL_SETTINGS.codingTasksEnabled
    ),
    terminalEnabled: safeBoolean(settings.terminalEnabled, DEFAULT_AGENT_TOOL_SETTINGS.terminalEnabled),
    fileEditsEnabled: safeBoolean(settings.fileEditsEnabled, DEFAULT_AGENT_TOOL_SETTINGS.fileEditsEnabled),
    gitEnabled: safeBoolean(settings.gitEnabled, DEFAULT_AGENT_TOOL_SETTINGS.gitEnabled),
    networkEnabled: safeBoolean(settings.networkEnabled, DEFAULT_AGENT_TOOL_SETTINGS.networkEnabled),
    approvalMode,
    workspaceRoot: safeString(settings.workspaceRoot, DEFAULT_AGENT_TOOL_SETTINGS.workspaceRoot),
    allowedDomains: safeString(settings.allowedDomains, DEFAULT_AGENT_TOOL_SETTINGS.allowedDomains),
    blockedPaths: safeString(settings.blockedPaths, DEFAULT_AGENT_TOOL_SETTINGS.blockedPaths),
    codingProvider,
    providerBaseUrl: safeString(settings.providerBaseUrl, DEFAULT_AGENT_TOOL_SETTINGS.providerBaseUrl),
    providerModel: safeString(settings.providerModel, DEFAULT_AGENT_TOOL_SETTINGS.providerModel),
    providerApiKey: safeString(settings.providerApiKey, DEFAULT_AGENT_TOOL_SETTINGS.providerApiKey),
    preferFreeModels: safeBoolean(
      settings.preferFreeModels,
      DEFAULT_AGENT_TOOL_SETTINGS.preferFreeModels
    ),
    auditLogEnabled: safeBoolean(
      settings.auditLogEnabled,
      DEFAULT_AGENT_TOOL_SETTINGS.auditLogEnabled
    ),
  };
}

export function loadAgentToolSettings(): AgentToolSettings {
  if (typeof window === "undefined") return DEFAULT_AGENT_TOOL_SETTINGS;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeAgentToolSettings(JSON.parse(raw) as Partial<AgentToolSettings>) : DEFAULT_AGENT_TOOL_SETTINGS;
  } catch {
    return DEFAULT_AGENT_TOOL_SETTINGS;
  }
}

export function saveAgentToolSettings(settings: AgentToolSettings) {
  if (typeof window === "undefined") return;
  const normalized = normalizeAgentToolSettings(settings);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent(AGENT_TOOL_SETTINGS_UPDATED_EVENT, { detail: normalized }));
}
