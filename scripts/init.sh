#!/usr/bin/env bash
# Copyright (c) 2014, Transloadit Ltd.
#
# This file:
#
#  - Installs Ubuntu dependencies of Transloadit's go-sdk
#
# Run as:
#
#  ./init.sh # typically done by Vagrantfile
#
# Authors:
#
#  - Kevin van Zonneveld <kevin@transloadit.com>

# set -o pipefail
# set -o errexit
# set -o nounset
# set -o xtrace

# Set magic variables for current FILE & DIR
__dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
__root="$(cd "$(dirname "${__dir}")" && pwd)"
__file="${__dir}/$(basename "${BASH_SOURCE[0]}")"
__base="$(basename ${__file} .sh)"


if [[ "${OSTYPE}" == "darwin"* ]]; then
  echo "Please don't use this on OSX"
  exit 1
fi

if ! which go >/dev/null 2>&1; then
  cd /usr/src
  if [ ! -f ./go1.3.linux-amd64.tar.gz ]; then
    wget https://storage.googleapis.com/golang/go1.3.linux-amd64.tar.gz
  fi
  tar -C /usr/local -xzf go1.3.linux-amd64.tar.gz
  export PATH=$PATH:/usr/local/go/bin
fi

if ! dpkg -S git-core >/dev/null 2>&1; then
  sudo apt-get -qq update
  sudo apt-get -qq install git-core
fi

export GOPATH=~/go
go get github.com/transloadit/go-sdk/transloadify

echo "Init done."
