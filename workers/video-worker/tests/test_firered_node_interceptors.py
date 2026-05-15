import asyncio
import importlib.util
import sys
import types
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
NODE_INTERCEPTORS_PATH = (
    ROOT
    / "openstoryline"
    / "firered"
    / "src"
    / "open_storyline"
    / "mcp"
    / "hooks"
    / "node_interceptors.py"
)


def _install_import_stubs() -> None:
    interceptors = types.ModuleType("langchain_mcp_adapters.interceptors")

    class MCPToolCallRequest:
        pass

    interceptors.MCPToolCallRequest = MCPToolCallRequest
    sys.modules.setdefault("langchain_mcp_adapters", types.ModuleType("langchain_mcp_adapters"))
    sys.modules["langchain_mcp_adapters.interceptors"] = interceptors

    langgraph_types = types.ModuleType("langgraph.types")

    class Command:
        def __init__(self, update=None):
            self.update = update or {}

    langgraph_types.Command = Command
    sys.modules.setdefault("langgraph", types.ModuleType("langgraph"))
    sys.modules["langgraph.types"] = langgraph_types

    messages = types.ModuleType("langchain_core.messages")

    class ToolMessage:
        def __init__(self, content=None, tool_call_id=None, **kwargs):
            self.content = content
            self.tool_call_id = tool_call_id
            self.kwargs = kwargs

    class ToolCall(dict):
        pass

    messages.ToolMessage = ToolMessage
    messages.ToolCall = ToolCall
    sys.modules.setdefault("langchain_core", types.ModuleType("langchain_core"))
    sys.modules["langchain_core.messages"] = messages

    tools = types.ModuleType("langchain_core.tools")

    class ToolException(Exception):
        pass

    tools.ToolException = ToolException
    sys.modules["langchain_core.tools"] = tools

    mcp_types = types.ModuleType("mcp.types")

    class CallToolResult:
        pass

    mcp_types.CallToolResult = CallToolResult
    sys.modules.setdefault("mcp", types.ModuleType("mcp"))
    sys.modules["mcp.types"] = mcp_types

    node_manager_mod = types.ModuleType("open_storyline.nodes.node_manager")

    class NodeManager:
        pass

    node_manager_mod.NodeManager = NodeManager
    sys.modules.setdefault("open_storyline", types.ModuleType("open_storyline"))
    sys.modules.setdefault("open_storyline.nodes", types.ModuleType("open_storyline.nodes"))
    sys.modules["open_storyline.nodes.node_manager"] = node_manager_mod

    storage_file = types.ModuleType("open_storyline.storage.file")

    class FileCompressor:
        @staticmethod
        def compress_and_encode(_path):
            raise AssertionError("not used in these tests")

    storage_file.FileCompressor = FileCompressor
    sys.modules.setdefault("open_storyline.storage", types.ModuleType("open_storyline.storage"))
    sys.modules["open_storyline.storage.file"] = storage_file

    logging_mod = types.ModuleType("open_storyline.utils.logging")

    class Logger:
        def warning(self, *_args, **_kwargs):
            pass

        def error(self, *_args, **_kwargs):
            pass

        def info(self, *_args, **_kwargs):
            pass

        def debug(self, *_args, **_kwargs):
            pass

    logging_mod.get_logger = lambda _name=None: Logger()
    sys.modules.setdefault("open_storyline.utils", types.ModuleType("open_storyline.utils"))
    sys.modules["open_storyline.utils.logging"] = logging_mod


def _load_tool_interceptor():
    _install_import_stubs()
    module_name = "firered_node_interceptors_under_test"
    spec = importlib.util.spec_from_file_location(module_name, NODE_INTERCEPTORS_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module.ToolInterceptor


class Context:
    tts_config = {
        "provider": "minimax",
        "minimax": {"api_key": "tts-key", "base_url": "https://tts.example"},
    }
    pexels_api_key = "pexels-key"
    pexels_base_url = "https://app.example.com/api/private-media/pexels"


class Runtime:
    context = Context()


class Request:
    def __init__(self, name, args):
        self.name = name
        self.args = args
        self.runtime = Runtime()


class FireRedNodeInterceptorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ToolInterceptor = _load_tool_interceptor()

    def test_provider_injection_calls_handler_once(self):
        calls = []
        request = Request("generate_voiceover", {})

        async def handler(req):
            calls.append(dict(req.args))
            return "ok"

        result = asyncio.run(
            self.ToolInterceptor.inject_tts_config(request, handler)
        )

        self.assertEqual("ok", result)
        self.assertEqual(1, len(calls))
        self.assertEqual("minimax", request.args["provider"])
        self.assertEqual("tts-key", request.args["api_key"])

    def test_provider_injection_propagates_handler_exception_once(self):
        calls = []
        request = Request("generate_voiceover", {})

        async def handler(req):
            calls.append(req)
            raise RuntimeError("downstream render failed")

        with self.assertRaisesRegex(RuntimeError, "downstream render failed"):
            asyncio.run(self.ToolInterceptor.inject_tts_config(request, handler))

        self.assertEqual(1, len(calls))

    def test_pexels_injection_propagates_handler_exception_once(self):
        calls = []
        request = Request("search_media", {})

        async def handler(req):
            calls.append(dict(req.args))
            raise RuntimeError("mcp connect failed")

        with self.assertRaisesRegex(RuntimeError, "mcp connect failed"):
            asyncio.run(self.ToolInterceptor.inject_pexels_api_key(request, handler))

        self.assertEqual(1, len(calls))
        self.assertEqual("pexels-key", request.args["pexels_api_key"])
        self.assertEqual(
            "https://app.example.com/api/private-media/pexels",
            request.args["pexels_base_url"],
        )


if __name__ == "__main__":
    unittest.main()
