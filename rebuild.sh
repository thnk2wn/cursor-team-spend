#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

rm -rf out node_modules
./build.sh
