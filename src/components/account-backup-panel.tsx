"use client";

import { useEffect, useState } from "react";
import { Button, ProgressModal } from "@/components/ui";

type Manifest = {
  createdAt: string;
  encrypted: boolean;
  files: Array<{ category: string; sizeBytes: number }>;
};

const BACKUP_PHASES = [
  "Creating a consistent database snapshot",
  "Packaging resumes, generated documents, and scanner history",
  "Finishing the portable archive",
];

export function AccountBackupPanel() {
  const [password, setPassword] = useState("");
  const [acknowledgePlaintext, setAcknowledgePlaintext] = useState(false);
  const [status, setStatus] = useState("");
  const [restorePassword, setRestorePassword] = useState("");
  const [archive, setArchive] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ token: string; manifest: Manifest } | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [backupDialog, setBackupDialog] = useState<{
    state: "working" | "error";
    message?: string;
  } | null>(null);
  const [backupPhase, setBackupPhase] = useState(0);

  useEffect(() => {
    if (backupDialog?.state !== "working") return;
    const timer = window.setInterval(() => {
      setBackupPhase((current) => Math.min(current + 1, BACKUP_PHASES.length - 1));
    }, 1600);
    return () => window.clearInterval(timer);
  }, [backupDialog]);

  async function createBackup() {
    setStatus("");
    setBackupPhase(0);
    setBackupDialog({ state: "working" });
    try {
      const response = await fetch("/api/account-backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, acknowledgePlaintext }),
      });
      const result = await response.json() as { error?: string; downloadUrl?: string };
      if (!response.ok || !result.downloadUrl) throw new Error(result.error ?? "Backup failed.");
      setBackupDialog(null);
      setStatus("Backup created. Download starting...");
      window.location.href = result.downloadUrl;
    } catch (error) {
      setBackupDialog({ state: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function inspectRestore() {
    if (!archive) return setStatus("Choose a .jst-backup file first.");
    setStatus("Inspecting backup...");
    const response = await fetch("/api/account-backups/inspect", {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", "X-JST-Backup-Password": encodeURIComponent(restorePassword) },
      body: archive,
    });
    const result = await response.json() as { error?: string; token?: string; manifest?: Manifest };
    if (!response.ok || !result.token || !result.manifest) return setStatus(result.error ?? "Backup inspection failed.");
    setPreview({ token: result.token, manifest: result.manifest });
    setStatus("Backup validated. Review the summary before restoring.");
  }

  async function restore() {
    if (!preview || !confirmReplace) return;
    setStatus("Creating rollback backup and restoring account...");
    const response = await fetch("/api/account-backups/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: preview.token, confirmReplace }),
    });
    const result = await response.json() as { error?: string; rollbackFilename?: string };
    if (!response.ok) return setStatus(result.error ?? "Restore failed.");
    setStatus(`Restore complete. Rollback saved as ${result.rollbackFilename}. Reloading...`);
    setTimeout(() => window.location.assign("/dashboard"), 700);
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-3 rounded-control border border-border bg-surface p-4">
        <div>
          <h3 className="text-sm font-semibold text-ink">Create account backup</h3>
          <p className="mt-1 text-xs leading-5 text-muted">Includes your database, resume files referenced by resume lanes, generated documents, approved source config, and scanner import history. Other files under assets are always ignored.</p>
        </div>
        <label className="grid max-w-md gap-1 text-sm text-ink">
          Password protection (optional)
          <input className="rounded-control border border-border bg-panel px-3 py-2" onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
        </label>
        {!password && (
          <label className="flex items-start gap-2 text-xs leading-5 text-muted">
            <input checked={acknowledgePlaintext} onChange={(event) => setAcknowledgePlaintext(event.target.checked)} type="checkbox" />
            I understand this unencrypted archive contains private resume data and locally stored provider credentials.
          </label>
        )}
        <div><Button disabled={backupDialog?.state === "working" || (!password && !acknowledgePlaintext)} onClick={createBackup}>Create and download backup</Button></div>
      </section>

      <section className="grid gap-3 rounded-control border border-border bg-surface p-4">
        <div>
          <h3 className="text-sm font-semibold text-ink">Restore account backup</h3>
          <p className="mt-1 text-xs leading-5 text-muted">Restore replaces current managed account data. The app creates a rollback backup first.</p>
        </div>
        <input accept=".jst-backup" className="text-sm text-ink" onChange={(event) => { setArchive(event.target.files?.[0] ?? null); setPreview(null); }} type="file" />
        <label className="grid max-w-md gap-1 text-sm text-ink">
          Backup password, if used
          <input className="rounded-control border border-border bg-panel px-3 py-2" onChange={(event) => setRestorePassword(event.target.value)} type="password" value={restorePassword} />
        </label>
        <div><Button onClick={inspectRestore} variant="secondary">Inspect backup</Button></div>
        {preview && (
          <div className="grid gap-3 rounded-control border border-warning/35 bg-warning/8 p-3">
            <p className="text-sm text-ink">Created {preview.manifest.createdAt}. {preview.manifest.files.length} managed files. {preview.manifest.encrypted ? "Password protected." : "Unencrypted."}</p>
            <label className="flex items-start gap-2 text-xs leading-5 text-muted">
              <input checked={confirmReplace} onChange={(event) => setConfirmReplace(event.target.checked)} type="checkbox" />
              Replace my current local account snapshot after creating an automatic rollback backup.
            </label>
            <div><Button disabled={!confirmReplace} onClick={restore} variant="primary">Restore this backup</Button></div>
          </div>
        )}
      </section>
      {status && <p aria-live="polite" className="text-xs text-muted">{status}</p>}
      <ProgressModal
        open={!!backupDialog}
        phase={backupDialog?.state === "working" ? "running" : "done"}
        title={backupDialog?.state === "working" ? "Creating account backup" : "Backup could not be created"}
        message={BACKUP_PHASES[backupPhase]}
        subtitle="Keep this window open while the local archive is prepared."
        error={backupDialog?.state === "error" ? (backupDialog.message ?? "Backup failed.") : null}
        onClose={() => setBackupDialog(null)}
      />
    </div>
  );
}
