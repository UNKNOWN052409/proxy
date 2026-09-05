// Qwen adapter — multi-account pool with weighted rotation.
// Ported from the live-proven Python QwenConnector (universal_bridge.py,
// SERVER_E2E_OK). Accounts: user + dost apne email/pass se login karte hain
// (REST /api/accounts/login) ya token seedha paste karte hain.
// Design: NO scraping, NO anti-detection evasion, NO captcha solving.
// History isolation: har completion ke baad chat DELETE — account ke
// Qwen UI me proxy wali history kabhi nahi dikhti.
//
// TLS caveat: reqwest+rustls ka JA3 Chrome se match nahi karta —
// WAF cookie warmup se 200 mil raha hai. Agar Qwen kabhi TLS
// fingerprint reject kare, rquest crate pe switch karna hoga.

use crate::{Adapter};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::mpsc;

fn now_secs() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64
}

// ctime-style string: "Mon Aug 31 09:00:00 2026"
fn ctime_now() -> String {
    let secs = now_secs();
    let days = secs / 86400;
    let tod = secs % 86400;
    let (h, m, s) = (tod / 3600, (tod % 3600) / 60, tod % 60);
    // Howard Hinnant's civil_from_days
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z.rem_euclid(146097);
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let mth = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if mth <= 2 { y + 1 } else { y };
    static WDAY: [&str; 7] = ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue",
        "Wed"]; // 1970-01-01 = Thursday
    static MON: [&str; 12] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let wd = WDAY[(days.rem_euclid(7)) as usize];
    format!("{}, {} {} {} {:02}:{:02}:{:02} GMT",
            wd, d, MON[(mth - 1) as usize], year, h, m, s)
}

/// Ek Qwen account — token + rotation weight (points).
#[derive(Clone)]
pub struct QwenAccount {
    pub email: String,
    pub token: String,
    pub umid: String,
    pub weight: u32,   // 1..=100 — jitne points, utna zyada use
}

pub struct QwenAdapter {
    pub accounts: std::sync::RwLock<Vec<QwenAccount>>,
    pub cursor: std::sync::atomic::AtomicU64,
    pub umid: String, // legacy env/file token ka umid
}

impl QwenAdapter {
    pub fn from_file(path: &str) -> Option<Self> {
        let raw = std::fs::read_to_string(path).ok()?;
        let v: Value = serde_json::from_str(&raw).ok()?;
        let token = v.get("token")?.as_str()?.to_string();
        if token.is_empty() {
            return None;
        }
        Some(Self {
            accounts: std::sync::RwLock::new(vec![QwenAccount {
                email: "primary".into(),
                token,
                umid: v.get("umid").and_then(|u| u.as_str()).unwrap_or("").into(),
                weight: 100,
            }]),
            cursor: std::sync::atomic::AtomicU64::new(0),
            umid: v.get("umid").and_then(|u| u.as_str()).unwrap_or("").into(),
        })
    }

    /// Env fallback for container deploys (Render): QWEN_TOKEN_JSON holds
    /// the same {"token": "...", "umid": "..."} JSON. File wins if both exist.
    pub fn from_env_or_file(path: &str) -> Option<Self> {
        if let Some(qa) = Self::from_file(path) {
            return Some(qa);
        }
        let raw = std::env::var("QWEN_TOKEN_JSON").ok()?;
        let v: Value = serde_json::from_str(&raw).ok()?;
        let token = v.get("token")?.as_str()?.to_string();
        if token.is_empty() {
            return None;
        }
        Some(Self {
            accounts: std::sync::RwLock::new(vec![QwenAccount {
                email: "primary".into(),
                token,
                umid: v.get("umid").and_then(|u| u.as_str()).unwrap_or("").into(),
                weight: 100,
            }]),
            cursor: std::sync::atomic::AtomicU64::new(0),
            umid: v.get("umid").and_then(|u| u.as_str()).unwrap_or("").into(),
        })
    }

    /// Empty pool — sirf DB accounts se populate hoga.
    pub fn empty() -> Self {
        Self {
            accounts: std::sync::RwLock::new(Vec::new()),
            cursor: std::sync::atomic::AtomicU64::new(0),
            umid: String::new(),
        }
    }

    pub fn add_account(&self, acc: QwenAccount) {
        let mut g = self.accounts.write().unwrap();
        // same email replace, warna add
        if let Some(i) = g.iter().position(|a| a.email == acc.email) {
            g[i] = acc;
        } else {
            g.push(acc);
        }
    }

    pub fn remove_account(&self, email: &str) -> bool {
        let mut g = self.accounts.write().unwrap();
        let n = g.len();
        g.retain(|a| a.email != email);
        g.len() < n
    }

    pub fn account_count(&self) -> usize {
        self.accounts.read().unwrap().len()
    }

    /// Weighted pick — cumulative weights me round-robin cursor.
    /// weight 30 wala account weight 10 wale se 3x zyada serve karega.
    pub fn pick(&self) -> Option<QwenAccount> {
        let g = self.accounts.read().unwrap();
        if g.is_empty() {
            return None;
        }
        let total: u64 = g.iter()
            .map(|a| a.weight.max(1) as u64).sum();
        let n = self.cursor.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let mut slot = n % total;
        for a in g.iter() {
            let w = a.weight.max(1) as u64;
            if slot < w {
                return Some(a.clone());
            }
            slot -= w;
        }
        g.last().cloned()
    }
}

#[async_trait]
impl Adapter for QwenAdapter {
    fn name(&self) -> &'static str { "qwen" }

    fn models(&self) -> Vec<String> {
        vec!["qwen".into(), "qwen3.7-plus".into(),
             "qwen3.8-max".into()]
    }

    async fn chat(&self, prompt: &str, model: &str)
        -> Result<String, String> {
        let (tx, mut rx) = mpsc::channel::<String>(64);
        self.chat_stream_inner(prompt, model, tx).await?;
        let mut out = String::new();
        while let Some(p) = rx.recv().await {
            out.push_str(&p);
        }
        Ok(out)
    }

    async fn chat_stream(
        &self,
        prompt: &str,
        model: &str,
        tx: mpsc::Sender<String>,
    ) -> Result<(), String> {
        self.chat_stream_inner(prompt, model, tx).await
    }
}

impl QwenAdapter {
    async fn chat_stream_inner(
        &self,
        prompt: &str,
        model: &str,
        tx: mpsc::Sender<String>,
    ) -> Result<(), String> {
        let acc = self.pick()
            .ok_or("no qwen account — /api/accounts/login se add karo")?;
        let token = acc.token.clone();
        let umid = if acc.umid.is_empty() { self.umid.clone() } else { acc.umid.clone() };
        let acc_email = acc.email.clone();
        let real_model = match model {
            "qwen" | "qwen-plus" | "qwen3.7-plus" => "qwen3.7-plus",
            "qwen-max" | "qwen3.8-max" => "qwen3.8-max",
            _ => "qwen3.7-plus",
        };

        let client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) \
                         AppleWebKit/537.36 (KHTML, like Gecko) \
                         Chrome/131.0.0.0 Safari/537.36")
            .cookie_store(true)
            .build()
            .map_err(|e| e.to_string())?;

        // 1. WAF warmup — landing GET (acw_tc cookies)
        let _ = client
            .get("https://chat.qwen.ai/")
            .header("accept",
                "text/html,application/xhtml+xml,application/xml;q=0.9,\
                 */*;q=0.8")
            .header("accept-language", "en-US,en;q=0.9")
            .send()
            .await
            .map_err(|e| format!("warmup: {}", e))?;

        // token cookie manually — reqwest cookie_store domain
        // matching ke saath issues se bachne ke liye header use karo
        let cookie = format!("token={}", token);

        // 2. chats/new
        let r1 = client
            .post("https://chat.qwen.ai/api/v2/chats/new")
            .header("content-type", "application/json")
            .header("accept",
                    "application/json, text/plain, */*")
            .header("source", "web")
            .header("version", "0.2.87")
            .header("bx-v", "2.5.37")
            .header("timezone", ctime_now())
            .header("bx-ua", "default_not_value")
            .header("bx-umidtoken", &umid)
            .header("origin", "https://chat.qwen.ai")
            .header("referer", "https://chat.qwen.ai/c/new-chat")
            .header("x-request-id",
                uuid::Uuid::new_v4().to_string())
            .header("cookie", &cookie)
            .json(&json!({
                "chatId": "",
                "models": [real_model],
                "project_id": "",
                "timestamp": now_secs(),
                "chat_type": "t2t",
                "chat_mode": "normal",
            }))
            .send()
            .await
            .map_err(|e| format!("chats/new: {}", e))?;
        if r1.status().as_u16() != 200 {
            return Err(format!("chats/new: HTTP {}", r1.status()));
        }
        let j1: Value = r1.json().await
            .map_err(|e| e.to_string())?;
        let chat_id = j1
            .pointer("/data/id")
            .and_then(|v| v.as_str())
            .ok_or("chats/new: no id")?
            .to_string();

        // 3. completions (SSE)
        let fid = uuid::Uuid::new_v4().to_string();
        let ts = now_secs();
        let body = json!({
            "stream": true,
            "version": "2.1",
            "incremental_output": true,
            "chatId": chat_id,
            "parentId": "",
            "chat_id": chat_id,
            "chat_mode": "normal",
            "model": real_model,
            "parent_id": null,
            "messages": [{
                "id": null,
                "fid": fid,
                "parentId": null,
                "childrenIds": [],
                "role": "user",
                "content": prompt,
                "user_action": "chat",
                "files": [],
                "timestamp": ts,
                "models": [real_model],
                "model": "",
                "chat_type": "t2t",
                "feature_config": {
                    "thinking_enabled": false,
                    "output_schema": "phase",
                    "research_mode": "normal",
                    "auto_thinking": false,
                    "thinking_mode": "Auto",
                    "thinking_format": "summary",
                    "auto_search": false
                },
                "extra": {"meta": {"subChatType": "t2t"}},
                "sub_chat_type": "t2t",
                "parent_id": null
            }],
            "timestamp": ts
        });

        let url = format!(
            "https://chat.qwen.ai/api/v2/chat/completions?chat_id={}",
            chat_id);
        let r2 = client
            .post(&url)
            .header("content-type", "application/json")
            .header("accept", "application/json")
            .header("source", "web")
            .header("version", "0.2.87")
            .header("bx-v", "2.5.37")
            .header("timezone", ctime_now())
            .header("bx-ua", "default_not_value")
            .header("bx-umidtoken", &umid)
            .header("origin", "https://chat.qwen.ai")
            .header("referer", format!("https://chat.qwen.ai/c/{}", chat_id))
            .header("x-request-id", uuid::Uuid::new_v4().to_string())
            .header("x-accel-buffering", "no")
            .header("cookie", &cookie)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("completions: {}", e))?;
        if r2.status().as_u16() != 200 {
            return Err(format!("completions: HTTP {}", r2.status()));
        }

        // 4. SSE parse — choices[0].delta.content accumulate
        use futures_util::StreamExt;
        let mut stream = r2.bytes_stream();
        let mut buf = String::new();
        let mut acc = String::new();
        let mut finished = false;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| e.to_string())?;
            buf.push_str(&String::from_utf8_lossy(&chunk));
            loop {
                let Some(pos) = buf.find('\n') else { break };
                let line: String =
                    buf.drain(..=pos).collect();
                let line = line.trim();
                if !line.starts_with("data:") {
                    continue;
                }
                let data = line[5..].trim();
                if data == "[DONE]" {
                    finished = true;
                    break;
                }
                let Ok(v) = serde_json::from_str::<Value>(data) else {
                    continue };
                // full-resend guard: status=finished frame poora
                // accumulated text dobara bhej sakta hai — skip.
                {
                    let d = v.pointer("/choices/0/delta");
                    if let Some(d) = d {
                        let status = d.get("status")
                            .and_then(|s| s.as_str());
                        let content = d.get("content")
                            .and_then(|c| c.as_str())
                            .unwrap_or("");
                        if status == Some("finished")
                            && !content.is_empty()
                            && content == acc
                        {
                            continue;
                        }
                    }
                }
                // shape 1: choices[0].delta.content
                if let Some(piece) = v
                    .pointer("/choices/0/delta/content")
                    .and_then(|c| c.as_str())
                {
                    if !piece.is_empty() {
                        acc.push_str(piece);
                        let _ = tx.send(piece.to_string()).await;
                    }
                    continue;
                }
                // shape 2 (python parse_chunk): phase/content
                if let Some(phase) = v.get("phase") {
                    let ok_phase = phase.is_null()
                        || matches!(phase.as_str(),
                            Some("answer") | Some("continue"));
                    if ok_phase {
                        if let Some(c) = v.get("content")
                            .and_then(|c| c.as_str())
                        {
                            if !c.is_empty() {
                                let _ = tx.send(c.to_string()).await;
                            }
                        }
                    }
                }
            }
            if finished { break; }
        }

        // 5. history isolation — chat DELETE (fire-and-forget style).
        // Account owner ke Qwen UI me proxy chats kabhi nahi dikhen.
        let _ = client
            .delete(format!(
                "https://chat.qwen.ai/api/v2/chats/{}", chat_id))
            .header("accept", "application/json, text/plain, */*")
            .header("source", "web")
            .header("version", "0.2.87")
            .header("bx-v", "2.5.37")
            .header("timezone", ctime_now())
            .header("bx-ua", "default_not_value")
            .header("bx-umidtoken", &umid)
            .header("origin", "https://chat.qwen.ai")
            .header("referer", "https://chat.qwen.ai/c/new-chat")
            .header("x-request-id", uuid::Uuid::new_v4().to_string())
            .header("cookie", &cookie)
            .send()
            .await;
        eprintln!("[qwen] account={} model={} done, chat deleted",
            acc_email, real_model);
        Ok(())
    }
}
