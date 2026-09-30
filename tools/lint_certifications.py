#!/usr/bin/env python3
"""lint_certifications — refuse a certification that nobody tried to break.

Why this exists
---------------
On 2026-07-21 an agent wrote "the `rm -rf` guard is safe" about a guard whose
entire check was `[[ "$SESSION_DIR" == /tmp/* ]]` — a prefix test that
`/tmp/../home/dave` walks straight out of. An adversary found it minutes later.
The same session produced "only the intended files were touched" while the dirty
count arithmetic did not add up. Neither sentence was a lie; both were published
without anyone having attacked the thing being certified.

`verify_absence.py` and `change_budget.py` are what attacking it looks like in
this project, and both are opt-in. This linter is triggered by the *shape of the
written output* instead: `claim_detect.find_certifications` finds sentences that
assert a named artifact is safe / clean / passing, and this file requires each of
them to sit next to evidence.

What counts as evidence
-----------------------
1. `<!-- adversary: <label> -->` — a hand-written record of what was attacked
   and what happened. The label must be substantive: placeholders (`TODO`,
   `n/a`, `done`) and anything under 10 characters are rejected.
2. A fenced block that is a **command and its output** — an invocation line
   (`$ `-prompted, or a known runner carrying a flag, argument or path)
   followed by at least one non-blank line that is not itself an invocation,
   inside a console-flavoured fence. A block tagged `python`/`json`/`ts` is a
   code sample, and a block of commands with no output is a how-to; neither is
   evidence that anything ran.

Either form must lie within 5 lines of the certifying sentence (see
`WINDOW_LINES`).

WHAT A PASSING RUN DOES NOT PROVE
---------------------------------
Read this before quoting a green run of this linter as assurance.

The adversary marker is typed by hand. An agent can write
`<!-- adversary: tried a path traversal, it held -->` without running anything
at all, and this linter cannot tell the difference. The fenced-block form is
weaker still in one respect: nothing ties the pasted output to the pasted
command, to this repository, or to today.

So a passing run proves exactly one thing: **every certifying sentence in these
documents is accompanied, in the text, by a specific and attributable claim that
an adversarial check was performed.** It does not prove the check was performed,
that it was adequate, that it targeted the property being certified, that the
output shown came from the command shown, or that either is still true. What it
buys is that the omission is no longer silent — skipping the check now requires
writing a false, greppable, `git blame`-able sentence, instead of simply not
mentioning it. That is a smaller claim than "certifications are trustworthy" and
it is deliberately the only one made here; overclaiming would be the same class
of error this file exists to prevent.

Usage
-----
    python tools/lint_certifications.py                # defaults to docs/
    python tools/lint_certifications.py docs/adr path/to/one.md
    python tools/lint_certifications.py docs/ --write-allowlist  # (re)capture the ledger

The existing corpus carries 5 uncorroborated certifications, so the same
shrinking allowlist that grandfathers `lint_claims` grandfathers this linter too
(`tools/.lint_allowlist`, shared, namespaced by linter). A listed file passes at
or below its recorded count and fails when it rises; an unlisted file must be
clean. Every run ends with the grandfathered debt.

Exit codes
----------
    0  every certification carries evidence, within the allowlist
    1  an uncorroborated certification beyond the allowlist  -> do NOT publish
    2  usage error (a named path does not exist, or is an excluded tree)
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path

try:  # importable as `tools.lint_certifications` and runnable as a script
    from tools.claim_detect import find_certifications
except ModuleNotFoundError:  # pragma: no cover - exercised by the CLI, not tests
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from tools.claim_detect import find_certifications

# The shrinking allowlist is shared with lint_claims (orchestrator scope
# extension): Task 7's CI runs this linter too, and a gate red on day one against
# the existing 5-certification corpus is a gate that gets deleted.
from tools.lint_allowlist import (  # noqa: E402
    DEFAULT_ALLOWLIST_PATH,
    LINT_CERTIFICATIONS,
    Allowlist,
    debt_line,
    rel_key,
)

DEFAULT_PATH = "docs"

# Evidence must be within this many lines of the certifying sentence.
#
# Derived rather than picked: the widest realistic *legitimate* gap is
# certification / blank / sub-heading or lead-in / blank / evidence, which is 4.
# Five leaves one line of margin and no more. Wider windows let a block of
# evidence about one thing silence an unrelated certification further down the
# section, which is how a proximity rule quietly becomes a rubber stamp.
WINDOW_LINES = 5

# Directory names never walked, at any depth, and never accepted as an explicit
# argument either — naming the path would otherwise be the bypass. The first two
# are required: they are separate checkouts of this project and linting them
# would report the same documents two and three times over.
EXCLUDED_DIR_NAMES = frozenset({
    "determined-williams",
    "worktrees",
    ".git",
    "node_modules",
    "__pycache__",
    ".venv",
    "venv",
    "dist",
    "build",
    ".next",
    ".cache",
})

_ADVERSARY = re.compile(r"<!--\s*adversary\s*:(?P<label>.*?)-->", re.IGNORECASE | re.DOTALL)

_MIN_LABEL_CHARS = 10

# A label that records nothing. Checked case- and punctuation-insensitively.
# The last entry is this linter's own remediation hint: the failure message
# prints the marker format with that placeholder label, and pasting the hint
# verbatim satisfied the length check — so the tool's own output was a working
# bypass of the tool. Found by probing, like the rest of this file's rules.
_PLACEHOLDER_LABELS = frozenset({
    "todo", "tbd", "t.b.d", "n/a", "na", "none", "nil", "-", "--", "x",
    "ok", "okay", "yes", "no", "done", "pending", "wip", "?", "…",
    "what you attacked it with, and what happened",
})

_FENCE = re.compile(r"^(?P<indent>[ \t]*)(?P<ticks>```+|~~~+)(?P<info>[^\r\n]*)$")

# Fence languages whose contents can plausibly be a terminal transcript. A block
# tagged `python`, `ts`, `json`, `sql`, `diff` or `markdown` is a code sample or
# a quoted document — displayed, not run — and is rejected before its contents
# are read at all.
_TRANSCRIPT_LANGS = frozenset({
    "", "console", "shell", "shell-session", "shellsession", "sh", "bash", "zsh",
    "ps", "ps1", "powershell", "pwsh", "cmd", "terminal", "text", "txt", "output", "log",
})

# `$ cmd`, `PS C:\x> cmd`, `C:\x> cmd`. A bare `> ` is deliberately NOT a
# prompt: in Markdown it is a blockquote, so a fenced quotation of any document
# read as "command and output" and any quoted excerpt became evidence. The cost
# is that a genuine bare-`>` shell transcript needs a `$ ` rewrite — two
# characters, against a bypass that required none.
_PROMPT = re.compile(r"^(?:\$|PS[^>\n]*>|[A-Za-z]:\\[^>\n]*>)\s+\S")

# Deliberately a conservative allowlist. A false negative here costs the author
# one `$ ` prefix; a false positive turns "paste any fenced block" into a passing
# grade, which is the failure mode that makes a linter theatre.
_RUNNERS = frozenset({
    "python", "python3", "py", "pytest", "tox", "uv", "pip", "pipx",
    "node", "npm", "npx", "pnpm", "yarn", "deno", "bun", "tsc", "vitest", "jest",
    "git", "gh", "make", "bash", "sh", "zsh", "pwsh", "powershell", "cmd",
    "cargo", "go", "rustc", "java", "mvn", "gradle", "dotnet",
    "docker", "kubectl", "terraform", "supabase", "psql", "sqlite3",
    "ruff", "mypy", "eslint", "prettier", "black", "flake8", "playwright",
    "curl", "wget", "grep", "rg", "find", "ls", "cat", "diff", "sed", "awk",
    "head", "tail", "wc", "sha256sum", "certutil", "openssl",
})

_RUNNER_PREFIXES = ("./", ".\\", "../", "tools/", "scripts/", "bin/")
_RUNNER_SUFFIXES = (".py", ".sh", ".ps1", ".bat", ".cmd", ".exe")

# An argument, a flag, or a path — what a bare `go`/`find`/`make`/`set` line has
# and an English sentence opening with the same word does not. Without this,
# "Go through the exporter and it looks fine." parsed as an invocation and any
# quoted document became evidence; both leaks were found by probing this linter
# rather than by reasoning about it, which is the point of the file.
_ARGISH = re.compile(r"^-{1,2}[A-Za-z0-9]|[/\\=]|^\w+\.[A-Za-z0-9]")


@dataclass(frozen=True)
class Finding:
    """One certifying sentence with no evidence beside it."""

    path: str
    line: int
    marker: str
    sentence: str

    def __str__(self) -> str:
        return f"{self.path}:{self.line}: uncorroborated certification"

    def report(self) -> str:
        return f"{self}  [{self.marker}]  {self.sentence[:110]}"


def lint_text(text: str, path: str = "<text>") -> list[Finding]:
    """Certifications in `text` that no evidence sits next to."""
    spans = evidence_spans(text)
    return [
        Finding(path=path, line=hit.line, marker=hit.marker, sentence=hit.sentence)
        for hit in find_certifications(text)
        if not any(_distance(hit.line, span) <= WINDOW_LINES for span in spans)
    ]


def lint_file(path: Path | str) -> list[Finding]:
    """`lint_text` over one document. UTF-8 explicitly: the corpus is bilingual."""
    p = Path(path)
    return lint_text(p.read_text(encoding="utf-8"), str(path))


def evidence_spans(text: str) -> list[tuple[int, int]]:
    """1-based (first_line, last_line) of every accepted piece of evidence."""
    return sorted(_marker_spans(text) + _transcript_spans(text))


def collect_files(paths) -> list[Path]:
    """Markdown under `paths`, never descending into `EXCLUDED_DIR_NAMES`.

    Exclusion is by path component, so `worktrees/x/docs` is refused even when
    named explicitly. A path is judged as given (`Path` already normalises away
    `./`); this cannot see an exclusion that only exists above the current
    working directory, which is the one hole and is why the walk prunes by name
    as well.
    """
    out: list[Path] = []
    for raw in paths:
        p = Path(raw)
        if _is_excluded(p):
            continue
        if p.is_file():
            if p.suffix.lower() == ".md":
                out.append(p)
            continue
        for dirpath, dirnames, filenames in os.walk(p):
            dirnames[:] = sorted(d for d in dirnames if d not in EXCLUDED_DIR_NAMES)
            for name in sorted(filenames):
                if name.lower().endswith(".md"):
                    out.append(Path(dirpath) / name)
    return sorted(set(out))


def _is_excluded(path: Path) -> bool:
    return any(part in EXCLUDED_DIR_NAMES for part in path.parts)


def _distance(line: int, span: tuple[int, int]) -> int:
    start, end = span
    if start <= line <= end:
        return 0
    return min(abs(line - start), abs(line - end))


def _marker_spans(text: str) -> list[tuple[int, int]]:
    """Spans of substantive adversary markers that are asserted, not displayed.

    Markers are searched in fence-masked text: a marker inside a fenced block is
    an illustration of the format, and reading it as live evidence meant that
    *documenting* this linter's marker next to a certification silenced the
    finding. `lint_claims` applies the identical rule to evidence comments, for
    the identical reason.

    A label spanning more than three lines is rejected as unterminated: with
    DOTALL matching, a `<!-- adversary:` whose `-->` is pages away would create
    one span covering everything between them and silence every certification
    in range.
    """
    masked = _mask_fenced_blocks(text)
    spans = []
    for m in _ADVERSARY.finditer(masked):
        if m.group("label").count("\n") > 2:
            continue
        if not _is_substantive(m.group("label")):
            continue
        first = masked.count("\n", 0, m.start()) + 1
        last = masked.count("\n", 0, m.end()) + 1
        spans.append((first, last))
    return spans


def _mask_fenced_blocks(text: str) -> str:
    """Blank fenced regions, preserving newlines so line numbers stay true."""
    out = []
    inside = False
    for line in text.splitlines(keepends=True):
        if line.lstrip().startswith(("```", "~~~")):
            inside = not inside
            out.append(_blank_line(line))
        else:
            out.append(_blank_line(line) if inside else line)
    return "".join(out)


def _blank_line(text: str) -> str:
    return "".join(c if c == "\n" else " " for c in text)


def _is_substantive(label: str) -> bool:
    """Whether the marker records something, rather than merely being present.

    This does not make the marker unforgeable — nothing here can. It raises the
    cost of forging it from typing a token to writing a specific falsifiable
    sentence that a reviewer can check and `git blame` can attribute.
    """
    collapsed = " ".join(label.split())
    if collapsed.strip(" .!-").lower() in _PLACEHOLDER_LABELS:
        return False
    return len(collapsed) >= _MIN_LABEL_CHARS


def _transcript_spans(text: str) -> list[tuple[int, int]]:
    lines = text.splitlines()
    spans: list[tuple[int, int]] = []
    i = 0
    while i < len(lines):
        opener = _FENCE.match(lines[i])
        if opener is None:
            i += 1
            continue
        close = _closing_fence(lines, i, opener.group("ticks"))
        if close is None:
            break  # unterminated fence: nothing after it can be read reliably
        info = opener.group("info").strip()
        if _is_transcript(info, lines[i + 1 : close]):
            spans.append((i + 1, close + 1))
        i = close + 1
    return spans


def _closing_fence(lines: list[str], start: int, ticks: str) -> int | None:
    for j in range(start + 1, len(lines)):
        m = _FENCE.match(lines[j])
        if (
            m is not None
            and m.group("ticks")[0] == ticks[0]
            and len(m.group("ticks")) >= len(ticks)
            and not m.group("info").strip()
        ):
            return j
    return None


def _is_transcript(info: str, body: list[str]) -> bool:
    """Whether this block shows a command *and* what it printed.

    The output requirement is the load-bearing half. A code sample is filtered by
    its language tag, but an install/how-to block is legitimately tagged `bash`
    and is still not evidence that anything ran: it is all invocation and no
    result.

    Two shapes, because they need different rules:

    * **prompted** — any `$ ` line. Output is then simply the non-prompt lines,
      which is unambiguous, so several commands in one block are fine.
    * **unprompted** — there is nothing separating command from output except
      position, so exactly one invocation is allowed and it must be first. A
      second invocation lower down means this is a list of commands to run, not
      a record of one having been run. Without that rule a real how-to block in
      `docs/reports/…-production-readiness-baseline.en.md` passed as evidence:
      `cd determined-williams` is not in the runner allowlist, so it read as
      output for the `git` line above it.
    """
    lang = info.split()[0].lower() if info.split() else ""
    if lang not in _TRANSCRIPT_LANGS:
        return False

    lines = _logical_lines(body)
    if not lines:
        return False

    prompts = [i for i, line in enumerate(lines) if _PROMPT.match(line.strip())]
    if prompts:
        return any(not _PROMPT.match(line.strip()) for line in lines[prompts[0] + 1 :])

    start = 0
    while start < len(lines) and lines[start].lstrip().startswith("#"):
        start += 1  # a leading comment heads many shell blocks; it is not output
    if start >= len(lines) or not _is_command_line(lines[start]):
        return False
    rest = lines[start + 1 :]
    return bool(rest) and not any(_is_command_line(line) for line in rest)


def _logical_lines(body: list[str]) -> list[str]:
    """Non-blank lines, with `\\`-continued ones folded into a single command."""
    out: list[str] = []
    pending: str | None = None
    for raw in body:
        line = raw.rstrip()
        if pending is not None:
            pending = pending[:-1] + " " + line.strip()
            if not line.endswith("\\"):
                out.append(pending)
                pending = None
            continue
        if not line.strip():
            continue
        if line.endswith("\\"):
            pending = line
        else:
            out.append(line)
    if pending is not None:
        out.append(pending)
    return out


def _is_command_line(line: str) -> bool:
    """Whether this line is an invocation rather than a line of prose or output.

    A bare runner name is not enough (see `_ARGISH`); it must carry a flag, an
    argument or a path. `make test` and `npm run build` are therefore rejected
    unless written with a `$ ` prompt. That false negative is deliberate and
    costs the author two characters, where the opposite error costs the linter
    its whole purpose.
    """
    stripped = line.strip()
    if _PROMPT.match(stripped):
        return True
    tokens = stripped.split()
    if not tokens:
        return False
    first = tokens[0]
    if first.startswith(_RUNNER_PREFIXES) or first.lower().endswith(_RUNNER_SUFFIXES):
        return True  # ./check.sh, tools/verify_absence.py — never an English word
    if first.lower() not in _RUNNERS:
        return False
    return any(_ARGISH.search(t) for t in tokens[1:])


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(
        description="Refuse certifications that carry no adversarial evidence.")
    ap.add_argument("paths", nargs="*", help=f"files or directories (default: {DEFAULT_PATH})")
    ap.add_argument("--write-allowlist", dest="write_allowlist", action="store_true",
                    help="(re)capture the shrinking allowlist from this run's counts and exit.")
    ap.add_argument("--accept-regression", dest="accept_regression", action="store_true",
                    help="with --write-allowlist, permit raising a count or grandfathering a new "
                         "dirty file. Off by default: the ledger may only shrink.")
    ap.add_argument("--allowlist", type=Path, default=DEFAULT_ALLOWLIST_PATH,
                    help="path to the ledger (default: tools/.lint_allowlist).")
    a = ap.parse_args(argv)

    paths = a.paths or [DEFAULT_PATH]
    missing = [p for p in paths if not Path(p).exists()]
    if missing:
        for p in missing:
            print(f"no such path: {p}", file=sys.stderr)
        return 2

    # An explicitly named excluded path is refused with exit 2, not skipped.
    # `collect_files` still skips them defensively for library callers, but at
    # the CLI a silent skip prints "every certification carries evidence" over
    # a tree this tool refused to read — a green light it has no right to give.
    refused = [p for p in paths if _is_excluded(Path(p))]
    if refused:
        for p in refused:
            print(f"refusing excluded path: {p} (third-party tree; see EXCLUDED_DIR_NAMES)",
                  file=sys.stderr)
        return 2

    files = collect_files(paths)
    findings_by_file = {rel_key(fp): lint_file(fp) for fp in files}
    counts = {k: len(v) for k, v in findings_by_file.items()}

    if a.write_allowlist:
        return _write_allowlist(counts, a.allowlist, a.accept_regression)

    allowlist = Allowlist.load(a.allowlist)
    ev = allowlist.evaluate(LINT_CERTIFICATIONS, counts)

    # Print the raw findings for every file over its grandfathered count. Findings
    # at or below the count are suppressed (that is what grandfathering buys) but
    # stay counted in the debt line.
    printed = 0
    for path in sorted(r.path for r in ev.regressions):
        for f in findings_by_file.get(path, []):
            print(f.report())
            printed += 1

    if ev.regressions:
        print()
        print(f"checked {len(files)} document(s)")
        print(f"{printed} certification(s) beyond the allowlist, "
              f"in {len(ev.regressions)} document(s)")
        print()
        print("Attach one of these next to each sentence above, within "
              f"{WINDOW_LINES} lines:")
        print("  <!-- adversary: what you attacked it with, and what happened -->")
        print("  a fenced console block holding the command you ran and its output")
        print()
        print("Neither is proof the check happened. Both make skipping it a written,")
        print("attributable statement instead of a silence.")
    else:
        print(f"checked {len(files)} document(s): every certification carries evidence "
              f"(within the allowlist).")

    for tightening in ev.tightenings:
        print(f"tighten: {tightening}")

    print(debt_line(LINT_CERTIFICATIONS, allowlist))
    return 1 if ev.regressions else 0


def _write_allowlist(counts: dict[str, int], path: Path, accept_regression: bool) -> int:
    """Recapture the lint_certifications entries, refusing to loosen unless permitted."""
    allowlist = Allowlist.load(path)
    updated, refusals = allowlist.rewrite(LINT_CERTIFICATIONS, counts, accept_regression)
    updated.write(path)
    listed = updated.entries.get(LINT_CERTIFICATIONS, {})
    print(f"wrote {len(listed)} lint_certifications record(s) to {rel_key(path)}")
    for refusal in refusals:
        print(f"refused: {refusal}")
    print(debt_line(LINT_CERTIFICATIONS, updated))
    # Same rule as lint_claims: a capture that refused entries must not report
    # success. The write still happens; the exit code carries the refusals.
    return 1 if refusals else 0


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):  # Thai output on a cp1252 console
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    raise SystemExit(main(sys.argv[1:]))
