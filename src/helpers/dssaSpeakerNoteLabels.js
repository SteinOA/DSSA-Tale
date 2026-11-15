const { formatTimestamp } = require("./speakerMerge");

const htmlEscape = (value) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]
  );
const markdownEscape = (value) => value.replace(/([\\`*_[\]<>])/g, "\\$1");

// Update only generated speaker headers whose original clock belongs to this
// cluster. Never rewrite the spoken words, annotations, or another cluster
// sharing the same display name. Existing note markup is preserved bytewise.
function renameUploadSpeakerLabels(note, mappings, speakerId, displayName) {
  if (note?.note_type !== "upload" || typeof note.content !== "string") return note?.content;
  let segments;
  try {
    segments = JSON.parse(note.transcript);
  } catch {
    return note.content;
  }
  if (!Array.isArray(segments)) return note.content;
  const timed = segments.filter((s) => Number.isFinite(s.timestamp));
  const anchor =
    timed.find((s) => Number.isFinite(s.audioStartTimestamp))?.audioStartTimestamp ??
    Math.min(...timed.map((s) => s.timestamp));
  const rich = /<\/?(?:p|div|br|span|strong|em|ul|ol|li)\b/i.test(note.content);
  const encode = rich ? htmlEscape : (value) => value;
  const owners = new Map();
  const key = (label, from, to) => `${label}\0${from}\0${to}`;
  for (const segment of timed) {
    if (!segment.speaker || !Number.isFinite(segment.endTimestamp)) continue;
    const match = /^speaker_(\d+)$/.exec(segment.speaker);
    const aliases = new Set(
      [
        mappings.find((m) => m.speaker_id === segment.speaker)?.display_name,
        segment.speakerName,
        ...(match
          ? ["Taler", "Talar", "Speaker"].map((prefix) => `${prefix} ${Number(match[1]) + 1}`)
          : []),
      ].filter((value) => typeof value === "string" && value)
    );
    const from = formatTimestamp((segment.timestamp - anchor) / 1000);
    const to = formatTimestamp((segment.endTimestamp - anchor) / 1000);
    for (const label of aliases) {
      for (const encoded of new Set([encode(label), ...(rich ? [] : [markdownEscape(label)])])) {
        const id = key(encoded, from, to);
        if (!owners.has(id)) owners.set(id, new Set());
        owners.get(id).add(segment.speaker);
      }
    }
  }
  return note.content.replace(
    /(^|\n|>)([ \t]*)(\\?\[)([^\r\n]*?)(\\?\])([ \t]+)((?:\d+:)?\d+:\d{2})([ \t]*[-–][ \t]*)((?:\d+:)?\d+:\d{2})/g,
    (header, prefix, space, opening, label, closing, gap, from, separator, to) => {
      const ids = owners.get(key(label, from, to));
      const name =
        !rich && opening.startsWith("\\") ? markdownEscape(displayName) : encode(displayName);
      return ids?.size === 1 && ids.has(speakerId)
        ? `${prefix}${space}${opening}${name}${closing}${gap}${from}${separator}${to}`
        : header;
    }
  );
}

function syncUploadSpeakerLabels(note, mappings) {
  let content = note?.content;
  for (const mapping of mappings || []) {
    if (typeof mapping.display_name !== "string" || !mapping.display_name.trim()) continue;
    content = renameUploadSpeakerLabels(
      { ...note, content },
      mappings,
      mapping.speaker_id,
      mapping.display_name
    );
  }
  return content;
}

module.exports = { renameUploadSpeakerLabels, syncUploadSpeakerLabels };
