REPORTS_DIR ?= $(HOME)/reports
SLIDES_SRC ?= $(REPORTS_DIR)/site
SLIDES_DST ?= static/slides/site
SLIDES_SITE_INDEX ?= assets/slides/site-index.html
MKSLIDES ?= $(if $(wildcard $(HOME)/.venv/bin/mkslides),$(HOME)/.venv/bin/mkslides,mkslides)
HUGO ?= hugo
HUGO_CACHE ?= /tmp/hugo_cache/wiki

.PHONY: slides build-slides sync-slides build-site check-slides

slides: build-slides sync-slides build-site

build-slides:
	cd $(REPORTS_DIR) && $(MKSLIDES) build ./

sync-slides:
	test -f $(SLIDES_SRC)/index.html
	test -f $(SLIDES_SITE_INDEX)
	mkdir -p $(SLIDES_DST)
	rsync -a --delete --delete-excluded --exclude=.git --exclude=.gitignore --exclude=Makefile --exclude=/site/ $(SLIDES_SRC)/ $(SLIDES_DST)/
	cp $(SLIDES_SITE_INDEX) $(SLIDES_DST)/index.html

build-site:
	$(HUGO) --gc --minify --cacheDir $(HUGO_CACHE) --cleanDestinationDir

check-slides:
	$(HUGO) --gc --minify --cacheDir $(HUGO_CACHE) --destination /tmp/wiki-public-slides-check --cleanDestinationDir
	test -f /tmp/wiki-public-slides-check/slides/index.html
