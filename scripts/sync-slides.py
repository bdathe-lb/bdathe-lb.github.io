#!/usr/bin/env python3
"""Copy allowlisted decks from ~/reports into static/slides/site.

The workshop is ~/reports; this repo is the vitrine. data/slides.yaml is the
shelf — only those html files (and their dated image/video folders) are
copied. mkslides-assets / theme / icons are rsynced incrementally and never
deleted from this side. reports' mkslides.yml is left alone so its private
nav cannot overwrite the public catalog.

    python3 scripts/sync-slides.py

Safe to re-run. Unpublished decks already in static/slides/site/slides/ are
removed.
"""

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "data" / "slides.yaml"
DST = ROOT / "static" / "slides" / "site"
REPORTS = Path.home() / "reports"
SRC = REPORTS / "site"
INDEX = ROOT / "assets" / "slides" / "site-index.html"

VENDOR = ("mkslides-assets", "theme", "assets")


def yaml_scalar(line):
    return line.split(":", 1)[1].strip().strip('"').strip("'")


def read_catalog(path):
    decks, cur = [], {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("- group:"):
            if cur.get("file"):
                decks.append(cur)
            cur = {"group": yaml_scalar(line), "date": "", "file": ""}
        elif not cur:
            continue
        elif line.strip().startswith("date:"):
            cur["date"] = yaml_scalar(line)
        elif line.strip().startswith("file:"):
            cur["file"] = yaml_scalar(line)
    if cur.get("file"):
        decks.append(cur)
    return decks


def rsync(src, dst):
    dst.mkdir(parents=True, exist_ok=True)
    subprocess.check_call(["rsync", "-a", f"{src}/", f"{dst}/"])


def copy_deck(src_root, dst_root, deck):
    rel = Path(deck["file"])
    src = src_root / rel
    if not src.is_file():
        raise FileNotFoundError(src)
    dest = dst_root / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)

    stem = deck["date"] or rel.stem.replace("_meeting", "")
    parent = rel.parent
    for kind in ("images", "vedios", "videos"):
        folder = src_root / parent / kind / stem
        if folder.is_dir():
            out = dst_root / parent / kind / stem
            if out.exists():
                shutil.rmtree(out)
            shutil.copytree(folder, out)


def prune(dst_root, decks):
    keep_html = {str(Path(d["file"])) for d in decks}
    keep_dates = {d["date"] for d in decks if d.get("date")}
    slides = dst_root
    if not slides.is_dir():
        return
    for html in slides.rglob("*.html"):
        rel = str(html.relative_to(slides))
        if rel not in keep_html:
            html.unlink()
            print(f"  − {rel}")
    for kind in ("images", "vedios", "videos"):
        for folder in slides.glob(f"*/{kind}/*"):
            if folder.is_dir() and folder.name not in keep_dates:
                shutil.rmtree(folder)
                print(f"  − {folder.relative_to(slides)}")
    others = slides / "others"
    if others.is_dir():
        shutil.rmtree(others)
        print("  − others/")
    for empty in sorted(slides.rglob("*"), reverse=True):
        if empty.is_dir() and not any(empty.iterdir()):
            empty.rmdir()
            print(f"  − {empty.relative_to(slides)}/")


def main():
    if not CATALOG.exists():
        sys.exit(f"error: missing {CATALOG}")
    decks = read_catalog(CATALOG)
    if not decks:
        sys.exit("error: data/slides.yaml is empty")
    if not SRC.is_dir():
        sys.exit(f"error: missing {SRC} — build reports first: make -C ~/reports build")

    DST.mkdir(parents=True, exist_ok=True)
    slides_src = SRC / "slides"
    slides_dst = DST / "slides"

    for name in VENDOR:
        src, dst = SRC / name, DST / name
        if src.is_dir():
            print(f"  · {name}/")
            rsync(src, dst)

    for deck in decks:
        print(f"  ✓ {deck['file']}")
        copy_deck(slides_src, slides_dst, deck)

    prune(slides_dst, decks)

    if INDEX.exists():
        shutil.copy2(INDEX, DST / "index.html")

    print(f"slides: {len(decks)} public, from {SRC}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
