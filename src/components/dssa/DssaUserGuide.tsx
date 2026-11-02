import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import guide from "../../config/dssaUserGuide.json";

export default function DssaUserGuide({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const search = query.trim().toLocaleLowerCase("nb-NO");
  const sections = guide.sections.filter((section) =>
    [section.title, ...(section.paragraphs || []), ...(section.steps || [])]
      .join(" ")
      .toLocaleLowerCase("nb-NO")
      .includes(search)
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        lang="nb"
        className="w-[calc(100%-2rem)] max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
      >
        <DialogHeader className="shrink-0 pr-7">
          <DialogTitle>{guide.title}</DialogTitle>
          <DialogDescription>{guide.intro}</DialogDescription>
        </DialogHeader>
        <label className="grid gap-2 text-sm shrink-0">
          <span>Søk i bruksanvisningen</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="For eksempel nynorsk, Teams eller Word"
            className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
          />
        </label>
        <div
          className="min-h-0 overflow-y-auto pr-3 space-y-4 text-sm leading-relaxed"
          aria-label="Bruksanvisningens innhold"
        >
          {sections.length === 0 && <p role="status">Ingen treff. Prøv et annet søkeord.</p>}
          {sections.map((section) => (
            <details
              key={section.id}
              open={search ? true : undefined}
              className="rounded-lg border border-border p-3"
            >
              <summary className="cursor-pointer font-semibold text-foreground">
                {section.title}
              </summary>
              <div className="mt-3 space-y-3 text-foreground">
                {section.steps && (
                  <ol className="list-decimal pl-5 space-y-2">
                    {section.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                )}
                {section.paragraphs?.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </details>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
