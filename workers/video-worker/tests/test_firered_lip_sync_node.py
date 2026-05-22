import asyncio
import importlib.util
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
LIP_SYNC_PATH = (
    ROOT
    / "openstoryline"
    / "firered"
    / "src"
    / "open_storyline"
    / "nodes"
    / "core_nodes"
    / "lip_sync.py"
)


def _install_import_stubs(tmp: Path) -> None:
    base_node = types.ModuleType("open_storyline.nodes.core_nodes.base_node")

    class BaseNode:
        def __init__(self, server_cfg):
            self.server_cfg = server_cfg
            self.server_cache_dir = tmp

        async def _report_progress(self, *_args, **_kwargs):
            return None

        def _prepare_output_directory(self, node_state):
            path = self.server_cache_dir / node_state.session_id / node_state.artifact_id
            path.mkdir(parents=True, exist_ok=True)
            return path

    class NodeMeta:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)

    base_node.BaseNode = BaseNode
    base_node.NodeMeta = NodeMeta
    sys.modules.setdefault("open_storyline", types.ModuleType("open_storyline"))
    sys.modules.setdefault("open_storyline.nodes", types.ModuleType("open_storyline.nodes"))
    sys.modules.setdefault("open_storyline.nodes.core_nodes", types.ModuleType("open_storyline.nodes.core_nodes"))
    sys.modules["open_storyline.nodes.core_nodes.base_node"] = base_node

    node_schema = types.ModuleType("open_storyline.nodes.node_schema")
    node_schema.LipSyncInput = object
    sys.modules["open_storyline.nodes.node_schema"] = node_schema

    node_state = types.ModuleType("open_storyline.nodes.node_state")
    node_state.NodeState = object
    sys.modules["open_storyline.nodes.node_state"] = node_state

    ffmpeg_utils = types.ModuleType("open_storyline.utils.ffmpeg_utils")
    ffmpeg_utils.resolve_ffmpeg_executable = lambda: "ffmpeg"
    sys.modules.setdefault("open_storyline.utils", types.ModuleType("open_storyline.utils"))
    sys.modules["open_storyline.utils.ffmpeg_utils"] = ffmpeg_utils

    register = types.ModuleType("open_storyline.utils.register")

    class Registry:
        def register(self):
            return lambda cls: cls

    register.NODE_REGISTRY = Registry()
    sys.modules["open_storyline.utils.register"] = register


def _load_module(tmp: Path):
    _install_import_stubs(tmp)
    module_name = "lip_sync_under_test"
    spec = importlib.util.spec_from_file_location(module_name, LIP_SYNC_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


class Summary:
    def __init__(self):
        self.messages = []

    def info_for_user(self, message, **_kwargs):
        self.messages.append(str(message))


class NodeState:
    session_id = "session"
    artifact_id = "artifact"

    def __init__(self):
        self.node_summary = Summary()
        self.mcp_ctx = types.SimpleNamespace(report_progress=lambda *_a, **_k: None)


class LipSyncNodeTests(unittest.TestCase):
    def test_aliyun_videoretalk_submit_uses_official_async_endpoint(self):
        with tempfile.TemporaryDirectory() as raw_tmp:
            tmp = Path(raw_tmp)
            module = _load_module(tmp)

            class Response:
                ok = True

                def json(self):
                    return {"output": {"task_id": "task-123"}}

            with patch.object(module.requests, "post", return_value=Response()) as post:
                adapter = module.AliyunVideoRetalkAdapter(
                    api_key="key",
                    base_url="https://dashscope.example/api/v1",
                    ref_image_url="https://oss.example/ref.png",
                    video_extension=True,
                    query_face_threshold=170,
                )
                task_id = adapter.submit(
                    video_url="https://oss.example/video.mp4",
                    audio_url="https://oss.example/audio.wav",
                )

        self.assertEqual("task-123", task_id)
        self.assertEqual(
            "https://dashscope.example/api/v1/services/aigc/image2video/video-synthesis/",
            post.call_args.args[0],
        )
        payload = post.call_args.kwargs["json"]
        self.assertEqual("videoretalk", payload["model"])
        self.assertEqual("https://oss.example/video.mp4", payload["input"]["video_url"])
        self.assertEqual("https://oss.example/audio.wav", payload["input"]["audio_url"])
        self.assertEqual("https://oss.example/ref.png", payload["input"]["ref_image_url"])
        self.assertTrue(payload["parameters"]["video_extension"])
        self.assertEqual(170, payload["parameters"]["query_face_threshold"])

    def test_aliyun_videoretalk_diagnostics_redact_signed_url_queries(self):
        with tempfile.TemporaryDirectory() as raw_tmp:
            tmp = Path(raw_tmp)
            module = _load_module(tmp)
            adapter = module.AliyunVideoRetalkAdapter(
                api_key="key",
                video_extension="false",
            )
            text = adapter._safe_text(
                {
                    "output": {
                        "video_url": "https://oss.example/out.mp4?OSSAccessKeyId=abc&Signature=secret&Expires=123"
                    }
                }
            )

        self.assertFalse(adapter.video_extension)
        self.assertIn("OSSAccessKeyId=<redacted>", text)
        self.assertIn("Signature=<redacted>", text)
        self.assertIn("Expires=<redacted>", text)
        self.assertNotIn("secret", text)

    def test_lip_sync_replaces_only_talking_head_segment_source_path(self):
        with tempfile.TemporaryDirectory() as raw_tmp:
            tmp = Path(raw_tmp)
            module = _load_module(tmp)
            video = tmp / "talking.mp4"
            broll = tmp / "broll.mp4"
            audio = tmp / "voice.wav"
            video.write_bytes(b"video")
            broll.write_bytes(b"broll")
            audio.write_bytes(b"audio")
            retalked = tmp / "retalked.mp4"
            retalked.write_bytes(b"retalked")

            class Adapter:
                def __init__(self, **_kwargs):
                    pass

                def run(self, **_kwargs):
                    return retalked, {"provider_task_id": "task-1"}

            node = module.LipSyncNode(types.SimpleNamespace())
            inputs = {
                "provider": "aliyun_videoretalk",
                "api_key": "key",
                "video_url": "https://example.com/video.mp4",
                "audio_url": "https://example.com/audio.wav",
                "tts": {
                    "voiceover": [
                        {
                            "group_id": "group_0001",
                            "path": str(audio),
                            "duration_ms": 3000,
                            "provider": "pixelle_clone",
                            "clone": True,
                        }
                    ]
                },
                "split_shots": {
                    "clips": [
                        {
                            "clip_id": "clip_0001",
                            "source_ref": {"tags": ["talking_head"]},
                        },
                        {
                            "clip_id": "clip_0002",
                            "source_ref": {"tags": ["project_material"]},
                        },
                    ]
                },
                "group_clips": {
                    "groups": [
                        {"group_id": "group_0001", "clip_ids": ["clip_0001"]},
                        {"group_id": "group_0002", "clip_ids": ["clip_0002"]},
                    ]
                },
                "plan_timeline": {
                    "tracks": {
                        "video": [
                            {
                                "group_id": "group_0001",
                                "clip_id": "clip_0001",
                                "kind": "video",
                                "source_path": str(video),
                                "source_window": {"start": 0, "duration": 3000},
                                "timeline_window": {"start": 0, "end": 3000},
                            },
                            {
                                "group_id": "group_0002",
                                "clip_id": "clip_0002",
                                "kind": "video",
                                "source_path": str(broll),
                                "source_window": {"start": 0, "end": 3000, "duration": 3000},
                                "timeline_window": {"start": 3000, "end": 6000},
                            },
                        ],
                        "voiceover": [],
                        "subtitles": [],
                        "bgm": [],
                    }
                },
            }

            with patch.object(module, "AliyunVideoRetalkAdapter", Adapter):
                result = asyncio.run(node.process(NodeState(), inputs))

        video_track = result["plan_timeline"]["tracks"]["video"]
        self.assertEqual(str(retalked), video_track[0]["source_path"])
        self.assertEqual(str(broll), video_track[1]["source_path"])
        self.assertEqual("task-1", result["segments"][0]["provider_task_id"])

    def test_lip_sync_without_provider_url_fails_closed(self):
        with tempfile.TemporaryDirectory() as raw_tmp:
            tmp = Path(raw_tmp)
            module = _load_module(tmp)
            node = module.LipSyncNode(types.SimpleNamespace())
            local_file = tmp / "voice.wav"
            local_file.write_bytes(b"audio")

            with self.assertRaisesRegex(Exception, "provider-accessible audio_url"):
                node._provider_url_for_path(local_file, {}, label="audio")

    def test_lip_sync_auto_uploads_local_file_to_oss_signed_url(self):
        with tempfile.TemporaryDirectory() as raw_tmp:
            tmp = Path(raw_tmp)
            module = _load_module(tmp)
            node = module.LipSyncNode(types.SimpleNamespace())
            local_file = tmp / "voice.wav"
            local_file.write_bytes(b"audio")
            calls = []

            class Auth:
                def __init__(self, key_id, key_secret):
                    self.key_id = key_id
                    self.key_secret = key_secret

            class Bucket:
                def __init__(self, auth, endpoint, bucket_name):
                    self.auth = auth
                    self.endpoint = endpoint
                    self.bucket_name = bucket_name

                def put_object_from_file(self, object_key, filename, headers=None):
                    calls.append(("put", object_key, filename, headers, self.bucket_name))

                def sign_url(self, method, object_key, expires):
                    calls.append(("sign", method, object_key, expires))
                    return f"https://oss.example/{object_key}?Signature=mock"

            fake_oss2 = types.SimpleNamespace(Auth=Auth, Bucket=Bucket)
            sys.modules["oss2"] = fake_oss2
            try:
                url = node._provider_url_for_path(
                    local_file,
                    {
                        "upload_url_mode": "auto",
                        "oss_access_key_id": "key-id",
                        "oss_access_key_secret": "key-secret",
                        "oss_bucket": "bucket",
                        "oss_endpoint": "https://oss-cn-hangzhou.aliyuncs.com",
                        "oss_prefix": "tmp/lip-sync",
                        "signed_url_expires_seconds": 60,
                    },
                    label="audio",
                )
            finally:
                sys.modules.pop("oss2", None)

        self.assertTrue(url.startswith("https://oss.example/tmp/lip-sync/lip-sync-inputs/"))
        self.assertEqual("put", calls[0][0])
        self.assertEqual(str(local_file), calls[0][2])
        self.assertIn(calls[0][3]["Content-Type"], {"audio/wav", "audio/x-wav"})
        self.assertEqual(("sign", "GET", calls[0][1], 60), calls[1])


if __name__ == "__main__":
    unittest.main()
