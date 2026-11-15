const fs = require("node:fs");
const path = require("node:path");
const guide = require("../src/config/dssaUserGuide.json");
const text =
  [
    guide.title,
    "",
    guide.intro,
    ...guide.sections.flatMap((section) => [
      "",
      section.title,
      "-".repeat(section.title.length),
      ...(section.steps || []).map((step, index) => `${index + 1}. ${step}`),
      ...(section.paragraphs || []).flatMap((paragraph) => ["", paragraph]),
    ]),
  ].join("\n") + "\n";
fs.writeFileSync(path.join(__dirname, "../docs/BRUKSANVISNING-WINDOWS.txt"), text, "utf8");
console.log(`Exported ${guide.sections.length} chapters to docs/BRUKSANVISNING-WINDOWS.txt`);
