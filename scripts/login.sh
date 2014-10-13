#!/usr/bin/env bash
# Copyright (c) 2014, Transloadit Ltd.
#
# This file:
#
#  - Sets up the bash environment
#  - Installs itself into the ~/.bashrc for convenience
#
# Run as:
#
#  ./login.sh
#
# Returns:
#
#  OK
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

echo ""
echo "Please don't forget to export your TRANSLOADIT_KEY and TRANSLOADIT_SECRET"
echo ""

export PATH=$PATH:/usr/local/go/bin
export GOPATH=~/go

cd /usr/src/go-sdk/

# Install this on login
if ! cat ~/.bashrc |grep "${__file}" > /dev/null 2>&1; then
  # |\ true is important, we don't want to ever crash the login process
  echo "source ${__file} || true" >> ~/.bashrc
fi
