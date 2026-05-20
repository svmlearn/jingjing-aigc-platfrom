import importlib.util
import sys
import types
import unittest
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASR_NODE_PATH = (
    ROOT
    / "openstoryline"
    / "firered"
    / "src"
    / "open_storyline"
    / "nodes"
    / "core_nodes"
    / "asr_node.py"
)


def _install_import_stubs() -> None:
    base_node = types.ModuleType("open_storyline.nodes.core_nodes.base_node")

    @dataclass
    class NodeMeta:
        name: str
        description: str
        node_id: str
        node_kind: str
        require_prior_kind: list
        default_require_prior_kind: list
        next_available_node: list

    class BaseNode:
        def __init__(self, server_cfg):
            self.server_cfg = server_cfg

    base_node.NodeMeta = NodeMeta
    base_node.BaseNode = BaseNode

    node_schema = types.ModuleType("open_storyline.nodes.node_schema")

    class LocalASRInput:
        pass

    node_schema.LocalASRInput = LocalASRInput

    node_state = types.ModuleType("open_storyline.nodes.node_state")

    class NodeState:
        pass

    node_state.NodeState = NodeState

    register_mod = types.ModuleType("open_storyline.utils.register")

    class Registry:
        def register(self, *args, **kwargs):
            def decorator(cls):
                return cls

            return decorator

    register_mod.NODE_REGISTRY = Registry()

    sys.modules.setdefault("open_storyline", types.ModuleType("open_storyline"))
    sys.modules.setdefault("open_storyline.nodes", types.ModuleType("open_storyline.nodes"))
    sys.modules.setdefault("open_storyline.nodes.core_nodes", types.ModuleType("open_storyline.nodes.core_nodes"))
    sys.modules["open_storyline.nodes.core_nodes.base_node"] = base_node
    sys.modules["open_storyline.nodes.node_schema"] = node_schema
    sys.modules["open_storyline.nodes.node_state"] = node_state
    sys.modules.setdefault("open_storyline.utils", types.ModuleType("open_storyline.utils"))
    sys.modules["open_storyline.utils.register"] = register_mod


def _load_asr_node_module():
    _install_import_stubs()
    module_name = "firered_asr_node_under_test"
    spec = importlib.util.spec_from_file_location(module_name, ASR_NODE_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


class FireRedAsrNodeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = _load_asr_node_module()

    def test_normalise_dashscope_sentences_matches_funasr_like_shape(self):
        result = self.module._normalise_dashscope_sentences(
            [
                {
                    "text": "欢迎来店里看看",
                    "begin_time": 0,
                    "end_time": 1800,
                    "words": [
                        {"text": "欢迎", "begin_time": 0, "end_time": 420},
                        {"text": "来店里", "begin_time": 420, "end_time": 1100},
                    ],
                },
                {
                    "text": "today is sunny",
                    "begin_time": 1800,
                    "end_time": 2600,
                },
            ]
        )

        self.assertEqual("欢迎来店里看看today is sunny", result["text"])
        self.assertEqual([[0, 420], [420, 1100], [1800, 2600]], result["timestamp"])
        self.assertEqual("欢迎来店里看看", result["sentence_info"][0]["text"])
        self.assertEqual([[0, 420], [420, 1100]], result["sentence_info"][0]["timestamp"])
        self.assertEqual([[1800, 2600]], result["sentence_info"][1]["timestamp"])
        self.assertEqual("aliyun_paraformer", result["provider"])

    def test_normalise_dashscope_sentences_inserts_space_between_ascii_sentences(self):
        result = self.module._normalise_dashscope_sentences(
            [
                {"text": "hello", "begin_time": 0, "end_time": 300},
                {"text": "world", "begin_time": 300, "end_time": 600},
            ]
        )

        self.assertEqual("hello world", result["text"])


if __name__ == "__main__":
    unittest.main()
