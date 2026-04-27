import unittest

from worker.app.models import VideoJob
from worker.app.directive import DirectiveValidationError, build_production_directive


def make_job(input_payload):
    return VideoJob(
        id="job_1",
        merchant_id="merchant_1",
        draft_id="draft_1",
        content_variant_id="variant_1",
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


if __name__ == "__main__":
    unittest.main()
