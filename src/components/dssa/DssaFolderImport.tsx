import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import { FolderOpen } from "../icons";

type FolderFile = { name: string; path: string; sizeBytes: number };

export default function DssaFolderImport({
  disabled,
  onFiles,
}: {
  disabled: boolean;
  onFiles: (files: FolderFile[]) => number;
}) {
  const { t } = useTranslation();
  const [recursive, setRecursive] = useState(
    () => localStorage.getItem("dssa-folder-import-recursive") !== "false"
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [warnings, setWarnings] = useState<Array<{ name: string; code: string }>>([]);
  const active = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (active.current) void window.electronAPI.cancelAudioFolderScan();
    };
  }, []);
  const choose = async () => {
    if (active.current || disabled) return;
    active.current = true;
    setBusy(true);
    setFailed(false);
    setMessage("");
    setWarnings([]);
    try {
      const result = await window.electronAPI.selectAudioFolder({ recursive });
      if (!mounted.current) return;
      if (result.canceled) {
        setMessage(t("dssaFolderImport.cancelled"));
        return;
      }
      if (result.error) throw Error(result.error);
      const files = result.files ?? [];
      const added = onFiles(files);
      setWarnings(result.warnings ?? []);
      setMessage(
        t("dssaFolderImport.result", {
          found: files.length,
          added,
          duplicates: files.length - added,
          skipped: result.skippedCount ?? 0,
          warnings: result.warningCount ?? 0,
        })
      );
    } catch (error) {
      if (mounted.current) {
        setFailed(true);
        setMessage(error instanceof Error ? error.message : t("dssaFolderImport.failed"));
      }
    } finally {
      active.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <section
      aria-label={t("dssaFolderImport.title")}
      className="my-5 space-y-3 rounded-xl border border-border p-4"
    >
      <h3 className="font-semibold">{t("dssaFolderImport.title")}</h3>
      <p className="text-sm text-muted-foreground">{t("dssaFolderImport.description")}</p>
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={recursive}
          disabled={busy || disabled}
          onChange={(event) => {
            setRecursive(event.target.checked);
            localStorage.setItem("dssa-folder-import-recursive", String(event.target.checked));
          }}
        />
        {t("dssaFolderImport.recursive")}
      </label>
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" disabled={busy || disabled} onClick={() => void choose()}>
          <FolderOpen size={16} aria-hidden="true" />
          {t("dssaFolderImport.choose")}
        </Button>
        {busy && (
          <Button variant="outline" onClick={() => void window.electronAPI.cancelAudioFolderScan()}>
            {t("dssaFolderImport.cancel")}
          </Button>
        )}
      </div>
      {busy && (
        <p role="status" className="text-sm">
          {t("dssaFolderImport.scanning")}
        </p>
      )}
      {message && (
        <p role={failed ? "alert" : "status"} className="text-sm">
          {message}
        </p>
      )}
      {warnings.length > 0 && (
        <details className="text-sm">
          <summary>{t("dssaFolderImport.warnings")}</summary>
          <ul className="mt-2 list-disc break-all ps-5">
            {warnings.map((warning, index) => (
              <li key={index}>
                {warning.name} ({warning.code})
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-xs text-muted-foreground">{t("dssaFolderImport.hint")}</p>
    </section>
  );
}
