import { DEFAULT_OWNER_PROFILE } from "@/lib/userProfiles";

export interface CurrentUserContext {
  displayName?: string;
  username?: string;
  email?: string;
  telegramChatId?: string;
}

export const DEFAULT_CURRENT_USER_CONTEXT: Required<CurrentUserContext> = {
  displayName: DEFAULT_OWNER_PROFILE.displayName,
  username: DEFAULT_OWNER_PROFILE.username,
  email: DEFAULT_OWNER_PROFILE.email,
  telegramChatId: DEFAULT_OWNER_PROFILE.telegramChatId,
};

const PROFILE_ANCHOR_NOTE =
  "Known profile anchors: Richard is James Richard Scott / TacImpulse, a 6'1\", about 220 lb, bald, bearded man. Jusstin is separate, about 5'8\", slimmer, usually with head hair and little significant facial hair. Do not swap their identities in conversation or image descriptions.";

export function normalizeCurrentUserContext(
  context: CurrentUserContext = DEFAULT_CURRENT_USER_CONTEXT
): Required<CurrentUserContext> {
  return {
    displayName:
      context.displayName?.trim() || DEFAULT_CURRENT_USER_CONTEXT.displayName,
    username: context.username?.trim() || DEFAULT_CURRENT_USER_CONTEXT.username,
    email: context.email?.trim() || DEFAULT_CURRENT_USER_CONTEXT.email,
    telegramChatId:
      context.telegramChatId?.trim() || DEFAULT_CURRENT_USER_CONTEXT.telegramChatId,
  };
}

export function buildCurrentUserSystemNote(context?: CurrentUserContext) {
  const currentUser = normalizeCurrentUserContext(context);

  return [
    `Current default UVB user: ${currentUser.displayName}.`,
    `Username: ${currentUser.username}.`,
    `Telegram chat ID: ${currentUser.telegramChatId}.`,
    "Unless the latest user message explicitly says another person is present or speaking, treat the current speaker as Richard / TacImpulse.",
    "Jusstin is a separate person and friend, never the default speaker inferred from alias rules or chat history.",
    PROFILE_ANCHOR_NOTE,
  ].join(" ");
}

export function appendCurrentUserSystemNote(
  systemPrompt: string,
  context?: CurrentUserContext
) {
  const trimmed = systemPrompt.trim();
  const note = buildCurrentUserSystemNote(context);
  if (
    trimmed.includes("Current default UVB user:") &&
    trimmed.includes("Known profile anchors:")
  ) {
    return trimmed;
  }
  if (trimmed.includes("Current default UVB user:")) {
    return [trimmed, PROFILE_ANCHOR_NOTE].filter(Boolean).join("\n\n");
  }
  return [trimmed, note].filter(Boolean).join("\n\n");
}
