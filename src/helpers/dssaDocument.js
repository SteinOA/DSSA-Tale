const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Footer,
  PageNumber,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
} = require("docx");
const MarkdownIt = require("markdown-it");
const md = new MarkdownIt({ html: false, linkify: false });
const { normalizeSegmentTimestamps } = require("./transcriptFormatter");

function timestamp(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60]
    .map((v) => String(v).padStart(2, "0"))
    .join(":");
}
function buildDocument(note, options = {}, mappings = {}) {
  const language =
    options.language === "nn" ? "nn-NO" : options.language === "en" ? "en-US" : "nb-NO";
  const label =
    language === "nn-NO"
      ? { title: "Møtedokument", speaker: "Talar", unknown: "Ukjend talar" }
      : language === "en-US"
        ? { title: "Meeting document", speaker: "Speaker", unknown: "Unknown speaker" }
        : { title: "Møtedokument", speaker: "Taler", unknown: "Ukjent taler" };
  const title = String(note.title || label.title);
  const rawDate = note.created_at;
  const date = new Date(typeof rawDate === "number" && rawDate < 1e12 ? rawDate * 1000 : rawDate);
  const dateText = Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(language);
  const lines = [];
  if (options.source === "transcript") {
    let segments;
    try {
      segments = JSON.parse(note.transcript || "[]");
    } catch {
      throw Error("Utskriften har ugyldig format. Originalnotatet er beholdt.");
    }
    if (Array.isArray(segments) && segments.length) {
      const speakers = new Map();
      for (const seg of normalizeSegmentTimestamps(segments, note)) {
        const key = seg.speaker || seg.source || "unknown";
        if (key !== "unknown" && !speakers.has(key))
          speakers.set(key, `${label.speaker} ${speakers.size + 1}`);
        const name =
          mappings[seg.speaker] ||
          (!seg.speakerIsPlaceholder && seg.speakerName) ||
          (key === "unknown" ? label.unknown : speakers.get(key));
        const prefix = [
          options.timestamps ? `[${timestamp(seg.timestamp)}]` : "",
          options.speakers ? `${name}:` : "",
        ]
          .filter(Boolean)
          .join(" ");
        lines.push(`${prefix ? prefix + " " : ""}${String(seg.text || "")}`);
      }
    } else lines.push(String(note.content || ""));
  } else {
    const content = options.source === "summary" ? note.enhanced_content : note.content;
    if (!content?.trim())
      throw Error(
        options.source === "summary"
          ? "Lag eller skriv et referat før du eksporterer det."
          : "Notatet har ingen tekst å eksportere."
      );
    lines.push(content);
  }
  const body = lines.join("\n\n");
  if (!body.trim()) throw Error("Dokumentet er tomt.");
  return { title, date: dateText, body, language };
}
function plainText(document) {
  // Inline markdown is rendered as text without deleting literal underscores/math.
  const tokens = md.parse(document.body, {});
  const lines = tokens
    .filter((t) => ["inline", "fence", "code_block"].includes(t.type))
    .map((t) =>
      t.type !== "inline"
        ? t.content
        : (t.children || [])
            .map((c) =>
              c.type === "softbreak" || c.type === "hardbreak"
                ? "\n"
                : ["text", "code_inline"].includes(c.type)
                  ? c.content
                  : ""
            )
            .join("")
    );
  return [document.title, document.date, "", ...lines].join("\n");
}
async function createDocx(document) {
  const tokens = md.parse(document.body, {});
  const children = [
    new Paragraph({ text: document.title, heading: HeadingLevel.TITLE }),
    new Paragraph({ text: document.date, spacing: { after: 260 } }),
  ];
  let heading,
    bulletDepth = 0;
  let rows = null,
    cells = null,
    cellParagraphs = null,
    inTableHeader = false;
  for (const token of tokens) {
    if (token.type === "table_open") {
      rows = [];
      continue;
    }
    if (token.type === "thead_open") {
      inTableHeader = true;
      continue;
    }
    if (token.type === "thead_close") {
      inTableHeader = false;
      continue;
    }
    if (token.type === "tr_open") {
      cells = [];
      continue;
    }
    if (token.type === "td_open" || token.type === "th_open") {
      cellParagraphs = [];
      continue;
    }
    if (token.type === "td_close" || token.type === "th_close") {
      cells.push(
        new TableCell({
          children: cellParagraphs.length ? cellParagraphs : [new Paragraph("")],
          ...(inTableHeader ? { shading: { fill: "E8EEF5" } } : {}),
        })
      );
      cellParagraphs = null;
      continue;
    }
    if (token.type === "tr_close") {
      rows.push(new TableRow({ children: cells, tableHeader: inTableHeader }));
      continue;
    }
    if (token.type === "table_close") {
      children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
      rows = null;
      continue;
    }
    if (token.type === "heading_open") heading = Number(token.tag.slice(1));
    if (token.type === "bullet_list_open" || token.type === "ordered_list_open") bulletDepth++;
    if (token.type === "bullet_list_close" || token.type === "ordered_list_close") bulletDepth--;
    if (token.type === "fence" || token.type === "code_block")
      children.push(new Paragraph({ text: token.content }));
    if (token.type !== "inline") continue;
    let bold = false,
      italics = false;
    const runs = [];
    for (const inline of token.children || []) {
      if (inline.type === "strong_open") bold = true;
      else if (inline.type === "strong_close") bold = false;
      else if (inline.type === "em_open") italics = true;
      else if (inline.type === "em_close") italics = false;
      else if (["softbreak", "hardbreak"].includes(inline.type))
        runs.push(new TextRun({ break: 1 }));
      else if (["text", "code_inline"].includes(inline.type))
        runs.push(new TextRun({ text: inline.content, bold, italics }));
    }
    const paragraph = new Paragraph({
      children: runs,
      ...(heading
        ? {
            heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][
              Math.min(heading, 3) - 1
            ],
          }
        : {}),
      ...(bulletDepth ? { bullet: { level: Math.min(bulletDepth - 1, 8) } } : {}),
      spacing: { after: 140, line: 276 },
    });
    if (cellParagraphs) cellParagraphs.push(paragraph);
    else children.push(paragraph);
    heading = undefined;
  }
  const doc = new Document({
    creator: "DSSA Tale",
    title: document.title,
    styles: {
      default: {
        document: {
          run: { font: "Aptos", size: 22, language: { value: document.language || "nb-NO" } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ children: [PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES] }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
function documentHtml(document) {
  const escape = (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const language = ["nn-NO", "en-US", "nb-NO"].includes(document.language)
    ? document.language
    : "nb-NO";
  return `<!doctype html><html lang="${language}"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>@page{size:A4;margin:20mm}body{font:11pt/1.5 Arial,sans-serif;color:#182737}h1{font-size:24pt}h2{font-size:16pt;break-after:avoid}h3{font-size:13pt;break-after:avoid}p,li{overflow-wrap:anywhere}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bdc8d2;padding:6pt;text-align:left}pre{white-space:pre-wrap}img{display:none}</style><body><h1>${escape(document.title)}</h1><p>${escape(document.date)}</p>${md.render(document.body)}</body></html>`;
}
async function createPdf(document) {
  const { BrowserWindow } = require("electron");
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      javascript: false,
    },
  });
  try {
    await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(documentHtml(document)));
    return await win.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate:
        '<div style="font-size:9px;width:100%;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });
  } finally {
    win.destroy();
  }
}
module.exports = { buildDocument, plainText, createDocx, createPdf, documentHtml, timestamp };
