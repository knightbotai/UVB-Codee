export interface AliasRule {
  id: string;
  label: string;
  pattern: string;
  replacement: string;
  enabled: boolean;
  notes: string;
}

export const ALIAS_RULES_UPDATED_EVENT = "uvb:alias-rules-updated";

export const DEFAULT_ALIAS_RULES: AliasRule[] = [
  {
    id: "jusstin-spelling",
    label: "Jusstin spelling",
    pattern: "\\bjustin\\b",
    replacement: "Jusstin",
    enabled: true,
    notes: "The correct spelling is J-U-S-S-T-I-N.",
  },
  {
    id: "butt-stuff-titlecase",
    label: "Butt Stuff title case",
    pattern: "\\bbut{1,2}\\s+stuf{1,2}\\b",
    replacement: "Butt Stuff",
    enabled: true,
    notes: "Canonical phrase uses two T's in Butt and capital B/S.",
  },
  {
    id: "codee-name",
    label: "Codee spelling",
    pattern: "\\bcody\\b",
    replacement: "Codee",
    enabled: true,
    notes: "The correct assistant nickname is C-O-D-E-E.",
  },
];

const STORAGE_KEY = "uvb:alias-rules";

function safeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export function normalizeAliasRules(rules: Partial<AliasRule>[] = DEFAULT_ALIAS_RULES): AliasRule[] {
  return rules
    .map((rule, index) => ({
      id: safeText(rule.id) || `alias:${index}`,
      label: safeText(rule.label) || safeText(rule.replacement) || "Alias rule",
      pattern: safeText(rule.pattern),
      replacement: safeText(rule.replacement),
      enabled: typeof rule.enabled === "boolean" ? rule.enabled : true,
      notes: safeText(rule.notes),
    }))
    .filter((rule) => rule.pattern && rule.replacement);
}

export function loadAliasRules(): AliasRule[] {
  if (typeof window === "undefined") return DEFAULT_ALIAS_RULES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeAliasRules(JSON.parse(raw) as Partial<AliasRule>[]) : DEFAULT_ALIAS_RULES;
  } catch {
    return DEFAULT_ALIAS_RULES;
  }
}

export function saveAliasRules(rules: AliasRule[]) {
  if (typeof window === "undefined") return;
  const normalized = normalizeAliasRules(rules);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent(ALIAS_RULES_UPDATED_EVENT, { detail: normalized }));
}

export function applyNameAliases(text: string, rules: AliasRule[] = DEFAULT_ALIAS_RULES) {
  return normalizeAliasRules(rules).reduce((current, rule) => {
    if (!rule.enabled) return current;
    try {
      return current.replace(new RegExp(rule.pattern, "gi"), rule.replacement);
    } catch {
      return current;
    }
  }, text);
}

export function buildAliasSystemNote(rules: AliasRule[] = DEFAULT_ALIAS_RULES) {
  const activeRules = normalizeAliasRules(rules).filter((rule) => rule.enabled);
  if (!activeRules.length) return "";
  return [
    "Alias rules: normalize these names/phrases whenever they appear in user input, assistant replies, captions, memories, or voice responses.",
    ...activeRules.map((rule) => `- ${rule.label}: ${rule.pattern} -> ${rule.replacement}. ${rule.notes}`.trim()),
  ].join("\n");
}

export function appendNameAliasSystemNote(systemPrompt: string, rules: AliasRule[] = DEFAULT_ALIAS_RULES) {
  const trimmed = systemPrompt.trim();
  const note = buildAliasSystemNote(rules);
  if (!note || trimmed.includes("Alias rules: normalize")) return trimmed;
  return [trimmed, note].filter(Boolean).join("\n\n");
}
