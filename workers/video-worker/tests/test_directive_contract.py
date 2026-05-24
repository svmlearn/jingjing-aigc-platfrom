import unittest

from worker.app.models import VideoJob
from worker.app.directive import DirectiveValidationError, build_production_directive


def make_job(input_payload):
    return VideoJob(
        id="job_1",
        merchant_id="merchant_1",
        draft_id="draft_1",
        content_variant_id="variant_1",
        created_by_user_id="member_user_1",
        status="pending",
        current_stage=None,
        instruction_text="make a video",
        input_payload=input_payload,
        runtime_payload={},
        retry_count=0,
    )


class DirectiveContractTests(unittest.TestCase):
    def test_directive_requires_locked_script_text(self):
        job = make_job(
            {
                "executionMode": "staging_worker",
                "productionDirective": {
                    "targetPlatform": "douyin",
                    "desiredOutputs": ["final_video", "cover"],
                },
            }
        )

        with self.assertRaises(DirectiveValidationError) as exc:
            build_production_directive(job)

        self.assertEqual("failed_manual", exc.exception.failure_status)
        self.assertEqual("missing_script_text", exc.exception.failure_code)

    def test_directive_rejects_legacy_directive_script_text_without_locked_script(self):
        job = make_job(
            {
                "executionMode": "staging_worker",
                "productionDirective": {
                    "targetPlatform": "douyin",
                    "desiredOutputs": ["final_video", "cover"],
                    "scriptText": "legacy script should not bypass script.text",
                },
            }
        )

        with self.assertRaises(DirectiveValidationError) as exc:
            build_production_directive(job)

        self.assertEqual("failed_manual", exc.exception.failure_status)
        self.assertEqual("missing_script_text", exc.exception.failure_code)

    def test_directive_rejects_non_boolean_script_locked_value(self):
        job = make_job(
            {
                "executionMode": "staging_worker",
                "script": {
                    "text": "locked flag must be a real boolean",
                    "locked": "false",
                },
                "productionDirective": {
                    "targetPlatform": "douyin",
                    "desiredOutputs": ["final_video", "cover"],
                },
            }
        )

        with self.assertRaises(DirectiveValidationError) as exc:
            build_production_directive(job)

        self.assertEqual("failed_manual", exc.exception.failure_status)
        self.assertEqual("script_not_locked", exc.exception.failure_code)

    def test_directive_rejects_present_but_invalid_desired_outputs(self):
        for desired_outputs in ([], "final_video"):
            with self.subTest(desired_outputs=desired_outputs):
                job = make_job(
                    {
                        "executionMode": "staging_worker",
                        "script": {
                            "text": "fixed script",
                            "locked": True,
                        },
                        "productionDirective": {
                            "targetPlatform": "douyin",
                            "desiredOutputs": desired_outputs,
                        },
                    }
                )

                with self.assertRaises(DirectiveValidationError) as exc:
                    build_production_directive(job)

                self.assertEqual("failed_manual", exc.exception.failure_status)
                self.assertEqual("missing_final_video_output", exc.exception.failure_code)

    def test_directive_rejects_unknown_desired_outputs(self):
        job = make_job(
            {
                "executionMode": "staging_worker",
                "script": {
                    "text": "fixed script",
                    "locked": True,
                },
                "productionDirective": {
                    "targetPlatform": "douyin",
                    "desiredOutputs": ["final_video", "thumbnail"],
                },
            }
        )

        with self.assertRaises(DirectiveValidationError) as exc:
            build_production_directive(job)

        self.assertEqual("failed_manual", exc.exception.failure_status)
        self.assertEqual("unsupported_desired_outputs", exc.exception.failure_code)

    def test_directive_normalizes_script_and_locked_fields(self):
        job = make_job(
            {
                "executionMode": "staging_worker",
                "script": {
                    "text": "下班后脑子还在开会，预约一次轻咨询。",
                    "locked": True,
                    "variantId": "variant_1",
                },
                "productionDirective": {
                    "targetPlatform": "douyin",
                    "aspectRatio": "9:16",
                    "desiredOutputs": ["final_video", "cover", "subtitles"],
                    "lockedFields": ["script", "cta", "target_user", "claims"],
                },
            }
        )

        directive = build_production_directive(job)

        self.assertEqual("staging_worker", directive.execution_mode)
        self.assertEqual("下班后脑子还在开会，预约一次轻咨询。", directive.script_text)
        self.assertTrue(directive.script_locked)
        self.assertEqual(("final_video", "cover", "subtitles"), directive.desired_outputs)
        self.assertIn("script", directive.locked_fields)
        self.assertEqual("douyin", directive.target_platform)

    def test_directive_normalizes_production_config(self):
        job = make_job(
            {
                "executionMode": "staging_worker",
                "script": {
                    "text": "locked script",
                    "locked": True,
                },
                "productionConfig": {
                    "voiceover": {
                        "enabled": True,
                        "provider": "minimax",
                        "voiceStyle": "warm",
                        "speed": 1.05,
                        "volume": 1.5,
                    },
                    "bgm": {
                        "enabled": True,
                        "userRequest": "light upbeat",
                        "include": {"mood": "warm"},
                        "exclude": {"genre": "heavy"},
                        "volume": 0.35,
                    },
                    "subtitles": {
                        "enabled": True,
                        "style": "platform_default",
                    },
                    "render": {
                        "aspectRatio": "9:16",
                        "includeOriginalAudio": True,
                    },
                },
                "productionDirective": {
                    "targetPlatform": "douyin",
                    "desiredOutputs": ["final_video"],
                },
            }
        )

        directive = build_production_directive(job)

        self.assertEqual("minimax", directive.production_config["voiceover"]["provider"])
        self.assertEqual("warm", directive.production_config["voiceover"]["voice_style"])
        self.assertEqual("light upbeat", directive.production_config["bgm"]["user_request"])
        self.assertEqual({"mood": "warm"}, directive.production_config["bgm"]["include"])
        self.assertEqual(0.35, directive.production_config["bgm"]["volume"])
        self.assertTrue(directive.production_config["render"]["include_original_audio"])
        self.assertEqual("script", directive.production_config["subtitles"]["talking_head_source"])
        self.assertFalse(directive.production_config["lip_sync"]["enabled"])

    def test_directive_preserves_render_max_duration(self):
        job = make_job(
            {
                "executionMode": "staging_worker",
                "script": {
                    "text": "locked script",
                    "locked": True,
                },
                "productionConfig": {
                    "render": {
                        "aspectRatio": "9:16",
                        "maxDurationSeconds": 45,
                        "includeOriginalAudio": False,
                    },
                },
                "productionDirective": {
                    "targetPlatform": "douyin",
                    "desiredOutputs": ["final_video"],
                },
            }
        )

        directive = build_production_directive(job)

        self.assertEqual(45, directive.production_config["render"]["max_duration_seconds"])

    def test_directive_normalizes_script_audio_alignment_lip_sync(self):
        job = make_job(
            {
                "executionMode": "staging_worker",
                "script": {
                    "text": "locked script",
                    "locked": True,
                },
                "productionConfig": {
                    "voiceover": {
                        "enabled": True,
                        "mode": "voice_profile",
                        "provider": "pixelle_clone",
                        "voiceProfileId": "profile-1",
                        "refAudioAssetId": "asset-1",
                    },
                    "subtitles": {
                        "enabled": True,
                        "style": "platform_default",
                        "talkingHeadSource": "script_audio_alignment",
                    },
                    "lipSync": {
                        "enabled": True,
                        "provider": "aliyun_videoretalk",
                    },
                },
                "productionDirective": {
                    "targetPlatform": "douyin",
                    "desiredOutputs": ["final_video"],
                },
            }
        )

        directive = build_production_directive(job)

        self.assertEqual(
            "script_audio_alignment",
            directive.production_config["subtitles"]["talking_head_source"],
        )
        self.assertTrue(directive.production_config["lip_sync"]["enabled"])
        self.assertEqual(
            "script_audio_alignment",
            directive.production_config["lip_sync"]["subtitle_source"],
        )
        self.assertTrue(directive.production_config["lip_sync"]["require_voice_profile"])

    def test_directive_keeps_asr_original_audio_as_explicit_fallback(self):
        job = make_job(
            {
                "executionMode": "staging_worker",
                "script": {
                    "text": "locked script",
                    "locked": True,
                },
                "productionConfig": {
                    "subtitles": {
                        "enabled": True,
                        "style": "platform_default",
                        "talkingHeadSource": "asr_original_audio",
                    },
                    "render": {
                        "preserveTalkingHeadOriginalAudio": True,
                    },
                },
                "productionDirective": {
                    "targetPlatform": "douyin",
                    "desiredOutputs": ["final_video"],
                },
            }
        )

        directive = build_production_directive(job)

        self.assertEqual(
            "asr_original_audio",
            directive.production_config["subtitles"]["talking_head_source"],
        )
        self.assertTrue(
            directive.production_config["render"]["preserve_talking_head_original_audio"]
        )
        self.assertTrue(directive.production_config["render"]["include_video_audio"])
        self.assertFalse(directive.production_config["lip_sync"]["enabled"])

    def test_directive_rejects_unsupported_voiceover_provider(self):
        job = make_job(
            {
                "executionMode": "staging_worker",
                "script": {
                    "text": "locked script",
                    "locked": True,
                },
                "productionConfig": {
                    "voiceover": {"enabled": True, "provider": "unknown"},
                },
                "productionDirective": {
                    "targetPlatform": "douyin",
                    "desiredOutputs": ["final_video"],
                },
            }
        )

        with self.assertRaises(DirectiveValidationError) as exc:
            build_production_directive(job)

        self.assertEqual("failed_manual", exc.exception.failure_status)
        self.assertEqual("invalid_production_config", exc.exception.failure_code)


if __name__ == "__main__":
    unittest.main()
