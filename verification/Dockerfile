# Builds the hemlock interpreter from source pinned to a specific commit,
# then runs a tiny HTTP server that wraps it for BenchLocal verification.

# ---------- Stage 1: build hemlock ----------
FROM debian:bookworm-slim AS builder

ARG HEMLOCK_REPO=https://github.com/hemlang/hemlock.git
ARG HEMLOCK_REF=main

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential ca-certificates git make gcc libc-dev \
    libssl-dev zlib1g-dev libcurl4-openssl-dev \
    libsqlite3-dev libpcre3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
RUN git clone --depth 1 --branch ${HEMLOCK_REF} ${HEMLOCK_REPO} hemlock || \
    (git clone ${HEMLOCK_REPO} hemlock && cd hemlock && git checkout ${HEMLOCK_REF})

WORKDIR /src/hemlock
RUN make

# ---------- Stage 2: runtime ----------
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip \
    ca-certificates \
    libssl3 zlib1g libcurl4 \
    libsqlite3-0 libpcre3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/hemlock
COPY --from=builder /src/hemlock/hemlock /usr/local/bin/hemlock
COPY --from=builder /src/hemlock/stdlib /opt/hemlock/stdlib

ENV HEMLOCK_STDLIB=/opt/hemlock/stdlib

WORKDIR /app
COPY server.py requirements.txt /app/
RUN pip install --no-cache-dir --break-system-packages -r requirements.txt

ENV PORT=4010
EXPOSE 4010

HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
    CMD python3 -c "import urllib.request,sys; urllib.request.urlopen('http://127.0.0.1:'+str(__import__('os').environ.get('PORT','4010'))+'/health', timeout=2)" || exit 1

CMD ["python3", "/app/server.py"]
