import unittest
from pathlib import Path
import sys
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from worker.app.real_io_smoke import (
    InvalidRealSmokeEnvError,
    MissingRealSmokeEnvError,
    RealSmokeConfig,
    build_cos_smoke_key,
    load_env_file_from_argv,
)


class RealIoSmokeTests(unittest.TestCase):
    def test_config_requires_real_db_and_oss_environment_by_default(self):
        env = {
            "WORKER_DATABASE_URL": "postgresql://user:secret@db.example/postgres",
        }

        with self.assertRaises(MissingRealSmokeEnvError) as raised:
            RealSmokeConfig.from_env(env)

        message = str(raised.exception)
        self.assertIn("WORKER_ALIYUN_OSS_ACCESS_KEY_ID/ALIYUN_OSS_ACCESS_KEY_ID", message)
        self.assertIn(
            "WORKER_ALIYUN_OSS_ACCESS_KEY_SECRET/ALIYUN_OSS_ACCESS_KEY_SECRET",
            message,
        )
        self.assertIn("WORKER_ALIYUN_OSS_BUCKET/ALIYUN_OSS_BUCKET", message)
        self.assertIn("WORKER_ALIYUN_OSS_REGION/ALIYUN_OSS_REGION", message)
        self.assertIn("WORKER_ALIYUN_OSS_ENDPOINT/ALIYUN_OSS_ENDPOINT", message)
        self.assertNotIn("secret", message)

    def test_config_repr_does_not_expose_secrets(self):
        config = RealSmokeConfig.from_env(
            {
                "WORKER_DATABASE_URL": "postgresql://user:db-password@db.example/postgres",
                "ALIYUN_OSS_ACCESS_KEY_ID": "aliyun-access-key-id",
                "ALIYUN_OSS_ACCESS_KEY_SECRET": "aliyun-access-key-secret",
                "ALIYUN_OSS_BUCKET": "jingjing-domestic-phase1-hz",
                "ALIYUN_OSS_REGION": "oss-cn-hangzhou",
                "ALIYUN_OSS_ENDPOINT": "https://oss-cn-hangzhou.aliyuncs.com",
            }
        )

        rendered = repr(config)

        self.assertNotIn("db-password", rendered)
        self.assertNotIn("aliyun-access-key-id", rendered)
        self.assertNotIn("aliyun-access-key-secret", rendered)
        self.assertIn("jingjing-domestic-phase1-hz", rendered)
        self.assertIn("oss-cn-hangzhou", rendered)

    def test_config_requires_worker_database_url_as_only_database_env(self):
        with self.assertRaises(MissingRealSmokeEnvError) as raised:
            RealSmokeConfig.from_env(
                {
                    "ALIYUN_OSS_ACCESS_KEY_ID": "aliyun-access-key-id",
                    "ALIYUN_OSS_ACCESS_KEY_SECRET": "aliyun-access-key-secret",
                    "ALIYUN_OSS_BUCKET": "jingjing-domestic-phase1-hz",
                    "ALIYUN_OSS_REGION": "oss-cn-hangzhou",
                    "ALIYUN_OSS_ENDPOINT": "https://oss-cn-hangzhou.aliyuncs.com",
                }
            )

        self.assertEqual(["WORKER_DATABASE_URL"], raised.exception.missing_names)

    def test_config_prefers_worker_cos_over_shared_cos_environment(self):
        config = RealSmokeConfig.from_env(
            {
                "WORKER_DATABASE_URL": "postgresql://user:db-password@db.example/postgres",
                "WORKER_STORAGE_PROVIDER": "tencent_cos",
                "WORKER_COS_SECRET_ID": "worker-cos-secret-id",
                "WORKER_COS_SECRET_KEY": "worker-cos-secret-key",
                "WORKER_COS_BUCKET": "worker-bucket-1250000000",
                "WORKER_COS_REGION": "ap-guangzhou",
                "WORKER_COS_RESULT_PREFIX": "video-results",
                "COS_SECRET_ID": "shared-cos-secret-id",
                "COS_SECRET_KEY": "shared-cos-secret-key",
                "COS_BUCKET": "shared-bucket-1250000000",
                "COS_REGION": "ap-singapore",
            }
        )

        self.assertEqual("worker-bucket-1250000000", config.cos_bucket)
        self.assertEqual("ap-guangzhou", config.cos_region)
        self.assertEqual("video-results", config.cos_prefix)

    def test_aliyun_config_requires_aliyun_oss_environment_only(self):
        env = {
            "WORKER_DATABASE_URL": "postgresql://user:secret@db.example/postgres",
            "WORKER_STORAGE_PROVIDER": "aliyun_oss",
            "WORKER_COS_SECRET_ID": "worker-cos-secret-id",
            "WORKER_COS_SECRET_KEY": "worker-cos-secret-key",
            "WORKER_COS_BUCKET": "worker-bucket-1250000000",
            "WORKER_COS_REGION": "ap-guangzhou",
        }

        with self.assertRaises(MissingRealSmokeEnvError) as raised:
            RealSmokeConfig.from_env(env)

        message = str(raised.exception)
        self.assertIn("WORKER_ALIYUN_OSS_ACCESS_KEY_ID/ALIYUN_OSS_ACCESS_KEY_ID", message)
        self.assertIn(
            "WORKER_ALIYUN_OSS_ACCESS_KEY_SECRET/ALIYUN_OSS_ACCESS_KEY_SECRET",
            message,
        )
        self.assertIn("WORKER_ALIYUN_OSS_BUCKET/ALIYUN_OSS_BUCKET", message)
        self.assertNotIn("worker-cos-secret-id", message)

    def test_config_accepts_aliyun_oss_environment_without_exposing_secrets(self):
        config = RealSmokeConfig.from_env(
            {
                "WORKER_DATABASE_URL": "postgresql://user:db-password@db.example/postgres",
                "WORKER_STORAGE_PROVIDER": "aliyun_oss",
                "WORKER_ALIYUN_OSS_ACCESS_KEY_ID": "aliyun-access-key-id",
                "WORKER_ALIYUN_OSS_ACCESS_KEY_SECRET": "aliyun-access-key-secret",
                "WORKER_ALIYUN_OSS_BUCKET": "jingjing-domestic-phase1-hz",
                "WORKER_ALIYUN_OSS_REGION": "oss-cn-hangzhou",
                "WORKER_ALIYUN_OSS_ENDPOINT": "https://oss-cn-hangzhou.aliyuncs.com",
                "WORKER_ALIYUN_OSS_RESULT_PREFIX": "video-results",
            }
        )

        rendered = repr(config)

        self.assertEqual("aliyun_oss", config.storage_provider)
        self.assertEqual("jingjing-domestic-phase1-hz", config.aliyun_oss_bucket)
        self.assertEqual("video-results", config.storage_prefix)
        self.assertNotIn("db-password", rendered)
        self.assertNotIn("aliyun-access-key-id", rendered)
        self.assertNotIn("aliyun-access-key-secret", rendered)

    def test_config_rejects_unsupported_storage_provider(self):
        with self.assertRaises(InvalidRealSmokeEnvError) as raised:
            RealSmokeConfig.from_env(
                {
                    "WORKER_DATABASE_URL": "postgresql://user:db-password@db.example/postgres",
                    "WORKER_STORAGE_PROVIDER": "s3",
                }
            )

        self.assertEqual("WORKER_STORAGE_PROVIDER", raised.exception.name)
        self.assertIn("tencent_cos or aliyun_oss", raised.exception.message)

    def test_config_rejects_phase_one_worker_concurrency_above_one(self):
        with self.assertRaises(InvalidRealSmokeEnvError) as raised:
            RealSmokeConfig.from_env(
                {
                    "WORKER_DATABASE_URL": "postgresql://user:db-password@db.example/postgres",
                    "WORKER_COS_SECRET_ID": "worker-cos-secret-id",
                    "WORKER_COS_SECRET_KEY": "worker-cos-secret-key",
                    "WORKER_COS_BUCKET": "worker-bucket-1250000000",
                    "WORKER_COS_REGION": "ap-guangzhou",
                    "WORKER_MAX_CONCURRENCY": "2",
                }
            )

        self.assertEqual("WORKER_MAX_CONCURRENCY", raised.exception.name)
        self.assertIn("fixed at 1", raised.exception.message)

    def test_load_env_file_from_argv_does_not_override_existing_values(self):
        with TemporaryDirectory() as directory:
            env_path = Path(directory) / "worker.env"
            env_path.write_text(
                "\n".join(
                    [
                        "WORKER_DATABASE_URL=postgresql://from-file/db",
                        "WORKER_COS_BUCKET='bucket-from-file'",
                        "WORKER_COS_REGION=ap-guangzhou",
                    ]
                ),
                encoding="utf-8",
            )
            env = {
                "WORKER_COS_BUCKET": "bucket-from-env",
            }

            loaded = load_env_file_from_argv(
                ["real_io_smoke.py", "--env-file", str(env_path)],
                env,
            )

        self.assertEqual(env_path, loaded)
        self.assertEqual("postgresql://from-file/db", env["WORKER_DATABASE_URL"])
        self.assertEqual("bucket-from-env", env["WORKER_COS_BUCKET"])
        self.assertEqual("ap-guangzhou", env["WORKER_COS_REGION"])

    def test_cos_smoke_key_is_scoped_under_configured_prefix(self):
        key = build_cos_smoke_key(" /worker-real-smoke/ ", run_id="abc123")

        self.assertEqual("worker-real-smoke/abc123.txt", key)


if __name__ == "__main__":
    unittest.main()
