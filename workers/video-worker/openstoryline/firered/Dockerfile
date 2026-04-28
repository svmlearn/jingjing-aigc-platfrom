# syntax=docker/dockerfile:1.7
FROM python:3.11-slim

WORKDIR /app

ARG DOWNLOAD_FIRERED_ASSETS=false
ARG PYTORCH_CPU_INDEX_URL=https://download.pytorch.org/whl/cpu

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg wget unzip git git-lfs curl \
    && rm -rf /var/lib/apt/lists/*

RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --index-url "$PYTORCH_CPU_INDEX_URL" \
    torch==2.11.0 \
    torchaudio==2.11.0

COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt

COPY agent_fastapi.py cli.py config.toml config.video_edit_engine.toml ./
COPY run.sh download.sh build_env.sh hf_space.sh ./
COPY src ./src
COPY web ./web
COPY prompts ./prompts
COPY scripts ./scripts

RUN sed -i 's/\r$//' run.sh download.sh build_env.sh hf_space.sh \
    && chmod +x run.sh download.sh \
    && if [ "$DOWNLOAD_FIRERED_ASSETS" = "true" ]; then ./download.sh; fi

ENV HOST=0.0.0.0
ENV PORT=7860
ENV PYTHONPATH=/app/src

EXPOSE 7860 8001

CMD ["bash", "run.sh"]
