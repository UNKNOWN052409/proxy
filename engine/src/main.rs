// revd — Rust engine for the uniproxy Rev kit
// OpenAI-compatible /v1 server + sk-fabri- key system + SQLite state.
// Single-account adapters plug into the Adapter trait below.
// Design: NO scraping, NO anti-bot evasion, NO multi-account rotation.

mod qwen;
mod deepseek;
mod generic_flow;

use deepseek::DeepSeekAdapter;
use generic_flow::GenericFlowAdapter;
use qwen::QwenAdapter;

use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{sse::{Event, Sse}, IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use rand::RngCore;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    convert::Infallible,
    net::SocketAddr,
    sync::{Arc, Mutex, OnceLock},
    time::{Instant, SystemTime, UNIX_EPOCH},
};
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;

// ---------------- config ----------------

#[derive(Debug, Deserialize, Default)]
struct Config {
    port: Option<u16>,
    db_path: Option<String>,
    #[serde(default)]
    tls: Option<bool>, // placeholder — cert wiring baad me
}

fn load_config() -> Config {
    let path = std::env::var("REV_CONFIG")
        .unwrap_or_else(|_| "engine.toml".into());
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| toml::from_str(&s).ok())
        .unwrap_or_default()
}

// ---------------- state ----------------

pub struct AppState {
    pub db: Mutex<Connection>,
}

pub fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

pub fn gen_key() -> String {
    let mut b = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut b);
    format!("sk-fabri-{}", hex::encode(b))
}

pub fn init_db(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS accounts(
            id TEXT PRIMARY KEY, provider TEXT, label TEXT,
            status TEXT, added_at INTEGER);
         CREATE TABLE IF NOT EXISTS api_keys(
            key TEXT PRIMARY KEY, account_id TEXT,
            enabled INTEGER, created_at INTEGER);
         CREATE TABLE IF NOT EXISTS usage(
            ts INTEGER, key TEXT, provider TEXT, model TEXT,
            tokens_in INTEGER, tokens_out INTEGER,
            latency_ms INTEGER, status_code INTEGER);",
    )
}

// ---------------- adapter trait + registry ----------------

#[async_trait::async_trait]
pub trait Adapter: Send + Sync {
    fn name(&self) -> &'static str;
    fn models(&self) -> Vec<String> { vec![] }
    /// Ek non-stream reply.
    async fn chat(&self, prompt: &str, model: &str)
        -> Result<String, String>;
    /// Streaming — har send ek text piece. Default: chat ko single
    /// piece ke roop me bhej deta hai.
    async fn chat_stream(
        &self,
        prompt: &str,
        model: &str,
        tx: mpsc::Sender<String>,
    ) -> Result<(), String> {
        let full = self.chat(prompt, model).await?;
        let _ = tx.send(full).await;
        Ok(())
    }
}

pub struct EchoAdapter;

#[async_trait::async_trait]
impl Adapter for EchoAdapter {
    fn name(&self) -> &'static str { "echo" }
    async fn chat(&self, prompt: &str, _model: &str)
        -> Result<String, String> {
        Ok(format!("[echo] {}", prompt))
    }
}

#[derive(Clone)]
pub struct Registry {
    inner: Arc<Vec<Box<dyn Adapter>>>,
}

impl Registry {
    pub fn new() -> Self {
        let mut adapters: Vec<Box<dyn Adapter>> =
            vec![Box::new(EchoAdapter)];
        // qwen token file ho to plug karo (single-account, user ka
        // apna guest token). Env fallback QWEN_TOKEN_JSON container
        // deploys ke liye (Render — file mount nahi hota wahan).
        let token_path = std::env::var("QWEN_TOKEN_FILE")
            .unwrap_or_else(|_| {
                "/home/kali/Rev/qwen_token.json".into()
            });
        if let Some(qa) = QwenAdapter::from_env_or_file(&token_path) {
            adapters.push(Box::new(qa));
        }
        // deepseek token file (browser login se harvested). Env fallback
        // DS_TOKEN_JSON same {"token": ..., "uid": ...} format me.
        let ds_path = std::env::var("DS_TOKEN_FILE")
            .unwrap_or_else(|_| {
                "/home/kali/Rev/deepseek_token.txt".into()
            });
        if let Some(da) = DeepSeekAdapter::from_env_or_file(&ds_path) {
            adapters.push(Box::new(da));
        }
        // generic captured flows — auto_pipeline.py ke config(s).
        // FLOW_CONFIG_DIR me har app ka <app>.config.json rakho; sab
        // load ho jaate hain (articles apps, chat apps, sab same plug).
        let flow_dir = std::env::var("FLOW_CONFIG_DIR").unwrap_or_else(|_| {
            "/home/kali/Rev/re_capture/flows".into()
        });
        if let Ok(entries) = std::fs::read_dir(&flow_dir) {
            let mut paths: Vec<_> = entries
                .filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| {
                    p.extension().and_then(|x| x.to_str()) == Some("json")
                })
                .collect();
            paths.sort();
            for p in paths {
                for ga in GenericFlowAdapter::from_config(
                    p.to_str().unwrap_or_default()) {
                    adapters.push(Box::new(ga));
                }
            }
        }
        Self { inner: Arc::new(adapters) }
    }
    pub fn get(&self, name: &str) -> Option<&dyn Adapter> {
        // 1) adapter naam se (e.g. "qwen", "echo")
        if let Some(a) = self
            .inner
            .iter()
            .map(|a| a.as_ref())
            .find(|a| a.name() == name)
        {
            return Some(a);
        }
        // 2) model id/alias se (e.g. "qwen3.8-max",
        //    "mockarticles-v2-articles") — models list me dhundo
        self.inner
            .iter()
            .map(|a| a.as_ref())
            .find(|a| a.models().iter().any(|m| m == name))
    }
    pub fn names(&self) -> Vec<&'static str> {
        self.inner.iter().map(|a| a.name()).collect()
    }
}

// ---------------- RPM limiter ----------------
// Per-key sliding-window rate limit. REV_RPM=0 ya unset = unlimited.
// 429 + Retry-After header return hota hai jab window full ho — client
// (Hermes/OpenAI SDK) standard retry semantics follow karta hai.
struct RpmLimiter {
    window_secs: i64,
    max_rpm: i64,
    hits: Mutex<Vec<(i64, String)>>, // (ts, key)
}

impl RpmLimiter {
    fn from_env() -> Self {
        let rpm = std::env::var("REV_RPM")
            .ok()
            .and_then(|s| s.trim().parse::<i64>().ok())
            .unwrap_or(0);
        Self { window_secs: 60, max_rpm: rpm, hits: Mutex::new(Vec::new()) }
    }

    /// Ok(()) ya Err(retry_after_secs)
    fn allow(&self, key: &str) -> Result<(), i64> {
        if self.max_rpm <= 0 {
            return Ok(());
        }
        let now = now();
        let mut h = self.hits.lock().unwrap();
        h.retain(|(ts, _)| now - *ts < self.window_secs);
        let mine = h.iter().filter(|(_, k)| k == key).count() as i64;
        if mine >= self.max_rpm {
            // sabse purani is-key hit kab window se bahar jayegi
            let oldest = h.iter()
                .filter(|(_, k)| k == key)
                .map(|(ts, _)| *ts)
                .min()
                .unwrap_or(now);
            return Err(oldest + self.window_secs - now);
        }
        h.push((now, key.to_string()));
        Ok(())
    }
}

static RPM_CELL: OnceLock<RpmLimiter> = OnceLock::new();

fn rpm() -> &'static RpmLimiter {
    RPM_CELL.get_or_init(RpmLimiter::from_env)
}

// ---------------- auth ----------------

fn check_key(state: &AppState, headers: &HeaderMap) -> bool {
    let auth = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let key = auth.strip_prefix("Bearer ").unwrap_or("").trim();
    if !key.starts_with("sk-fabri-") {
        return false;
    }
    let db = state.db.lock().unwrap();
    matches!(
        db.query_row(
            "SELECT enabled FROM api_keys WHERE key = ?1",
            [key],
            |r| r.get::<_, i64>(0),
        ),
        Ok(1)
    )
}

// ---------------- handlers ----------------

async fn health() -> Json<Value> {
    Json(json!({"status": "ok", "ts": now()}))
}

async fn models(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Response {
    if !check_key(&state, &headers) {
        return unauthorized();
    }
    let reg = REGISTRY_CELL.get();
    let mut data = Vec::new();
    for a in reg.inner.iter() {
        data.push(json!({
            "id": a.name(), "object": "model",
            "owned_by": "rev-engine",
        }));
        for m in a.models() {
            data.push(json!({
                "id": m, "object": "model",
                "owned_by": a.name(),
            }));
        }
    }
    Json(json!({"object": "list", "data": data})).into_response()
}

fn unauthorized() -> Response {
    (
        StatusCode::UNAUTHORIZED,
        Json(json!({"error": {"message": "invalid api key",
                              "type": "auth"}})),
    )
        .into_response()
}

#[derive(Deserialize)]
struct ChatReq {
    model: Option<String>,
    messages: Vec<ChatMsg>,
    stream: Option<bool>,
    /// Kitne output tokens chahiye — adapter prompt me inject hota hai
    /// taaki ek hi request me maximum content aaye (kam requests).
    #[serde(default)]
    max_tokens: Option<u64>,
    /// Ek hi request me multiple prompts — responses array me utne hi
    /// replies (batch mode: N prompts, 1 HTTP call round-trip shape).
    #[serde(default)]
    batch: Option<Vec<String>>,
}

#[derive(Deserialize)]
struct ChatMsg {
    role: String,
    #[serde(default)]
    content: String,
}

fn render_prompt(msgs: &[ChatMsg]) -> String {
    if msgs.len() == 1 && msgs[0].role == "user" {
        return msgs[0].content.clone();
    }
    let mut parts = Vec::new();
    for m in msgs {
        match m.role.as_str() {
            "system" => parts.push(format!("[Instructions]: {}", m.content)),
            "assistant" => parts.push(
                format!("[Previous assistant reply]: {}", m.content)),
            _ => parts.push(format!("[User]: {}", m.content)),
        }
    }
    parts.push("Answer the LAST [User] message above directly.".into());
    parts.join("\n\n")
}

/// Token-efficiency: LO ka rule — kam requests me maximum output.
/// max_tokens ko prompt me directive ki tarah inject karo (adapters
/// jo native max_tokens support nahi karte unke liye bhi kaam karta
/// hai), aur batch prompts ko ek single mega-prompt me merge karo.
fn render_prompt_full(
    msgs: &[ChatMsg],
    max_tokens: Option<u64>,
    batch: &Option<Vec<String>>,
) -> String {
    let mut p = render_prompt(msgs);
    // LO ka rule: har request me max output. max_tokens na bhi diya ho
    // to default full-detail directive — adaptive budget line.
    let budget = match max_tokens.filter(|m| *m > 0) {
        Some(mt) => format!("roughly {mt} tokens"),
        None => "as long as the full answer needs".into(),
    };
    p = format!(
        "{p}\n\n[Output budget: complete, thorough answer of {budget}. \
         Do not stop early; do not summarize short. Cover everything \
         asked.]",
    );
    if let Some(items) = batch {
        if !items.is_empty() {
            let numbered: String = items
                .iter()
                .enumerate()
                .map(|(i, s)| format!("{}. {}", i + 1, s))
                .collect::<Vec<_>>()
                .join("\n");
            p = format!(
                "{p}\n\n[BATCH MODE — answer EVERY item below in order, \
                 separated by \"=== <item number> ===\" headers. Ek \
                 combined reply me sab items cover karo.]\n{numbered}",
            );
        }
    }
    p
}

fn sse_frame(model: &str, delta: Value, finish: Option<&str>) -> String {
    json!({
        "id": format!("chatcmpl-{}", uuid::Uuid::new_v4()),
        "object": "chat.completion.chunk",
        "created": now(),
        "model": model,
        "choices": [{
            "index": 0,
            "delta": delta,
            "finish_reason": finish,
        }]
    })
    .to_string()
}

async fn completions(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<ChatReq>,
) -> Response {
    if !check_key(&state, &headers) {
        return unauthorized();
    }
    // RPM limit (REV_RPM env) — per-key sliding window, 429 + Retry-After.
    let api_key_str = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|a| a.strip_prefix("Bearer ").map(|s| s.to_string()))
        .unwrap_or_default();
    if let Err(retry_after) = rpm().allow(&api_key_str) {
        return (
            StatusCode::TOO_MANY_REQUESTS,
            [
                ("retry-after", retry_after.to_string()),
                ("content-type", "application/json".into()),
            ],
            Json(json!({"error": {"message":
                format!("rate limit: {} requests/min reached; retry in {}s",
                    std::env::var("REV_RPM").unwrap_or_default(), retry_after),
                "type": "rate_limit_error"}})),
        )
            .into_response();
    }
    let model = body.model.clone().unwrap_or_else(|| "echo".into());
    let prompt = render_prompt_full(
        &body.messages, body.max_tokens, &body.batch);
    let reg = REGISTRY_CELL.get();

    let Some(adapter) = reg.get(&model) else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": {"message":
                format!("unknown model '{}'", model),
                "type": "bad_model"}})),
        )
            .into_response();
    };

    let t0 = Instant::now();
    let usage_key = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|a| a.strip_prefix("Bearer ").map(|s| s.to_string()))
        .unwrap_or_default();

    let provider = adapter.name().to_string();

    if body.stream.unwrap_or(false) {
        let (tx, rx) = mpsc::channel::<String>(64);
        let prompt2 = prompt.clone();
        let model2 = model.clone();
        let reg2 = reg.clone();
        tokio::spawn(async move {
            let a = reg2.get(&model2).unwrap();
            if let Err(e) = a.chat_stream(&prompt2, &model2, tx).await {
                eprintln!("[adapter {}] stream error: {}", model2, e);
            }
        });

        let state2 = state.clone();
        let model3 = model.clone();
        let model4 = model.clone();
        let key2 = usage_key.clone();
        let provider2 = provider.clone();
        let stream = ReceiverStream::new(rx).map(move |piece| {
            Ok::<Event, Infallible>(
                Event::default().data(sse_frame(&model3, json!({
                    "content": piece }), None)),
            )
        })
        .chain(futures_util::stream::iter(vec![
            Ok(Event::default().data(sse_frame(&model4, json!({}),
                Some("stop")))),
            Ok(Event::default().data("[DONE]")),
        ]));

        // usage row — stream start pe ek hi baar (pieces count nahi
        // hota is layer pe, tokens_in estimate se log).
        let _ = state2.db.lock().unwrap().execute(
            "INSERT INTO usage VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            rusqlite::params![
                now(), key2, provider2, &model,
                prompt.len() as i64 / 4, 0,
                t0.elapsed().as_millis() as i64, 200
            ],
        );

        return Sse::new(stream).into_response();
    }

    // non-stream
    let reply = match adapter.chat(&prompt, &model).await {
        Ok(r) => r,
        Err(e) => {
            let _ = state.db.lock().unwrap().execute(
                "INSERT INTO usage VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                rusqlite::params![
                    now(), usage_key, provider, &model,
                    prompt.len() as i64 / 4, 0,
                    t0.elapsed().as_millis() as i64, 502
                ],
            );
            return (
                StatusCode::BAD_GATEWAY,
                Json(json!({"error": {"message": e,
                                      "type": "adapter_error"}})),
            )
                .into_response()
        }
    };
    let _ = state.db.lock().unwrap().execute(
        "INSERT INTO usage VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        rusqlite::params![
            now(), usage_key, provider, &model,
            prompt.len() as i64 / 4, reply.len() as i64 / 4,
            t0.elapsed().as_millis() as i64, 200
        ],
    );
    Json(json!({
        "id": format!("chatcmpl-{}", uuid::Uuid::new_v4()),
        "object": "chat.completion",
        "created": now(),
        "model": model,
        "choices": [{
            "index": 0,
            "message": {"role": "assistant", "content": reply},
            "finish_reason": "stop"
        }],
        "usage": {
            "prompt_tokens": prompt.len() / 4,
            "completion_tokens": reply.len() / 4,
            "total_tokens": (prompt.len() + reply.len()) / 4
        }
    }))
    .into_response()
}

// ---------------- keymgmt CLI ----------------

fn key_cmd(args: &[String]) -> i32 {
    let db_path = std::env::var("REV_DB")
        .unwrap_or_else(|_| "rev.db".into());
    let conn = Connection::open(&db_path).expect("db open fail");
    init_db(&conn).expect("db init fail");
    match args.first().map(|s| s.as_str()) {
        Some("gen") => {
            let key = gen_key();
            let id = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO api_keys VALUES (?1,?2,1,?3)",
                rusqlite::params![key, id, now()],
            )
            .expect("insert fail");
            println!("{}", key);
            0
        }
        Some("list") => {
            let mut stmt = conn
                .prepare("SELECT key, account_id, enabled, created_at
                          FROM api_keys")
                .unwrap();
            let rows = stmt
                .query_map([], |r| {
                    Ok(format!("{} {} {} {}",
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, i64>(2)?,
                        r.get::<_, i64>(3)?))
                })
                .unwrap();
            for r in rows {
                println!("{}", r.unwrap());
            }
            0
        }
        Some("usage") => {
            let mut stmt = conn
                .prepare("SELECT ts, key, provider, model,
                          tokens_in, tokens_out, latency_ms,
                          status_code FROM usage ORDER BY ts DESC
                          LIMIT 20")
                .unwrap();
            let rows = stmt
                .query_map([], |r| {
                    Ok(format!("{} key={} prov={} model={} tin={} tout={} lat={} code={}",
                        r.get::<_, i64>(0)?, r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?, r.get::<_, String>(3)?,
                        r.get::<_, i64>(4)?, r.get::<_, i64>(5)?,
                        r.get::<_, i64>(6)?, r.get::<_, i64>(7)?))
                })
                .unwrap();
            for r in rows {
                println!("{}", r.unwrap());
            }
            0
        }
        _ => {
            eprintln!("usage: revd key gen|list|usage");
            1
        }
    }
}

// ---------------- registry singleton ----------------

struct RegOnce(OnceLock<Registry>);
static REGISTRY_CELL: RegOnce = RegOnce(OnceLock::new());

impl RegOnce {
    fn get(&self) -> Registry {
        self.0.get_or_init(Registry::new).clone()
    }
}

use futures_util::StreamExt;

// ---------------- main ----------------

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(|s| s.as_str()) == Some("key") {
        std::process::exit(key_cmd(&args[2..]));
    }

    let cfg = load_config();
    let port = cfg.port.unwrap_or_else(|| {
        std::env::var("PORT")
            .ok()
            .and_then(|p| p.trim().parse().ok())
            .unwrap_or(8000)
    });
    let db_path = cfg.db_path.clone().unwrap_or_else(|| "rev.db".into());

    let conn = Connection::open(&db_path).expect("rev.db open fail");
    init_db(&conn).expect("db init fail");

    let state = Arc::new(AppState { db: Mutex::new(conn) });

    let app = Router::new()
        .route("/health", get(health))
        .route("/v1/models", get(models))
        .route("/v1/chat/completions", post(completions))
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("bind fail");
    println!("revd listening on http://0.0.0.0:{}", port);

    // ---- keepalive: Render free tier 15 min idle pe service spin-down
    // karta hai. REV_KEEPALIVE_URL set ho (e.g. https://<app>.onrender.com/health)
    // to har 10 min self-ping — service hamesha warm rehti hai.
    if let Ok(ping_url) = std::env::var("REV_KEEPALIVE_URL") {
        if !ping_url.is_empty() {
            tokio::spawn(async move {
                let client = reqwest::Client::builder()
                    .timeout(std::time::Duration::from_secs(10))
                    .build()
                    .unwrap();
                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(600)).await;
                    match client.get(&ping_url).send().await {
                        Ok(r) => println!(
                            "[keepalive] {} -> {}", ping_url, r.status()),
                        Err(e) => eprintln!("[keepalive] err: {}", e),
                    }
                }
            });
        }
    }

    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await
        .expect("server error");
}
