import { useState, useEffect, useCallback, useRef } from "react";
import DssaSpeakerAudio from "../dssa/DssaSpeakerAudio";
import { useTranslation } from "react-i18next";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Users } from "../icons";
import type { TranscriptSegment } from "../../stores/meetingRecordingStore";
import { resolveSegmentSpeakerName } from "../../utils/transcriptSpeakerState";

export function UploadSpeakerNames({
  segments,
  mappings,
  onRename,
  detailed,
  onDetailedChange,
  noteId,
  focusSpeaker,
}: {
  segments: TranscriptSegment[];
  mappings: Record<string, string>;
  onRename: (id: string, name: string) => Promise<void>;
  detailed: boolean;
  onDetailedChange: (value: boolean) => void;
  noteId?: number;
  focusSpeaker?: { id: string; requestId: string } | null;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const speakers = [...new Set(segments.flatMap((s) => (s.speaker ? [s.speaker] : [])))];
  const label = (id: string) =>
    t("notes.speaker.label", { n: Number(id.match(/speaker_(\d+)/)?.[1] ?? 0) + 1 });
  const choose = useCallback(
    (id: string) => {
      setSelected(id);
      setName(mappings[id] || segments.find((s) => s.speaker === id)?.speakerName || "");
      setError(false);
    },
    [mappings, segments]
  );
  const focusedRequest = useRef("");
  useEffect(() => {
    if (
      focusSpeaker &&
      focusSpeaker.requestId !== focusedRequest.current &&
      segments.some((s) => s.speaker === focusSpeaker.id)
    ) {
      focusedRequest.current = focusSpeaker.requestId;
      choose(focusSpeaker.id);
      setOpen(true);
    }
  }, [focusSpeaker, choose, segments]);
  if (!speakers.length) return null;
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) choose(speakers.includes(selected) ? selected : speakers[0]);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
        >
          <Users size={16} />
          {t("notes.speaker.manageNames")}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto p-4">
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!selected || !name.trim() || saving) return;
            setSaving(true);
            setError(false);
            try {
              await onRename(selected, name.trim());
              setOpen(false);
            } catch {
              setError(true);
            } finally {
              setSaving(false);
            }
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            {t("notes.speaker.chooseSpeaker")}
            <select
              value={selected}
              disabled={saving}
              onChange={(e) => choose(e.target.value)}
              className="rounded-md border border-border bg-background p-2 text-foreground"
            >
              {speakers.map((id) => (
                <option key={id} value={id}>
                  {label(id)}
                  {mappings[id] ? ` — ${mappings[id]}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("notes.speaker.nameLabel")}
            <input
              autoFocus
              value={name}
              maxLength={120}
              disabled={saving}
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border border-border bg-background p-2 text-foreground"
            />
          </label>
          <p className="text-xs text-muted-foreground">{t("notes.speaker.renameScope")}</p>
          {noteId && selected && <DssaSpeakerAudio noteId={noteId} speaker={selected} />}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={detailed}
              onChange={(e) => onDetailedChange(e.target.checked)}
            />
            {t("notes.speaker.detailedControl")}
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {t("notes.speaker.renameFailed")}
            </p>
          )}
          <button type="submit" disabled={saving || !name.trim()} className="rounded-md px-3 py-2">
            {t("notes.speaker.save")}
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

// Normal document flow lets the user read and scroll freely instead of a
// chat scroller that anchors at the final utterance.
export function UploadTranscriptText({
  segments,
  mappings,
  onSelectSpeaker,
}: {
  segments: TranscriptSegment[];
  mappings: Record<string, string>;
  onSelectSpeaker?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const blocks: Array<{ key: string; speaker?: string; name?: string; texts: string[] }> = [];
  for (const segment of segments) {
    const name = resolveSegmentSpeakerName(segment, mappings);
    const previous = blocks.at(-1);
    if (previous && previous.speaker === segment.speaker && previous.name === name)
      previous.texts.push(segment.text);
    else blocks.push({ key: segment.id, speaker: segment.speaker, name, texts: [segment.text] });
  }
  return (
    <div className="px-5 py-5 pb-32 space-y-4 select-text">
      {blocks.map((block) => (
        <p key={block.key} className="text-base leading-relaxed [overflow-wrap:anywhere]">
          <strong className="font-semibold">
            {block.speaker && onSelectSpeaker ? (
              <button
                type="button"
                onClick={() => onSelectSpeaker(block.speaker!)}
                className="mr-2 rounded-md px-2 py-1 text-sm"
                title={t("notes.speaker.manageNames")}
              >
                {block.name ||
                  t("notes.speaker.label", {
                    n: Number(block.speaker.match(/speaker_(\d+)/)?.[1] ?? 0) + 1,
                  })}
              </button>
            ) : (
              <>
                {block.name ||
                  (block.speaker
                    ? t("notes.speaker.label", {
                        n: Number(block.speaker.match(/speaker_(\d+)/)?.[1] ?? 0) + 1,
                      })
                    : t("notes.speaker.unknownLabel"))}
                :{" "}
              </>
            )}
          </strong>
          {block.texts.join(" ")}
        </p>
      ))}
    </div>
  );
}
