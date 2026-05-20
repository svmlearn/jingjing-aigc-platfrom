import importlib.util
import sys
import types
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RENDER_PATH = (
    ROOT
    / "openstoryline"
    / "firered"
    / "src"
    / "open_storyline"
    / "nodes"
    / "core_nodes"
    / "render_video.py"
)


def _install_import_stubs() -> None:
    moviepy = types.ModuleType("moviepy")
    for name in (
        "VideoFileClip",
        "AudioFileClip",
        "ImageClip",
        "VideoClip",
        "ColorClip",
        "CompositeVideoClip",
        "CompositeAudioClip",
    ):
        setattr(moviepy, name, object)
    moviepy.concatenate_videoclips = lambda *a, **k: None
    moviepy.concatenate_audioclips = lambda *a, **k: None
    moviepy.vfx = types.SimpleNamespace()
    sys.modules["moviepy"] = moviepy

    config_mod = types.ModuleType("src.open_storyline.config")
    config_mod.Settings = object
    sys.modules.setdefault("src", types.ModuleType("src"))
    sys.modules.setdefault("src.open_storyline", types.ModuleType("src.open_storyline"))
    sys.modules["src.open_storyline.config"] = config_mod

    base_node = types.ModuleType("open_storyline.nodes.core_nodes.base_node")

    class BaseNode:
        def __init__(self, server_cfg):
            self.server_cfg = server_cfg

    class NodeMeta:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)

    base_node.BaseNode = BaseNode
    base_node.NodeMeta = NodeMeta
    sys.modules.setdefault("open_storyline", types.ModuleType("open_storyline"))
    sys.modules.setdefault("open_storyline.nodes", types.ModuleType("open_storyline.nodes"))
    sys.modules.setdefault("open_storyline.nodes.core_nodes", types.ModuleType("open_storyline.nodes.core_nodes"))
    sys.modules["open_storyline.nodes.core_nodes.base_node"] = base_node

    node_state = types.ModuleType("open_storyline.nodes.node_state")
    node_state.NodeState = object
    sys.modules["open_storyline.nodes.node_state"] = node_state

    node_schema = types.ModuleType("open_storyline.nodes.node_schema")
    node_schema.RenderVideoInput = object
    sys.modules["open_storyline.nodes.node_schema"] = node_schema

    util = types.ModuleType("open_storyline.utils.util")
    util.get_video_rotation = lambda *_a, **_k: 0
    logging_mod = types.ModuleType("open_storyline.utils.logging")
    logging_mod.MCPMoviePyLogger = object
    register = types.ModuleType("open_storyline.utils.register")

    class Registry:
        def register(self):
            return lambda cls: cls

    register.NODE_REGISTRY = Registry()
    sys.modules.setdefault("open_storyline.utils", types.ModuleType("open_storyline.utils"))
    sys.modules["open_storyline.utils.util"] = util
    sys.modules["open_storyline.utils.logging"] = logging_mod
    sys.modules["open_storyline.utils.register"] = register


def _load_render_module():
    _install_import_stubs()
    module_name = "render_video_under_test"
    spec = importlib.util.spec_from_file_location(module_name, RENDER_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


class RenderLipSyncTests(unittest.TestCase):
    def test_select_render_plan_timeline_prefers_lip_sync_plan(self):
        module = _load_render_module()
        original = {"tracks": {"video": [{"source_path": "original.mp4"}]}}
        retalked = {"tracks": {"video": [{"source_path": "retalked.mp4"}]}}

        selected = module.select_render_plan_timeline(
            {
                "plan_timeline": original,
                "lip_sync": {"plan_timeline": retalked},
            }
        )

        self.assertEqual("retalked.mp4", selected["tracks"]["video"][0]["source_path"])


if __name__ == "__main__":
    unittest.main()
