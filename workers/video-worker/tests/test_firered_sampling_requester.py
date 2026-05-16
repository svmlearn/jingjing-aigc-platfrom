import asyncio
import importlib.util
import sys
import types
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FIRERED_SRC = ROOT / "openstoryline" / "firered" / "src"
SAMPLING_REQUESTER_PATH = (
    ROOT
    / "openstoryline"
    / "firered"
    / "src"
    / "open_storyline"
    / "mcp"
    / "sampling_requester.py"
)


def _load_module():
    sys.path.insert(0, str(FIRERED_SRC))
    mcp = types.ModuleType("mcp")
    mcp.__path__ = []
    mcp_server = types.ModuleType("mcp.server")
    mcp_server.__path__ = []
    fastmcp = types.ModuleType("mcp.server.fastmcp")
    session = types.ModuleType("mcp.server.session")
    mcp_types = types.ModuleType("mcp.types")

    class Context:
        @classmethod
        def __class_getitem__(cls, _item):
            return cls

    class ServerSession:
        pass

    class SamplingMessage:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)

    class TextContent:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)

    class ModelHint:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)

    class ModelPreferences:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)

    fastmcp.Context = Context
    session.ServerSession = ServerSession
    mcp_types.SamplingMessage = SamplingMessage
    mcp_types.TextContent = TextContent
    mcp_types.ModelHint = ModelHint
    mcp_types.ModelPreferences = ModelPreferences
    sys.modules["mcp"] = mcp
    sys.modules["mcp.server"] = mcp_server
    sys.modules["mcp.server.fastmcp"] = fastmcp
    sys.modules["mcp.server.session"] = session
    sys.modules["mcp.types"] = mcp_types

    emoji_module = types.ModuleType("open_storyline.utils.emoji")

    class EmojiManager:
        def remove_emoji(self, text):
            return text

    emoji_module.EmojiManager = EmojiManager
    sys.modules["open_storyline.utils.emoji"] = emoji_module
    spec = importlib.util.spec_from_file_location(
        "firered_sampling_requester_test",
        SAMPLING_REQUESTER_PATH,
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class _FakeSession:
    async def create_message(self, **_kwargs):
        class Result:
            stopReason = "error"

            class Content:
                type = "text"
                text = "model provider failed"

            content = Content()

        return Result()


class _FlakySession:
    def __init__(self):
        self.calls = 0

    async def create_message(self, **_kwargs):
        self.calls += 1

        class Result:
            class Content:
                type = "text"

            content = Content()

        result = Result()
        if self.calls == 1:
            result.stopReason = "error"
            result.content.text = "temporary provider failure"
        else:
            result.stopReason = "endTurn"
            result.content.text = "ok"
        return result


class _FakeContext:
    session = _FakeSession()


class _FlakyContext:
    def __init__(self):
        self.session = _FlakySession()
        self.progress = []

    async def report_progress(self, progress, total, message):
        self.progress.append((progress, total, message))


class SamplingRequesterTest(unittest.TestCase):
    def test_sampling_error_stop_reason_raises(self):
        module = _load_module()
        sampler = module.MCPSampler(_FakeContext())

        async def run():
            with self.assertRaises(module.SamplingError) as raised:
                await sampler.sampling(
                    system_prompt=None,
                    messages=[],
                    metadata={"timeout_seconds": 1},
                )
            self.assertIn("model provider failed", str(raised.exception))

        asyncio.run(run())

    def test_sampling_error_retries_before_success(self):
        module = _load_module()
        context = _FlakyContext()
        sampler = module.MCPSampler(context)

        async def run():
            result = await sampler.sampling(
                system_prompt=None,
                messages=[],
                metadata={"timeout_seconds": 1, "sampling_max_attempts": 2},
            )
            self.assertEqual("ok", result)
            self.assertEqual(2, context.session.calls)

        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
