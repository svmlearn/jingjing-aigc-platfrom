import asyncio
import importlib.util
import sys
import types
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory


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


class WorkerPrivatePexelsContext:
    pexels_api_key = "private-pexels-token"
    pexels_base_url = "https://app.example.com/api/private-media/pexels/merchants/merchant-1"
    worker_payload = {"merchant_id": "merchant-1"}


class WorkerMissingPexelsContext:
    pexels_api_key = ""
    pexels_base_url = ""
    worker_payload = {"merchant_id": "merchant-1"}


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


class LipSyncContext:
    lip_sync_config = {
        "provider": "aliyun_videoretalk",
        "aliyun_videoretalk": {
            "api_key": "retalk-key",
            "base_url": "https://dashscope.example/api/v1",
            "model": "videoretalk",
        },
    }
    worker_payload = {
        "production_config": {
            "lip_sync": {"enabled": True, "provider": "aliyun_videoretalk"}
        }
    }


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


class ArtifactMeta:
    def __init__(self, artifact_id, node_id="search_media", session_id="session-1", created_at=0):
        self.artifact_id = artifact_id
        self.node_id = node_id
        self.session_id = session_id
        self.created_at = created_at


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

    def test_worker_pexels_injection_requires_private_search_config(self):
        request = Request("search_media", {}, context=WorkerMissingPexelsContext())

        async def handler(_req):
            raise AssertionError("handler must not run without private search config")

        with self.assertRaisesRegex(Exception, "official Pexels fallback is disabled"):
            asyncio.run(self.ToolInterceptor.inject_pexels_api_key(request, handler))

    def test_worker_pexels_injection_requires_merchant_scoped_base_url(self):
        request = Request("search_media", {}, context=WorkerPrivatePexelsContext())

        async def handler(req):
            return dict(req.args)

        result = asyncio.run(self.ToolInterceptor.inject_pexels_api_key(request, handler))

        self.assertEqual("private-pexels-token", result["pexels_api_key"])
        self.assertEqual(
            "https://app.example.com/api/private-media/pexels/merchants/merchant-1",
            result["pexels_base_url"],
        )

    def test_load_media_merges_all_search_media_results_for_session(self):
        request = Request("load_media", {})

        with TemporaryDirectory() as tmp:
            media_dir = Path(tmp) / "media"
            media_dir.mkdir()
            search_a = str(Path(tmp) / "search-a.mp4")
            search_b = str(Path(tmp) / "search-b.mp4")
            search_c = str(Path(tmp) / "search-c.mp4")

            class Store:
                artifacts_dir = Path(tmp) / "artifacts"

                def generate_artifact_id(self, node_id):
                    return f"{node_id}-artifact"

                def get_metas(self, *, node_id, session_id):
                    self.node_id = node_id
                    self.session_id = session_id
                    return [
                        types.SimpleNamespace(artifact_id="search-1", created_at=1),
                        types.SimpleNamespace(artifact_id="search-2", created_at=2),
                    ]

                def load_result(self, artifact_id):
                    payloads = {
                        "search-1": {"payload": {"search_media": [{"path": search_a}, {"path": search_b}]}},
                        "search-2": {"payload": {"search_media": [{"path": search_b}, {"path": search_c}]}},
                    }
                    return None, payloads[artifact_id]

            context = types.SimpleNamespace(
                session_id="session-1",
                media_dir=str(media_dir),
                lang="zh",
                cfg=types.SimpleNamespace(project=types.SimpleNamespace(media_dir=str(media_dir))),
                node_manager=types.SimpleNamespace(id_to_tool={}),
                worker_payload=None,
            )
            request.runtime = types.SimpleNamespace(context=context, store=Store())

            async def handler(req):
                return req.args

            result = asyncio.run(self.ToolInterceptor.inject_media_content_before(request, handler))

        paths = [item["path"] for item in result["inputs"]]
        self.assertEqual([search_a, search_b, search_c], paths)

    def test_search_media_result_is_annotated_with_scene_query_diagnostic(self):
        module = sys.modules["firered_node_interceptors_under_test"]
        request = Request(
            "search_media",
            {"search_keyword": "一楼厂房空间"},
            context=types.SimpleNamespace(
                worker_payload={
                    "materialContext": {
                        "sceneAssetQueries": [
                            {"sceneNo": 1, "query": "一楼厂房空间", "sourceRole": "merchant_broll"}
                        ]
                    }
                }
            ),
        )
        tool_result = {
            "artifact_id": "search-1",
            "isError": False,
            "summary": {},
            "tool_excute_result": {
                "search_media": [{"path": "/tmp/factory.mp4"}],
            },
        }

        module._annotate_worker_scene_search_result(tool_result, request)

        diagnostic = tool_result["tool_excute_result"]["_worker_scene_search"]
        self.assertEqual(0, diagnostic["scene_index"])
        self.assertEqual(1, diagnostic["scene_no"])
        self.assertEqual("一楼厂房空间", diagnostic["query"])
        self.assertEqual(1, diagnostic["result_count"])

    def test_generate_script_blocks_when_group_count_is_below_required_scene_count(self):
        module = sys.modules["firered_node_interceptors_under_test"]
        context = types.SimpleNamespace(
            worker_payload={
                "script_text": (
                    "1\n00:00-00:05\n台词/字幕：第一段\n"
                    "2\n00:05-00:10\n台词/字幕：第二段\n"
                    "3\n00:10-00:15\n台词/字幕：第三段\n"
                ),
                "production_directive": {"script_locked": True},
                "materialContext": {
                    "sceneAssetQueries": [
                        {"sceneNo": 1, "query": "一楼厂房空间", "sourceRole": "merchant_broll"},
                        {"sceneNo": 2, "query": "基础设施", "sourceRole": "merchant_broll"},
                        {"sceneNo": 3, "query": "园区管理", "sourceRole": "merchant_broll"},
                    ]
                },
            }
        )
        args = {"group_clips": {"groups": [{"group_id": "group_0001"}, {"group_id": "group_0002"}]}}

        with self.assertRaisesRegex(Exception, "required_scene_count=3"):
            module._ensure_worker_required_group_count("generate_script", args, context)

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
        self.assertNotIn("skip_voiceover", first)
        self.assertTrue(first["voiceover_enabled"])
        self.assertEqual("voiceover", first["audio_source"])
        self.assertEqual("asr_original_audio", first["subtitle_source"])
        self.assertEqual(5000, first["source_duration_ms"])
        self.assertEqual("中段仍使用锁定脚本", second["raw_text"])
        self.assertEqual("voiceover", second["audio_source"])

    def test_locked_worker_script_uses_asr_but_skips_voiceover_when_voiceover_disabled(self):
        module = sys.modules["firered_node_interceptors_under_test"]
        payload = {
            "script_text": "1\n00:00-00:05\n台词/字幕：脚本文案\n",
            "production_directive": {"script_locked": True},
            "production_config": {
                "voiceover": {"enabled": False},
                "subtitles": {"talking_head_source": "asr_original_audio"},
            },
        }
        groups = [{"group_id": "group_0001", "clip_ids": ["clip_0001"]}]
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
            ]
        }
        asr = {"asr_infos": [{"clip_id": "clip_0001", "asr_text": "ASR 原声文本"}]}

        custom_script = module._build_custom_script_from_worker_payload(
            payload,
            groups,
            asr,
            split_shots,
        )

        first = custom_script["group_scripts"][0]
        self.assertEqual("ASR 原声文本", first["raw_text"])
        self.assertTrue(first["skip_voiceover"])
        self.assertFalse(first["voiceover_enabled"])
        self.assertEqual("original_video_audio", first["audio_source"])
        self.assertEqual("asr_original_audio", first["subtitle_source"])

    def test_locked_worker_script_uses_asr_for_unlabeled_member_upload_candidates(self):
        module = sys.modules["firered_node_interceptors_under_test"]
        payload = {
            "script_text": (
                "1\n00:00-00:05\n场景：成员真人口播\n台词/字幕：脚本文案不应覆盖ASR\n"
                "2\n00:05-00:10\n场景：团队素材\n台词/字幕：团队素材仍使用脚本\n"
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
                    },
                },
                {
                    "clip_id": "clip_0002",
                    "source_ref": {
                        "media_id": "media_0002",
                        "duration": 5000,
                        "role": "project_material",
                        "scene_type": "merchant_material_library",
                    },
                },
            ]
        }
        asr = {
            "asr_infos": [
                {"clip_id": "clip_0001", "asr_text": "成员上传口播识别结果"},
                {"clip_id": "clip_0002", "asr_text": "团队素材环境声"},
            ]
        }

        custom_script = module._build_custom_script_from_worker_payload(
            payload,
            groups,
            asr,
            split_shots,
        )

        first, second = custom_script["group_scripts"]
        self.assertEqual("成员上传口播识别结果", first["raw_text"])
        self.assertEqual("voiceover", first["audio_source"])
        self.assertEqual("asr_original_audio", first["subtitle_source"])
        self.assertEqual("团队素材仍使用脚本", second["raw_text"])
        self.assertEqual("voiceover", second["audio_source"])

    def test_locked_worker_script_uses_structured_member_upload_signal_without_talking_head_words(self):
        module = sys.modules["firered_node_interceptors_under_test"]
        dialogue_label = "台词/字幕"
        payload = {
            "script_text": (
                f"1\n00:00-00:05\nScene: member assigned upload\n{dialogue_label}: locked text should be replaced by ASR\n"
                f"2\n00:05-00:10\nScene: project material\n{dialogue_label}: project material keeps locked script\n"
            ),
            "production_directive": {"script_locked": True},
            "production_config": {
                "subtitles": {"talking_head_source": "asr_original_audio"}
            },
            "materialContext": {
                "userTalkingHeadAssetIds": ["member-upload-1"],
            },
            "input_assets": [
                {
                    "asset_id": "member-upload-1",
                    "file_name": "member-upload.mp4",
                    "storage_key": "draft-inputs/merchant-1/draft-1/member-upload.mp4",
                },
            ],
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
                        "asset_id": "member-upload-1",
                        "file_name": "member-upload.mp4",
                        "duration": 5000,
                    },
                },
                {
                    "clip_id": "clip_0002",
                    "source_ref": {
                        "media_id": "media_0002",
                        "duration": 5000,
                        "role": "project_material",
                        "scene_type": "merchant_material_library",
                    },
                },
            ]
        }
        asr = {
            "asr_infos": [
                {"clip_id": "clip_0001", "asr_text": "member upload ASR result"},
                {"clip_id": "clip_0002", "asr_text": "project ambient sound"},
            ]
        }

        custom_script = module._build_custom_script_from_worker_payload(
            payload,
            groups,
            asr,
            split_shots,
        )

        first, second = custom_script["group_scripts"]
        self.assertEqual("member upload ASR result", first["raw_text"])
        self.assertEqual("voiceover", first["audio_source"])
        self.assertEqual("asr_original_audio", first["subtitle_source"])
        self.assertEqual("project material keeps locked script", second["raw_text"])
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

    def test_worker_scene_search_requires_each_merchant_broll_query(self):
        module = sys.modules["firered_node_interceptors_under_test"]
        payload = {
            "script_text": "locked script",
            "production_directive": {"script_locked": True},
            "materialContext": {
                "sceneAssetQueries": [
                    {"sceneNo": 1, "query": "coffee entrance", "sourceRole": "merchant_broll"},
                    {"sceneNo": 2, "query": "member talking", "sourceRole": "user_talking_head"},
                    {"sceneNo": 3, "query": "quiet table", "sourceRole": "merchant_broll"},
                ]
            },
        }

        missing = module._missing_worker_scene_searches(
            payload,
            [{"search_keyword": "coffee entrance", "search_media": []}],
        )

        self.assertEqual(1, len(missing))
        self.assertEqual(2, missing[0]["index"])
        self.assertEqual(3, missing[0]["sceneNo"])
        self.assertEqual("quiet table", missing[0]["query"])
        self.assertEqual("merchant_broll", missing[0]["sourceRole"])

    def test_worker_scene_search_accepts_zero_result_record(self):
        module = sys.modules["firered_node_interceptors_under_test"]
        payload = {
            "script_text": "locked script",
            "production_directive": {
                "script_locked": True,
                "material_context": {
                    "sceneAssetQueries": [
                        {"sceneNo": 1, "query": "coffee entrance", "sourceRole": "merchant_broll"},
                    ],
                },
            },
        }

        missing = module._missing_worker_scene_searches(
            payload,
            [{"search_keyword": "coffee entrance", "search_media": []}],
        )

        self.assertEqual([], missing)

    def test_worker_group_count_failure_reports_scene_material_insufficient(self):
        module = sys.modules["firered_node_interceptors_under_test"]
        context = types.SimpleNamespace(
            worker_payload={
                "script_text": "locked script",
                "materialContext": {
                    "sceneAssetQueries": [
                        {"sceneNo": 1, "query": "entry", "sourceRole": "merchant_broll"},
                        {"sceneNo": 2, "query": "table", "sourceRole": "merchant_broll"},
                    ]
                },
            }
        )

        with self.assertRaisesRegex(Exception, "scene_material_insufficient.*sceneNo=2"):
            module._ensure_worker_required_group_count(
                {"group_clips": {"groups": [{"group_id": "group_0001"}]}},
                context,
            )

    def test_worker_group_count_gate_skips_unlocked_payload(self):
        module = sys.modules["firered_node_interceptors_under_test"]
        context = types.SimpleNamespace(
            worker_payload={
                "materialContext": {
                    "sceneAssetQueries": [
                        {"sceneNo": 1, "query": "entry", "sourceRole": "merchant_broll"},
                        {"sceneNo": 2, "query": "table", "sourceRole": "merchant_broll"},
                    ]
                },
            }
        )

        module._ensure_worker_required_group_count(
            {"group_clips": {"groups": [{"group_id": "group_0001"}]}},
            context,
        )

    def test_worker_scene_search_accepts_camel_case_locked_payload(self):
        module = sys.modules["firered_node_interceptors_under_test"]
        payload = {
            "scriptText": "locked script",
            "productionDirective": {
                "scriptLocked": True,
                "materialContext": {
                    "sceneAssetQueries": [
                        {"sceneNo": 1, "query": "front desk", "sourceRole": "merchant_broll"},
                    ],
                },
            },
        }

        missing = module._missing_worker_scene_searches(payload, [])

        self.assertEqual(1, len(missing))
        self.assertEqual(0, missing[0]["index"])
        self.assertEqual(1, missing[0]["sceneNo"])
        self.assertEqual("front desk", missing[0]["query"])
        self.assertEqual("merchant_broll", missing[0]["sourceRole"])

    def test_load_media_merges_all_search_media_payloads(self):
        module = sys.modules["firered_node_interceptors_under_test"]
        payloads = {
            "search_media_1": {"payload": {"search_media": [{"path": "/tmp/a.mp4"}]}},
            "search_media_2": {"payload": {"search_media": ["/tmp/b.mp4", "/tmp/a.mp4"]}},
        }

        class Store:
            def get_metas(self, *, node_id, session_id):
                self.calls = (node_id, session_id)
                return [
                    ArtifactMeta("search_media_1", created_at=1),
                    ArtifactMeta("search_media_2", created_at=2),
                ]

            def load_result(self, artifact_id):
                return ArtifactMeta(artifact_id), payloads[artifact_id]

        search_payloads = module._load_search_media_payloads(Store(), session_id="session-1")

        self.assertEqual(
            [
                {"search_media": [{"path": "/tmp/a.mp4"}]},
                {"search_media": ["/tmp/b.mp4", "/tmp/a.mp4"]},
            ],
            search_payloads,
        )

    def test_locked_worker_script_keeps_numbered_scenes_when_group_count_is_larger(self):
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

        self.assertEqual(2, len(custom_script["group_scripts"]))
        self.assertEqual(
            [
                "如果你想找一个不吵、能坐一会儿的咖啡小院，可以看看这家。",
                "它不是商场里一眼看完的店，更像是走进去以后才发现的安静角落。",
            ],
            [item["raw_text"] for item in custom_script["group_scripts"]],
        )

    def test_locked_worker_script_uses_spoken_text_and_does_not_duplicate_subtitles(self):
        module = sys.modules["firered_node_interceptors_under_test"]
        payload = {
            "script_text": (
                "1\n00:00-00:08\n"
                "场景：真人开头口播\n"
                "口播：我是智鸾，先带你看这套厂房。\n"
                "字幕：我是智鸾，先带你看这套厂房。\n"
                "拍法：正面手持\n"
                "2\n00:08-00:16\n"
                "场景：车间动线\n"
                "口播：这里进出货和生产动线是分开的。\n"
                "字幕：这里进出货和生产动线是分开的。\n"
            ),
            "production_directive": {"script_locked": True},
        }
        groups = [
            {"group_id": "group_0001"},
            {"group_id": "group_0002"},
            {"group_id": "group_0003"},
            {"group_id": "group_0004"},
        ]

        custom_script = module._build_custom_script_from_worker_payload(payload, groups)

        self.assertEqual(2, len(custom_script["group_scripts"]))
        self.assertEqual(
            [
                "我是智鸾，先带你看这套厂房。",
                "这里进出货和生产动线是分开的。",
            ],
            [item["raw_text"] for item in custom_script["group_scripts"]],
        )

    def test_locked_worker_script_keeps_scene_heading_sections_from_member_script(self):
        module = sys.modules["firered_node_interceptors_under_test"]
        payload = {
            "script_text": (
                "分镜脚本：\n"
                "场景1（0-5秒）\n"
                "画面：成员口播开场，园区入口或门头前半身出镜。\n"
                "镜头要求：成员口播 园区入口 门头 开场\n"
                "口播：找厂房别只看价格，先看三个点：空间、配套、位置。\n"
                "字幕：找厂房，先看空间、配套、位置\n"
                "素材关键词：园区门口口播、园区入口\n\n"
                "场景2（5-17秒）\n"
                "画面：一楼厂房大空间、柱网、绿色地坪、采光窗、消防管线连续扫拍。\n"
                "口播：这个园区一楼有约 2000 平厂房，层高到楼板 5.56 米，到梁 5 米，做生产、仓储、办公改造都比较好安排。\n"
                "字幕：一楼约2000平，楼板5.56米，到梁5米\n"
                "素材关键词：一楼厂房楼梯与夹层入口空间\n\n"
                "场景3（17-31秒）\n"
                "画面：停车位、宿舍楼、公寓、食堂、管理处、电梯等配套快速蒙太奇。\n"
                "口播：园区还有 2 栋宿舍、1 栋公寓，食堂、电梯、管理处、停车位这些基础配套也在。\n"
                "字幕：宿舍、公寓、食堂、电梯、停车位都有\n"
                "素材关键词：园区停车通道与厂房外立面\n\n"
                "场景4（31-44秒）\n"
                "画面：平峦山远景、园区林荫道路、周边道路与交通环境。\n"
                "口播：周边靠近平峦山，环境比普通厂房舒服，附近还有地铁和物流园，员工通勤、货物流转都方便。\n"
                "字幕：靠近平峦山，通勤和货物流转更方便\n"
                "素材关键词：平峦山远景与园区周边环境\n\n"
                "场景5（44-52秒）\n"
                "画面：成员口播收尾，停车位或园区入口背景。\n"
                "口播：如果你正在找工业园区厂房，这种就值得实地看一眼。\n"
                "字幕：找厂房，建议实地看一眼\n"
                "素材关键词：停车位口播、园区门口口播\n"
            ),
            "production_directive": {"script_locked": True},
        }
        groups = [{"group_id": f"group_{index:04d}"} for index in range(1, 10)]

        custom_script = module._build_custom_script_from_worker_payload(payload, groups)

        self.assertEqual(5, len(custom_script["group_scripts"]))
        self.assertEqual(
            [
                "找厂房别只看价格，先看三个点：空间、配套、位置。",
                "这个园区一楼有约 2000 平厂房，层高到楼板 5.56 米，到梁 5 米，做生产、仓储、办公改造都比较好安排。",
                "园区还有 2 栋宿舍、1 栋公寓，食堂、电梯、管理处、停车位这些基础配套也在。",
                "周边靠近平峦山，环境比普通厂房舒服，附近还有地铁和物流园，员工通勤、货物流转都方便。",
                "如果你正在找工业园区厂房，这种就值得实地看一眼。",
            ],
            [item["raw_text"] for item in custom_script["group_scripts"]],
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

    def test_generate_script_does_not_require_asr_for_script_audio_alignment(self):
        module = sys.modules["firered_node_interceptors_under_test"]
        context = types.SimpleNamespace(
            worker_payload={
                "production_config": {
                    "subtitles": {"talking_head_source": "script_audio_alignment"},
                    "lip_sync": {"enabled": True, "provider": "aliyun_videoretalk"},
                }
            }
        )

        require_kind = module._with_required_original_audio_asr(
            ["split_shots", "group_clips"],
            "generate_script",
            context,
        )

        self.assertEqual(["split_shots", "group_clips"], require_kind)

    def test_locked_worker_script_keeps_script_for_script_audio_alignment_talking_head_groups(self):
        module = sys.modules["firered_node_interceptors_under_test"]
        label = module._DIALOGUE_RE.pattern.split("|")[0].split("(?:")[1]
        script_text = f"1\n00:00-00:05\n{label}: Locked script must be the subtitle source\n"
        payload = {
            "script_text": script_text,
            "production_directive": {"script_locked": True},
            "production_config": {
                "subtitles": {"talking_head_source": "script_audio_alignment"},
                "lip_sync": {"enabled": True, "provider": "aliyun_videoretalk"},
            },
        }
        groups = [{"group_id": "group_0001", "clip_ids": ["clip_0001"]}]
        split_shots = {
            "clips": [
                {
                    "clip_id": "clip_0001",
                    "source_ref": {
                        "media_id": "media_0001",
                        "duration": 5000,
                        "tags": ["talking_head"],
                    },
                }
            ]
        }
        asr = {
            "asr_infos": [
                {"clip_id": "clip_0001", "asr_text": "ASR should not replace this"}
            ]
        }

        custom_script = module._build_custom_script_from_worker_payload(
            payload,
            groups,
            asr,
            split_shots,
        )

        first = custom_script["group_scripts"][0]
        self.assertEqual("Locked script must be the subtitle source", first["raw_text"])
        self.assertFalse(first.get("skip_voiceover", False))
        self.assertEqual("voiceover", first["audio_source"])
        self.assertEqual("locked_script", first["subtitle_source"])

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

    def test_render_drops_lip_sync_dependency_when_disabled(self):
        module = sys.modules["firered_node_interceptors_under_test"]
        context = types.SimpleNamespace(
            worker_payload={"production_config": {"lip_sync": {"enabled": False}}}
        )

        require_kind = module._with_disabled_optional_kinds_removed(
            ["load_media", "plan_timeline", "lip_sync", "transition_rec", "text_rec"],
            "render_video",
            context,
        )

        self.assertEqual(
            ["load_media", "plan_timeline", "transition_rec", "text_rec"],
            require_kind,
        )

    def test_render_requires_lip_sync_output_when_enabled(self):
        module = sys.modules["firered_node_interceptors_under_test"]
        context = types.SimpleNamespace(
            worker_payload={"production_config": {"lip_sync": {"enabled": True}}}
        )

        with self.assertRaisesRegex(module.ToolException, "requires lip_sync output"):
            module._ensure_lip_sync_render_input({}, context)

        module._ensure_lip_sync_render_input(
            {"lip_sync": {"plan_timeline": {"tracks": {"video": []}}}},
            context,
        )

    def test_lip_sync_config_injection_uses_model_config_chain(self):
        request = Request("lip_sync", {}, context=LipSyncContext())

        async def handler(req):
            return dict(req.args)

        result = asyncio.run(self.ToolInterceptor.inject_lip_sync_config(request, handler))

        self.assertEqual("aliyun_videoretalk", result["provider"])
        self.assertEqual("retalk-key", result["api_key"])
        self.assertEqual("videoretalk", result["model"])

    def test_worker_filter_clips_rejects_skip_mode(self):
        module = sys.modules["firered_node_interceptors_under_test"]
        context = types.SimpleNamespace(worker_payload={"input_assets": []})

        with self.assertRaisesRegex(module.ToolException, "must not run filter_clips"):
            module._reject_worker_filter_clips_fallback(
                "filter_clips",
                {"mode": "skip"},
                context,
            )

    def test_worker_filter_clips_rejects_default_mode(self):
        module = sys.modules["firered_node_interceptors_under_test"]
        context = types.SimpleNamespace(worker_payload={"input_assets": []})

        with self.assertRaisesRegex(module.ToolException, "must not run filter_clips"):
            module._reject_worker_filter_clips_fallback(
                "filter_clips",
                {"mode": "default"},
                context,
            )

    def test_worker_filter_clips_allows_auto_and_non_worker_calls(self):
        module = sys.modules["firered_node_interceptors_under_test"]
        worker_context = types.SimpleNamespace(worker_payload={"input_assets": []})
        local_context = types.SimpleNamespace(worker_payload=None)

        module._reject_worker_filter_clips_fallback(
            "filter_clips",
            {"mode": "auto"},
            worker_context,
        )
        module._reject_worker_filter_clips_fallback(
            "filter_clips",
            {"mode": "skip"},
            local_context,
        )
        module._reject_worker_filter_clips_fallback(
            "group_clips",
            {"mode": "default"},
            worker_context,
        )

    def test_locked_worker_script_keeps_numbered_scenes_when_group_count_is_larger_duplicate(self):
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

        self.assertEqual(2, len(custom_script["group_scripts"]))
        self.assertEqual(
            [
                "如果你想找一个不吵、能坐一会儿的咖啡小院，可以看看这家。",
                "它不是商场里一眼看完的店，更像是走进去以后才发现的安静角落。",
            ],
            [item["raw_text"] for item in custom_script["group_scripts"]],
        )


if __name__ == "__main__":
    unittest.main()
