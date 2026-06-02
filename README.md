# hembench — BenchLocal Bench Pack for Hemlock

Code-generation benchmark for the [Hemlock](https://github.com/hemlang/hemlock) programming language, packaged for [BenchLocal](https://github.com/stevibe/BenchLocal).

**38 scenarios** spanning six levels:

| Level | Topic                          | Weight |
| ----- | ------------------------------ | ------ |
| L1    | Syntax & control flow          | 10%    |
| L2    | Standard library               | 15%    |
| L3    | Algorithms                     | 20%    |
| L4    | Systems & concurrency          | 25%    |
| L5    | Cross-language translation     | 15%    |
| L6    | Debugging                      | 15%    |

Each task issues a single-turn prompt asking the model to write a Hemlock program. The generated code is executed inside a Docker-isolated verifier that runs the bundled `hemlock` interpreter and compares output against the task's expected result.

## Quick start

### Inside BenchLocal

Install via the BenchLocal UI by pointing it at this repo (the desktop app will build the verifier image on first run).

### Standalone CLI

You can run the pack outside BenchLocal against any OpenAI-compatible inference endpoint:

```bash
npm install
npm run build
npm run docker:verifier        # builds the hemlock verifier image
docker run -d --name hembench-verifier -p 4010:4010 hembench-verifier

node dist-cli/cli/run.js \
  --base-url http://localhost:8199 \
  --model local \
  --verifier http://localhost:4010 \
  --level L1
```

Useful flags: `--task L1-E-01`, `--level L3`, `--temperature 0.2`, `--max-tokens 8192`, `--llm-timeout 300`.

## Architecture

```
benchlocal.pack.json     # pack manifest (sampling defaults, verifier spec)
benchlocal/index.ts      # BenchLocal adapter (defineBenchPack)
lib/
  tasks.ts               # JSON task loader + level weights
  prompt.ts              # System/user message builder + code extractor
  llm-client.ts          # OpenAI-compatible chat client
  verifier.ts            # HTTP client for the verifier sidecar
  orchestrator.ts        # End-to-end per-task runner
  score.ts               # Weighted per-level scoring
cli/run.ts               # Standalone CLI runner
verification/
  Dockerfile             # Builds hemlock from source, ships HTTP wrapper
  server.py              # Flask service exposing POST /run
tasks/
  L1_syntax/             # 9 tasks
  L2_stdlib/             # 5 tasks
  L3_algorithms/         # 7 tasks
  L4_systems/            # 7 tasks
  L5_translation/        # 5 tasks
  L6_debugging/          # 5 tasks
```

## Verifier protocol

```http
POST /run
Content-Type: application/json

{
  "code": "for (let i = 1; i <= 20; i++) { ... }",
  "expected_output": "1\n2\nFizz\n4\nBuzz\n...",
  "validator": "exact_match",
  "timeout_ms": 5000
}
```

Response:

```json
{
  "pass": true,
  "category": "ok",
  "exit_code": 0,
  "actual_output": "1\n2\nFizz\n...",
  "stderr": "",
  "duration_ms": 42,
  "parses": true,
  "runs": true
}
```

Categories: `ok`, `parse_error`, `runtime_error`, `wrong_output`, `timeout`, `empty`.

## Pinning hemlock

The Dockerfile builds from `hemlang/hemlock` `main` by default. To pin to a specific commit:

```bash
docker build --build-arg HEMLOCK_REF=<sha> -t hembench-verifier ./verification
```

## License

MIT
