import { Cloud } from "../icons";
import type { CloudSource } from "../../types/dssa";

export default function DssaCloudMark({ source }: { source: CloudSource }) {
  if (source === "google")
    return (
      <svg viewBox="0 0 24 24" className="size-5 shrink-0" aria-hidden="true" focusable="false">
        <path fill="#0F9D58" d="M8 2h8L8 16H0z" />
        <path fill="#F4B400" d="M16 2l8 14h-8L8 2z" />
        <path fill="#4285F4" d="M0 16h24l-4 7H4z" />
      </svg>
    );
  if (source === "microsoft")
    return (
      <svg viewBox="0 0 24 24" className="size-5 shrink-0" aria-hidden="true" focusable="false">
        <path fill="#F25022" d="M1 1h10v10H1z" />
        <path fill="#7FBA00" d="M13 1h10v10H13z" />
        <path fill="#00A4EF" d="M1 13h10v10H1z" />
        <path fill="#FFB900" d="M13 13h10v10H13z" />
      </svg>
    );
  return <Cloud className="size-5 shrink-0 text-sky-600 dark:text-sky-300" aria-hidden="true" />;
}
