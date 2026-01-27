#!/usr/bin/env bash

GANACHE_APP="$HOME/apps/ganache/ganache-2.7.1-linux-x86_64.AppImage"

chmod +x "$GANACHE_APP"

# Launch Ganache GUI detached
nohup "$GANACHE_APP" >/dev/null 2>&1 &

