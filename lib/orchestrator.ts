import { chatCompletion } from "./llm-client";
import { buildMessages, extractCode } from "./prompt";
import { callVerifier, type ErrorCategory, type VerifierResponse } from "./verifier";
import type { Task } from "./tasks";

export interface ModelConfig {
  id: string;
  label: string;
  provider: string;
  model: string;
  baseUrl: string;
  apiKey?: string;
}

export interface GenerationConfig {
  temperature: number;
  maxTokens: number;
  llmTimeoutMs: number;
  signal?: AbortSignal;
}

export interface VerifierConfig {
  baseUrl: string;
}

export interface ScenarioRun {
  taskId: string;
  pass: boolean;
  category: ErrorCategory | "generation_failed";
  rawResponse: string;
  reasoning?: string;
  extractedCode: string;
  verifier?: VerifierResponse;
  errorMessage?: string;
  genTimeMs: number;
  verifyTimeMs: number;
}

export type ProgressFn = (msg: string) => Promise<void> | void;

export async function runScenario(
  task: Task,
  model: ModelConfig,
  gen: GenerationConfig,
  verifier: VerifierConfig,
  progress?: ProgressFn,
): Promise<ScenarioRun> {
  const messages = buildMessages(task);

  await progress?.(`Generating ${task.id} (${task.title})…`);

  const genStart = Date.now();
  let chat;
  try {
    chat = await chatCompletion({
      baseUrl: model.baseUrl,
      apiKey: model.apiKey,
      model: model.model,
      messages,
      temperature: gen.temperature,
      maxTokens: gen.maxTokens,
      timeoutMs: gen.llmTimeoutMs,
      signal: gen.signal,
    });
  } catch (e) {
    return {
      taskId: task.id,
      pass: false,
      category: "generation_failed",
      rawResponse: "",
      extractedCode: "",
      genTimeMs: Date.now() - genStart,
      verifyTimeMs: 0,
      errorMessage: e instanceof Error ? e.message : String(e),
    };
  }
  const genTimeMs = Date.now() - genStart;

  const code = extractCode(chat.content);
  if (!code) {
    return {
      taskId: task.id,
      pass: false,
      category: "empty",
      rawResponse: chat.content,
      reasoning: chat.reasoning,
      extractedCode: "",
      genTimeMs,
      verifyTimeMs: 0,
      errorMessage: "Model returned no extractable code",
    };
  }

  await progress?.(`Verifying ${task.id}…`);

  const verifyStart = Date.now();
  let result: VerifierResponse;
  try {
    result = await callVerifier(
      verifier.baseUrl,
      {
        code,
        expected_output: task.expected_output,
        validator: task.validator,
        timeout_ms: task.timeout_ms,
      },
      gen.signal,
    );
  } catch (e) {
    return {
      taskId: task.id,
      pass: false,
      category: "runtime_error",
      rawResponse: chat.content,
      reasoning: chat.reasoning,
      extractedCode: code,
      genTimeMs,
      verifyTimeMs: Date.now() - verifyStart,
      errorMessage: `Verifier call failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  const verifyTimeMs = Date.now() - verifyStart;

  return {
    taskId: task.id,
    pass: result.pass,
    category: result.category,
    rawResponse: chat.content,
    reasoning: chat.reasoning,
    extractedCode: code,
    verifier: result,
    genTimeMs,
    verifyTimeMs,
  };
}
