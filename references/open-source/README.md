# open-source references

这个目录存放外部开源项目的本地参考副本。

它们的用途是：

- 阅读结构
- 借鉴实现方式
- 拆模块边界
- 验证哪些能力可以直接复用，哪些只能参考思路

它们不是我们正式产品代码的一部分，也不等于可直接商用的最终方案。

## 当前已拉取项目

### 1. `social-auto-upload`

路径：

- `social-auto-upload/`

建议优先看：

- `social-auto-upload/README.md`
- `social-auto-upload/sau_cli.py`
- `social-auto-upload/uploader/`
- `social-auto-upload/skills/xiaohongshu-upload/SKILL.md`
- `social-auto-upload/skills/douyin-upload/SKILL.md`

最值得借的层：

- 平台发布适配层
- 多账号登录/检查/上传 CLI
- 图文/视频发布命令抽象

对我们最有价值的判断：

- 这是当前最适合作为“发布执行层”参考和接入候选的项目
- 小红书、抖音相关目录最值得优先拆读

### 2. `AIWriteX`

路径：

- `AIWriteX/`

建议优先看：

- `AIWriteX/README.md`
- `AIWriteX/src/ai_write_x/core/unified_workflow.py`
- `AIWriteX/src/ai_write_x/core/content_generation.py`
- `AIWriteX/src/ai_write_x/adapters/platform_adapters.py`
- `AIWriteX/src/ai_write_x/tools/hotnews.py`
- `AIWriteX/knowledge/templates/`

最值得借的层：

- 内容生成工作流拆法
- 平台内容适配思路
- 模板和知识库组织方式

对我们最有价值的判断：

- 更适合借“内容工作流”和“模板化组织”
- 不建议整套当作我们最终产品底座

### 3. `MediaCrawler`

路径：

- `MediaCrawler/`

建议优先看：

- `MediaCrawler/README.md`
- `MediaCrawler/media_platform/`
- `MediaCrawler/store/`
- `MediaCrawler/api/`
- `MediaCrawler/config/`

最值得借的层：

- 多平台内容抓取分层
- 平台 crawler 模块拆法
- 存储与 API 暴露方式

对我们最有价值的判断：

- 更适合做“灵感导入层”与内部研究参考
- README 已明确写明“仅供学习和参考、禁止用于商业用途”，因此更不适合直接作为商用底座

### 4. `Pixelle-Video`

来源：

- <https://github.com/AIDC-AI/Pixelle-Video>

本地路径：

- `Pixelle-Video/`

当前本地快照：

- branch：`main`
- commit：`fd39263dd7bec7410c66d0cfd04846014338be23`

建议优先看：

- `Pixelle-Video/README.md`
- `Pixelle-Video/pixelle_video/service.py`
- `Pixelle-Video/web/app.py`
- `Pixelle-Video/api/app.py`
- `Pixelle-Video/config.example.yaml`
- `Pixelle-Video/docker-compose.yml`

最值得借的层：

- 一句话主题到短视频的自动化流水线
- 文案生成、分镜/配图规划、TTS、BGM、视频合成的模块拆法
- Streamlit Web UI 与 API 服务如何包装同一套视频生成能力
- ComfyUI / RunningHub / 多模型配置的组织方式

对我们最有价值的判断：

- 更适合做“AI 视频剪辑/生成链路”的实现参考，和当前 `小红书AI剪辑视频` 目录可以并列阅读
- 它不是发布执行层项目，不替代 `social-auto-upload`
- 它不是灵感采集项目，不替代 `MediaCrawler`
- 许可证不是 MIT，而是 Apache-2.0；通常允许商用，但使用/分发时要保留 LICENSE、NOTICE、版权和归属信息，并对修改文件作出说明

## 当前建议的阅读顺序

如果目的是尽快拼出 MVP，建议按这个顺序看：

1. 先看 `social-auto-upload`
2. 再看 `AIWriteX`
3. 如果要推进 AI 视频生成/剪辑链路，再看 `Pixelle-Video` 与 `小红书AI剪辑视频`
4. 最后看 `MediaCrawler`

原因：

- 我们当前最先要打通的是发布链路
- 其次才是内容工作流
- AI 视频生成/剪辑属于内容生产增强能力，适合在视频工作台路线里拆读
- 自动化采集能力目前更适合做后置增强
