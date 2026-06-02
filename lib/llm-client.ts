import type { ChatMessage } from "./prompt";

export interface ChatRequest {
  baseUrl: string;
  apiKey?: string;
  model: string;
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ChatResponse {
  content: string;
  reasoning?: string;
  finishReason?: string;
}

export async function chatCompletion(req: ChatRequest): Promise<ChatResponse> {
  const url = `${req.baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (req.apiKey) headers["Authorization"] = `Bearer ${req.apiKey}`;

  const body = {
    model: req.model,
    messages: req.messages,
    temperature: req.temperature,
    max_tokens: req.maxTokens,
  };

  const ctrl = req.signal ? undefined : new AbortController();
  const timer = req.timeoutMs && ctrl ? setTimeout(() => ctrl.abort(), req.timeoutMs) : null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: req.signal ?? ctrl?.signal,
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`Chat HTTP ${res.status}: ${errBody.slice(0, 300)}`);
    }
    const data: any = await res.json();
    const msg = data?.choices?.[0]?.message ?? {};
    return {
      content: typeof msg.content === "string" ? msg.content : "",
      reasoning: typeof msg.reasoning_content === "string" ? msg.reasoning_content : undefined,
      finishReason: data?.choices?.[0]?.finish_reason,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
