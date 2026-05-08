const REPEATED_FUNCTION_WORD_PATTERN =
  /\b(you|i|we|he|she|they|it|the|a|an|and|to|of|for|with|that|this)\b[\s,.;:!?-]+\1\b/giu;
const REPEATED_PHRASE_PATTERN =
  /\b([\p{L}\p{N}'-]+(?:\s+[\p{L}\p{N}'-]+){1,4})\b(?:[\s,.;:!?-]+\1\b)+/giu;
const REPEATED_TRAILING_WORD_PATTERN =
  /\b([\p{L}\p{N}'-]+)\b(?:[\s,.;:!?-]+\1\b){2,}(?=[\s.?!]*$)/giu;

export function cleanSttTranscript(text: string) {
  let cleaned = text.trim();
  for (let index = 0; index < 3; index += 1) {
    cleaned = cleaned
      .replace(REPEATED_PHRASE_PATTERN, "$1")
      .replace(REPEATED_TRAILING_WORD_PATTERN, "$1")
      .replace(REPEATED_FUNCTION_WORD_PATTERN, "$1");
  }
  return cleaned.replace(/\s{2,}/g, " ").trim();
}
