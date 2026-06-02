export type ErrorCategory =
  | "ok"
  | "parse_error"
  | "runtime_error"
  | "wrong_output"
  | "timeout"
  | "empty";

export interface VerifierRequest {
  code: string;
  expected_output: string;
  validator: "exact_match" | "contains" | "regex";
  timeout_ms: number;
}

export interface VerifierResponse {
  pass: boolean;
  category: ErrorCategory;
  exit_code: number;
  actual_output: string;
  stderr: string;
  duration_ms: number;
  parses: boolean;
  runs: boolean;
}

export async function callVerifier(
  baseUrl: string,
  req: VerifierRequest,
  signal?: AbortSignal,
): Promise<VerifierResponse> {
  const url = `${baseUrl.replace(/\/$/, "")}/run`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Verifier HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as VerifierResponse;
}
