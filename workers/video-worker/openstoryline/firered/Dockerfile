FROM python:3.11-slim

WORKDIR /app

ARG DOWNLOAD_FIRERED_ASSETS=false

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg wget unzip git git-lfs curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY agent_fastapi.py cli.py config.toml config.video_edit_engine.toml ./
COPY run.sh download.sh build_env.sh hf_space.sh ./
COPY src ./src
COPY web ./web
COPY prompts ./prompts
COPY scripts ./scripts

RUN chmod +x run.sh download.sh \
    && if [ "$DOWNLOAD_FIRERED_ASSETS" = "true" ]; then ./download.sh; fi

ENV HOST=0.0.0.0
ENV PORT=7860
ENV PYTHONPATH=/app/src

EXPOSE 7860 8001

CMD ["bash", "run.sh"]
