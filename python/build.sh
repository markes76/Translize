#!/bin/bash
# Bundle the NotebookLM MCP server as a standalone binary via PyInstaller.
# Output: resources/python/notebooklm-mcp

set -e

cd "$(dirname "$0")"

pip install -r requirements.txt
pip install pyinstaller

pyinstaller --onefile \
  --name notebooklm-mcp \
  --distpath ../resources/python \
  notebooklm_mcp/server.py

echo "Built: resources/python/notebooklm-mcp"
