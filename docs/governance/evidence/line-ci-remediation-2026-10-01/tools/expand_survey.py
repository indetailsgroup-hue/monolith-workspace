"""Expand shorthand migration citations (e.g. 0107:61, 00040:442) in the
routine table of the P0-10 EXECUTE survey into resolvable file:line citations.

Only table rows between the routine-table header and the next blank line are
touched. Each shorthand must map to exactly one migration file and every cited
line must exist in that file; otherwise the script stops without writing.
Usage: python expand_survey.py <repo> <md> <header-prefix> [--write]
"""
import re
import sys
from pathlib import Path

repo, md_rel, header = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
write = "--write" in sys.argv
migs = sorted(p.name for p in (repo / "supabase/migrations").glob("*.sql"))

def resolve(tok: str) -> str:
    prefix = ("000000000" + tok) if len(tok) == 5 else tok
    hits = [m for m in migs if m.startswith(prefix + "_")]
    if len(hits) != 1:
        raise SystemExit(f"ambiguous or missing migration for {tok}: {hits}")
    return hits[0]

SHORT = re.compile(r"(?<![\w./`-])(0\d{3}|000\d{2}):(\d+)((?:[-–]\d+)?(?:,\s*\d+(?:[-–]\d+)?)*)")
path = repo / md_rel
lines = path.read_text(encoding="utf-8").split("\n")
start = next(i for i, l in enumerate(lines) if l.startswith(header))
changes = []
i = start
while i < len(lines) and lines[i].strip():
    line = lines[i]
    def sub(m):
        name = resolve(m.group(1))
        body = (repo / "supabase/migrations" / name).read_text(encoding="utf-8").split("\n")
        nums = [int(n) for n in re.findall(r"\d+", m.group(2) + m.group(3))]
        for n in nums:
            if n < 1 or n > len(body):
                raise SystemExit(f"line {n} out of range for {name} ({len(body)} lines)")
        return f"`{name}:{m.group(2)}{m.group(3)}`"
    new = SHORT.sub(sub, line)
    if new != line:
        changes.append((i + 1, line, new))
        lines[i] = new
    i += 1
for n, old, new in changes:
    print(f"L{n}\n  - {old}\n  + {new}")
print(f"{len(changes)} row(s) changed")
if write:
    path.write_text("\n".join(lines), encoding="utf-8", newline="\n")
