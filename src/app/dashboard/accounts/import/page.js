"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "@/components/shared";
import ImportModal from "@/components/accounts/ImportModal";

/**
 * Import Page
 * Wrapper for ImportModal with instructions and guidance
 */
export default function ImportPage() {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);

  const handleImportComplete = (result) => {
    // Close modal and redirect to accounts page after successful import
    setTimeout(() => {
      setModalOpen(false);
      router.push("/dashboard/accounts");
    }, 1500);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-main">Import Accounts</h1>
          <p className="text-text-muted text-sm mt-1">
            Import credentials from 9Router, OMNIROUTER, or LLN proxy formats
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon="arrow_back"
          onClick={() => router.push("/dashboard/accounts")}
        >
          Back to Accounts
        </Button>
      </div>

      {/* Instructions Card */}
      <Card>
        <div className="p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-text-main mb-3">How to Import</h2>
            <p className="text-sm text-text-muted mb-4">
              Kiro Proxy supports multiple account import formats. Follow these steps to import your accounts:
            </p>
          </div>

          {/* Steps */}
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="size-8 rounded-lg bg-brand-500/10 flex items-center justify-center shrink-0">
                <span className="text-brand-400 font-bold text-sm">1</span>
              </div>
              <div>
                <h3 className="text-sm font-medium text-text-main mb-1">Export from your proxy</h3>
                <p className="text-xs text-text-muted">
                  Export your accounts as JSON from 9Router, OMNIROUTER, or LLN proxy.
                  Make sure the file contains valid JSON data.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="size-8 rounded-lg bg-brand-500/10 flex items-center justify-center shrink-0">
                <span className="text-brand-400 font-bold text-sm">2</span>
              </div>
              <div>
                <h3 className="text-sm font-medium text-text-main mb-1">Upload your file</h3>
                <p className="text-xs text-text-muted">
                  Click the import button below and select your JSON file.
                  The format will be auto-detected based on file structure.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="size-8 rounded-lg bg-brand-500/10 flex items-center justify-center shrink-0">
                <span className="text-brand-400 font-bold text-sm">3</span>
              </div>
              <div>
                <h3 className="text-sm font-medium text-text-main mb-1">Review and confirm</h3>
                <p className="text-xs text-text-muted">
                  Preview your accounts before importing. Duplicates will be skipped automatically.
                  Your existing accounts will never be removed.
                </p>
              </div>
            </div>
          </div>

          {/* Supported Formats */}
          <div className="rounded-xl bg-surface-2 border border-border-subtle p-4">
            <h3 className="text-sm font-medium text-text-main mb-3">Supported Formats</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-brand-400 text-[16px]">check_circle</span>
                  <p className="text-xs font-medium text-text-main">9Router</p>
                </div>
                <p className="text-[10px] text-text-muted pl-6">
                  {"{ accounts: [...] }"}
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-brand-400 text-[16px]">check_circle</span>
                  <p className="text-xs font-medium text-text-main">OMNIROUTER</p>
                </div>
                <p className="text-[10px] text-text-muted pl-6">
                  {"{ connections: [...] }"}
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-brand-400 text-[16px]">check_circle</span>
                  <p className="text-xs font-medium text-text-main">LLN Proxy</p>
                </div>
                <p className="text-[10px] text-text-muted pl-6">
                  {"[{ email, password }]"}
                </p>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="flex justify-center pt-2">
            <Button
              variant="primary"
              size="lg"
              icon="upload_file"
              onClick={() => setModalOpen(true)}
            >
              Start Import
            </Button>
          </div>
        </div>
      </Card>

      {/* Important Notes */}
      <Card>
        <div className="p-4">
          <div className="flex gap-3">
            <span className="material-symbols-outlined text-amber-400 text-[20px] shrink-0">
              info
            </span>
            <div className="space-y-2">
              <p className="text-sm font-medium text-text-main">Important Notes</p>
              <ul className="text-xs text-text-muted space-y-1 list-disc pl-4">
                <li>Imports are additive - existing accounts are never removed or overwritten</li>
                <li>Duplicate accounts (same email) will be automatically skipped</li>
                <li>Password hashes are imported as-is and cannot be reversed to plaintext</li>
                <li>Account tiers will be preserved from the import file</li>
                <li>All imported accounts are marked as active by default</li>
              </ul>
            </div>
          </div>
        </div>
      </Card>

      {/* Import Modal */}
      <ImportModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onImportComplete={handleImportComplete}
      />
    </div>
  );
}
