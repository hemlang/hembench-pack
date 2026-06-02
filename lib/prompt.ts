import type { Task } from "./tasks";

export const SYSTEM_PROMPT =
  "You are a code generation assistant. You write programs in the Hemlock programming language.\n" +
  "IMPORTANT: Respond ONLY with the Hemlock source code. No markdown fences, no explanations, " +
  "no comments about the code — just the raw .hml program that can be run directly.\n" +
  "Do NOT wrap your code in ```hemlock``` or ``` blocks.\n";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export function buildMessages(task: Task): ChatMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: task.prompt },
  ];
}

const CODE_FENCE_RE = /```(?:hemlock|hml)?\s*\n([\s\S]*?)```/;
const THINK_RE = /<think>[\s\S]*?<\/think>\s*/g;

export function extractCode(raw: string): string {
  let text = (raw ?? "").trim();
  if (!text) return "";

  text = text.replace(THINK_RE, "").trim();
  if (!text) return "";

  const fenced = CODE_FENCE_RE.exec(text);
  if (fenced) return fenced[1].trim();

  if (text.startsWith("```")) {
    const lines = text.split("\n");
    if (lines[lines.length - 1].trim() === "```") {
      return lines.slice(1, -1).join("\n").trim();
    }
    return lines.slice(1).join("\n").trim();
  }

  return text;
}
