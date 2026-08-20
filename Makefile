# ---------------------------------------------------------------------------
# bdathe.wiki  —  Hugo site + mkslides pipeline
# ---------------------------------------------------------------------------
#
#   make help          List targets (default)
#   make serve         Hugo live-reload server
#   make build         Full production build (slides + Hugo)
#   make site          Hugo only
#   make slides        Copy allowlisted decks from ~/reports into static/
#   make clean         Remove public/ and Hugo cache
#
# Overrides:  make serve PORT=1314
#             make build HUGO=~/.local/bin/hugo
# ---------------------------------------------------------------------------

# --- paths -----------------------------------------------------------------
REPORTS_DIR       ?= $(HOME)/reports
SLIDES_SRC        ?= $(REPORTS_DIR)/site
SLIDES_DST        ?= static/slides/site
SLIDES_SITE_INDEX ?= assets/slides/site-index.html

# Prefer a user-local Hugo if present (matches CI: extended 0.163.x)
HUGO       ?= $(firstword $(wildcard $(HOME)/.local/bin/hugo) hugo)
HUGO_CACHE ?= /tmp/hugo_cache/wiki

# Dev server
HOST     ?= 127.0.0.1
PORT     ?= 1313
BASE_URL ?= http://$(HOST):$(PORT)/

.DEFAULT_GOAL := help

.PHONY: help serve open build site slides build-slides sync-slides check clean \
        build-site check-slides covers

# --- help ------------------------------------------------------------------

help:
	@printf '%s\n' \
	  '' \
	  'bdathe.wiki — available targets' \
	  '' \
	  '  Development' \
	  '    make serve          Hugo live-reload server  →  $(BASE_URL)' \
	  '    make open           Open $(BASE_URL) in a browser' \
	  '' \
	  '  Build' \
	  '    make build          Full production build (slides → sync → Hugo)' \
	  '    make site           Hugo only  (--gc --minify → public/)' \
	  '    make slides         Copy public decks (data/slides.yaml) from ~/reports' \
	  '    make build-slides   Rebuild all of ~/reports (workshop, optional)' \
	  '    make sync-slides    Same as make slides' \
	  '    make covers         Fetch covers + iTunes previews for data/music.yaml' \
	  '' \
	  '  Maintenance' \
	  '    make check          Verify slides appear in Hugo output' \
	  '    make clean          Remove public/, resources/, and Hugo cache' \
	  '' \
	  '  Overrides: PORT=$(PORT)  HOST=$(HOST)  HUGO=$(HUGO)' \
	  '             REPORTS_DIR=$(REPORTS_DIR)' \
	  ''

# --- development -----------------------------------------------------------

## Local Hugo server with live reload (does not rebuild slides).
serve:
	@echo "→ $(BASE_URL)  (Ctrl+C to stop; run 'make slides' if slides changed)"
	$(HUGO) server \
		--bind $(HOST) \
		--port $(PORT) \
		--cacheDir $(HUGO_CACHE) \
		--navigateToChanged

## Open the local dev URL in a browser.
open:
	@open "$(BASE_URL)" 2>/dev/null \
		|| xdg-open "$(BASE_URL)" 2>/dev/null \
		|| echo "Open $(BASE_URL) in your browser"

# --- build -----------------------------------------------------------------

## Full production pipeline: rebuild slides, sync, then Hugo.
build: slides site
	@echo "✓ built → public/"

## Hugo production build only (reuses already-synced slides).
site:
	$(HUGO) --gc --minify --cacheDir $(HUGO_CACHE) --cleanDestinationDir

## Copy allowlisted decks from ~/reports into static/. Does not rebuild the
## whole workshop — only data/slides.yaml is public. Run make build-slides
## first if reports/site is stale.
slides: sync-slides
	@echo "✓ slides → $(SLIDES_DST)"

## Rebuild every deck in ~/reports. Optional; the wiki no longer needs it
## unless a public deck's source changed.
build-slides:
	$(MAKE) -C $(REPORTS_DIR) build

## Copy public decks + shared reveal.js assets. Prunes unpublished html.
sync-slides:
	python3 scripts/sync-slides.py
	python3 scripts/slide-back.py "$(SLIDES_DST)"

## Vendor album art and 30s iTunes previews for data/music.yaml.
# Run after adding a track. Committed rather than fetched during the Hugo
# build — see scripts/fetch-covers.py for why. Already-present files are
# skipped; use `make covers FORCE=--force` to re-download.
covers:
	python3 scripts/fetch-covers.py $(FORCE)

# --- maintenance -----------------------------------------------------------

## Build site and assert slides index is present in public/.
check: site
	@test -f public/slides/index.html \
		&& echo "✓ public/slides/index.html" \
		|| { echo "✗ public/slides/index.html missing — run: make slides && make site"; exit 1; }

## Remove Hugo output and cache.
clean:
	rm -rf public resources
	rm -rf "$(HUGO_CACHE)"
	@echo "✓ cleaned public/, resources/, $(HUGO_CACHE)"

# --- back-compat aliases ---------------------------------------------------

build-site: site
check-slides: check
