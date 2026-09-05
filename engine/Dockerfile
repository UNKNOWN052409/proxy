# revd — Rust engine container for Render deployment.
# Multi-stage: build on debian slim, ship only the binary + a fresh DB.
FROM rust:1.83-slim AS builder
WORKDIR /build
RUN apt-get update && apt-get install -y --no-install-recommends pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
COPY Cargo.toml Cargo.lock ./
# dependency pre-heat (layer cache)
RUN mkdir -p src && echo 'fn main(){}' > src/main.rs && cargo build --release && rm -rf src
COPY src ./src
RUN touch src/main.rs && cargo build --release

FROM debian:12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* && useradd -m revd
COPY --from=builder /build/target/release/revd /app/revd
# engine.toml absent = defaults: port from $PORT (Render injects), rev.db local
ENV REV_DB=/app/data/rev.db
RUN mkdir -p /app/data && chown -R revd:revd /app
USER revd
EXPOSE 8000
# key DB fresh banti hai; render deploy ke baad `fly console`/shell se
# `./revd key gen` chalake key mint karke Render dashboard env me
# REVD_BOOTSTRAP_KEY set karo — ya pehli deploy ke baad CLI se gen karo.
ENTRYPOINT ["/app/revd"]
