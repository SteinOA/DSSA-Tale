import { useState } from "react";
import { useTranslation } from "react-i18next";
import { createDssaTranslator } from "../../utils/dssaTranslation";
export default function DssaMeetingMode({ disabled }: { disabled: boolean }) {
  const { i18n } = useTranslation();
  const tr = createDssaTranslator(i18n);
  const [mode, setMode] = useState(localStorage.getItem("dssaMeetingMode") || "live");
  return (
    <select
      disabled={disabled}
      aria-label={tr("Transkribering av møte", "Meeting transcription")}
      className="h-[30px] max-w-44 rounded-md border border-border bg-background px-2 text-xs"
      value={mode}
      onChange={(e) => {
        setMode(e.target.value);
        localStorage.setItem("dssaMeetingMode", e.target.value);
      }}
    >
      <option value="live">{tr("Transkriber underveis", "Transcribe live")}</option>
      <option value="after">{tr("Transkriber etter møtet", "Transcribe after meeting")}</option>
    </select>
  );
}
