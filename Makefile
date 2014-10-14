SHELL := /usr/bin/env bash

test:
	go test

build:
	go get .
	go build -o bin/transloadify transloadify.go
	bin/transloadify -h || true

release:
	$(MAKE) build
	$(MAKE) test
	git diff --quiet HEAD || (echo "--> Please first commit your work" && false)
	./scripts/bump.sh ./VERSION $(bump)
	git commit ./VERSION -m "Release $$(./scripts/bump.sh ./VERSION)"
	git tag $$(./scripts/bump.sh ./VERSION)
	git push --tags || true

install:
	go get ./

.PHONY: \
	test \
	bump \
	release \
	install
