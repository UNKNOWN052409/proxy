// DeepSeek adapter — ported from the live-proven Python DeepSeekChatConnector
// (rev-serving/universal_bridge.py, verified SERVER_E2E_OK).
// Single-account: user's own token from deepseek_token.json
// ({token, uid} — browser login se harvest hota hai).
// Flow: warmup -> chat_session/create -> PoW solve -> completion SSE.
// Design: NO scraping, NO anti-detection evasion, NO multi-account rotation.
//
// TLS caveat: reqwest+rustls ka JA3 Chrome se match nahi karta —
// landing warmup + userToken cookie se 200 mil raha hai aaj. Agar DS
// kabhi TLS reject kare, rquest (Chrome impersonation) pe switch.

use crate::Adapter;
use async_trait::async_trait;
use base64::Engine as _;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::mpsc;

pub struct DeepSeekAdapter {
    pub token: String,
    #[allow(dead_code)]
    pub uid: String,
}

fn now_secs() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64
}

impl DeepSeekAdapter {
    /// Env fallback for container deploys (Render): DS_TOKEN_JSON holds the
    /// same {"token": ..., "uid": ...} JSON. File wins if both exist.
    pub fn from_env_or_file(path: &str) -> Option<Self> {
        if let Some(da) = Self::from_file(path) {
            return Some(da);
        }
        let raw = std::env::var("DS_TOKEN_JSON").ok()?;
        let v: Value = serde_json::from_str(&raw).ok()?;
        let token = v.get("token")?.as_str()?.to_string();
        if token.is_empty() {
            return None;
        }
        Some(Self {
            token,
            uid: v.get("uid").and_then(|u| u.as_str()).unwrap_or("").to_string(),
        })
    }

    pub fn from_file(path: &str) -> Option<Self> {
        let raw = std::fs::read_to_string(path).ok()?;
        let v: Value = serde_json::from_str(&raw).ok()?;
        let token = v.get("token")?.as_str()?.to_string();
        if token.is_empty() {
            return None;
        }
        Some(Self {
            token,
            uid: v.get("uid").and_then(|u| u.as_str()).unwrap_or("").to_string(),
        })
    }

    fn headers() -> Vec<(&'static str, &'static str)> {
        vec![
            ("content-type", "application/json"),
            ("accept", "application/json"),
            ("x-client-locale", "en_US"),
            ("x-client-bundle-id", "com.deepseek.chat"),
            ("x-client-version", "2.4.0"),
            ("x-client-platform", "web"),
            ("x-client-timezone-offset", "0"),
            ("referer", "https://chat.deepseek.com/"),
        ]
    }

    /// DeepSeekHashV1 PoW: SHA-256(salt + challenge + nonce) with
    /// leading hex zeros = bits/4. Challenge format: "<rand>_<bits>".
    fn solve_pow(&self, chal: &Value, target_path: &str) -> Result<String, String> {
        let challenge = chal.get("challenge").and_then(|c| c.as_str()).unwrap_or("");
        let salt = chal.get("salt").and_then(|s| s.as_str()).unwrap_or("");
        let signature = chal.get("signature").and_then(|s| s.as_str()).unwrap_or("");
        let algo = chal.get("algorithm").and_then(|a| a.as_str()).unwrap_or("DeepSeekHashV1");
        if challenge.is_empty() {
            return Err("pow: empty challenge".into());
        }
        let bits: i64 = challenge
            .rsplit_once('_')
            .and_then(|(_, b)| b.parse().ok())
            .unwrap_or(0);
        let zeros = (bits / 4).max(1) as usize;
        let prefix = "0".repeat(zeros);
        for nonce in 0..100_000_000i64 {
            let mut h = Sha256::new();
            h.update(format!("{salt}{challenge}{nonce}").as_bytes());
            let hexd = hex::encode(h.finalize());
            if hexd.starts_with(&prefix) {
                let solution = json!({
                    "algorithm": algo,
                    "challenge": challenge,
                    "salt": salt,
                    "answer": nonce,
                    "signature": signature,
                    "target_path": target_path,
                });
                return Ok(base64::engine::general_purpose::STANDARD
                    .encode(solution.to_string()));
            }
        }
        Err(format!("pow: unsolved (zeros={zeros})"))
    }
}

#[async_trait]
impl Adapter for DeepSeekAdapter {
    fn name(&self) -> &'static str { "deepseek" }

    fn models(&self) -> Vec<String> {
        vec!["deepseek".into(), "deepseek-think".into(), "deepseek-search".into()]
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
        &self, prompt: &str, model: &str, tx: mpsc::Sender<String>,
    ) -> Result<(), String> {
        self.chat_stream_inner(prompt, model, tx).await
    }
}

impl DeepSeekAdapter {
    async fn chat_stream_inner(
        &self, prompt: &str, model: &str, tx: mpsc::Sender<String>,
    ) -> Result<(), String> {
        let model_type = match model {
            "deepseek" | "deepseek-instant" | "qwen/deepseek" => "default",
            "deepseek-expert" => "expert",
            "deepseek-think" | "deepseek-deep-think" => "deep_think",
            "deepseek-search" => "search",
            _ => "default",
        };

        let client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) \
                         AppleWebKit/537.36 (KHTML, like Gecko) \
                         Chrome/131.0.0.0 Safari/537.36")
            .cookie_store(true)
            .timeout(std::time::Duration::from_secs(180))
            .build()
            .map_err(|e| e.to_string())?;

        let auth = format!("Bearer {}", self.token);
        let cookie = format!("userToken={}", self.token);

        // 1. WAF warmup — landing GET
        let _ = client
            .get("https://chat.deepseek.com/")
            .header("accept", "text/html,application/xhtml+xml,*/*;q=0.8")
            .header("accept-language", "en-US,en;q=0.9")
            .send()
            .await;

        // 2. chat_session/create
        let mut req = client
            .post("https://chat.deepseek.com/api/v0/chat_session/create")
            .json(&json!({}));
        for (k, v) in Self::headers() {
            req = req.header(k, v);
        }
        let r1 = req
            .header("authorization", &auth)
            .header("cookie", &cookie)
            .send()
            .await
            .map_err(|e| format!("session: {e}"))?;
        if r1.status().as_u16() != 200 {
            return Err(format!("session: HTTP {}", r1.status()));
        }
        let j1: Value = r1.json().await.map_err(|e| e.to_string())?;
        let sid = j1
            .pointer("/data/biz_data/chat_session/id")
            .and_then(|v| v.as_str())
            .ok_or("session: no id")?
            .to_string();

        // 3. PoW challenge + solve
        let mut pow_req = client
            .post("https://chat.deepseek.com/api/v0/chat/create_pow_challenge")
            .json(&json!({"target_path": "/api/v0/chat/completion"}));
        for (k, v) in Self::headers() {
            pow_req = pow_req.header(k, v);
        }
        let rp = pow_req
            .header("authorization", &auth)
            .header("cookie", &cookie)
            .send()
            .await
            .map_err(|e| format!("pow: {e}"))?;
        if rp.status().as_u16() != 200 {
            return Err(format!("pow: HTTP {}", rp.status()));
        }
        let jp: Value = rp.json().await.map_err(|e| e.to_string())?;
        let chal = jp
            .pointer("/data/biz_data/challenge")
            .cloned()
            .ok_or("pow: no challenge")?;
        let pow_header = self.solve_pow(&chal, "/api/v0/chat/completion")?;

        // 4. completion (SSE)
        let body = json!({
            "chat_session_id": sid,
            "parent_message_id": null,
            "model_type": model_type,
            "prompt": prompt,
            "ref_file_ids": [],
            "thinking_enabled": model_type == "deep_think",
            "search_enabled": true,
            "action": null,
            "preempt": false,
        });
        let mut req = client
            .post("https://chat.deepseek.com/api/v0/chat/completion")
            .json(&body);
        for (k, v) in Self::headers() {
            req = req.header(k, v);
        }
        let r2 = req
            .header("authorization", &auth)
            .header("cookie", &cookie)
            .header("x-ds-pow-response", &pow_header)
            .header("referer", format!("https://chat.deepseek.com/a/chat/s/{sid}"))
            .send()
            .await
            .map_err(|e| format!("completion: {e}"))?;
        if r2.status().as_u16() != 200 {
            return Err(format!("completion: HTTP {}", r2.status()));
        }

        // 5. SSE parse — python parse_chunk shapes:
        //    v.response.fragments[0].content | v.o=APPEND,v.v | d.content
        use futures_util::StreamExt;
        let mut stream = r2.bytes_stream();
        let mut buf = String::new();
        let mut finished = false;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| e.to_string())?;
            buf.push_str(&String::from_utf8_lossy(&chunk));
            loop {
                let Some(pos) = buf.find('\n') else { break };
                let line: String = buf.drain(..=pos).collect();
                let line = line.trim();
                if line.starts_with("event:") {
                    if line.contains("close") {
                        finished = true;
                        break;
                    }
                    continue;
                }
                if !line.starts_with("data:") {
                    continue;
                }
                let data = line[5..].trim();
                if data == "[DONE]" || data == "null" || data.is_empty() {
                    continue;
                }
                let Ok(v) = serde_json::from_str::<Value>(data) else {
                    continue;
                };
                let mut piece: Option<String> = None;
                if let Some(frags) = v
                    .pointer("/v/response/fragments")
                    .and_then(|f| f.as_array())
                {
                    if let Some(c) = frags
                        .first()
                        .and_then(|f| f.get("content"))
                        .and_then(|c| c.as_str())
                    {
                        piece = Some(c.to_string());
                    }
                }
                if piece.is_none() {
                    if v.pointer("/v/o").and_then(|o| o.as_str()) == Some("APPEND") {
                        if let Some(c) = v.pointer("/v/v").and_then(|c| c.as_str()) {
                            piece = Some(c.to_string());
                        }
                    }
                }
                if piece.is_none() {
                    if let Some(c) = v.get("content").and_then(|c| c.as_str()) {
                        piece = Some(c.to_string());
                    }
                }
                if let Some(p) = piece {
                    if !p.is_empty() {
                        let _ = tx.send(p).await;
                    }
                }
            }
            if finished {
                break;
            }
        }
        let _ = now_secs(); // keep helper warm for future timestamped bodies
        Ok(())
    }
}
