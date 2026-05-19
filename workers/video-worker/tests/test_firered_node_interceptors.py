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
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module.ToolInterceptor


class Context:
    tts_config = {
        "provider": "minimax",
        "minimax": {"api_key": "tts-key", "base_url": "https://tts.example"},
    }
    pexels_api_key = "pexels-key"
    pexels_base_url = "https://app.example.com/api/private-media/pexels"
    worker_payload = None


class CloneContext:
    tts_config = {
        "provider": "pixelle_clone",
        "pixelle_clone": {
            "api_key": "clone-key",
            "base_url": "https://www.runninghub.cn",
            "ref_audio": "/tmp/ref.wav",
        },
    }
    pexels_api_key = ""
    pexels_base_url = ""
    worker_payload = None


class RunninghubFallbackContext:
    tts_config = {
        "provider": "minimax",
        "minimax": {"api_key": "minimax-key", "base_url": "https://api.minimax.io"},
        "fallback_provider": "runninghub",
        "runninghub": {"api_key": "runninghub-key", "base_url": "https://www.runninghub.cn"},
    }
    pexels_api_key = ""
    pexels_base_url = ""
    worker_payload = None


class TalkingHeadContext:
    tts_config = {}
    pexels_api_key = ""
    pexels_base_url = ""
    worker_payload = {
        "script_text": "1\n00:00-00:05\n场景：真人开头口播\n台词/字幕：欢迎来看这家店",
        "production_config": {
            "voiceover": {"enabled": True, "provider": "pixelle_clone"}
        },
        "input_assets": [
            {
                "asset_type": "video",
                "file_name": "clip.mp4",
                "tags": ["talking_head"],
                "store_file_name": "media_0001.mp4",
            }
        ],
    }


class TalkingHeadAsrContext:
    tts_config = {}
    pexels_api_key = ""
    pexels_base_url = ""
    asr_config = {
        "provider": "aliyun_paraformer",
        "aliyun_paraformer": {"api_key": "asr-key", "model": "paraformer-realtime-v2"},
    }
    worker_payload = {
        "production_config": {
            "subtitles": {"talking_head_source": "asr_original_audio"}
        },
    }


class LocalFunasrTalkingHeadAsrContext(TalkingHeadAsrContext):
    asr_config = {"provider": "local_funasr"}


class MissingKeyTalkingHeadAsrContext(TalkingHeadAsrContext):
    asr_config = {"provider": "aliyun_paraformer", "aliyun_paraformer": {}}


class Runtime:
    context = Context()


class Request:
    def __init__(self, name, args, context=None):
        self.name = name
        self.args = args
        self.runtime = types.SimpleNamespace(context=context or Context())

    def override(self, args):
        self.args = args
        return self


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
        self.assertEqual("tts-key", request.args["provider_keys"]["api_key"])

    def test_clone_provider_injection_flattens_nested_config(self):
        request = Request("generate_voiceover", {}, context=CloneContext())

        async def handler(req):
            return dict(req.args)

        result = asyncio.run(
            self.ToolInterceptor.inject_tts_config(request, handler)
        )

        self.assertEqual("pixelle_clone", result["provider"])
        self.assertEqual("clone-key", result["api_key"])
        self.assertEqual("https://www.runninghub.cn", result["base_url"])
        self.assertEqual("/tmp/ref.wav", result["provider_keys"]["ref_audio"])

    def test_minimax_provider_injection_preserves_runninghub_fallback(self):
        request = Request("generate_voiceover", {}, context=RunninghubFallbackContext())

        async def handler(req):
            return dict(req.args)

        result = asyncio.run(
            self.ToolInterceptor.inject_tts_config(request, handler)
        )

        self.assertEqual("minimax", result["provider"])
        self.assertEqual("runninghub", result["fallback_provider"])
        self.assertEqual("runninghub-key", result["runninghub"]["api_key"])

    def test_render_video_mutes_source_audio_for_talking_head_voiceover(self):
        module = sys.modules["firered_node_interceptors_under_test"]
        result = {"include_video_audio": True, "video_volume_scale": 1}
        module._force_mute_source_audio_for_talking_head(result, TalkingHeadContext())

        self.assertFalse(result["include_video_audio"])
        self.assertEqual(0, result["video_volume_scale"])
        self.assertEqual("mute_source_for_talking_head_voiceover", result["audio_policy"])

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

    def test_locked_worker_script_builds_custom_script_for_groups(self):
        module = sys.modules["firered_node_interceptors_under_test"]
        payload = {
            "script_text": (
                "1\n"
                "00:00-00:05\n"
                "场景：真人开头口播\n"
                "台词/字幕：如果你想找一个不吵、能坐一会儿的咖啡小院，可以看看这家。\n"
                "画面花字：楼群里的小院咖啡\n\n"
                "2\n"
                "00:05-00:12\n"
                "场景：入口动线\n"
                "台词/字幕：它不是商场里一眼看完的店，更像是走进去以后才发现的安静角落。\n"
                "画面花字：走进去，才发现里面很安静\n"
            ),
            "production_directive": {"script_locked": True},
        }
        groups = [{"group_id": "group_0001"}, {"group_id": "group_0002"}]

        custom_script = module._build_custom_script_from_worker_payload(payload, groups)

        self.assertEqual(
            [
                {
                    "group_id": "group_0001",
                    "raw_text": "如果你想找一个不吵、能坐一会儿的咖啡小院，可以看看这家。",
                    "source_clip_ids": [],
                    "source_duration_ms": 0,
                    "subtitle_source": "locked_script",
                    "audio_source": "voiceover",
                },
                {
                    "group_id": "group_0002",
                    "raw_text": "它不是商场里一眼看完的店，更像是走进去以后才发现的安静角落。",
                    "source_clip_ids": [],
                    "source_duration_ms": 0,
                    "subtitle_source": "locked_script",
                    "audio_source": "voiceover",
                },
            ],
            custom_script["group_scripts"],
        )

    def test_locked_worker_script_uses_asr_for_talking_head_groups(self):
        module = sys.modules["firered_node_interceptors_under_test"]
        payload = {
            "script_text": (
                "1\n00:00-00:05\n场景：真人开头口播\n台词/字幕：脚本文案不应覆盖ASR\n"
                "2\n00:05-00:12\n场景：入口动线\n台词/字幕：中段仍使用锁定脚本\n"
            ),
            "production_directive": {"script_locked": True},
            "production_config": {
                "subtitles": {"talking_head_source": "asr_original_audio"}
            },
        }
        groups = [
            {"group_id": "group_0001", "clip_ids": ["clip_0001"]},
            {"group_id": "group_0002", "clip_ids": ["clip_0002"]},
        ]
        split_shots = {
            "clips": [
                {
                    "clip_id": "clip_0001",
                    "source_ref": {
                        "media_id": "media_0001",
                        "duration": 5000,
                        "tags": ["talking_head"],
                    },
                },
                {
                    "clip_id": "clip_0002",
                    "source_ref": {
                        "media_id": "media_0002",
                        "duration": 7000,
                    },
                },
            ]
        }
        asr = {
            "asr_infos": [
                {"clip_id": "clip_0001", "asr_text": "这是从真人原声识别出来的话"},
                {"clip_id": "clip_0002", "asr_text": "中段素材环境声"},
            ]
        }

        custom_script = module._build_custom_script_from_worker_payload(
            payload,
            groups,
            asr,
            split_shots,
        )

        first, second = custom_script["group_scripts"]
        self.assertEqual("这是从真人原声识别出来的话", first["raw_text"])
        self.assertTrue(first["skip_voiceover"])
        self.assertFalse(first["voiceover_enabled"])
        self.assertEqual("original_video_audio", first["audio_source"])
        self.assertEqual("asr_original_audio", first["subtitle_source"])
        self.assertEqual(5000, first["source_duration_ms"])
        self.assertEqual("中段仍使用锁定脚本", second["raw_text"])
        self.assertEqual("voiceover", second["audio_source"])

    def test_generate_script_requires_asr_when_original_talking_head_subtitles_requested(self):
        module = sys.modules["firered_node_interceptors_under_test"]
        context = types.SimpleNamespace(
            worker_payload={
                "production_config": {
                    "subtitles": {"talking_head_source": "asr_original_audio"}
                }
            }
        )

        require_kind = module._with_required_original_audio_asr(
            ["split_shots", "group_clips"],
            "generate_script",
            context,
        )

        self.assertEqual(["split_shots", "group_clips", "asr"], require_kind)

    def test_locked_worker_script_expands_dialogues_to_match_more_groups(self):
        module = sys.modules["firered_node_interceptors_under_test"]
        payload = {
            "script_text": (
                "1\n00:00-00:05\n"
                "台词/字幕：如果你想找一个不吵、能坐一会儿的咖啡小院，可以看看这家。\n"
                "2\n00:05-00:12\n"
                "台词/字幕：它不是商场里一眼看完的店，更像是走进去以后才发现的安静角落。\n"
            ),
            "production_directive": {"script_locked": True},
        }
        groups = [
            {"group_id": "group_0001"},
            {"group_id": "group_0002"},
            {"group_id": "group_0003"},
        ]

        custom_script = module._build_custom_script_from_worker_payload(payload, groups)

        self.assertEqual(3, len(custom_script["group_scripts"]))
        self.assertEqual("group_0003", custom_script["group_scripts"][2]["group_id"])
        self.assertTrue(custom_script["group_scripts"][2]["raw_text"])

    def test_locked_worker_script_builds_custom_script_for_groups(self):
        module = sys.modules["firered_node_interceptors_under_test"]
        payload = {
            "script_text": (
                "1\n"
                "00:00-00:05\n"
                "场景：真人开头口播\n"
                "台词/字幕：如果你想找一个不吵、能坐一会儿的咖啡小院，可以看看这家。\n"
                "画面花字：楼群里的小院咖啡\n\n"
                "2\n"
                "00:05-00:12\n"
                "场景：入口动线\n"
                "台词/字幕：它不是商场里一眼看完的店，更像是走进去以后才发现的安静角落。\n"
                "画面花字：走进去，才发现里面很安静\n"
            ),
            "production_directive": {"script_locked": True},
        }
        groups = [{"group_id": "group_0001"}, {"group_id": "group_0002"}]

        custom_script = module._build_custom_script_from_worker_payload(payload, groups)

        self.assertEqual(
            [
                {
                    "group_id": "group_0001",
                    "raw_text": "如果你想找一个不吵、能坐一会儿的咖啡小院，可以看看这家。",
                    "source_clip_ids": [],
                    "source_duration_ms": 0,
                    "subtitle_source": "locked_script",
                    "audio_source": "voiceover",
                },
                {
                    "group_id": "group_0002",
                    "raw_text": "它不是商场里一眼看完的店，更像是走进去以后才发现的安静角落。",
                    "source_clip_ids": [],
                    "source_duration_ms": 0,
                    "subtitle_source": "locked_script",
                    "audio_source": "voiceover",
                },
            ],
            custom_script["group_scripts"],
        )

    def test_locked_worker_script_uses_asr_for_talking_head_groups(self):
        module = sys.modules["firered_node_interceptors_under_test"]
        payload = {
            "script_text": (
                "1\n00:00-00:05\n场景：真人开头口播\n台词/字幕：脚本文案不应覆盖ASR\n"
                "2\n00:05-00:12\n场景：入口动线\n台词/字幕：中段仍使用锁定脚本\n"
            ),
            "production_directive": {"script_locked": True},
            "production_config": {
                "subtitles": {"talking_head_source": "asr_original_audio"}
            },
        }
        groups = [
            {"group_id": "group_0001", "clip_ids": ["clip_0001"]},
            {"group_id": "group_0002", "clip_ids": ["clip_0002"]},
        ]
        split_shots = {
            "clips": [
                {
                    "clip_id": "clip_0001",
                    "source_ref": {
                        "media_id": "media_0001",
                        "duration": 5000,
                        "tags": ["talking_head"],
                    },
                },
                {
                    "clip_id": "clip_0002",
                    "source_ref": {
                        "media_id": "media_0002",
                        "duration": 7000,
                    },
                },
            ]
        }
        asr = {
            "asr_infos": [
                {"clip_id": "clip_0001", "asr_text": "这是从真人原声识别出来的话"},
                {"clip_id": "clip_0002", "asr_text": "中段素材环境声"},
            ]
        }

        custom_script = module._build_custom_script_from_worker_payload(
            payload,
            groups,
            asr,
            split_shots,
        )

        first, second = custom_script["group_scripts"]
        self.assertEqual("这是从真人原声识别出来的话", first["raw_text"])
        self.assertTrue(first["skip_voiceover"])
        self.assertFalse(first["voiceover_enabled"])
        self.assertEqual("original_video_audio", first["audio_source"])
        self.assertEqual("asr_original_audio", first["subtitle_source"])
        self.assertEqual(5000, first["source_duration_ms"])
        self.assertEqual("中段仍使用锁定脚本", second["raw_text"])
        self.assertEqual("voiceover", second["audio_source"])

    def test_generate_script_requires_asr_when_original_talking_head_subtitles_requested(self):
        module = sys.modules["firered_node_interceptors_under_test"]
        context = types.SimpleNamespace(
            worker_payload={
                "production_config": {
                    "subtitles": {"talking_head_source": "asr_original_audio"}
                }
            }
        )

        require_kind = module._with_required_original_audio_asr(
            ["split_shots", "group_clips"],
            "generate_script",
            context,
        )

        self.assertEqual(["split_shots", "group_clips", "asr"], require_kind)

    def test_original_audio_asr_injection_accepts_aliyun_paraformer(self):
        request = Request("local_asr", {}, context=TalkingHeadAsrContext())

        async def handler(req):
            return dict(req.args)

        result = asyncio.run(self.ToolInterceptor.inject_asr_config(request, handler))

        self.assertEqual("aliyun_paraformer", result["provider"])
        self.assertEqual("asr-key", result["api_key"])

    def test_original_audio_asr_rejects_local_funasr(self):
        request = Request("local_asr", {}, context=LocalFunasrTalkingHeadAsrContext())

        async def handler(req):
            return dict(req.args)

        with self.assertRaisesRegex(Exception, "local FunASR fallback is disabled"):
            asyncio.run(self.ToolInterceptor.inject_asr_config(request, handler))

    def test_original_audio_asr_rejects_missing_key(self):
        request = Request("local_asr", {}, context=MissingKeyTalkingHeadAsrContext())

        async def handler(req):
            return dict(req.args)

        with self.assertRaisesRegex(Exception, "ALIYUN_ASR_API_KEY or DASHSCOPE_API_KEY"):
            asyncio.run(self.ToolInterceptor.inject_asr_config(request, handler))

    def test_locked_worker_script_marks_no_voiceover_groups_for_original_audio(self):
        module = sys.modules["firered_node_interceptors_under_test"]
        payload = {
            "script_text": (
                "1\n00:00-00:05\n台词/字幕：第一段锁定脚本\n"
                "2\n00:05-00:12\n台词/字幕：第二段锁定脚本\n"
            ),
            "production_directive": {"script_locked": True},
            "production_config": {
                "voiceover": {"enabled": False},
                "bgm": {"enabled": False},
            },
        }
        groups = [
            {"group_id": "group_0001", "clip_ids": ["clip_0001"]},
            {"group_id": "group_0002", "clip_ids": ["clip_0002"]},
        ]

        custom_script = module._build_custom_script_from_worker_payload(payload, groups)

        for group_script in custom_script["group_scripts"]:
            self.assertTrue(group_script["skip_voiceover"])
            self.assertFalse(group_script["voiceover_enabled"])
            self.assertEqual("original_video_audio", group_script["audio_source"])
            self.assertTrue(group_script["preserve_clip_duration"])

    def test_plan_timeline_drops_disabled_voiceover_and_bgm_dependencies(self):
        module = sys.modules["firered_node_interceptors_under_test"]
        context = types.SimpleNamespace(
            worker_payload={
                "production_config": {
                    "voiceover": {"enabled": False},
                    "bgm": {"enabled": False},
                }
            }
        )

        require_kind = module._with_disabled_optional_kinds_removed(
            ["load_media", "split_shots", "group_clips", "generate_script", "tts", "music_rec"],
            "plan_timeline",
            context,
        )

        self.assertEqual(
            ["load_media", "split_shots", "group_clips", "generate_script"],
            require_kind,
        )

    def test_locked_worker_script_expands_dialogues_to_match_more_groups(self):
        module = sys.modules["firered_node_interceptors_under_test"]
        payload = {
            "script_text": (
                "1\n00:00-00:05\n"
                "台词/字幕：如果你想找一个不吵、能坐一会儿的咖啡小院，可以看看这家。\n"
                "2\n00:05-00:12\n"
                "台词/字幕：它不是商场里一眼看完的店，更像是走进去以后才发现的安静角落。\n"
            ),
            "production_directive": {"script_locked": True},
        }
        groups = [
            {"group_id": "group_0001"},
            {"group_id": "group_0002"},
            {"group_id": "group_0003"},
        ]

        custom_script = module._build_custom_script_from_worker_payload(payload, groups)

        self.assertEqual(3, len(custom_script["group_scripts"]))
        self.assertEqual("group_0003", custom_script["group_scripts"][2]["group_id"])
        self.assertTrue(custom_script["group_scripts"][2]["raw_text"])


if __name__ == "__main__":
    unittest.main()
