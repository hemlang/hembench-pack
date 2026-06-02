import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type TaskLevel = "L1" | "L2" | "L3" | "L4" | "L5" | "L6";
export type Difficulty = "easy" | "medium" | "hard";
export type Validator = "exact_match" | "contains" | "regex";

export interface Task {
  id: string;
  level: TaskLevel;
  difficulty: Difficulty;
  title: string;
  topic: string;
  prompt: string;
  expected_output: string;
  timeout_ms: number;
  validator: Validator;
  tags: string[];
}

export const LEVEL_WEIGHTS: Record<TaskLevel, number> = {
  L1: 0.10,
  L2: 0.15,
  L3: 0.20,
  L4: 0.25,
  L5: 0.15,
  L6: 0.15,
};

export const LEVEL_DIRS: Record<TaskLevel, string> = {
  L1: "L1_syntax",
  L2: "L2_stdlib",
  L3: "L3_algorithms",
  L4: "L4_systems",
  L5: "L5_translation",
  L6: "L6_debugging",
};

export const LEVEL_LABELS: Record<TaskLevel, string> = {
  L1: "Syntax & Control Flow",
  L2: "Standard Library",
  L3: "Algorithms",
  L4: "Systems & Concurrency",
  L5: "Cross-Language Translation",
  L6: "Debugging",
};

export function loadAllTasks(tasksRoot: string): Task[] {
  const tasks: Task[] = [];
  for (const level of Object.keys(LEVEL_DIRS) as TaskLevel[]) {
    const dir = join(tasksRoot, LEVEL_DIRS[level]);
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const file of entries) {
      if (!file.endsWith(".json")) continue;
      const raw = readFileSync(join(dir, file), "utf8");
      tasks.push(JSON.parse(raw) as Task);
    }
  }
  tasks.sort((a, b) => a.id.localeCompare(b.id));
  return tasks;
}
