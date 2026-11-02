import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import {
  CONTENT_TEXT_SIZES,
  UI_TEXT_SIZES,
  readDssaTextSize,
  saveDssaTextSize,
  DSSA_TEXT_SIZE_KEY,
} from "../../utils/dssaTextSize";

export default function DssaTextSizeSettings() {
  const { t } = useTranslation();
  const [value, setValue] = useState(readDssaTextSize);
  useEffect(() => {
    const refresh = () => setValue(readDssaTextSize());
    const storage = (event: StorageEvent) => {
      if (event.key === DSSA_TEXT_SIZE_KEY || event.key === null) refresh();
    };
    window.addEventListener("storage", storage);
    window.addEventListener("dssa-text-size-changed", refresh);
    return () => {
      window.removeEventListener("storage", storage);
      window.removeEventListener("dssa-text-size-changed", refresh);
    };
  }, []);
  const update = (next: typeof value) => {
    saveDssaTextSize(next);
    setValue(next);
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        <label className="grid gap-2 min-w-40 text-xs font-medium">
          {t("dssaTextSize.ui")}
          <select
            className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
            value={value.ui}
            onChange={(event) => update({ ...value, ui: Number(event.target.value) })}
          >
            {UI_TEXT_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} %
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 min-w-40 text-xs font-medium">
          {t("dssaTextSize.content")}
          <select
            className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
            value={value.content}
            onChange={(event) => update({ ...value, content: Number(event.target.value) })}
          >
            {CONTENT_TEXT_SIZES.map((size) => (
              <option key={size} value={size}>
                {size === 0 ? t("dssaTextSize.standard") : `${size} px`}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-muted-foreground">{t("dssaTextSize.description")}</p>
      <p className="dssa-content-text rounded-md border border-border p-3 text-sm">
        {t("dssaTextSize.preview")}
      </p>
      <Button size="sm" variant="outline" onClick={() => update({ ui: 100, content: 0 })}>
        {t("dssaTextSize.reset")}
      </Button>
    </div>
  );
}
