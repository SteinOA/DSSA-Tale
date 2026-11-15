import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

export type DssaHelpTopic =
  "google" | "microsoft" | "apple" | "link" | "libraries" | "model" | "export" | "connections";

export default function DssaHelpButton({ topic }: { topic: DssaHelpTopic }) {
  const { t } = useTranslation();
  const title = t(`dssaHelp.${topic}.title`);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          data-brand={["google", "microsoft", "apple", "link"].includes(topic) ? topic : undefined}
          variant="outline"
          size="icon"
          className="h-7 w-7 rounded-full text-sm font-bold"
          aria-label={t("dssaHelp.about", { title })}
          title={t("dssaHelp.about", { title })}
        >
          <span aria-hidden="true">?</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        className="w-80 max-w-[calc(100vw-2rem)] p-4 text-sm leading-relaxed"
      >
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-2">{t(`dssaHelp.${topic}.text`)}</p>
        <p className="mt-3 text-xs text-muted-foreground">{t("dssaHelp.dismiss")}</p>
      </PopoverContent>
    </Popover>
  );
}
