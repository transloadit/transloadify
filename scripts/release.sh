#!/usr/bin/env bash
# Copyright (c) 2014, Transloadit Ltd.
#
# This file:
#
#  - Compiles the latest ./VERSION for all platforms
#  - Uploads them to S3
#
# Run as:
#
#  ./release.sh # typically done by Makefile
#
# Authors:
#
#  - Kevin van Zonneveld <kevin@transloadit.com>

# At one point, do windows compiling locally: http://stackoverflow.com/questions/12168873/cross-compile-go-on-osx
# GOOS=${os} CGO_ENABLED=0 GOARCH=${arch} go build -o bin/transloadify transloadify.go
# ARCHIVE=transloadify-${os}-${arch}.tar.gz
# tar czf ${ARCHIVE} transloadify
# echo ${ARCHIVE}

set -o pipefail
set -o errexit
set -o nounset
# set -o xtrace

# Set magic variables for current FILE & DIR
__dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
__root="$(cd "$(dirname "${__dir}")" && pwd)"
__file="${__dir}/$(basename "${BASH_SOURCE[0]}")"
__base="$(basename ${__file} .sh)"


version=${VERSION:-$(echo $(cat ./VERSION))}
oses=${OSES:-windows linux darwin}
archs=${ARCHS:-amd64}
tmpdir=$(mktemp -d 2>/dev/null || mktemp -d -t 'transloadify')

for arch in $(echo ${archs}); do
  for os in $(echo ${oses}); do
    basename="transloadify-${os}-${arch}-${version}"
    latest="transloadify-${os}-${arch}-latest"
    extension=""
    if [ "${os}" = "windows" ]; then
      extension=".exe"
    fi

    rm -rf "${tmpdir}"
    mkdir -p "${tmpdir}"
    pushd "${tmpdir}"
      # I think gobuild has a rate-limiter, hence the retry delay
      curl \
        --retry 3 \
        --verbose \
        --progress-bar \
        --location \
        --retry-delay 60 \
        --output "./${basename}.zip" \
      "http://gobuild.io/github.com/transloadit/transloadify/${version}/${os}/${arch}"

      unzip -o *.zip || (head -n2 *.zip; false) # <-- we probably downloaded an error message
      rm *.zip

      aws s3 cp --acl public-read "transloadify${extension}" "s3://releases.transloadit.com/transloadify/${basename}${extension}"
      echo "--> Saved as http://releases.transloadit.com/transloadify/${basename}${extension}"

      aws s3 cp --acl public-read "s3://releases.transloadit.com/transloadify/${basename}${extension}" "s3://releases.transloadit.com/transloadify/${latest}${extension}"
      echo "--> Saved as http://releases.transloadit.com/transloadify/${latest}${extension}"
    popd
  done
done

