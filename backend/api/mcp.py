"""
MCP API: CRUD for tools.mcpServers entries in ~/.nanobot/config.json.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from utils import atomic_write_json

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/mcp", tags=["mcp"])

CONFIG_PATH = Path.home() / ".nanobot" / "config.json"

# Dangerous commands that should not be allowed as MCP stdio servers
_DANGEROUS_COMMANDS = {
    "rm", "sh", "bash", "zsh", "cmd", "powershell", "python", "python3",
    "node", "perl", "ruby", "curl", "wget", "nc", "netcat", "telnet",
}


def _read_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH) as f:
                return json.load(f)
        except json.JSONDecodeError:
            return {}
    return {}


def _write_config(data: dict) -> None:
    atomic_write_json(CONFIG_PATH, data)


def _get_servers(cfg: dict) -> dict:
    return cfg.get("tools", {}).get("mcpServers", {})


def _set_servers(cfg: dict, servers: dict) -> None:
    cfg.setdefault("tools", {})["mcpServers"] = servers


@router.get("")
async def list_mcp_servers():
    cfg = _read_config()
    servers = _get_servers(cfg)
    result = []
    for name, spec in servers.items():
        entry = {"name": name}
        if "url" in spec:
            entry["type"] = "http"
            entry["url"] = spec["url"]
            entry["headers"] = spec.get("headers", {})
        else:
            entry["type"] = "stdio"
            entry["command"] = spec.get("command", "")
            entry["args"] = spec.get("args", [])
            entry["env"] = spec.get("env", {})
        entry["toolTimeout"] = spec.get("toolTimeout", 30)
        result.append(entry)
    return {"servers": result}


class StdioMCPServer(BaseModel):
    name: str
    command: str
    args: list[str] = []
    env: dict[str, str] = {}
    toolTimeout: int = 30


class HttpMCPServer(BaseModel):
    name: str
    url: str
    headers: dict[str, str] = {}
    toolTimeout: int = 30


class MCPServerRequest(BaseModel):
    name: str
    type: str  # "stdio" | "http"
    command: Optional[str] = None
    args: list[str] = []
    env: dict[str, str] = {}
    url: Optional[str] = None
    headers: dict[str, str] = {}
    toolTimeout: int = 30


@router.post("")
async def add_mcp_server(body: MCPServerRequest):
    if not body.name.strip():
        raise HTTPException(400, "name is required")

    cfg = _read_config()
    servers = _get_servers(cfg)

    if body.type == "http":
        if not body.url:
            raise HTTPException(400, "url is required for http type")
        spec: dict[str, Any] = {"url": body.url}
        if body.headers:
            spec["headers"] = body.headers
    elif body.type == "stdio":
        if not body.command:
            raise HTTPException(400, "command is required for stdio type")
        cmd_name = Path(body.command).name.lower()
        if cmd_name in _DANGEROUS_COMMANDS:
            raise HTTPException(400, f"Command '{cmd_name}' is not allowed for security reasons")
        spec = {"command": body.command, "args": body.args}
        if body.env:
            spec["env"] = body.env
    else:
        raise HTTPException(400, f"Unknown type '{body.type}'. Use 'stdio' or 'http'.")

    if body.toolTimeout != 30:
        spec["toolTimeout"] = body.toolTimeout

    servers[body.name] = spec
    _set_servers(cfg, servers)
    _write_config(cfg)
    return {"ok": True, "name": body.name}


@router.put("/{name}")
async def update_mcp_server(name: str, body: MCPServerRequest):
    cfg = _read_config()
    servers = _get_servers(cfg)
    if name not in servers:
        raise HTTPException(404, f"MCP server '{name}' not found")

    if body.type == "http":
        if not body.url:
            raise HTTPException(400, "url is required for http type")
        spec: dict[str, Any] = {"url": body.url}
        if body.headers:
            spec["headers"] = body.headers
    else:
        if not body.command:
            raise HTTPException(400, "command is required for stdio type")
        cmd_name = Path(body.command).name.lower()
        if cmd_name in _DANGEROUS_COMMANDS:
            raise HTTPException(400, f"Command '{cmd_name}' is not allowed for security reasons")
        spec = {"command": body.command, "args": body.args}
        if body.env:
            spec["env"] = body.env

    if body.toolTimeout != 30:
        spec["toolTimeout"] = body.toolTimeout

    # rename if needed
    if body.name != name:
        del servers[name]
        servers[body.name] = spec
    else:
        servers[name] = spec

    _set_servers(cfg, servers)
    _write_config(cfg)
    return {"ok": True}


@router.delete("/{name}")
async def delete_mcp_server(name: str):
    cfg = _read_config()
    servers = _get_servers(cfg)
    if name not in servers:
        raise HTTPException(404, f"MCP server '{name}' not found")
    del servers[name]
    _set_servers(cfg, servers)
    _write_config(cfg)
    return {"ok": True}
