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
tmpDir=$(mktemp -d 2>/dev/null || mktemp -d -t 'transloadify')

for arch in $(echo ${archs}); do
  for os in $(echo ${oses}); do
    basename="transloadify-${os}-${arch}-${version}"
    latest="transloadify-${os}-${arch}-latest"
    binExt=""
    archExt=".zip"
    if [ "${os}" = "windows" ]; then
      binExt=".exe"
    fi
    if [ "${os}" = "linux" ]; then
      archExt=".tar.gz"
    fi
    url="http://gobuild3.qiniudn.com/github.com/transloadit/transloadify/branch-v-${version}/transloadify-${os}-${arch}${archExt}"

    rm -rf "${tmpDir}"
    mkdir -p "${tmpDir}"
    pushd "${tmpDir}"
      # I think gobuild has a rate-limiter, hence the retry delay
      echo "--> Downloading ${url}"
      curl \
        --retry 3 \
        --progress-bar \
        --fail \
        --location \
        --retry-delay 60 \
        --output "./${basename}${archExt}" \
      "${url}"

      if [ "${archExt}" = ".zip" ]; then
        unzip -o *${archExt} || (head -n2 *${archExt}; false) # <-- we probably downloaded an error message
      elif [ "${archExt}" = ".tar.gz" ]; then
        tar zxvf *${archExt}
      fi
      rm *${archExt}

      aws s3 cp --acl public-read "transloadify${binExt}" "s3://releases.transloadit.com/transloadify/${basename}${binExt}"
      echo "--> Uploaded as http://releases.transloadit.com/transloadify/${basename}${binExt}"

      aws s3 cp --acl public-read "s3://releases.transloadit.com/transloadify/${basename}${binExt}" "s3://releases.transloadit.com/transloadify/${latest}${binExt}"
      echo "--> Uploaded as http://releases.transloadit.com/transloadify/${latest}${binExt}"
    popd
  done
done

