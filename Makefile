# ---------------------------------------------------------------------------
# bdathe.wiki  —  Hugo site + mkslides pipeline
# ---------------------------------------------------------------------------
#
#   make help          List targets (default)
#   make serve         Hugo live-reload server
#   make build         Full production build (slides + Hugo)
#   make site          Hugo only
#   make slides        Rebuild slides and sync into static/
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

# rsync exclusions when copying built slides into static/
RSYNC_EXCLUDES := --exclude=.git --exclude=.gitignore --exclude=Makefile --exclude=/site/

.DEFAULT_GOAL := help

.PHONY: help serve open build site slides build-slides sync-slides check clean \
        build-site check-slides

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
	  '    make slides         Rebuild slides + sync into static/slides/site' \
	  '    make build-slides   mkslides only (via ~/reports Makefile)' \
	  '    make sync-slides    rsync reports/site → static/slides/site' \
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

## Rebuild slides (mkslides) and copy them into static/.
slides: build-slides sync-slides
	@echo "✓ slides → $(SLIDES_DST)"

## Run mkslides via reports' Makefile.
# mkslides rglob-scans the whole tree and resolves symlinks; a local .venv
# (python → /usr/bin/python3) breaks `mkslides build ./`. reports/Makefile
# stages a clean tree first.
build-slides:
	$(MAKE) -C $(REPORTS_DIR) build

## Copy built slides from reports into Hugo static/.
sync-slides:
	@test -f "$(SLIDES_SRC)/index.html" \
		|| { echo "error: missing $(SLIDES_SRC)/index.html — run: make build-slides"; exit 1; }
	@test -f "$(SLIDES_SITE_INDEX)" \
		|| { echo "error: missing $(SLIDES_SITE_INDEX)"; exit 1; }
	mkdir -p "$(SLIDES_DST)"
	rsync -a --delete --delete-excluded $(RSYNC_EXCLUDES) \
		"$(SLIDES_SRC)/" "$(SLIDES_DST)/"
	cp "$(SLIDES_SITE_INDEX)" "$(SLIDES_DST)/index.html"

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
