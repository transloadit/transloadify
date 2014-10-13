#!/usr/bin/env bash
# Copyright (c) 2014, Transloadit Ltd.
#
# This file:
#
#  - Bumps a given semver
#
# Run as:
#
#  ./bump.sh 0.0.0 patch # typically done by Makefile
#
# Returns:
#
# v0.0.1
#
# Authors:
#
#  - Kevin van Zonneveld <kevin@transloadit.com>

set -o pipefail
set -o errexit
set -o nounset
# set -o xtrace

# Set magic variables for current FILE & DIR
__dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
__root="$(cd "$(dirname "${__dir}")" && pwd)"
__file="${__dir}/$(basename "${BASH_SOURCE[0]}")"
__base="$(basename ${__file} .sh)"


. ${__dir}/semver.sh

function bump() {
  local version="${1}"
  local levelName="${2}"
  local bump="${3}"

  local major=0
  local minor=0
  local patch=0
  local special=""

  local bumpedVersion=""

  semverParseInto "${version}" major minor patch special

  if [ "${levelName}" = "major" ]; then
    let "major = major + ${bump}"
    minor=0
    patch=0
    special=""
  fi
  if [ "${levelName}" = "minor" ]; then
    let "minor = minor + ${bump}"
    patch=0
    special=""
  fi
  if [ "${levelName}" = "patch" ]; then
    let "patch = patch + ${bump}"
    special=""
  fi
  if [ "${levelName}" = "special" ]; then
    special="${bump}"
  fi

  bumpedVersion="v${major}.${minor}.${patch}"
  if [ -n "${special}" ]; then
    bumpedVersion=".${bumpedVersion}"
  fi
  echo "${bumpedVersion}"
}

if [ -f "${1}" ]; then
  file="${1}"
  version="$(echo $(cat "${file}"))"
else
  version="${1}"
fi

bumpedVersion=$(bump "${version}" "${2:-patch}" "${3:-1}")
echo "${bumpedVersion}"

if [ -n "${file}" ]; then
  echo "${bumpedVersion}" > "${file}"
fi
