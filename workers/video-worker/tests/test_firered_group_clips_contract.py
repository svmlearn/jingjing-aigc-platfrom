import importlib.util
import sys
import types
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GROUP_CLIPS_PATH = (
    ROOT
    / "openstoryline"
    / "firered"
    / "src"
    / "open_storyline"
    / "nodes"
    / "core_nodes"
    / "group_clips.py"
)


def _install_import_stubs() -> None:
    base_node = types.ModuleType("open_storyline.nodes.core_nodes.base_node")

    class BaseNode:
        pass

    class NodeMeta:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

    base_node.BaseNode = BaseNode
    base_node.NodeMeta = NodeMeta

    node_state = types.ModuleType("open_storyline.nodes.node_state")

    class NodeState:
        pass

    node_state.NodeState = NodeState

    node_schema = types.ModuleType("open_storyline.nodes.node_schema")
    node_schema.GroupClipsInput = object

    prompts = types.ModuleType("src.open_storyline.utils.prompts")
    prompts.get_prompt = lambda *_args, **_kwargs: ""

    parse_json = types.ModuleType("open_storyline.utils.parse_json")
    parse_json.parse_json_dict = lambda value: value

    register = types.ModuleType("open_storyline.utils.register")

    class Registry:
        def register(self):
            return lambda cls: cls

    register.NODE_REGISTRY = Registry()

    sys.modules.setdefault("open_storyline", types.ModuleType("open_storyline"))
    sys.modules.setdefault("open_storyline.nodes", types.ModuleType("open_storyline.nodes"))
    sys.modules.setdefault(
        "open_storyline.nodes.core_nodes",
        types.ModuleType("open_storyline.nodes.core_nodes"),
    )
    sys.modules["open_storyline.nodes.core_nodes.base_node"] = base_node
    sys.modules["open_storyline.nodes.node_state"] = node_state
    sys.modules["open_storyline.nodes.node_schema"] = node_schema
    sys.modules.setdefault("open_storyline.utils", types.ModuleType("open_storyline.utils"))
    sys.modules["open_storyline.utils.parse_json"] = parse_json
    sys.modules["open_storyline.utils.register"] = register
    sys.modules.setdefault("src", types.ModuleType("src"))
    sys.modules.setdefault("src.open_storyline", types.ModuleType("src.open_storyline"))
    sys.modules.setdefault(
        "src.open_storyline.utils",
        types.ModuleType("src.open_storyline.utils"),
    )
    sys.modules["src.open_storyline.utils.prompts"] = prompts


def _load_group_clips_module():
    _install_import_stubs()
    spec = importlib.util.spec_from_file_location(
        "firered_group_clips_contract_test",
        GROUP_CLIPS_PATH,
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class GroupClipsContractTests(unittest.TestCase):
    def test_coalesces_extra_llm_groups_to_requested_scene_count(self):
        module = _load_group_clips_module()
        groups = [
            {"group_id": "group_0001", "summary": "Scene 1 entrance", "clip_ids": ["clip_0001"]},
            {"group_id": "group_0002", "summary": "Scene 2 factory door", "clip_ids": ["clip_0002"]},
            {"group_id": "group_0003", "summary": "Scene 2 factory space", "clip_ids": ["clip_0003"]},
            {"group_id": "group_0004", "summary": "Scene 2 factory depth", "clip_ids": ["clip_0004"]},
            {"group_id": "group_0005", "summary": "Scene 3 facilities", "clip_ids": ["clip_0005"]},
            {"group_id": "group_0006", "summary": "Scene 3 details", "clip_ids": ["clip_0006"]},
            {"group_id": "group_0007", "summary": "Scene 4 environment", "clip_ids": ["clip_0007"]},
            {"group_id": "group_0008", "summary": "Scene 5 closing", "clip_ids": ["clip_0008"]},
        ]

        requested = module._extract_requested_group_count("Group clips into 5 scenes matching the script")
        result = module._coalesce_groups_to_requested_count(groups, requested)

        self.assertEqual(5, len(result))
        self.assertEqual([f"group_{index:04d}" for index in range(1, 6)], [g["group_id"] for g in result])
        self.assertEqual(["clip_0002", "clip_0003", "clip_0004"], result[1]["clip_ids"])
        self.assertEqual(["clip_0005", "clip_0006"], result[2]["clip_ids"])

    def test_coalesces_chinese_scene_summaries_to_locked_script_count(self):
        module = _load_group_clips_module()
        groups = [
            {"group_id": "group_0001", "summary": "场景1-口播开场", "clip_ids": ["clip_0003"]},
            {"group_id": "group_0002", "summary": "场景2-厂房概览(推入)", "clip_ids": ["clip_0010"]},
            {"group_id": "group_0003", "summary": "场景2-厂房概览(平移)", "clip_ids": ["clip_0011"]},
            {"group_id": "group_0004", "summary": "场景2-厂房细节(采光)", "clip_ids": ["clip_0008"]},
            {"group_id": "group_0005", "summary": "场景2-厂房细节(管线)", "clip_ids": ["clip_0013"]},
            {"group_id": "group_0006", "summary": "场景2-厂房参照", "clip_ids": ["clip_0014"]},
            {"group_id": "group_0007", "summary": "场景3-园区配套快速蒙太奇", "clip_ids": ["clip_0005"]},
            {"group_id": "group_0008", "summary": "场景4-园区环境", "clip_ids": ["clip_0001"]},
            {"group_id": "group_0009", "summary": "场景5-停车位口播收尾", "clip_ids": ["clip_0006"]},
        ]

        requested = module._extract_requested_group_count(
            "场景1 口播\n场景2 厂房\n场景3 配套\n场景4 环境\n场景5 收尾"
        )
        result = module._coalesce_groups_to_requested_count(groups, requested)

        self.assertEqual(5, len(result))
        self.assertEqual([f"group_{index:04d}" for index in range(1, 6)], [g["group_id"] for g in result])
        self.assertEqual(["clip_0010", "clip_0011", "clip_0008", "clip_0013", "clip_0014"], result[1]["clip_ids"])
        self.assertEqual(["clip_0005"], result[2]["clip_ids"])
        self.assertEqual(["clip_0006"], result[4]["clip_ids"])

    def test_infers_requested_count_from_chinese_scene_summaries(self):
        module = _load_group_clips_module()
        groups = [
            {"group_id": "group_0001", "summary": "场景1-口播开场", "clip_ids": ["clip_0001"]},
            {"group_id": "group_0002", "summary": "场景2-厂房概览", "clip_ids": ["clip_0002"]},
            {"group_id": "group_0003", "summary": "场景2-厂房细节", "clip_ids": ["clip_0003"]},
            {"group_id": "group_0004", "summary": "场景3-快速蒙太奇", "clip_ids": ["clip_0004"]},
            {"group_id": "group_0005", "summary": "场景4-环境", "clip_ids": ["clip_0005"]},
            {"group_id": "group_0006", "summary": "场景5-收尾", "clip_ids": ["clip_0006"]},
        ]

        requested = module._infer_requested_group_count_from_groups(groups)
        result = module._coalesce_groups_to_requested_count(groups, requested)

        self.assertEqual(5, requested)
        self.assertEqual(5, len(result))
        self.assertEqual(["clip_0002", "clip_0003"], result[1]["clip_ids"])


if __name__ == "__main__":
    unittest.main()
