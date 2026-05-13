import unittest

from worker.app.real_io_smoke import (
    MissingRealSmokeEnvError,
    RealSmokeConfig,
    build_cos_smoke_key,
)


class RealIoSmokeTests(unittest.TestCase):
    def test_config_requires_real_db_and_cos_environment(self):
        env = {
            "WORKER_DATABASE_URL": "postgresql://user:secret@db.example/postgres",
        }

        with self.assertRaises(MissingRealSmokeEnvError) as raised:
            RealSmokeConfig.from_env(env)

        message = str(raised.exception)
        self.assertIn("COS_SECRET_ID", message)
        self.assertIn("COS_SECRET_KEY", message)
        self.assertIn("COS_BUCKET", message)
        self.assertIn("COS_REGION", message)
        self.assertNotIn("secret", message)

    def test_config_repr_does_not_expose_secrets(self):
        config = RealSmokeConfig.from_env(
            {
                "WORKER_DATABASE_URL": "postgresql://user:db-password@db.example/postgres",
                "COS_SECRET_ID": "cos-secret-id",
                "COS_SECRET_KEY": "cos-secret-key",
                "COS_BUCKET": "jj-content-staging-1341668543",
                "COS_REGION": "ap-singapore",
            }
        )

        rendered = repr(config)

        self.assertNotIn("db-password", rendered)
        self.assertNotIn("cos-secret-id", rendered)
        self.assertNotIn("cos-secret-key", rendered)
        self.assertIn("jj-content-staging-1341668543", rendered)
        self.assertIn("ap-singapore", rendered)

    def test_config_accepts_supabase_db_url_as_compatibility_fallback(self):
        config = RealSmokeConfig.from_env(
            {
                "SUPABASE_DB_URL": "postgresql://user:db-password@db.example/postgres",
                "COS_SECRET_ID": "cos-secret-id",
                "COS_SECRET_KEY": "cos-secret-key",
                "COS_BUCKET": "jj-content-staging-1341668543",
                "COS_REGION": "ap-singapore",
            }
        )

        self.assertEqual("jj-content-staging-1341668543", config.cos_bucket)

    def test_cos_smoke_key_is_scoped_under_configured_prefix(self):
        key = build_cos_smoke_key(" /worker-real-smoke/ ", run_id="abc123")

        self.assertEqual("worker-real-smoke/abc123.txt", key)


if __name__ == "__main__":
    unittest.main()
