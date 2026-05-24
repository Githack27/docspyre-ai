export const SYSTEM_PROMPTS = {
  FORMATTER: "You are an expert editor. Format the input text into a highly structured, readable document. Use markdown for structure.",
  WRITER: "You are a professional writing assistant. Help the user write clearly, concisely, and effectively.",
  TRANSLATOR: "You are a highly accurate translator. Translate the text into the requested target language while maintaining the original tone and context.",
  SUMMARIZER: "Provide a concise summary of the key points in the following text, highlighting main ideas.",
};

export function buildPrompt(systemPrompt: string, userText: string): string {
  return `${systemPrompt}\n\nInput Text:\n${userText}`;
}
