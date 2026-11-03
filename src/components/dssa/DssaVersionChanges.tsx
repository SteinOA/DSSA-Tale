import notes from "../../config/dssaReleaseNotes.json";

export default function DssaVersionChanges({ installedVersion }: { installedVersion: string }) {
  const current = notes.find((entry) => entry.version === installedVersion);
  const installedIndex = notes.findIndex((entry) => entry.version === installedVersion);
  const previous = installedIndex >= 0 ? notes.slice(installedIndex + 1) : [];
  return (
    <section
      className="mt-4 space-y-3 rounded-lg border border-border p-4"
      aria-label="Versjonsendringer"
    >
      <h3 className="font-semibold">Endringer i installert versjon {installedVersion}</h3>
      {current ? (
        <ul className="list-disc space-y-2 ps-5 text-sm">
          {current.changes.map((change) => (
            <li key={change}>{change}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {installedVersion
            ? "Ingen lokal endringsoversikt følger for denne versjonen."
            : "Leser installert versjon …"}
        </p>
      )}
      {previous.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-medium">
            Tidligere versjonsendringer
          </summary>
          <div className="mt-3 space-y-4">
            {previous.map((entry) => (
              <div key={entry.version}>
                <h4 className="text-sm font-semibold">{entry.version}</h4>
                <ul className="mt-2 list-disc space-y-1 ps-5 text-sm">
                  {entry.changes.map((change) => (
                    <li key={change}>{change}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
