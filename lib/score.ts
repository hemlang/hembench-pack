import { LEVEL_WEIGHTS, LEVEL_LABELS, type Task, type TaskLevel } from "./tasks";

export interface ScoredTaskResult {
  taskId: string;
  level: TaskLevel;
  pass: boolean;
}

export interface LevelBreakdown {
  level: TaskLevel;
  label: string;
  weight: number;
  total: number;
  correct: number;
  score: number;
}

export interface ScoreSummary {
  totalScore: number;
  overall: number;
  correct: number;
  total: number;
  levels: LevelBreakdown[];
  rating: string;
}

function rate(overall: number): string {
  if (overall >= 0.85) return "Excellent";
  if (overall >= 0.70) return "Strong";
  if (overall >= 0.50) return "Adequate";
  if (overall >= 0.30) return "Weak";
  return "Poor";
}

export function scoreResults(results: ScoredTaskResult[]): ScoreSummary {
  const byLevel: Record<TaskLevel, { total: number; correct: number }> = {
    L1: { total: 0, correct: 0 },
    L2: { total: 0, correct: 0 },
    L3: { total: 0, correct: 0 },
    L4: { total: 0, correct: 0 },
    L5: { total: 0, correct: 0 },
    L6: { total: 0, correct: 0 },
  };

  for (const r of results) {
    const lv = byLevel[r.level];
    if (!lv) continue;
    lv.total += 1;
    if (r.pass) lv.correct += 1;
  }

  const levels: LevelBreakdown[] = (Object.keys(byLevel) as TaskLevel[]).map((lv) => {
    const { total, correct } = byLevel[lv];
    const score = total === 0 ? 0 : correct / total;
    return {
      level: lv,
      label: LEVEL_LABELS[lv],
      weight: LEVEL_WEIGHTS[lv],
      total,
      correct,
      score,
    };
  });

  const overall = levels.reduce(
    (acc, l) => acc + (l.total > 0 ? l.score * l.weight : 0),
    0,
  );
  const reachable = levels.reduce(
    (acc, l) => acc + (l.total > 0 ? l.weight : 0),
    0,
  );
  const normalized = reachable === 0 ? 0 : overall / reachable;

  return {
    totalScore: normalized * 100,
    overall: normalized,
    correct: results.filter((r) => r.pass).length,
    total: results.length,
    levels,
    rating: rate(normalized),
  };
}

export function taskLevelFromId(taskId: string): TaskLevel {
  const lv = taskId.slice(0, 2) as TaskLevel;
  return lv;
}
