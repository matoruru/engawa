#!/bin/bash

find . \
  -type d \( -name node_modules -o -name .git \) -prune -o \
  -type f ! -name '*.lock' ! -name 'codebase.txt' \
  -exec sh -c 'echo ":: File: $1"; cat "$1"; echo; echo' _ {} \; > codebase.txt
