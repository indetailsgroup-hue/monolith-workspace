"""Print each unevidenced negative-claim finding with its marker, terms and sentence.

Read-only. Imports the pinned detector from <tools_parent>/tools and reads the
listed documents under <repo_root>. Certification findings are printed by
lint_certifications itself, so only negative claims are expanded here.
usage: python lint-explain.py <tools_parent> <repo_root> <file>...
"""
import sys
from pathlib import Path

tools_root = Path(sys.argv[1])
repo = Path(sys.argv[2])
sys.path.insert(0, str(tools_root))
from tools.claim_detect import find_negative_claims  # noqa: E402
from tools.lint_claims import EVIDENCE_COMMENT  # noqa: E402

total = 0
for rel in sys.argv[3:]:
    text = (repo / rel).read_text(encoding="utf-8")
    evidenced = {m.group("term").strip() for m in EVIDENCE_COMMENT.finditer(text)}
    for h in find_negative_claims(text):
        if all(t in evidenced for t in h.terms):
            continue
        total += 1
        s = h.sentence if len(h.sentence) < 500 else h.sentence[:500] + " ..."
        print(f"{rel}:{h.line} marker={h.marker!r} terms={list(h.terms)}")
        print(f"    {s}")
print(f"unevidenced negative claims listed: {total}")
