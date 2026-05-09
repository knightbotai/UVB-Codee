const REPEATED_FUNCTION_WORD_PATTERN =
  /\b(you|i|we|he|she|they|it|the|a|an|and|to|of|for|with|that|this)\b[\s,.;:!?-]+\1\b/giu;
const REPEATED_PHRASE_PATTERN =
  /\b([\p{L}\p{N}'-]+(?:\s+[\p{L}\p{N}'-]+){1,4})\b(?:[\s,.;:!?-]+\1\b)+/giu;
const REPEATED_TRAILING_WORD_PATTERN =
  /\b([\p{L}\p{N}'-]+)\b(?:[\s,.;:!?-]+\1\b){2,}(?=[\s.?!]*$)/giu;
const REPEATED_FILLER_PATTERN =
  /\b(uh|um|ah|er|hmm|mm)\b(?:[\s,.;:!?-]+\1\b){1,}/giu;
const EXCESSIVE_FILLER_RUN_PATTERN =
  /(?:\b(?:uh|um|ah|er|hmm|mm)\b[\s,.;:!?-]*){4,}/giu;
const PHANTOM_TRAILING_THANKS_PATTERN =
  /(?:[\s,.;:!?-]*(?:thank you|thanks|thanks for watching|thank you for watching)[\s,.;:!?-]*){1,}$/iu;
const PHANTOM_REPEATED_THANKS_PATTERN =
  /\b(thank you|thanks)\b(?:[\s,.;:!?-]+\1\b){1,}/giu;

export function cleanSttTranscript(text: string) {
  let cleaned = text.trim();
  for (let index = 0; index < 3; index += 1) {
    cleaned = cleaned
      .replace(EXCESSIVE_FILLER_RUN_PATTERN, "uh, ")
      .replace(REPEATED_FILLER_PATTERN, "$1")
      .replace(PHANTOM_REPEATED_THANKS_PATTERN, "$1")
      .replace(REPEATED_PHRASE_PATTERN, "$1")
      .replace(REPEATED_TRAILING_WORD_PATTERN, "$1")
      .replace(REPEATED_FUNCTION_WORD_PATTERN, "$1");
  }
  return cleaned.replace(PHANTOM_TRAILING_THANKS_PATTERN, "").replace(/\s{2,}/g, " ").trim();
}
