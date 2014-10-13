SHELL := /usr/bin/env bash

test:
	go test

build:
	go get .
	go build -o bin/transloadify transloadify.go
	bin/transloadify -h || true

release:
	$(MAKE) build
	# $(MAKE) test
	git status || (echo "--> Please first commit your work" && false)
	./scripts/bump.sh ./VERSION $(bump)
	git commit ./VERSION -m "Release $$(cat VERSION)"
	git tag $$(cat VERSION)
	git push --tags || true
	./scripts/release.sh

install:
	go get ./

.PHONY: \
	test \
	bump \
	release \
	install
