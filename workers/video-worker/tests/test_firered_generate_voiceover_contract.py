import importlib.util
import asyncio
import sys
import types
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VOICEOVER_PATH = (
    ROOT
    / "openstoryline"
    / "firered"
    / "src"
    / "open_storyline"
    / "nodes"
    / "core_nodes"
    / "generate_voiceover.py"
)


def _install_import_stubs() -> None:
    base_node = types.ModuleType("open_storyline.nodes.core_nodes.base_node")

    class BaseNode:
        def __init__(self, server_cfg):
            self.server_cfg = server_cfg
            self.server_cache_dir = Path("/tmp")

        async def _report_progress(self, *_args, **_kwargs):
            return None

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
    node_schema.GenerateVoiceoverInput = object
    sys.modules["open_storyline.nodes.node_schema"] = node_schema

    node_state = types.ModuleType("open_storyline.nodes.node_state")
    node_state.NodeState = object
    sys.modules["open_storyline.nodes.node_state"] = node_state

    logging_mod = types.ModuleType("open_storyline.utils.logging")
    logging_mod.get_logger = lambda _name=None: types.SimpleNamespace(warning=lambda *a, **k: None)
    sys.modules.setdefault("open_storyline.utils", types.ModuleType("open_storyline.utils"))
    sys.modules["open_storyline.utils.logging"] = logging_mod

    pixelle_tts = types.ModuleType("open_storyline.utils.pixelle_tts_adapter")

    class PixelleTTSAdapter:
        fallback_calls = []
        clone_calls = []

        def __init__(self, *, fallback_cfg, clone_cfg):
            self.fallback_cfg = fallback_cfg
            self.clone_cfg = clone_cfg

        async def synthesize_runninghub_fallback(self, *, text, output_path):
            self.__class__.fallback_calls.append(
                {
                    "text": text,
                    "output_path": output_path,
                    "fallback_cfg": self.fallback_cfg,
                    "clone_cfg": self.clone_cfg,
                }
            )
            output_path.write_bytes(b"RIFFxxxxWAVE")
            return {"provider": "pixelle_runninghub"}

        async def synthesize_clone(self, *, text, ref_audio, output_path):
            self.__class__.clone_calls.append(
                {
                    "text": text,
                    "ref_audio": ref_audio,
                    "output_path": output_path,
                    "fallback_cfg": self.fallback_cfg,
                    "clone_cfg": self.clone_cfg,
                }
            )
            output_path.write_bytes(b"RIFFxxxxWAVE")
            return {"provider": "pixelle_clone"}

    pixelle_tts.PixelleTTSAdapter = PixelleTTSAdapter
    sys.modules["open_storyline.utils.pixelle_tts_adapter"] = pixelle_tts

    parse_json = types.ModuleType("open_storyline.utils.parse_json")
    parse_json.parse_json_dict = lambda raw: {}
    sys.modules["open_storyline.utils.parse_json"] = parse_json

    prompts = types.ModuleType("open_storyline.utils.prompts")
    prompts.get_prompt = lambda *a, **k: ""
    sys.modules["open_storyline.utils.prompts"] = prompts

    register = types.ModuleType("open_storyline.utils.register")

    class Registry:
        def register(self):
            return lambda cls: cls

    register.NODE_REGISTRY = Registry()
    sys.modules["open_storyline.utils.register"] = register

    librosa = types.ModuleType("librosa")
    librosa.get_duration = lambda path: 1.0
    sys.modules["librosa"] = librosa


def _load_node_class():
    _install_import_stubs()
    module_name = "generate_voiceover_under_test"
    spec = importlib.util.spec_from_file_location(module_name, VOICEOVER_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module.GenerateVoiceoverNode


class Summary:
    def __init__(self):
        self.user_messages = []
        self.llm_messages = []

    def info_for_user(self, message, **_kwargs):
        self.user_messages.append(str(message))

    def info_for_llm(self, message, **_kwargs):
        self.llm_messages.append(str(message))


class Progress:
    async def report_progress(self, *_args, **_kwargs):
        return None


class GenerateVoiceoverContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.Node = _load_node_class()

    def _node(self):
        cfg = types.SimpleNamespace(
            local_mcp_server=types.SimpleNamespace(server_cache_dir=".cache"),
            generate_voiceover=types.SimpleNamespace(
                providers={
                    "bytedance": {"uid": "uid", "appid": "appid", "access_token": "token"},
                    "pixelle_clone": {
                        "base_url": "https://www.runninghub.cn",
                        "api_key": "",
                        "ref_audio": "",
                    },
                    "runninghub": {
                        "base_url": "https://www.runninghub.cn",
                        "api_key": "runninghub-key",
                        "workflow_id": "edge-workflow",
                    },
                },
                tts_provider_params_path=Path("missing.json"),
            ),
        )
        return self.Node(cfg)

    def test_explicit_clone_missing_config_does_not_fallback_to_default_provider(self):
        node = self._node()
        summary = Summary()
        state = types.SimpleNamespace(node_summary=summary, session_id="session-1")

        with self.assertRaisesRegex(ValueError, "pixelle_clone missing required field: api_key"):
            node._resolve_provider_secrets(
                "pixelle_clone",
                node._get_runtime_provider_cfg("pixelle_clone", {"provider": "pixelle_clone"}),
                {"provider": "pixelle_clone"},
                state,
            )

        self.assertFalse(any("falling back" in message for message in summary.user_messages))

    def test_clone_provider_cannot_use_runninghub_ordinary_tts_fallback(self):
        node = self._node()
        self.assertFalse(
            node._can_fallback_provider(
                "pixelle_clone",
                "runninghub",
                {"runninghub": {"api_key": "runninghub-key"}},
            )
        )

    def test_minimax_can_use_runninghub_fallback_only_when_configured(self):
        node = self._node()
        self.assertTrue(
            node._can_fallback_provider(
                "minimax",
                "runninghub",
                {"runninghub": {"api_key": "runninghub-key"}},
            )
        )
        self.assertFalse(node._can_fallback_provider("minimax", "runninghub", {}))

    def test_runninghub_ordinary_tts_uses_pixelle_workflow_adapter(self):
        module = sys.modules["open_storyline.utils.pixelle_tts_adapter"]
        module.PixelleTTSAdapter.fallback_calls.clear()
        module.PixelleTTSAdapter.clone_calls.clear()
        node = self._node()

        output_path = Path("ordinary.wav")
        try:
            node._tts_runninghub_sync(
                text="ordinary tts",
                wav_path=output_path,
                secrets={
                    "base_url": "https://www.runninghub.cn",
                    "api_key": "runninghub-key",
                    "workflow_id": "edge-workflow",
                },
                tts_params={"voice": "zh-CN-YunjianNeural", "speed": 1.1},
                provider_cfg={},
            )
        finally:
            output_path.unlink(missing_ok=True)

        self.assertEqual(1, len(module.PixelleTTSAdapter.fallback_calls))
        self.assertEqual([], module.PixelleTTSAdapter.clone_calls)
        call = module.PixelleTTSAdapter.fallback_calls[0]
        self.assertEqual("ordinary tts", call["text"])
        self.assertEqual("edge-workflow", call["fallback_cfg"]["runninghub_tts_edge_workflow_id"])

    def test_pixelle_clone_uses_clone_workflow_adapter_without_file_requirement(self):
        module = sys.modules["open_storyline.utils.pixelle_tts_adapter"]
        module.PixelleTTSAdapter.fallback_calls.clear()
        module.PixelleTTSAdapter.clone_calls.clear()
        node = self._node()

        output_path = Path("clone.wav")
        try:
            node._tts_pixelle_clone_sync(
                text="clone tts",
                wav_path=output_path,
                secrets={
                    "base_url": "https://www.runninghub.cn",
                    "api_key": "clone-key",
                    "ref_audio": "oss://voice-profiles/customer/ref.wav",
                    "workflow_id": "1983718528991862786",
                },
                tts_params={},
                provider_cfg={},
            )
        finally:
            output_path.unlink(missing_ok=True)

        self.assertEqual([], module.PixelleTTSAdapter.fallback_calls)
        self.assertEqual(1, len(module.PixelleTTSAdapter.clone_calls))
        call = module.PixelleTTSAdapter.clone_calls[0]
        self.assertEqual("clone tts", call["text"])
        self.assertEqual("oss://voice-profiles/customer/ref.wav", call["ref_audio"])
        self.assertEqual(
            "1983718528991862786",
            call["clone_cfg"]["runninghub_tts_clone_workflow_id"],
        )

    def test_process_skips_original_audio_groups_for_voiceover(self):
        node = self._node()
        node._resolve_provider_secrets = lambda *_args, **_kwargs: {"api_key": "clone-key", "base_url": "https://www.runninghub.cn", "ref_audio": "ref.wav"}
        node._load_provider_param_schema = lambda _provider: {}

        async def infer_params(**_kwargs):
            return {}

        node._infer_tts_params_with_llm = infer_params
        generated = []

        def fake_handler(*, text, wav_path, secrets, tts_params, provider_cfg):
            generated.append(text)
            wav_path.write_bytes(b"RIFFxxxxWAVE")

        node._tts_pixelle_clone_sync = fake_handler

        summary = Summary()
        state = types.SimpleNamespace(
            node_summary=summary,
            session_id="session-1",
            artifact_id="artifact-1",
            mcp_ctx=Progress(),
        )

        result = asyncio.run(
            node.process(
                state,
                {
                    "provider": "pixelle_clone",
                    "generate_script": {
                        "group_scripts": [
                            {
                                "group_id": "group_0001",
                                "raw_text": "真人原声",
                                "skip_voiceover": True,
                                "audio_source": "original_video_audio",
                            },
                            {
                                "group_id": "group_0002",
                                "raw_text": "中段克隆配音",
                            },
                        ]
                    },
                },
            )
        )

        self.assertEqual(["中段克隆配音"], generated)
        self.assertEqual(1, len(result["voiceover"]))
        self.assertEqual("group_0002", result["voiceover"][0]["group_id"])
        self.assertEqual(
            [{"group_id": "group_0001", "reason": "original_video_audio", "audio_source": "original_video_audio", "subtitle_source": None}],
            result["skipped_voiceover"],
        )


if __name__ == "__main__":
    unittest.main()
