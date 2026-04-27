import unittest

from openstoryline.app.schemas import RunRequest


class EngineRunContractTests(unittest.TestCase):
    def test_run_request_keeps_production_directive_fields(self):
        request = RunRequest(
            job_id="job_1",
            merchant_id="merchant_1",
            draft_id="draft_1",
            content_variant_id="variant_1",
            instruction_text="make it warmer",
            workspace_dir="/tmp/workspace",
            output_dir="/tmp/output",
            execution_mode="staging_worker",
            script_text="固定脚本",
            production_directive={
                "script_locked": True,
                "locked_fields": ["script", "cta"],
                "desired_outputs": ["final_video", "cover"],
            },
        )

        self.assertEqual("staging_worker", request.execution_mode)
        self.assertEqual("固定脚本", request.script_text)
        self.assertTrue(request.production_directive["script_locked"])
        self.assertEqual(["script", "cta"], request.production_directive["locked_fields"])


if __name__ == "__main__":
    unittest.main()
