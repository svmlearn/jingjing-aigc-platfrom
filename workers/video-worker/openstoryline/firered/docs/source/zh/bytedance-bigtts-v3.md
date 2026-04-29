# ByteDance Big Model TTS (V3)

OpenStoryline now supports a second ByteDance TTS provider for the newer V3 async API.

- Legacy provider: `[generate_voiceover.providers.bytedance]` -> `/api/v1/tts`
- New provider: `[generate_voiceover.providers.bytedance_bigtts]` -> `/api/v3/tts/submit` and `/api/v3/tts/query`

## Example config

```toml
[generate_voiceover.providers.bytedance_bigtts]
label = "ByteDance Big Model"
base_url = "https://openspeech.bytedance.com"
uid = "YOUR_UID"
appid = "YOUR_APP_ID"
access_key = "YOUR_ACCESS_KEY"
resource_id = "seed-tts-1.0"
speaker = "zh_female_tianmeitaozi_mars_bigtts"
```

## Notes

- `resource_id` should match the ByteDance big-model TTS resource you actually opened, for example `seed-tts-1.0` or `seed-tts-2.0`.
- `speaker` should be a valid V3 speaker id from the ByteDance big-model speaker list.
- When `bytedance_bigtts` is fully configured, OpenStoryline will prefer it automatically for TTS.
