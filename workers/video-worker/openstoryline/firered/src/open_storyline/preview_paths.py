from __future__ import annotations

import os
from pathlib import Path


def parse_extra_preview_roots(raw: str | None) -> list[str]:
    if not raw:
        return []

    roots: list[str] = []
    for item in raw.split(os.pathsep):
        candidate = item.strip()
        if not candidate:
            continue
        resolved = str(Path(candidate).expanduser().resolve())
        if resolved not in roots:
            roots.append(resolved)
    return roots


def build_preview_allowed_roots(
    *,
    media_dir: str,
    outputs_dir: str,
    bgm_dir: str,
    server_cache_dir: str,
    extra_roots: list[str] | tuple[str, ...] = (),
) -> list[str]:
    roots = [
        str(Path(media_dir).resolve()),
        str(Path(outputs_dir).resolve()),
        str(Path(outputs_dir).resolve()),
        str(Path(bgm_dir).resolve()),
        str(Path(server_cache_dir).resolve()),
    ]
    for extra_root in extra_roots:
        resolved = str(Path(extra_root).expanduser().resolve())
        if resolved not in roots:
            roots.append(resolved)
    return roots
