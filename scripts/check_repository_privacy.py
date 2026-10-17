"""Inspect staged blobs without printing matched personal content or secrets."""

import re
import subprocess
from pathlib import PurePosixPath

ROOTS = {"backend", "frontend", "vehicles", "tests", "scripts", "docs", "data"}
TOP_FILES = {
    "README.md",
    "LICENSE",
    "pyproject.toml",
    "uv.lock",
    ".gitignore",
    ".gitattributes",
    ".env.example",
}
FORBIDDEN_PARTS = {
    "data",
    ".cache",
    ".venv",
    ".python",
    "node_modules",
    "dist",
    "__pycache__",
    "test-results",
    "playwright-report",
    "blob-report",
    ".aws",
    ".codex",
    ".agents",
}
FORBIDDEN_SUFFIXES = {
    ".ndjson",
    ".jsonl",
    ".sqlite",
    ".sqlite3",
    ".db",
    ".csv",
    ".asc",
    ".blf",
    ".pcap",
    ".pcapng",
    ".candump",
    ".log",
    ".png",
    ".jpg",
    ".jpeg",
    ".heic",
    ".zip",
    ".7z",
    ".pem",
    ".key",
    ".pfx",
    ".p12",
    ".bak",
    ".pyc",
}
PATTERNS = {
    "personal Windows path": re.compile(r"[A-Z]:[/\\]Users[/\\][^\s/\\]+", re.I),
    "device MAC address": re.compile(r"(?<![\w])(?:[0-9A-F]{2}[:-]){5}[0-9A-F]{2}(?![\w])", re.I),
    "device Bluetooth identity": re.compile(r"BTH" + r"ENUM|_C0000" + r"0000|OBDLink MX\+\s+\d{4,}", re.I),
    "private key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "credential token": re.compile(
        r"\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16})\b"
    ),
}


def inspect_blob(path, content):
    target = PurePosixPath(path)
    if path == "data/.gitkeep":
        return [] if not content else ["data placeholder must be empty"]
    issues = []
    if target.parts[0] not in ROOTS and path not in TOP_FILES:
        issues.append("unexpected top-level file")
    if any(part in FORBIDDEN_PARTS for part in target.parts):
        issues.append("private or generated directory")
    if target.suffix.lower() in FORBIDDEN_SUFFIXES or ".sqlite3-" in target.name:
        issues.append("capture, credential or generated file type")
    if target.name.startswith(".env") and path != ".env.example":
        issues.append("environment file")
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        return issues + ["unexpected binary file"]
    for label, pattern in PATTERNS.items():
        if pattern.search(text):
            issues.append(label)
    # Ignore ordinary words and all-hex protocol payloads; flag likely VIN identities.
    for candidate in re.findall(r"(?<![A-Za-z0-9])[A-HJ-NPR-Z0-9]{17}(?![A-Za-z0-9])", text):
        if any(c.isdigit() for c in candidate) and any(c in "GHJKLMNPRSTUVWXYZ" for c in candidate):
            issues.append("possible vehicle identity")
            break
    return issues


def main():
    result = subprocess.run(
        ["git", "diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
        capture_output=True,
        check=True,
    )
    paths = [p for p in result.stdout.decode("utf-8").split("\0") if p]
    if not paths:
        raise SystemExit("No staged files to inspect")
    failures = []
    for path in paths:
        content = subprocess.run(["git", "show", f":{path}"], capture_output=True, check=True).stdout
        for issue in inspect_blob(path, content):
            failures.append((path, issue))
    for path, issue in failures:
        print(f"BLOCKED {path}: {issue}")
    if failures:
        raise SystemExit(1)
    print(f"Privacy check passed for {len(paths)} staged files. Manual review is still required.")


if __name__ == "__main__":
    main()
