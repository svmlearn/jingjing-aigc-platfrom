from __future__ import annotations

import json
import os
import sys
import tempfile
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Mapping


ALIYUN_OSS_ENV_FALLBACKS = {
    "aliyun_oss_access_key_id": (
        "WORKER_ALIYUN_OSS_ACCESS_KEY_ID",
        "ALIYUN_OSS_ACCESS_KEY_ID",
    ),
    "aliyun_oss_access_key_secret": (
        "WORKER_ALIYUN_OSS_ACCESS_KEY_SECRET",
        "ALIYUN_OSS_ACCESS_KEY_SECRET",
    ),
    "aliyun_oss_bucket": ("WORKER_ALIYUN_OSS_BUCKET", "ALIYUN_OSS_BUCKET"),
    "aliyun_oss_region": ("WORKER_ALIYUN_OSS_REGION", "ALIYUN_OSS_REGION"),
    "aliyun_oss_endpoint": ("WORKER_ALIYUN_OSS_ENDPOINT", "ALIYUN_OSS_ENDPOINT"),
}
SUPPORTED_STORAGE_PROVIDERS = frozenset({"aliyun_oss"})


class MissingRealSmokeEnvError(RuntimeError):
    def __init__(self, missing_names: list[str]) -> None:
        self.missing_names = missing_names
        super().__init__(
            "missing required real smoke environment variables: "
            + ", ".join(missing_names)
        )


class InvalidRealSmokeEnvError(RuntimeError):
    def __init__(self, name: str, message: str) -> None:
        self.name = name
        self.message = message
        super().__init__(f"invalid real smoke environment variable {name}: {message}")


@dataclass(frozen=True)
class RealSmokeConfig:
    database_url: str = field(repr=False)
    storage_provider: str = "aliyun_oss"
    aliyun_oss_access_key_id: str = field(default="", repr=False)
    aliyun_oss_access_key_secret: str = field(default="", repr=False)
    aliyun_oss_bucket: str = ""
    aliyun_oss_region: str = ""
    aliyun_oss_endpoint: str = ""
    storage_prefix: str = "worker-real-smoke"
    worker_max_concurrency: int = 1

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "RealSmokeConfig":
        source = env or os.environ
        database_url = str(source.get("WORKER_DATABASE_URL") or "").strip()
        worker_max_concurrency = _read_worker_max_concurrency(source)
        storage_provider = _storage_provider(source)
        aliyun_values = {
            field: _first_env(source, *env_names)
            for field, env_names in ALIYUN_OSS_ENV_FALLBACKS.items()
        }
        missing = _missing_storage_env(aliyun_values)
        if not database_url:
            missing.append("WORKER_DATABASE_URL")
        if missing:
            raise MissingRealSmokeEnvError(missing)
        return cls(
            database_url=database_url,
            storage_provider=storage_provider,
            aliyun_oss_access_key_id=aliyun_values["aliyun_oss_access_key_id"],
            aliyun_oss_access_key_secret=aliyun_values["aliyun_oss_access_key_secret"],
            aliyun_oss_bucket=aliyun_values["aliyun_oss_bucket"],
            aliyun_oss_region=aliyun_values["aliyun_oss_region"],
            aliyun_oss_endpoint=aliyun_values["aliyun_oss_endpoint"],
            storage_prefix=_storage_prefix(source),
            worker_max_concurrency=worker_max_concurrency,
        )


def build_storage_smoke_key(prefix: str, *, run_id: str | None = None) -> str:
    normalized_prefix = prefix.strip().strip("/") or "worker-real-smoke"
    return f"{normalized_prefix}/{run_id or uuid.uuid4().hex}.txt"


def _first_env(source: Mapping[str, str], *names: str) -> str:
    for name in names:
        value = str(source.get(name) or "").strip()
        if value:
            return value
    return ""


def _read_worker_max_concurrency(source: Mapping[str, str]) -> int:
    raw_value = str(source.get("WORKER_MAX_CONCURRENCY") or "1").strip()
    try:
        value = int(raw_value)
    except ValueError as exc:
        raise InvalidRealSmokeEnvError(
            "WORKER_MAX_CONCURRENCY",
            "must be the integer 1 for domestic phase-1 validation",
        ) from exc

    if value != 1:
        raise InvalidRealSmokeEnvError(
            "WORKER_MAX_CONCURRENCY",
            "must stay fixed at 1 for domestic phase-1 validation",
        )
    return value


def _storage_provider(source: Mapping[str, str]) -> str:
    value = str(
        source.get("WORKER_STORAGE_PROVIDER")
        or source.get("STORAGE_PROVIDER")
        or "aliyun_oss"
    ).strip().lower()
    if value not in SUPPORTED_STORAGE_PROVIDERS:
        raise InvalidRealSmokeEnvError(
            "WORKER_STORAGE_PROVIDER",
            "must be aliyun_oss",
        )
    return value


def _missing_storage_env(aliyun_values: Mapping[str, str]) -> list[str]:
    return [
        "/".join(env_names)
        for field, env_names in ALIYUN_OSS_ENV_FALLBACKS.items()
        if not aliyun_values[field]
    ]


def _storage_prefix(source: Mapping[str, str]) -> str:
    value = (
        source.get("REAL_IO_SMOKE_STORAGE_PREFIX")
        or source.get("REAL_IO_SMOKE_OSS_PREFIX")
        or source.get("WORKER_ALIYUN_OSS_RESULT_PREFIX")
        or source.get("WORKER_STORAGE_RESULT_PREFIX")
        or "worker-real-smoke"
    )
    return str(value).strip().strip("/") or "worker-real-smoke"


def load_env_file_from_argv(
    argv: list[str] | None = None,
    env: dict[str, str] | None = None,
) -> Path | None:
    args = argv if argv is not None else sys.argv
    target_env = env if env is not None else os.environ
    try:
        index = args.index("--env-file")
    except ValueError:
        return None

    if index + 1 >= len(args):
        raise InvalidRealSmokeEnvError("--env-file", "requires a path")

    env_path = Path(args[index + 1])
    try:
        load_env_file(env_path, target_env)
    except OSError as exc:
        raise InvalidRealSmokeEnvError("--env-file", str(exc)) from exc
    return env_path


def load_env_file(path: Path, env: dict[str, str]) -> None:
    text = path.read_text(encoding="utf-8")
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue

        name, separator, raw_value = line.partition("=")
        if not separator:
            continue

        key = name.strip()
        if not key or key in env:
            continue

        env[key] = _unquote_env_value(raw_value.strip())


def _unquote_env_value(value: str) -> str:
    if (
        (value.startswith('"') and value.endswith('"'))
        or (value.startswith("'") and value.endswith("'"))
    ):
        return value[1:-1]
    return value


def run_database_smoke(config: RealSmokeConfig) -> dict[str, object]:
    import psycopg

    with psycopg.connect(config.database_url) as connection:
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


def run_aliyun_oss_smoke(config: RealSmokeConfig) -> dict[str, object]:
    import oss2

    key = build_storage_smoke_key(config.storage_prefix)
    body = b"jingjing video worker real aliyun oss smoke\n"
    bucket = oss2.Bucket(
        oss2.Auth(
            config.aliyun_oss_access_key_id,
            config.aliyun_oss_access_key_secret,
        ),
        config.aliyun_oss_endpoint,
        config.aliyun_oss_bucket,
    )
    with tempfile.TemporaryDirectory() as tmp:
        destination = Path(tmp) / "oss-smoke.txt"
        bucket.put_object(key, body, headers={"Content-Type": "text/plain"})
        bucket.get_object_to_file(key, str(destination))
        downloaded = destination.read_bytes()
    bucket.delete_object(key)
    return {
        "status": "ok",
        "provider": "aliyun_oss",
        "bucket": config.aliyun_oss_bucket,
        "region": config.aliyun_oss_region,
        "endpoint": config.aliyun_oss_endpoint,
        "key": key,
        "bytes": len(downloaded),
        "roundtrip_matched": downloaded == body,
        "deleted": True,
    }


def run_storage_smoke(config: RealSmokeConfig) -> dict[str, object]:
    return run_aliyun_oss_smoke(config)


def run_real_io_smoke(config: RealSmokeConfig) -> dict[str, object]:
    storage = run_storage_smoke(config)
    report = {
        "config": {
            "storage_provider": config.storage_provider,
            "worker_max_concurrency": config.worker_max_concurrency,
        },
        "database": run_database_smoke(config),
        "storage": storage,
    }
    return report


def main() -> int:
    try:
        load_env_file_from_argv()
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
    except InvalidRealSmokeEnvError as exc:
        print(
            json.dumps(
                {
                    "status": "invalid_environment",
                    "name": exc.name,
                    "message": exc.message,
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
