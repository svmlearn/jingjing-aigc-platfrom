from __future__ import annotations

import json
import os
import tempfile
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Mapping


REQUIRED_REAL_IO_ENV = (
    "SUPABASE_DB_URL",
    "COS_SECRET_ID",
    "COS_SECRET_KEY",
    "COS_BUCKET",
    "COS_REGION",
)


class MissingRealSmokeEnvError(RuntimeError):
    def __init__(self, missing_names: list[str]) -> None:
        self.missing_names = missing_names
        super().__init__(
            "missing required real smoke environment variables: "
            + ", ".join(missing_names)
        )


@dataclass(frozen=True)
class RealSmokeConfig:
    supabase_db_url: str = field(repr=False)
    cos_secret_id: str = field(repr=False)
    cos_secret_key: str = field(repr=False)
    cos_bucket: str
    cos_region: str
    cos_prefix: str = "worker-real-smoke"

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "RealSmokeConfig":
        source = env or os.environ
        missing = [
            name for name in REQUIRED_REAL_IO_ENV if not str(source.get(name) or "").strip()
        ]
        if missing:
            raise MissingRealSmokeEnvError(missing)
        return cls(
            supabase_db_url=str(source["SUPABASE_DB_URL"]).strip(),
            cos_secret_id=str(source["COS_SECRET_ID"]).strip(),
            cos_secret_key=str(source["COS_SECRET_KEY"]).strip(),
            cos_bucket=str(source["COS_BUCKET"]).strip(),
            cos_region=str(source["COS_REGION"]).strip(),
            cos_prefix=str(source.get("REAL_IO_SMOKE_COS_PREFIX") or "worker-real-smoke"),
        )


def build_cos_smoke_key(prefix: str, *, run_id: str | None = None) -> str:
    normalized_prefix = prefix.strip().strip("/") or "worker-real-smoke"
    return f"{normalized_prefix}/{run_id or uuid.uuid4().hex}.txt"


def run_database_smoke(config: RealSmokeConfig) -> dict[str, object]:
    import psycopg

    with psycopg.connect(config.supabase_db_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute("select 1")
            one = cursor.fetchone()[0]
            cursor.execute(
                """
                select table_name
                from information_schema.tables
                where table_schema = 'public'
                  and table_name in ('video_edit_jobs', 'asset_objects')
                order by table_name
                """
            )
            tables = [row[0] for row in cursor.fetchall()]
    return {
        "status": "ok",
        "select_1": one,
        "tables": tables,
        "required_tables_present": sorted(tables) == ["asset_objects", "video_edit_jobs"],
    }


def run_cos_smoke(config: RealSmokeConfig) -> dict[str, object]:
    from qcloud_cos import CosConfig, CosS3Client

    key = build_cos_smoke_key(config.cos_prefix)
    body = b"jingjing video worker real cos smoke\n"
    client = CosS3Client(
        CosConfig(
            Region=config.cos_region,
            SecretId=config.cos_secret_id,
            SecretKey=config.cos_secret_key,
            Token=None,
            Scheme="https",
        )
    )
    with tempfile.TemporaryDirectory() as tmp:
        destination = Path(tmp) / "cos-smoke.txt"
        client.put_object(
            Bucket=config.cos_bucket,
            Key=key,
            Body=body,
            ContentType="text/plain",
            EnableMD5=False,
        )
        client.download_file(
            Bucket=config.cos_bucket,
            Key=key,
            DestFilePath=str(destination),
        )
        downloaded = destination.read_bytes()
    client.delete_object(Bucket=config.cos_bucket, Key=key)
    return {
        "status": "ok",
        "bucket": config.cos_bucket,
        "region": config.cos_region,
        "key": key,
        "bytes": len(downloaded),
        "roundtrip_matched": downloaded == body,
        "deleted": True,
    }


def run_real_io_smoke(config: RealSmokeConfig) -> dict[str, object]:
    return {
        "database": run_database_smoke(config),
        "cos": run_cos_smoke(config),
    }


def main() -> int:
    try:
        config = RealSmokeConfig.from_env()
    except MissingRealSmokeEnvError as exc:
        print(
            json.dumps(
                {
                    "status": "missing_environment",
                    "missing": exc.missing_names,
                },
                ensure_ascii=True,
                sort_keys=True,
            )
        )
        return 2

    print(json.dumps(run_real_io_smoke(config), ensure_ascii=True, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
