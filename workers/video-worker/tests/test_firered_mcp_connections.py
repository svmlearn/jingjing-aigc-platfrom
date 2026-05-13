import importlib.util
import os
import sys
import types
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MCP_CONNECTIONS_PATH = (
    ROOT
    / "openstoryline"
    / "firered"
    / "src"
    / "open_storyline"
    / "mcp_connections.py"
)
CONFIG_PATH = ROOT / "openstoryline" / "firered" / "src" / "open_storyline" / "config.py"


def _install_import_stubs() -> None:
    httpx_utils = types.ModuleType("mcp.shared._httpx_utils")

    def create_mcp_http_client(**kwargs):
        return {"kwargs": kwargs}

    httpx_utils.create_mcp_http_client = create_mcp_http_client
    sys.modules.setdefault("mcp", types.ModuleType("mcp"))
    sys.modules.setdefault("mcp.shared", types.ModuleType("mcp.shared"))
    sys.modules["mcp.shared._httpx_utils"] = httpx_utils

    config = types.ModuleType("open_storyline.config")

    class MCPConfig:
        pass

    config.MCPConfig = MCPConfig
    sys.modules.setdefault("open_storyline", types.ModuleType("open_storyline"))
    sys.modules["open_storyline.config"] = config


def _load_module():
    _install_import_stubs()
    spec = importlib.util.spec_from_file_location("firered_mcp_connections_test", MCP_CONNECTIONS_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def _load_config_module():
    spec = importlib.util.spec_from_file_location("firered_config_test", CONFIG_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class MCPConnectionsTest(unittest.TestCase):
    def test_build_connections_accepts_legacy_config_without_extra_servers(self):
        module = _load_module()

        class LegacyMCPConfig:
            server_name = "storyline"
            server_transport = "streamable-http"
            url = "http://127.0.0.1:8001/mcp"
            timeout = 600

        connections = module.build_mcp_connections(
            LegacyMCPConfig(),
            session_id="ready-test",
            sampling_callback=lambda *_args, **_kwargs: None,
        )

        self.assertEqual(["storyline"], list(connections))
        connection = connections["storyline"]
        self.assertEqual("streamable-http", connection["transport"])
        self.assertEqual("http://127.0.0.1:8001/mcp", connection["url"])
        self.assertEqual({"X-Storyline-Session-Id": "ready-test"}, connection["headers"])


class FireRedConfigTest(unittest.TestCase):
    def test_expand_env_placeholders_recursively(self):
        module = _load_config_module()
        old_value = os.environ.get("OPENSTORYLINE_TEST_KEY")
        os.environ["OPENSTORYLINE_TEST_KEY"] = "real-key"
        try:
            self.assertEqual(
                {
                    "api_key": "real-key",
                    "fallback": "fallback-value",
                    "items": ["real-key"],
                },
                module._expand_env_placeholders(
                    {
                        "api_key": "${OPENSTORYLINE_TEST_KEY:-}",
                        "fallback": "${OPENSTORYLINE_MISSING_KEY:-fallback-value}",
                        "items": ["${OPENSTORYLINE_TEST_KEY:-}"],
                    }
                ),
            )
        finally:
            if old_value is None:
                os.environ.pop("OPENSTORYLINE_TEST_KEY", None)
            else:
                os.environ["OPENSTORYLINE_TEST_KEY"] = old_value


if __name__ == "__main__":
    unittest.main()
