from __future__ import annotations

import logging
import time

from .config import Settings
from .db import VideoJobRepository
from .processor import JobProcessor


class VideoWorkerPoller:
    def __init__(
        self,
        settings: Settings,
        repository: VideoJobRepository,
        processor: JobProcessor,
    ) -> None:
        self._settings = settings
        self._repository = repository
        self._processor = processor
        self._logger = logging.getLogger("video-worker.poller")

    def _sweep_stale_jobs(self) -> None:
        stale_count = self._repository.sweep_stale_jobs(
            self._settings.video_job_stale_minutes
        )
        if stale_count:
            self._logger.warning("Marked %s stale jobs as failed_retryable", stale_count)

    def run_forever(self) -> None:
        self._logger.info(
            "Starting poll loop with interval=%ss concurrency=%s",
            self._settings.worker_poll_interval_seconds,
            self._settings.worker_max_concurrency,
        )
        self._sweep_stale_jobs()
        while True:
            self._sweep_stale_jobs()
            job = self._repository.claim_next_job()
            if job is None:
                self._logger.debug("No pending video jobs found")
                time.sleep(self._settings.worker_poll_interval_seconds)
                continue

            self._logger.info("Claimed video job %s", job.id)
            try:
                self._processor.process(job)
                self._logger.info("Completed video job %s", job.id)
            except Exception:
                self._logger.exception("Video job %s failed", job.id)
            time.sleep(self._settings.worker_poll_interval_seconds)
