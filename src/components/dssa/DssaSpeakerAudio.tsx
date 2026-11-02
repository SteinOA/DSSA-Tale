import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
export default function DssaSpeakerAudio({ noteId, speaker }: { noteId: number; speaker: string }) {
  const { t } = useTranslation();
  const [available, setAvailable] = useState(false),
    [samples, setSamples] = useState<Array<{ start: number; end: number }>>([]),
    [index, setIndex] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [url, setUrl] = useState("");
  const audio = useRef<HTMLAudioElement>(null),
    seq = useRef(0);
  const invalidate = useCallback(() => {
    seq.current++;
  }, []);
  const player = useCallback((node: HTMLAudioElement | null) => {
    if (audio.current !== node) audio.current?.pause();
    audio.current = node;
  }, []);
  useEffect(() => {
    const run = ++seq.current;
    setUrl("");
    setError("");
    setIndex(0);
    setBusy(false);
    void window.dssaAPI
      ?.speakerSamples(noteId, speaker)
      .then((r) => {
        if (run !== seq.current) return;
        if (r.error) setError(r.error);
        setAvailable(!!r.available);
        setSamples(r.samples || []);
      })
      .catch(() => {
        if (run === seq.current) setError(t("dssa.speakerAudioFailed"));
      });
    return invalidate;
  }, [noteId, speaker, invalidate, t]);
  const play = async () => {
    const run = seq.current;
    setBusy(true);
    setError("");
    try {
      const result = await window.dssaAPI.speakerClip(noteId, speaker, index);
      if (run !== seq.current) return;
      if (result.error || !result.audioBase64)
        throw Error(result.error || t("dssa.speakerAudioFailed"));
      setUrl("data:audio/wav;base64," + result.audioBase64);
    } catch (e) {
      if (run === seq.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (run === seq.current) setBusy(false);
    }
  };
  const stamp = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{t("dssa.speakerListenHint")}</p>
      {!available && (
        <Button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await window.dssaAPI.speakerAttach(noteId);
              if (r.error) throw Error(r.error);
              if (r.success) setAvailable(true);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("dssa.speakerAttach")}
        </Button>
      )}
      {!!samples.length && (
        <>
          <select
            aria-label={t("dssa.speakerSample")}
            className="w-full rounded-md border p-2"
            value={index}
            onChange={(e) => {
              audio.current?.pause();
              setUrl("");
              setIndex(Number(e.target.value));
            }}
          >
            {samples.map((sample, i) => (
              <option key={i} value={i}>
                {t("dssa.speakerSample")} {i + 1}: {stamp(sample.start)}–{stamp(sample.end)}
              </option>
            ))}
          </select>
          <Button type="button" disabled={!available || busy} onClick={() => void play()}>
            {t("dssa.speakerListen")}
          </Button>
        </>
      )}
      {!samples.length && <p className="text-xs">{t("dssa.speakerNoTime")}</p>}
      {url && (
        <audio
          ref={player}
          controls
          autoPlay
          src={url}
          className="w-full"
          aria-label={t("dssa.speakerSample")}
        />
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
