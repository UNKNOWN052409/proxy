"use client";

import { useRef, useState } from "react";
import { Modal, Button, Badge } from "@/components/shared";
import { cn } from "@/lib/cn";

export default function ImportModal({ isOpen, onClose, onImportComplete }) {
  const [file, setFile] = useState(null);
  const [format, setFormat] = useState("auto");
  const [providerId, setProviderId] = useState("");
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const submitFile = async (selectedFile, { dryRun }) => {
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("format", format);
    formData.append("providerId", providerId.trim());
    if (dryRun) formData.append("dryRun", "true");
    const response = await fetch("/api/accounts/import", { method: "POST", body: formData });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Import validation failed");
    return data;
  };

  const validateSelectedFile = async (selectedFile = file) => {
    if (!selectedFile) return;
    setPreview({ loading: true });
    try {
      const data = await submitFile(selectedFile, { dryRun: true });
      setPreview({ ...data.preview, rejected: data.rejected || [] });
    } catch (error) {
      setPreview({ error: error.message || "Unable to validate the selected file." });
    }
  };

  const handleFileSelect = async (selectedFile) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setResult(null);
    await validateSelectedFile(selectedFile);
  };

  const handleDrag = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(event.type === "dragenter" || event.type === "dragover");
  };

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    if (event.dataTransfer.files?.[0]) handleFileSelect(event.dataTransfer.files[0]);
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setResult(null);
    try {
      const data = await submitFile(file, { dryRun: false });
      setResult({ success: data.success, ...data });
      if (data.success && onImportComplete) setTimeout(() => onImportComplete(data), 1400);
    } catch (error) {
      setResult({ success: false, error: error.message || "Import failed" });
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setFormat("auto");
    setProviderId("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => { reset(); onClose(); };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Import authorized credentials" size="lg">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-text-main">File format
            <select value={format} onChange={(event) => setFormat(event.target.value)} className="mt-2 w-full h-10 rounded-lg bg-surface-2 border border-border text-text-main px-3 focus:outline-none focus:ring-2 focus:ring-brand-500/30" disabled={importing || result?.success}>
              <option value="auto">Auto-detect from extension</option>
              <option value="json">JSON bundle</option>
              <option value="csv">CSV rows</option>
              <option value="tokens">Plain token list</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-text-main">Default provider ID <span className="text-text-subtle font-normal">(required for .txt)</span>
            <input value={providerId} onChange={(event) => setProviderId(event.target.value)} placeholder="e.g. kiro" className="mt-2 w-full h-10 rounded-lg bg-surface-2 border border-border text-text-main px-3 focus:outline-none focus:ring-2 focus:ring-brand-500/30" disabled={importing || result?.success} />
          </label>
        </div>

        {!result?.success && <div className={cn("relative border-2 border-dashed rounded-xl p-8 transition-colors", dragActive ? "border-brand-500 bg-brand-500/5" : "border-border-subtle hover:border-brand-500/50")} onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}>
          <input ref={fileInputRef} type="file" accept=".json,.csv,.txt,application/json,text/csv,text/plain" onChange={(event) => handleFileSelect(event.target.files?.[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" disabled={importing} />
          <div className="text-center pointer-events-none"><div className="size-12 rounded-2xl bg-brand-500/10 flex items-center justify-center mx-auto mb-3"><span className="material-symbols-outlined text-[28px] text-brand-400">upload_file</span></div><p className="text-sm font-medium text-text-main mb-1">{file ? file.name : "Drop a JSON, CSV, or .txt token file here"}</p><p className="text-xs text-text-muted">API keys, official bearer tokens, OAuth account records, and approved metadata only.</p></div>
        </div>}

        {file && !result?.success && <div className="flex justify-end"><Button variant="outline" size="sm" icon="fact_check" onClick={() => validateSelectedFile()} disabled={importing}>Revalidate file</Button></div>}

        {preview && !result && <div className="rounded-xl bg-surface-2 border border-border-subtle p-4">{preview.loading ? <div className="flex items-center gap-2 text-sm text-text-muted"><span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>Validating safe import schema…</div> : preview.error ? <div className="flex gap-2 text-sm text-danger"><span className="material-symbols-outlined text-[20px]">error</span>{preview.error}</div> : <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium text-text-main">Safe import preview</p><div className="flex gap-2"><Badge variant="info" size="sm">{preview.credentialEntries || 0} credentials</Badge><Badge variant="neutral" size="sm">{preview.accountEntries || 0} OAuth accounts</Badge>{preview.rejectedEntries > 0 && <Badge variant="danger" size="sm">{preview.rejectedEntries} rejected</Badge>}</div></div><p className="text-xs text-text-muted">Credential values are never rendered in this preview. Providers: {[...(preview.credentialProviders || []), ...(preview.accountProviders || [])].filter((value, index, values) => values.indexOf(value) === index).join(", ") || "not detected"}.</p>{preview.rejected?.length > 0 && <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-xs text-amber-200">{preview.rejected.length} entries include unsupported private material and will not be stored.</div>}</div>}</div>}

        {result && <div className={cn("rounded-xl border p-4", result.success ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/20")}><div className="flex items-start gap-3"><span className={cn("material-symbols-outlined text-[24px] shrink-0", result.success ? "text-emerald-400" : "text-danger")}>{result.success ? "check_circle" : "error"}</span><div className="flex-1"><p className={cn("text-sm font-medium mb-1", result.success ? "text-emerald-400" : "text-danger")}>{result.success ? "Import complete" : "Import needs attention"}</p><p className="text-xs text-text-muted">Imported {result.imported || 0} entries: {result.credentials?.imported || 0} encrypted credentials and {result.accounts?.imported || 0} encrypted OAuth accounts.{result.failed > 0 ? ` ${result.failed} entries were not imported.` : ""}</p>{result.error && <p className="text-xs text-danger mt-1">{result.error}</p>}</div></div></div>}

        <div className="rounded-lg bg-surface-2 border border-border-subtle p-3 text-xs text-text-muted"><p className="font-medium text-text-main mb-1">Accepted file fields</p><p><code>provider, apiKey/key/token, label, expiresAt</code> for credentials; <code>provider, accessToken, refreshToken, email, label, expiresAt</code> for official OAuth accounts. Passwords, cookies, browser sessions, private headers, and authorization-header dumps are rejected.</p></div>

        <div className="flex gap-3">{result?.success ? <Button variant="primary" fullWidth onClick={handleClose}>Done</Button> : <><Button variant="primary" fullWidth onClick={handleImport} disabled={!file || preview?.error || preview?.loading || importing} loading={importing}>Encrypt & import</Button><Button variant="ghost" onClick={handleClose}>Cancel</Button></>}</div>
      </div>
    </Modal>
  );
}
