/* Standalone CLI runner — useful for testing the pack outside BenchLocal.
 * Spawns no LLM server: point it at any OpenAI-compatible base URL.
 *
 * Usage:
 *   npm run build:cli && node dist-cli/cli/run.js \
 *     --base-url http://localhost:8199 --model local \
 *     --verifier http://localhost:4010 [--task L1-E-01] [--level L1]
 */

import { join } from "node:path";
import { loadAllTasks, type Task, type TaskLevel } from "../lib/tasks";
import { runScenario } from "../lib/orchestrator";
import { scoreResults, taskLevelFromId } from "../lib/score";

interface CliArgs {
  baseUrl: string;
  apiKey?: string;
  model: string;
  verifier: string;
  task?: string;
  level?: TaskLevel;
  temperature: number;
  maxTokens: number;
  llmTimeoutMs: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
    args[key] = val;
  }
  if (!args["base-url"]) throw new Error("--base-url is required (e.g. http://localhost:8199)");
  if (!args["verifier"]) throw new Error("--verifier is required (e.g. http://localhost:4010)");
  return {
    baseUrl: args["base-url"],
    apiKey: args["api-key"],
    model: args["model"] ?? "local",
    verifier: args["verifier"],
    task: args["task"],
    level: args["level"] as TaskLevel | undefined,
    temperature: args["temperature"] ? parseFloat(args["temperature"]) : 0.2,
    maxTokens: args["max-tokens"] ? parseInt(args["max-tokens"], 10) : 8192,
    llmTimeoutMs: args["llm-timeout"] ? parseInt(args["llm-timeout"], 10) * 1000 : 300_000,
  };
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const tasksRoot = join(__dirname, "..", "..", "tasks");
  const all = loadAllTasks(tasksRoot);
  const filtered: Task[] = all.filter((t) => {
    if (cli.task && t.id !== cli.task) return false;
    if (cli.level && t.level !== cli.level) return false;
    return true;
  });

  if (filtered.length === 0) {
    console.error(`No tasks matched.`);
    process.exit(1);
  }

  const results = [];
  for (const [i, task] of filtered.entries()) {
    process.stdout.write(`[${i + 1}/${filtered.length}] ${task.id} ${task.title}… `);
    const run = await runScenario(
      task,
      { id: "cli", label: "cli", provider: "local", model: cli.model, baseUrl: cli.baseUrl, apiKey: cli.apiKey },
      { temperature: cli.temperature, maxTokens: cli.maxTokens, llmTimeoutMs: cli.llmTimeoutMs },
      { baseUrl: cli.verifier },
    );
    console.log(`${run.pass ? "PASS" : "FAIL"}  ${run.category}  gen=${run.genTimeMs}ms verify=${run.verifyTimeMs}ms`);
    results.push({ taskId: run.taskId, level: taskLevelFromId(run.taskId), pass: run.pass });
  }

  const summary = scoreResults(results);
  console.log("\n=== Summary ===");
  for (const lv of summary.levels) {
    if (lv.total === 0) continue;
    console.log(`  ${lv.level}: ${lv.correct}/${lv.total} (${(lv.score * 100).toFixed(1)}%)  weight=${lv.weight}`);
  }
  console.log(`Overall: ${summary.totalScore.toFixed(1)}%  (${summary.correct}/${summary.total})  — ${summary.rating}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
