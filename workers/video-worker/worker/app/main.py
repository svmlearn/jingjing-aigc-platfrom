from __future__ import annotations

import logging
from pathlib import Path

from .config import Settings
from .cos_client import TencentCosClient
from .db import VideoJobRepository
from .openstoryline_client import OpenStorylineClient
from .poller import VideoWorkerPoller
from .processor import JobProcessor


def configure_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level, logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


def ensure_directories(paths: list[Path]) -> None:
    for path in paths:
        path.mkdir(parents=True, exist_ok=True)


def main() -> None:
    settings = Settings.from_env()
    configure_logging(settings.log_level)
    ensure_directories(
        [
            settings.worker_temp_root,
            settings.worker_models_root,
            settings.worker_output_root,
        ]
    )
    repository = VideoJobRepository(settings.supabase_db_url)
    cos_client = TencentCosClient(settings)
    openstoryline_client = OpenStorylineClient(settings)
    logging.getLogger("video-worker").info(
        "OpenStoryline healthcheck: %s",
        openstoryline_client.healthcheck(),
    )
    processor = JobProcessor(settings, repository, cos_client, openstoryline_client)
    poller = VideoWorkerPoller(settings, repository, processor)
    poller.run_forever()


if __name__ == "__main__":
    main()
