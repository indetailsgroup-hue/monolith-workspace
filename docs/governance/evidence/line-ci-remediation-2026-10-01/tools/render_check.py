"""Re-render each target Markdown with the repo renderer and compare to its HTML.

mode "check": render into a scratch dir and report byte equality with the
committed/working HTML (sanity that lang+title are recovered exactly).
mode "write": render in place (overwrite the sibling .html in the worktree).
Titles and lang are read from the existing HTML so re-renders stay identical
apart from the Markdown change.
"""
import html
import re
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(sys.argv[2])
MODE = sys.argv[1]
SCRATCH = Path(tempfile.mkdtemp(prefix="render-check-"))
TARGETS = [l.strip() for l in (Path(__file__).resolve().parent / "targets.txt").read_text().splitlines() if l.strip()]

bad = 0
for rel in TARGETS:
    md = REPO / rel
    htm = md.with_suffix(".html")
    old = htm.read_text(encoding="utf-8")
    lang = re.search(r'<html lang="([^"]+)"', old).group(1)
    title = html.unescape(re.search(r"<title>(.*?)</title>", old, re.S).group(1))
    out = htm if MODE == "write" else SCRATCH / rel.replace("/", "__").replace(".md", ".html")
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["node", str(REPO / "scripts/render-standalone-markdown.mjs"), str(md), str(out), lang, title],
                   check=True, cwd=REPO)
    if MODE == "check":
        same = out.read_bytes() == htm.read_bytes()
        bad += not same
        print(("SAME " if same else "DIFF ") + rel)
    else:
        print("WROTE " + str(htm.relative_to(REPO)))
sys.exit(1 if bad else 0)
