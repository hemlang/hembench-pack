#!/usr/bin/env python3
"""HemBench verifier service.

Receives generated Hemlock source via HTTP, executes it with the bundled
`hemlock` interpreter, and reports whether the output matches the expected
value. Designed for use as a BenchLocal pack verifier sidecar.
"""

import os
import re
import subprocess
import tempfile
import time
from pathlib import Path

from flask import Flask, jsonify, request

PORT = int(os.environ.get("PORT", "4010"))
HEMLOCK_BIN = os.environ.get("HEMLOCK_BIN", "/usr/local/bin/hemlock")
HARD_TIMEOUT_CAP_MS = 60_000
MAX_OUTPUT_BYTES = 1_048_576  # 1 MB

app = Flask(__name__)


def classify(exit_code: int, actual: str, expected: str, validator: str, timed_out: bool):
    if timed_out:
        return False, "timeout"
    if exit_code != 0:
        if "parse error" in (actual or "").lower() or "syntax error" in (actual or "").lower():
            return False, "parse_error"
        return False, "runtime_error"
    matched = compare_output(actual, expected, validator)
    return matched, "ok" if matched else "wrong_output"


def compare_output(actual: str, expected: str, validator: str) -> bool:
    if validator == "exact_match":
        return actual.rstrip("\n") == expected.rstrip("\n")
    if validator == "contains":
        return expected in actual
    if validator == "regex":
        try:
            return re.search(expected, actual) is not None
        except re.error:
            return False
    return actual.rstrip("\n") == expected.rstrip("\n")


@app.get("/health")
def health():
    return jsonify({"ok": True, "hemlock": HEMLOCK_BIN, "exists": Path(HEMLOCK_BIN).exists()})


@app.post("/run")
def run():
    body = request.get_json(force=True, silent=True) or {}
    code = body.get("code") or ""
    expected = body.get("expected_output") or ""
    validator = body.get("validator") or "exact_match"
    timeout_ms = int(body.get("timeout_ms") or 5000)
    timeout_ms = max(500, min(timeout_ms, HARD_TIMEOUT_CAP_MS))

    if not code.strip():
        return jsonify({
            "pass": False,
            "category": "empty",
            "exit_code": -1,
            "actual_output": "",
            "stderr": "no code submitted",
            "duration_ms": 0,
            "parses": False,
            "runs": False,
        })

    with tempfile.NamedTemporaryFile("w", suffix=".hml", delete=False) as f:
        f.write(code)
        f.flush()
        path = f.name

    started = time.monotonic()
    timed_out = False
    stdout = b""
    stderr = b""
    rc = -1
    try:
        try:
            proc = subprocess.run(
                [HEMLOCK_BIN, path],
                capture_output=True,
                timeout=timeout_ms / 1000.0,
                check=False,
            )
            rc = proc.returncode
            stdout = proc.stdout[:MAX_OUTPUT_BYTES]
            stderr = proc.stderr[:MAX_OUTPUT_BYTES]
        except subprocess.TimeoutExpired as e:
            timed_out = True
            stdout = (e.stdout or b"")[:MAX_OUTPUT_BYTES]
            stderr = (e.stderr or b"")[:MAX_OUTPUT_BYTES]
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass

    duration_ms = int((time.monotonic() - started) * 1000)
    actual = stdout.decode("utf-8", errors="replace")
    stderr_s = stderr.decode("utf-8", errors="replace")
    passed, category = classify(rc, actual, expected, validator, timed_out)

    parses = not (category == "parse_error")
    runs = parses and not timed_out

    return jsonify({
        "pass": passed,
        "category": category,
        "exit_code": rc,
        "actual_output": actual,
        "stderr": stderr_s,
        "duration_ms": duration_ms,
        "parses": parses,
        "runs": runs,
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT, threaded=False)
