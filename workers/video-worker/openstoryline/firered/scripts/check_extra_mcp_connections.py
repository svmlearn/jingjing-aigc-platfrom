from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path
from typing import Sequence

ROOT_DIR = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT_DIR / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from open_storyline.config import MCPConfig, ExtraMCPServerConfig
from open_storyline.mcp_connections import build_mcp_connections
from langchain_mcp_adapters.client import MultiServerMCPClient


VIDEO_EDIT_ENGINE_SERVER_NAME = "video_edit_engine"
EXPECTED_VIDEO_EDIT_TOOL_NAMES = [
    "session_create",
    "session_open",
    "assets_add",
    "plan_preview",
    "revision_apply",
    "render_preview",
    "export_final",
]


def _expected_prefixed_tool_names(server_name: str) -> list[str]:
    return [f"{server_name}_{tool_name}" for tool_name in EXPECTED_VIDEO_EDIT_TOOL_NAMES]


def build_smoke_connections(
    *,
    server_name: str = VIDEO_EDIT_ENGINE_SERVER_NAME,
    url: str = "http://127.0.0.1:9001/mcp",
    session_id: str = "session-123",
) -> dict:
    local_mcp_server = MCPConfig(
        port=8001,
        extra_mcp_servers=[
            ExtraMCPServerConfig(
                server_name=server_name,
                transport="streamable-http",
                url=url,
                timeout=600,
                sse_read_timeout=1800,
                headers={
                    "Authorization": "Bearer test",
                    "X-Upstream-Session": "{{session_id}}",
                },
            )
        ],
    )

    connections = build_mcp_connections(
        local_mcp_server=local_mcp_server,
        session_id=session_id,
        sampling_callback=object(),
    )
    return connections


def assert_connection_shape(
    connections: dict,
    *,
    server_name: str = VIDEO_EDIT_ENGINE_SERVER_NAME,
    url: str = "http://127.0.0.1:9001/mcp",
    session_id: str = "session-123",
) -> None:
    assert set(connections) == {"storyline", server_name}, connections
    assert connections["storyline"]["session_kwargs"]["sampling_callback"] is not None
    assert connections[server_name]["url"] == url
    assert connections[server_name]["headers"] == {
        "Authorization": "Bearer test",
        "X-Upstream-Session": session_id,
        "X-Storyline-Session-Id": session_id,
    }


async def probe_live_server_tools(
    connections: dict,
    *,
    server_name: str = VIDEO_EDIT_ENGINE_SERVER_NAME,
) -> list[str]:
    client = MultiServerMCPClient(
        connections=connections,
        tool_name_prefix=True,
    )
    tools = await client.get_tools(server_name=server_name)
    tool_names = [tool.name for tool in tools]
    expected_tool_names = _expected_prefixed_tool_names(server_name)
    missing = [tool_name for tool_name in expected_tool_names if tool_name not in tool_names]
    if missing:
        raise AssertionError(
            f"{server_name} is missing expected tools: {missing}; got {tool_names}"
        )
    return tool_names


async def probe_live_session_open_call(
    connections: dict,
    *,
    server_name: str = VIDEO_EDIT_ENGINE_SERVER_NAME,
    missing_session_id: str = "__openstoryline_smoke_missing__",
) -> str:
    client = MultiServerMCPClient(
        connections=connections,
        tool_name_prefix=True,
    )
    tools = await client.get_tools(server_name=server_name)
    tool_name = f"{server_name}_session_open"
    session_open_tool = next((tool for tool in tools if tool.name == tool_name), None)
    if session_open_tool is None:
        raise AssertionError(f"{server_name} is missing expected tool: {tool_name}")

    try:
        result = await session_open_tool.ainvoke({"session_id": missing_session_id})
    except Exception as exc:
        message = f"{type(exc).__name__}: {exc}"
        lower_message = message.lower()
        if (
            missing_session_id.lower() in lower_message
            or "unknown session" in lower_message
            or "session_id" in lower_message
            or "not found" in lower_message
        ):
            return message
        raise AssertionError(
            f"{tool_name} call failed before reaching the expected missing-session path: {message}"
        ) from exc

    if isinstance(result, dict):
        if result.get("ok") is False:
            return str(result.get("message") or result)
        return str(result)
    return str(result)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Smoke-check OpenStoryline extra MCP connection wiring.",
    )
    parser.add_argument("--live", action="store_true", help="Connect to the extra MCP server and list tools.")
    parser.add_argument("--server-name", default=VIDEO_EDIT_ENGINE_SERVER_NAME)
    parser.add_argument("--url", default="http://127.0.0.1:9001/mcp")
    parser.add_argument("--session-id", default="session-123")
    args = parser.parse_args(argv)

    connections = build_smoke_connections(
        server_name=args.server_name,
        url=args.url,
        session_id=args.session_id,
    )
    assert_connection_shape(
        connections,
        server_name=args.server_name,
        url=args.url,
        session_id=args.session_id,
    )

    if args.live:
        tool_names = asyncio.run(
            probe_live_server_tools(connections, server_name=args.server_name)
        )
        call_result = asyncio.run(
            probe_live_session_open_call(connections, server_name=args.server_name)
        )
        print(f"extra MCP live tool probe passed: {', '.join(tool_names)}")
        print(f"extra MCP live call probe reached session_open: {call_result}")
        return 0

    print("extra MCP connection smoke test passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
