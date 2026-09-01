// Generic flow-replay adapter — koi bhi captured app, engine me plug.
// Python pipeline (auto_pipeline.py) config.json banata hai:
//   {upstream_url, upstream_headers, body_template (${MESSAGES}/${MODEL}
//   placeholders), model_map, response_path?, sse_path?}
// Har app ka captured flow isi adapter se OpenAI-compatible ho jata hai.
// Single-account: user ki apni captured session. Design: NO scraping,
// NO anti-detection evasion, NO multi-account rotation.
//
// Ye adapter articles/content apps ke liye bhi hai — agar capture me
// chat endpoint nahi hai to response_path us JSON field pe point karo
// jahan content mile (auto_pipeline khud detect karta hai).

use crate::Adapter;
use async_trait::async_trait;
use serde_json::Value;
use std::collections::HashMap;
use tokio::sync::mpsc;

pub struct GenericFlowAdapter {
    pub name: String,
    pub models: Vec<String>,
    pub url: String,
    pub method: String,
    pub headers: HashMap<String, String>,
    pub body_template: Value,
    /// request model alias -> internal model id
    pub model_map: HashMap<String, String>,
    /// response extraction: JSON pointer(s) jahan se text aata hai
    /// (non-SSE JSON responses ke liye). Pehla match jeetta hai.
    pub response_paths: Vec<String>,
    /// SSE data frames ke andar same pointers try hote hain
    pub is_sse: bool,
}

impl GenericFlowAdapter {
    /// auto_pipeline.py ke config.json se load. Ek file me "apps" array
    /// ho sakta hai (multi-app) ya flat single-app config.
    pub fn from_config(path: &str) -> Vec<Self> {
        let raw = std::fs::read_to_string(path).ok().unwrap_or_default();
        let Ok(v) = serde_json::from_str::<Value>(&raw) else {
            return Vec::new();
        };
        let mut out = Vec::new();

        // helper: ek config object -> adapter
        let build = |name: String, c: &Value| -> Option<Self> {
            let url = c.get("upstream_url")?.as_str()?.to_string();
            let method = c
                .get("method")
                .and_then(|m| m.as_str())
                .unwrap_or("POST")
                .to_uppercase();
            let mut headers = HashMap::new();
            if let Some(h) = c.get("upstream_headers").and_then(|h| h.as_object()) {
                for (k, val) in h {
                    if let Some(s) = val.as_str() {
                        headers.insert(k.clone(), s.to_string());
                    }
                }
            }
            let body_template = c
                .get("body_template")
                .cloned()
                .unwrap_or_else(|| serde_json::json!({}));
            let mut model_map = HashMap::new();
            if let Some(mm) = c.get("model_map").and_then(|m| m.as_object()) {
                for (k, val) in mm {
                    if let Some(s) = val.as_str() {
                        model_map.insert(k.clone(), s.to_string());
                    }
                }
            }
            let mut response_paths = Vec::new();
            if let Some(rp) = c.get("response_paths").and_then(|r| r.as_array()) {
                for p in rp {
                    if let Some(s) = p.as_str() {
                        response_paths.push(s.to_string());
                    }
                }
            }
            // sane default extraction paths
            if response_paths.is_empty() {
                response_paths = vec![
                    "/choices/0/message/content".into(),
                    "/choices/0/delta/content".into(),
                    "/content".into(),
                    "/data/content".into(),
                    "/text".into(),
                ];
            }
            let models = model_map.keys().cloned().collect::<Vec<_>>();
            let is_sse = c.get("is_sse").and_then(|s| s.as_bool()).unwrap_or(true);
            Some(Self {
                name,
                models,
                url,
                method,
                headers,
                body_template,
                model_map,
                response_paths,
                is_sse,
            })
        };

        if let Some(apps) = v.get("apps").and_then(|a| a.as_array()) {
            for a in apps {
                if let Some(nm) = a.get("name").and_then(|n| n.as_str()) {
                    if let Some(ad) = build(nm.to_string(), a) {
                        out.push(ad);
                    }
                }
            }
        } else if let Some(ad) = build(
            std::path::Path::new(path)
                .file_stem()
                .and_then(|s| s.to_str())
                .map(|s| s.trim_end_matches(".config"))
                .unwrap_or("app")
                .to_string(),
            &v,
        ) {
            out.push(ad);
        }
        out
    }

    /// template me ${MESSAGES}/${MODEL}/${PROMPT} substitute karo.
    fn render_body(&self, prompt: &str, model_id: &str) -> Value {
        let mut body = self.body_template.clone();
        fn walk(v: &mut Value, prompt: &str, model: &str) {
            match v {
                Value::String(s) => {
                    let t = s.replace("${MESSAGES}", prompt)
                        .replace("${PROMPT}", prompt)
                        .replace("${MODEL}", model);
                    *s = t;
                }
                Value::Array(items) => {
                    for i in items {
                        walk(i, prompt, model);
                    }
                }
                Value::Object(map) => {
                    for (_, val) in map.iter_mut() {
                        walk(val, prompt, model);
                    }
                }
                _ => {}
            }
        }
        walk(&mut body, prompt, model_id);
        body
    }

    fn extract(&self, v: &Value) -> Option<String> {
        for p in &self.response_paths {
            // JSON pointer, but plain "key" bhi chal jaye
            if let Some(x) = v.pointer(p.strip_prefix('/').map(|_| p.as_str()).unwrap_or(p)) {
                if let Some(s) = x.as_str() {
                    if !s.is_empty() {
                        return Some(s.to_string());
                    }
                }
            }
        }
        None
    }
}

#[async_trait]
impl Adapter for GenericFlowAdapter {
    fn name(&self) -> &'static str {
        // Box<dyn Adapter> ke through 'static str chahiye — name ko
        // leak karna safe hai kyunki configs process lifetime ke hain.
        Box::leak(self.name.clone().into_boxed_str())
    }

    fn models(&self) -> Vec<String> {
        let mut m = self.models.clone();
        if m.is_empty() {
            m.push(self.name.clone());
        }
        m
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

impl GenericFlowAdapter {
    async fn chat_stream_inner(
        &self, prompt: &str, model: &str, tx: mpsc::Sender<String>,
    ) -> Result<(), String> {
        let model_id = self
            .model_map
            .get(model)
            .cloned()
            .or_else(|| self.model_map.values().next().cloned())
            .unwrap_or_else(|| model.to_string());

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(180))
            .build()
            .map_err(|e| e.to_string())?;

        let body = self.render_body(prompt, &model_id);
        let mut req = if self.method == "GET" {
            client.get(&self.url)
        } else {
            client.request(
                reqwest::Method::from_bytes(self.method.as_bytes())
                    .unwrap_or(reqwest::Method::POST),
                &self.url,
            )
            .json(&body)
        };
        for (k, v) in &self.headers {
            req = req.header(k.as_str(), v.as_str());
        }
        let resp = req
            .send()
            .await
            .map_err(|e| format!("upstream: {e}"))?;
        let status = resp.status().as_u16();
        if status != 200 {
            let t = resp.text().await.unwrap_or_default();
            return Err(format!(
                "upstream: HTTP {status} {}",
                &t[..t.len().min(200)]
            ));
        }

        let ctype = resp
            .headers()
            .get("content-type")
            .and_then(|c| c.to_str().ok())
            .unwrap_or("")
            .to_string();

        if self.is_sse && ctype.contains("event-stream") {
            use futures_util::StreamExt;
            let mut stream = resp.bytes_stream();
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
                    if data == "[DONE]" || data.is_empty() {
                        continue;
                    }
                    let Ok(v) = serde_json::from_str::<Value>(data) else {
                        // plain-text SSE piece
                        if !data.is_empty() {
                            let _ = tx.send(format!("{data}\n")).await;
                        }
                        continue;
                    };
                    if let Some(p) = self.extract(&v) {
                        let _ = tx.send(p).await;
                    }
                }
                if finished {
                    break;
                }
            }
            Ok(())
        } else {
            // plain JSON response — extract content field
            let text = resp
                .text()
                .await
                .map_err(|e| format!("body: {e}"))?;
            let Ok(v) = serde_json::from_str::<Value>(&text) else {
                // non-JSON body (article HTML etc) — as-is bhej do
                let _ = tx.send(text).await;
                return Ok(());
            };
            if let Some(p) = self.extract(&v) {
                let _ = tx.send(p).await;
            } else {
                // fallback: poora JSON (agent khud padh leta hai)
                let _ = tx.send(v.to_string()).await;
            }
            Ok(())
        }
    }
}
