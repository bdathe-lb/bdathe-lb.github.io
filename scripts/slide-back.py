#!/usr/bin/env python3
"""Put a "back to 讲" control on every generated deck.

The decks are copied from ~/reports by scripts/sync-slides.py according to
data/slides.yaml. There is no Hugo template to hang this off — the only
place that belongs to this repo is right after the copy. Run it from the
Makefile's sync-slides target (and it is safe to run over an already-injected
tree: it looks for its own marker and skips).

    python3 scripts/slide-back.py static/slides/site
"""

import sys
from pathlib import Path

MARKER = "deck-back"

SNIPPET = """
<style>
.deck-back {
  position: fixed;
  top: 14px;
  left: 16px;
  z-index: 60;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 14px 7px 11px;
  border-radius: 999px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: rgba(255, 255, 255, 0.72);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  color: #55504a;
  font: 500 13px/1 -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', sans-serif;
  letter-spacing: 0.04em;
  text-decoration: none;
  opacity: 0.42;
  transition: opacity 200ms ease, color 200ms ease, border-color 200ms ease, transform 200ms ease;
}
.deck-back:hover, .deck-back:focus-visible {
  opacity: 1;
  color: #1f1d1a;
  border-color: rgba(0, 0, 0, 0.3);
  transform: translateX(-2px);
}
.deck-back span { font-size: 15px; line-height: 1; }
/* reveal.js goes full-bleed in print/PDF export — the chrome should not */
@media print { .deck-back { display: none; } }
</style>
<a class="deck-back" href="/slides/" title="返回讲稿列表"><span>&#8592;</span>讲</a>
"""


def is_deck(html: str) -> bool:
    """A real deck loads reveal from the vendored assets and has a .reveal root.

    Everything else under the tree is either reveal.js's own bundled demos and
    tests or a page a slide embeds in an iframe, and neither should grow a
    control that navigates the whole window away.
    """
    return "mkslides-assets/reveal-js/dist/reveal.css" in html and '<div class="reveal">' in html


def inject(path: Path) -> bool:
    html = path.read_text(encoding="utf-8", errors="strict")
    if MARKER in html or "</body>" not in html or not is_deck(html):
        return False
    path.write_text(html.replace("</body>", SNIPPET + "</body>", 1), encoding="utf-8")
    return True


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else "static/slides/site")
    if not root.is_dir():
        print(f"slide-back: {root} is not a directory", file=sys.stderr)
        return 1

    # mkslides mirrors the source tree under slides/; the sibling
    # mkslides-assets/ is vendored reveal.js and is left alone
    decks = sorted((root / "slides").rglob("*.html"))
    done = sum(inject(p) for p in decks)
    print(f"✓ back control on {done} deck(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
