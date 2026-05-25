import importlib.util
import sys
import types
import unittest
from dataclasses import dataclass
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SEARCH_MEDIA_PATH = (
    ROOT
    / "openstoryline"
    / "firered"
    / "src"
    / "open_storyline"
    / "nodes"
    / "core_nodes"
    / "search_media.py"
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
            self.server_cache_dir = Path(".")

    base_node.NodeMeta = NodeMeta
    base_node.BaseNode = BaseNode

    node_schema = types.ModuleType("open_storyline.nodes.node_schema")

    class SearchMediaInput:
        pass

    node_schema.SearchMediaInput = SearchMediaInput

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


def _load_search_media():
    _install_import_stubs()
    module_name = "firered_search_media_under_test"
    spec = importlib.util.spec_from_file_location(module_name, SEARCH_MEDIA_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


class MockResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class FireRedSearchMediaPrivateBaseUrlTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.search_media = _load_search_media()

    def test_private_video_search_uses_configured_base_url_with_bearer_key(self):
        with patch.object(
            self.search_media.requests,
            "get",
            return_value=MockResponse({"videos": [], "next_page": None}),
        ) as get:
            response = self.search_media.search_videos(
                pexels_api_key="private-token",
                pexels_base_url="https://app.example.com/api/private-media/pexels/merchants/merchant-1/",
                query="lobby",
                per_page=10,
                page=2,
            )

        self.assertEqual({"videos": [], "next_page": None}, response)
        get.assert_called_once_with(
            "https://app.example.com/api/private-media/pexels/merchants/merchant-1/videos/search",
            headers={"Authorization": "Bearer private-token"},
            params={"query": "lobby", "per_page": 10, "page": 2},
            timeout=30,
        )

    def test_private_photo_search_keeps_authorization_header_when_key_is_provided(self):
        with patch.object(
            self.search_media.requests,
            "get",
            return_value=MockResponse({"photos": [], "next_page": None}),
        ) as get:
            self.search_media.search_photos(
                pexels_api_key="private-token",
                pexels_base_url="https://app.example.com/api/private-media/pexels/merchants/merchant-1",
                query="living room",
                per_page=5,
                page=1,
            )

        get.assert_called_once_with(
            "https://app.example.com/api/private-media/pexels/merchants/merchant-1/v1/search",
            headers={"Authorization": "Bearer private-token"},
            params={"query": "living room", "per_page": 5, "page": 1},
            timeout=30,
        )

    def test_official_pexels_url_remains_default_when_base_url_is_empty(self):
        with patch.object(
            self.search_media.requests,
            "get",
            return_value=MockResponse({"videos": [], "next_page": None}),
        ) as get:
            self.search_media.search_videos(
                pexels_api_key="pexels-key",
                query="project",
                per_page=10,
                page=1,
            )

        self.assertEqual("https://api.pexels.com/videos/search", get.call_args.args[0])
        self.assertEqual({"Authorization": "pexels-key"}, get.call_args.kwargs["headers"])


if __name__ == "__main__":
    unittest.main()
