import importlib.util
import sys
import types
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GENERATE_SCRIPT_PATH = (
    ROOT
    / "openstoryline"
    / "firered"
    / "src"
    / "open_storyline"
    / "nodes"
    / "core_nodes"
    / "generate_script.py"
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

    class GenerateScriptInput:
        pass

    node_schema.GenerateScriptInput = GenerateScriptInput

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


def _load_generate_script_module():
    _install_import_stubs()
    spec = importlib.util.spec_from_file_location(
        "firered_generate_script_locked_test",
        GENERATE_SCRIPT_PATH,
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class GenerateScriptLockedScriptTests(unittest.TestCase):
    def test_extracts_locked_script_marker(self):
        module = _load_generate_script_module()

        self.assertEqual(
            "Scene 1\nhello",
            module._extract_locked_script_request("Use the locked script: Scene 1\nhello"),
        )
        self.assertEqual("", module._extract_locked_script_request("generate a new script"))

    def test_builds_group_scripts_from_locked_script(self):
        module = _load_generate_script_module()

        result = module._build_locked_script_result(
            "Scene 1 | 00:00-00:03\nhello world.",
            [{"group_id": "group_0001"}],
        )

        self.assertEqual("Scene 1 | 00:00-00:03", result["title"])
        self.assertEqual(["group_0001"], [item["group_id"] for item in result["group_scripts"]])
        self.assertEqual(
            "Scene 1 | 00:00-00:03\nhello world.",
            result["group_scripts"][0]["raw_text"],
        )
        self.assertEqual(
            ["Scene 1 | 00:00-00:03", "hello world"],
            [unit["text"] for unit in result["group_scripts"][0]["subtitle_units"]],
        )

    def test_normalizes_custom_subtitle_units_payload(self):
        module = _load_generate_script_module()

        result = module._normalize_custom_script_payload(
            {
                "title": "locked title",
                "subtitle_units": [
                    {"text": "first line", "subtitle": "ignored"},
                    {"subtitle": "second line"},
                ],
            },
            [{"group_id": "group_0001"}],
        )

        self.assertEqual("locked title", result["title"])
        self.assertEqual(
            [{"group_id": "group_0001", "raw_text": "first line，second line"}],
            result["group_scripts"],
        )


if __name__ == "__main__":
    unittest.main()
