"use client";

import { useState, useRef } from "react";
import { Modal, Button, Badge } from "@/components/shared";
import { cn } from "@/lib/cn";

/**
 * ImportModal Component
 * Multi-format file upload modal with preview and auto-detection
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Modal open state
 * @param {Function} props.onClose - Close handler
 * @param {Function} props.onImportComplete - Callback after successful import
 */
export default function ImportModal({ isOpen, onClose, onImportComplete }) {
  const [file, setFile] = useState(null);
  const [format, setFormat] = useState("auto");
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = async (selectedFile) => {
    if (!selectedFile) return;

    setFile(selectedFile);
    setResult(null);

    // Read and parse file
    try {
      const text = await selectedFile.text();
      const data = JSON.parse(text);

      // Auto-detect format
      let detectedFormat = format;
      if (format === "auto") {
        if (data.accounts && Array.isArray(data.accounts)) {
          detectedFormat = "9router";
        } else if (data.connections && Array.isArray(data.connections)) {
          detectedFormat = "OMNIROUTER";
        } else if (Array.isArray(data)) {
          detectedFormat = "lln";
        }
      }

      // Generate preview
      const accounts = data.accounts || data.connections || (Array.isArray(data) ? data : []);
      setPreview({
        format: detectedFormat,
        count: accounts.length,
        sample: accounts.slice(0, 3),
      });
    } catch (error) {
      setPreview({
        error: "Failed to parse file. Please ensure it's valid JSON.",
        details: error.message,
      });
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleImport = async () => {
    if (!file) return;

    setImporting(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("format", format);

      const res = await fetch("/api/accounts/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        setResult({
          success: true,
          ...data,
        });

        // Call completion callback after delay
        if (onImportComplete) {
          setTimeout(() => {
            onImportComplete(data);
          }, 2000);
        }
      } else {
        setResult({
          success: false,
          error: data.error || "Import failed",
        });
      }
    } catch (error) {
      setResult({
        success: false,
        error: "Network error. Please try again.",
        details: error.message,
      });
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setFormat("auto");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Import Accounts" size="lg">
      <div className="space-y-4">
        {/* Format Selection */}
        <div>
          <label className="block text-sm font-medium text-text-main mb-2">
            Format
          </label>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className="w-full h-10 rounded-lg bg-surface-2 border border-border text-text-main px-3 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            disabled={importing || result?.success}
          >
            <option value="auto">Auto-detect</option>
            <option value="9router">9Router</option>
            <option value="OMNIROUTER">OMNIROUTER</option>
            <option value="lln">LLN Proxy</option>
          </select>
        </div>

        {/* File Upload Area */}
        {!result?.success && (
          <div
            className={cn(
              "relative border-2 border-dashed rounded-xl p-8 transition-colors",
              dragActive
                ? "border-brand-500 bg-brand-500/5"
                : "border-border-subtle hover:border-brand-500/50"
            )}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={(e) => handleFileSelect(e.target.files[0])}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={importing}
            />

            <div className="text-center pointer-events-none">
              <div className="size-12 rounded-2xl bg-brand-500/10 flex items-center justify-center mx-auto mb-3">
                <span className="material-symbols-outlined text-[28px] text-brand-400">
                  upload_file
                </span>
              </div>
              <p className="text-sm font-medium text-text-main mb-1">
                {file ? file.name : "Drop your file here or click to browse"}
              </p>
              <p className="text-xs text-text-muted">
                Supports .json files (9Router, OMNIROUTER, LLN formats)
              </p>
            </div>
          </div>
        )}

        {/* Preview */}
        {preview && !result && (
          <div className="rounded-xl bg-surface-2 border border-border-subtle p-4">
            {preview.error ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-danger text-[20px]">error</span>
                  <p className="text-sm font-medium text-danger">{preview.error}</p>
                </div>
                {preview.details && (
                  <p className="text-xs text-text-muted pl-7">{preview.details}</p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-text-main">Preview</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="info" size="sm">{preview.format}</Badge>
                    <Badge variant="neutral" size="sm">{preview.count} accounts</Badge>
                  </div>
                </div>

                {preview.sample && preview.sample.length > 0 && (
                  <div className="space-y-2">
                    {preview.sample.map((acct, idx) => (
                      <div
                        key={idx}
                        className="text-xs text-text-muted bg-surface border border-border-subtle rounded-lg p-2"
                      >
                        {acct.email || acct.username || `Account ${idx + 1}`}
                        {acct.tier && ` · ${acct.tier}`}
                      </div>
                    ))}
                    {preview.count > 3 && (
                      <p className="text-xs text-text-subtle text-center">
                        + {preview.count - 3} more accounts
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Import Result */}
        {result && (
          <div
            className={cn(
              "rounded-xl border p-4",
              result.success
                ? "bg-emerald-500/5 border-emerald-500/20"
                : "bg-red-500/5 border-red-500/20"
            )}
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "material-symbols-outlined text-[24px] shrink-0",
                  result.success ? "text-emerald-400" : "text-danger"
                )}
              >
                {result.success ? "check_circle" : "error"}
              </span>
              <div className="flex-1">
                <p
                  className={cn(
                    "text-sm font-medium mb-1",
                    result.success ? "text-emerald-400" : "text-danger"
                  )}
                >
                  {result.success ? "Import Successful" : "Import Failed"}
                </p>
                {result.success ? (
                  <p className="text-xs text-text-muted">
                    Successfully imported {result.imported || 0} accounts
                    {result.skipped > 0 && ` · ${result.skipped} skipped (duplicates)`}
                  </p>
                ) : (
                  <div className="space-y-1">
                    <p className="text-xs text-text-muted">{result.error}</p>
                    {result.details && (
                      <p className="text-xs text-text-subtle">{result.details}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          {result?.success ? (
            <Button variant="primary" fullWidth onClick={handleClose}>
              Done
            </Button>
          ) : (
            <>
              <Button
                variant="primary"
                fullWidth
                onClick={handleImport}
                disabled={!file || preview?.error || importing}
                loading={importing}
              >
                Import
              </Button>
              <Button variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
