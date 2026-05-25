import importlib.util
import sys
import types
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PLAN_TIMELINE_PATH = (
    ROOT
    / "openstoryline"
    / "firered"
    / "src"
    / "open_storyline"
    / "nodes"
    / "core_nodes"
    / "plan_timeline.py"
)


def _install_import_stubs() -> None:
    config_mod = types.ModuleType("src.open_storyline.config")
    config_mod.Settings = object
    sys.modules.setdefault("src", types.ModuleType("src"))
    sys.modules.setdefault("src.open_storyline", types.ModuleType("src.open_storyline"))
    sys.modules["src.open_storyline.config"] = config_mod

    open_config = types.ModuleType("open_storyline.config")

    class PlanTimelineConfig:
        title_duration = 5000
        bgm_loop = True
        min_clip_duration = 500
        estimate_text_min = 1500
        estimate_text_char_per_sec = 6.0
        image_default_duration = 3000
        group_margin_over_voiceover = 1000

    open_config.PlanTimelineConfig = PlanTimelineConfig
    sys.modules.setdefault("open_storyline", types.ModuleType("open_storyline"))
    sys.modules["open_storyline.config"] = open_config

    base_node = types.ModuleType("open_storyline.nodes.core_nodes.base_node")

    class BaseNode:
        def __init__(self, server_cfg):
            self.server_cfg = server_cfg

    class NodeMeta:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)

    base_node.BaseNode = BaseNode
    base_node.NodeMeta = NodeMeta
    sys.modules.setdefault("open_storyline.nodes", types.ModuleType("open_storyline.nodes"))
    sys.modules.setdefault("open_storyline.nodes.core_nodes", types.ModuleType("open_storyline.nodes.core_nodes"))
    sys.modules["open_storyline.nodes.core_nodes.base_node"] = base_node

    node_state = types.ModuleType("open_storyline.nodes.node_state")
    node_state.NodeState = object
    sys.modules["open_storyline.nodes.node_state"] = node_state

    node_schema = types.ModuleType("open_storyline.nodes.node_schema")
    node_schema.PlanTimelineInput = object
    sys.modules["open_storyline.nodes.node_schema"] = node_schema

    register = types.ModuleType("open_storyline.utils.register")

    class Registry:
        def register(self):
            return lambda cls: cls

    register.NODE_REGISTRY = Registry()
    sys.modules.setdefault("open_storyline.utils", types.ModuleType("open_storyline.utils"))
    sys.modules["open_storyline.utils.register"] = register


def _load_plan_timeline_module():
    _install_import_stubs()
    module_name = "plan_timeline_under_test"
    spec = importlib.util.spec_from_file_location(module_name, PLAN_TIMELINE_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


class PlanTimelineContractTests(unittest.TestCase):
    def test_video_duration_shortage_fails_instead_of_slowing_down(self):
        module = _load_plan_timeline_module()
        planner = module.TimelinePlanner(module.PlanTimelineConfig())

        with self.assertRaisesRegex(ValueError, "scene_material_insufficient"):
            planner.plan(
                media=[{"media_id": "media_1", "path": "short.mp4"}],
                clips=[
                    {
                        "clip_id": "clip_1",
                        "kind": "video",
                        "source_ref": {
                            "media_id": "media_1",
                            "start": 0,
                            "end": 2852,
                            "duration": 2852,
                        },
                    }
                ],
                groups=[{"group_id": "group_1", "clip_ids": ["clip_1"]}],
                group_scripts=[
                    {
                        "group_id": "group_1",
                        "raw_text": "This scene needs a much longer narration window. " * 4,
                    }
                ],
                voiceovers=[{"group_id": "group_1", "duration": 10076}],
                background_music=None,
                use_beats=False,
            )


if __name__ == "__main__":
    unittest.main()
