#!/bin/bash
set -e

PLUGIN_DIR="/Users/adam/Library/Mobile Documents/iCloud~md~obsidian/Documents/Personal/.obsidian/plugins/obsidian-schema-enforcer"

npm run build
mkdir -p "$PLUGIN_DIR"
cp main.js manifest.json styles.css "$PLUGIN_DIR/"

echo "Deployed — toggle plugin off/on in Obsidian to reload"
