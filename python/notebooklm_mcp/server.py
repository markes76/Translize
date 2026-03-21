"""
NotebookLM MCP Server — stdio JSON-RPC transport.

Provides tools for interacting with Google NotebookLM via browser automation.
Spawned by Electron's mcp-server-manager.ts as a sidecar process.

Tools:
  - list_notebooks: List available notebooks
  - create_notebook: Create a new notebook
  - upload_source: Upload a file as a notebook source
  - add_note: Add text content to a notebook
  - get_insights: Poll for generated insights from a notebook
  - ask_notebook: Ask NotebookLM a question (triggers web research)
"""

import json
import sys
import asyncio
from typing import Any

# MCP JSON-RPC protocol over stdio
# Electron sends requests as JSON lines to stdin, reads responses from stdout


class NotebookLMService:
    """Wrapper around notebooklm-py with Playwright-based browser automation."""

    def __init__(self):
        self._authenticated = False
        self._nlm = None

    async def ensure_auth(self) -> bool:
        """Ensure we're authenticated with Google. Returns True if ready."""
        if self._authenticated and self._nlm is not None:
            return True

        try:
            import os
            from notebooklm import NotebookLM

            # Use system Chrome instead of Playwright's Chromium
            chrome_path = os.environ.get(
                "CHROME_EXECUTABLE_PATH",
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
            )

            self._nlm = NotebookLM(executable_path=chrome_path)
            await self._nlm.login()
            self._authenticated = True
            return True
        except TypeError:
            # notebooklm-py 0.1.1 may not support executable_path kwarg
            try:
                from notebooklm import NotebookLM
                self._nlm = NotebookLM()
                await self._nlm.login()
                self._authenticated = True
                return True
            except Exception as e:
                log_error(f"Authentication failed: {e}")
                return False
        except ImportError:
            log_error("notebooklm-py not installed. Run: pip install notebooklm-py")
            return False
        except Exception as e:
            log_error(f"Authentication failed: {e}")
            return False

    async def list_notebooks(self) -> list[dict[str, Any]]:
        if not await self.ensure_auth():
            return []
        try:
            notebooks = await self._nlm.list_notebooks()
            return [{"id": nb.id, "title": nb.title} for nb in notebooks]
        except Exception as e:
            log_error(f"list_notebooks failed: {e}")
            return []

    async def create_notebook(self, title: str) -> dict[str, Any] | None:
        if not await self.ensure_auth():
            return None
        try:
            nb = await self._nlm.create_notebook(title=title)
            return {"id": nb.id, "title": nb.title}
        except Exception as e:
            log_error(f"create_notebook failed: {e}")
            return None

    async def upload_source(self, notebook_id: str, file_path: str) -> bool:
        if not await self.ensure_auth():
            return False
        try:
            nb = await self._nlm.get_notebook(notebook_id)
            await nb.upload_source(file_path)
            return True
        except Exception as e:
            log_error(f"upload_source failed: {e}")
            return False

    async def add_note(self, notebook_id: str, title: str, content: str) -> bool:
        if not await self.ensure_auth():
            return False
        try:
            nb = await self._nlm.get_notebook(notebook_id)
            await nb.add_note(title=title, content=content)
            return True
        except Exception as e:
            log_error(f"add_note failed: {e}")
            return False

    async def get_insights(self, notebook_id: str) -> dict[str, Any]:
        if not await self.ensure_auth():
            return {"error": "Not authenticated"}
        try:
            nb = await self._nlm.get_notebook(notebook_id)
            summary = await nb.get_summary()
            return {"summary": summary}
        except Exception as e:
            log_error(f"get_insights failed: {e}")
            return {"error": str(e)}

    async def ask_notebook(self, notebook_id: str, question: str) -> str:
        if not await self.ensure_auth():
            return "Not authenticated"
        try:
            nb = await self._nlm.get_notebook(notebook_id)
            answer = await nb.ask(question)
            return answer
        except Exception as e:
            log_error(f"ask_notebook failed: {e}")
            return f"Error: {e}"


def log_error(msg: str):
    print(json.dumps({"jsonrpc": "2.0", "method": "log", "params": {"level": "error", "message": msg}}),
          file=sys.stderr, flush=True)


service = NotebookLMService()


async def handle_request(request: dict[str, Any]) -> dict[str, Any]:
    """Handle a JSON-RPC request and return a response."""
    method = request.get("method", "")
    params = request.get("params", {})
    req_id = request.get("id")

    result: Any = None
    error: str | None = None

    try:
        if method == "list_notebooks":
            result = await service.list_notebooks()
        elif method == "create_notebook":
            result = await service.create_notebook(params.get("title", "Untitled"))
        elif method == "upload_source":
            result = await service.upload_source(params["notebook_id"], params["file_path"])
        elif method == "add_note":
            result = await service.add_note(params["notebook_id"], params.get("title", "Note"), params["content"])
        elif method == "get_insights":
            result = await service.get_insights(params["notebook_id"])
        elif method == "ask_notebook":
            result = await service.ask_notebook(params["notebook_id"], params["question"])
        elif method == "ping":
            result = "pong"
        else:
            error = f"Unknown method: {method}"
    except Exception as e:
        error = str(e)

    response = {"jsonrpc": "2.0", "id": req_id}
    if error:
        response["error"] = {"code": -32000, "message": error}
    else:
        response["result"] = result

    return response


async def main():
    """Read JSON-RPC requests from stdin, write responses to stdout."""
    print(json.dumps({"jsonrpc": "2.0", "method": "ready", "params": {}}), flush=True)

    loop = asyncio.get_event_loop()
    reader = asyncio.StreamReader()
    protocol = asyncio.StreamReaderProtocol(reader)
    await loop.connect_read_pipe(lambda: protocol, sys.stdin)

    while True:
        try:
            line = await reader.readline()
            if not line:
                break
            line_str = line.decode("utf-8").strip()
            if not line_str:
                continue

            request = json.loads(line_str)
            response = await handle_request(request)
            print(json.dumps(response), flush=True)

        except json.JSONDecodeError:
            continue
        except Exception as e:
            log_error(f"Server error: {e}")
            continue


if __name__ == "__main__":
    asyncio.run(main())
