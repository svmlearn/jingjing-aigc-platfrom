---
name: server-time-test
description: Use when verifying real server runtime for video-worker/OpenStoryline test cases and organizing results into Feishu Sheets. Triggers include requests to record server processing time, exact final-video time, CASE-001/002/003 timing tables, upload running attachments to case folders, or summarize whether a remote video generation chain naturally completed.
---

# Server Time Test

Use this skill to turn a real remote video generation run into auditable timing records, Feishu attachments, and the matching row in the Feishu case-comparison summary table. The goal is not to make a pretty report; it is to make later debugging possible.

## Non-Negotiables

- Do not invent runtime, completion time, duration, resolution, or output filename.
- Prefer server logs and DB snapshots over local file timestamps.
- If server logs are gone, say so and use the strongest saved evidence, such as a DB result snapshot or saved render metadata.
- Keep different case packages separate. Never mix 5.15 evidence into 5.16, or vice versa.
- Do not generate a final video locally with FFmpeg for evidence. Local FFmpeg is allowed only for read-only inspection if the user permits it.
- Do not push or merge unless the user explicitly asks.

## Evidence Order

Use the first available evidence source that answers the question:

1. Remote logs from `/srv/jingjing-video-worker`:
   - `docker compose logs --since <UTC> --until <UTC> video-worker firered-openstoryline openstoryline-engine`
   - Look for `Claimed video job`, `Video generated successfully`, COS upload lines, and `Completed video job`.
2. Remote output metadata:
   - `outputs/jobs/<job_id>/...`
   - Firered/OpenStoryline metadata, render result JSON, final output path.
3. Saved local artifacts from the case package:
   - worker DB snapshot JSON with `created_at`, `finished_at`, `updated_at`
   - `firered-session-meta.json`
   - `render_video_result.json`
   - saved compose logs
4. Local file metadata only for local download/landing time, not server processing time.

If evidence conflicts, report the conflict and do not silently choose the more convenient value.

## Runtime Fields

Use these meanings consistently:

- `处理耗时`: from worker claim/start to worker completed, or from saved DB `created_at` to `finished_at` when logs are unavailable. State the source if not using live server logs.
- `成片时间`: the exact timestamp when render node says `Video generated successfully`.
- `响应回写`: the timestamp when worker marks the job complete, such as `Completed video job` or DB `finished_at`.
- `成片时长`: media duration from render metadata or `ffprobe` on the remote output.
- `最终成片`: render output basename for server summary; Feishu attachment can be uploaded with normalized name `final-output-reference.mp4`.

Convert UTC evidence to CST/China time (`+08:00`) before writing Feishu's `时间（CST）` column.

## Short Summary Format

When the user asks for the concise result, use exactly this shape:

```text
处理耗时：<N分N秒>
成片时长：<N.NNN秒>
分辨率：<width>x<height>
最终成片：<filename.mp4>
```

Do not add list bullets inside this summary unless the surrounding document already requires bullets.

## Feishu Processing Time Sheet

Use the `lark-sheets` skill and read the target sheet before writing. For this project, the known spreadsheet is:

- Spreadsheet URL: `https://jcn1wxz8ytwa.feishu.cn/sheets/FZFssBOOlhi5VDtuVLico6Eyndo`
- Processing-time sheet title: `处理时间`
- Current sheet id observed: `2oJXKo`

Follow the existing CASE-001 block format:

```text
CASE-00X 处理时间

阶段 | 时间（CST） | 说明 | 产物/文件
请求文件生成 | yyyy-mm-dd HH:MM:SS.mmm | ... | ...
载入素材 | ... | ... | 节点：load_media
镜头切分 | ... | ... | 节点：split_shots
素材理解 | ... | ... | 节点：understand_clips
筛选镜头 | ... | ... | 节点：filter_clips
镜头分组 | ... | ... | 节点：group_clips
生成脚本 | ... | ... | 节点：generate_script
生成克隆口播 | ... | ... | 节点：generate_voiceover
规划时间线 | ... | ... | 节点：plan_timeline_pro
渲染成片 | <render-success-time> | include duration/resolution/bytes | final-output-reference.mp4...
响应回写 | <completed-time> | include succeeded and processing time | openstoryline-engine-response.json...
```

If a node was not executed or its timestamp is not available, leave it out or mark the source clearly. Do not fabricate node times to make the block look complete.

## Feishu Running Attachments

Use the `lark-drive` skill. The target Drive structure for this project is:

- Parent folder: `视频剪辑测试文档`
- Current parent folder token observed: `XegfffXmklNOQIdNOn0cIgoVnch`
- Existing CASE-001 folder is the model.

Create or reuse case folders under the same parent:

- `case-002` for the 2026-05-15 run.
- `case-003` for the 2026-05-16 run.

Upload the minimum useful evidence:

- `final-output-reference.mp4`
- `subtitles.srt`
- run metadata or render result JSON
- worker/server response JSON or manifest
- concise result summary
- server compose logs when available

Then update the `CASE-001运行附件` sheet in the same three-column style:

```text
附件类型 | 原文件 | 用途说明
云空间文件夹 | case-00X link | CASE-00X 对应日期真实链路产物文件夹
服务器日志 / 真实传入/结果摘要 | filename | why it matters
服务器响应JSON | filename | 技术复核用
运行元数据 | filename | 节点产物/渲染参数复核
字幕文件 | subtitles.srt | 成片字幕结果
最终成片 | final-output-reference.mp4 | 案例输出结果
运行编号 | <job_id> | job id
运行模式 | server_openstoryline_pixelle_clone_test | mode/provider
克隆录音开关 | TRUE/FALSE | whether clone voice was enabled
```

## Feishu Case Comparison Summary

After updating processing time and attachments, update the matching row in the case-comparison summary sheet. For this project:

- Sheet title: `案例对比总表`
- Current sheet id observed: `c424f5`

Read the sheet before writing and locate the row by exact case id, such as `CASE-006`; do not assume the row number from memory.

Only write the official main sheet `案例对比总表` unless the user explicitly asks to update a copy. Do not write `案例对比总表（副本）`; it may be read only for diagnosis.

Update the existing row, not a duplicate row. Preserve planned input fields unless real run evidence gives a stronger value. At minimum, fill or correct these fields:

- User-uploaded talking-head inputs: COS keys, filenames, and whether source audio was muted during render.
- Merchant/library video inputs: COS keys or saved evidence proving which library assets were fetched.
- Voice reference input: COS key or saved evidence for clone reference audio.
- Voice mode: provider, clone mode, segment count, and whether fallback/plain TTS was used.
- Processing time: same value as the processing-time sheet.
- Output resolution, duration, final render basename, normalized uploaded filename, Feishu folder/file link, COS key, and byte size.
- Technical effect details: background music, subtitles, source-audio mute policy, natural-chain route, and fields verified from logs/metadata only.
- Problem notes: cancelled/failed prior jobs, warnings, known deviations, or remaining human-review items.
- Remarks: job id, server, date, FireRed session id, workflow/provider ids, and where detailed evidence lives.

The case-comparison row must be self-contained for readers who never open the attachment folder. Do not use `详见附件`, `详见文件夹`, or a link as a substitute for the actual result. Links are allowed only as supporting references after the visible cell text already contains the key details.

Do not invent subjective scores. If nobody has watched and scored the video, write `manual review pending` or the Chinese equivalent instead of numeric quality scores.

## Windows Lark CLI JSON Trap

On Windows PowerShell, `lark-cli sheets +write --values '[["PING"]]'` may strip inner quotes before the CLI receives them. If `--values invalid JSON, must be a 2D array` appears even for valid JSON:

1. Write the values JSON to a temp file.
2. Invoke `lark-cli` through Node with an argv array so JSON is passed as one argument:

```powershell
node -e "const cp=require('child_process'); const fs=require('fs'); const run='C:/Users/17330/AppData/Roaming/npm/node_modules/@larksuite/cli/scripts/run.js'; const values=fs.readFileSync('.codex/tmp_values.json','utf8'); const args=[run,'sheets','+write','--url','<url>','--sheet-id','<sheet_id>','--range','A1:D10','--values',values]; const r=cp.spawnSync(process.execPath,args,{encoding:'utf8'}); process.stdout.write(r.stdout||''); process.stderr.write(r.stderr||''); process.exit(r.status??1);"
```

Remove temporary `.codex/tmp_*` files after use.

## Verification Checklist

Before final response:

- Read back the Feishu processing-time range and confirm the case blocks are present.
- Read back the Feishu running-attachment range and confirm folder links and filenames are present.
- Read back the Feishu case-comparison summary row and confirm the matching case id row has the real runtime/output details.
- Confirm the Drive folders exist by search or listing.
- State if any folder listing or log lookup failed and what evidence was used instead.
- Mention `lark-cli` update notices only after the requested work is complete.
