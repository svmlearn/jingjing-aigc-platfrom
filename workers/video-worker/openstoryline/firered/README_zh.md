# README_zh

中文说明仍以根目录的 [README.md](./README.md) 为主。

本次 Docker / MCP 补充：

- `config.toml` 现在支持 `${ENV_VAR:-PLACEHOLDER}` 形式的占位写法，容器里会优先读取环境变量，不需要把真实密钥写回仓库。
- 如需接入第二个 MCP 服务，例如 `video-edit-engine`，可在 `local_mcp_server.extra_mcp_servers` 中添加一项，Docker 场景下推荐直接使用服务名，例如 `http://video-edit-engine:9001/mcp`。
- HTTP / SSE 类型的 extra MCP 现在会自动透传 `X-Storyline-Session-Id`；如果上游还需要别的动态 header，也可以在 `headers` 里写 `{{session_id}}`。

公开提交前建议确认：

- `config.toml` 中只有占位值或环境变量模板，没有真实密钥。
- 没有提交 `.venv/`、`.logs/`、`.storyline/`、`outputs/` 等本地产物。
- 保留原始 `LICENSE` 文件。
