import { join } from "node:path";
import {
  createHostHelpers,
  defineBenchPack,
  loadBenchPackManifest,
  type ProgressEmitter,
  type ScenarioResult,
  type ScenarioRunInput,
} from "@benchlocal/sdk";

import { loadAllTasks, LEVEL_LABELS, type Task } from "../lib/tasks";
import { runScenario, type ModelConfig } from "../lib/orchestrator";
import { scoreResults, taskLevelFromId, type ScoredTaskResult } from "../lib/score";

const PACK_ROOT = join(__dirname, "..", "..");
const TASKS_DIR = join(PACK_ROOT, "tasks");
const TASKS: Task[] = loadAllTasks(TASKS_DIR);

const manifest = loadBenchPackManifest(__dirname);

function toModelConfig(input: ScenarioRunInput, baseUrl: string, apiKey?: string): ModelConfig {
  return {
    id: input.model.id,
    label: input.model.label,
    provider: input.model.provider,
    model: input.model.model,
    baseUrl,
    apiKey,
  };
}

function describeCategory(category: string): string {
  switch (category) {
    case "ok": return "Output matched expected.";
    case "parse_error": return "Generated code failed to parse.";
    case "runtime_error": return "Code crashed during execution.";
    case "wrong_output": return "Code ran but output did not match expected.";
    case "timeout": return "Execution exceeded the task timeout.";
    case "empty": return "Model returned no extractable code.";
    case "generation_failed": return "LLM request failed.";
    default: return `Failed: ${category}`;
  }
}

export { manifest };

export default defineBenchPack({
  manifest,

  async listScenarios() {
    return TASKS.map((t) => ({
      id: t.id,
      title: t.title,
      category: LEVEL_LABELS[t.level],
      description: t.prompt.split("\n")[0].slice(0, 200),
      detailCards: [
        {
          title: "What this tests",
          content: `${LEVEL_LABELS[t.level]} — ${t.topic} (${t.difficulty})`,
        },
        {
          title: "Prompt",
          content: t.prompt,
        },
        {
          title: "Validator",
          content: `${t.validator} (timeout ${t.timeout_ms}ms)`,
        },
      ],
    }));
  },

  async prepare(context) {
    const helpers = createHostHelpers(context);
    const verifier = helpers.getRequiredVerifier("hemlock-runner");
    const verifierBaseUrl = verifier.url;
    if (!verifierBaseUrl) {
      throw new Error("hemlock-runner verifier is missing a url");
    }

    return {
      async runScenario(input: ScenarioRunInput, emit: ProgressEmitter): Promise<ScenarioResult> {
        const task = helpers.getScenarioById(TASKS, input.scenario.id) as Task;
        const provider = helpers.getRequiredProvider(input.model.provider, { enabledOnly: true });
        const gen = helpers.resolveGenerationRequest(input.generation);
        const timeoutSec = gen.request_timeout_seconds ?? 300;

        const emitProgress = async (message: string) => {
          await emit({
            type: "model_progress",
            modelId: input.model.id,
            scenarioId: task.id,
            message,
          });
        };

        const run = await runScenario(
          task,
          toModelConfig(input, provider.baseUrl, helpers.getSecretValue(input.model.provider)),
          {
            temperature: gen.temperature ?? 0.2,
            maxTokens: gen.max_tokens ?? 8192,
            llmTimeoutMs: timeoutSec * 1000,
            signal: input.abortSignal,
          },
          { baseUrl: verifierBaseUrl },
          emitProgress,
        );

        const log = [
          `task=${task.id} title="${task.title}" level=${task.level} difficulty=${task.difficulty}`,
          `category=${run.category} pass=${run.pass} gen_ms=${run.genTimeMs} verify_ms=${run.verifyTimeMs}`,
          run.errorMessage ? `error: ${run.errorMessage}` : "",
          run.reasoning ? `--- reasoning ---\n${run.reasoning}\n--- /reasoning ---` : "",
          `--- code ---\n${run.extractedCode}\n--- /code ---`,
          run.verifier ? `--- actual ---\n${run.verifier.actual_output}\n--- /actual ---` : "",
        ].filter(Boolean).join("\n");

        return {
          scenarioId: task.id,
          status: run.pass ? "pass" : "fail",
          score: run.pass ? 1 : 0,
          summary: describeCategory(run.category),
          note: run.errorMessage,
          rawLog: log,
          output: {
            finalAnswer: run.extractedCode,
            assistantMessages: run.rawResponse ? [run.rawResponse] : undefined,
          },
          verifier: run.verifier
            ? {
                status: run.verifier.category,
                summary: describeCategory(run.verifier.category),
                details: {
                  pass: run.verifier.pass,
                  exitCode: run.verifier.exit_code,
                  actualOutput: run.verifier.actual_output,
                  stderr: run.verifier.stderr,
                  durationMs: run.verifier.duration_ms,
                  parses: run.verifier.parses,
                  runs: run.verifier.runs,
                },
              }
            : undefined,
          timings: {
            durationMs: run.genTimeMs + run.verifyTimeMs,
          },
        };
      },

      async dispose() {},
    };
  },

  scoreModelResults(results) {
    const scored: ScoredTaskResult[] = results.map((r) => ({
      taskId: r.scenarioId,
      level: taskLevelFromId(r.scenarioId),
      pass: r.status === "pass",
    }));
    const summary = scoreResults(scored);

    return {
      totalScore: summary.totalScore,
      summary: summary.rating,
      categories: summary.levels.map((lv) => ({
        id: lv.level,
        label: lv.label,
        score: lv.score * 100,
        weight: Math.round(lv.weight * 100),
      })),
    };
  },
});
