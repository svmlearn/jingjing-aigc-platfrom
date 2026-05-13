from __future__ import annotations

from datetime import timedelta
from typing import Any
import logging

from mcp.shared._httpx_utils import create_mcp_http_client

from open_storyline.config import MCPConfig

logger = logging.getLogger(__name__)
SESSION_ID_HEADER = "X-Storyline-Session-Id"


def _transport_supports_http_headers(transport: str) -> bool:
    return transport in {"streamable-http", "streamable_http", "http", "sse"}


def _render_header_value(value: Any, session_id: str) -> Any:
    if not isinstance(value, str):
        return value
    return value.replace("{{session_id}}", session_id).replace("{session_id}", session_id)


def _build_connection_headers(
    *,
    transport: str,
    session_id: str,
    headers: dict[str, Any] | None = None,
    forward_storyline_session_id: bool = True,
) -> dict[str, Any] | None:
    if not _transport_supports_http_headers(transport):
        return None

    resolved_headers = {
        key: _render_header_value(value, session_id)
        for key, value in (headers or {}).items()
    }
    if forward_storyline_session_id:
        resolved_headers[SESSION_ID_HEADER] = session_id

    return resolved_headers or None


def _build_httpx_client_factory(default_headers: dict[str, Any] | None):
    def _factory(headers=None, timeout=None, auth=None):
        merged_headers = dict(headers or {})
        merged_headers.update(default_headers or {})
        return create_mcp_http_client(
            headers=merged_headers or None,
            timeout=timeout,
            auth=auth,
        )

    return _factory


def _mcp_timeout_value(seconds: float, transport: str) -> float | timedelta:
    if transport in {"streamable-http", "streamable_http", "http"}:
        return timedelta(seconds=seconds)
    return seconds


def _build_mcp_connection(
    *,
    transport: str,
    url: str,
    timeout: float,
    sse_read_timeout: float,
    headers: dict[str, Any] | None = None,
    session_kwargs: dict[str, Any] | None = None,
    httpx_client_factory: Any | None = None,
) -> dict[str, Any]:
    connection: dict[str, Any] = {
        "transport": transport,
        "url": url,
        "timeout": _mcp_timeout_value(timeout, transport),
        "sse_read_timeout": _mcp_timeout_value(sse_read_timeout, transport),
    }
    if headers is not None:
        connection["headers"] = headers
    if session_kwargs is not None:
        connection["session_kwargs"] = session_kwargs
    if httpx_client_factory is not None:
        connection["httpx_client_factory"] = httpx_client_factory
    return connection


def build_mcp_connections(
    local_mcp_server: MCPConfig,
    session_id: str,
    sampling_callback: Any,
) -> dict[str, dict[str, Any]]:
    primary_headers = _build_connection_headers(
        transport=local_mcp_server.server_transport,
        session_id=session_id,
    )
    primary_httpx_client_factory = (
        _build_httpx_client_factory(primary_headers)
        if _transport_supports_http_headers(local_mcp_server.server_transport)
        else None
    )
    connections: dict[str, dict[str, Any]] = {
        local_mcp_server.server_name: _build_mcp_connection(
            transport=local_mcp_server.server_transport,
            url=local_mcp_server.url,
            timeout=local_mcp_server.timeout,
            sse_read_timeout=30 * 60,
            headers=primary_headers,
            session_kwargs={"sampling_callback": sampling_callback},
            httpx_client_factory=primary_httpx_client_factory,
        )
    }

    for extra_server in getattr(local_mcp_server, "extra_mcp_servers", []):
        if extra_server.server_name in connections:
            logger.warning(
                "Skipping duplicate MCP server name '%s' from extra_mcp_servers; primary connection kept.",
                extra_server.server_name,
            )
            continue
        extra_headers = _build_connection_headers(
            transport=extra_server.transport,
            session_id=session_id,
            headers=extra_server.headers,
            forward_storyline_session_id=extra_server.forward_storyline_session_id,
        )
        extra_httpx_client_factory = (
            _build_httpx_client_factory(extra_headers)
            if _transport_supports_http_headers(extra_server.transport)
            else None
        )
        connections[extra_server.server_name] = _build_mcp_connection(
            transport=extra_server.transport,
            url=extra_server.url,
            timeout=extra_server.timeout,
            sse_read_timeout=extra_server.sse_read_timeout,
            headers=extra_headers,
            httpx_client_factory=extra_httpx_client_factory,
        )

    return connections
