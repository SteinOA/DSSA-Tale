// File imports only: join ASR segments to voices on the actual audio timeline.
// These thresholds are conservative matching rules, not model confidence.
const MIN_DOMINANT_SHARE = 0.75;
const MIN_VOICED_COVERAGE = 0.5;
const MAX_NEAREST_GAP_SECONDS = 0.5;
const EPSILON = 1e-6;

function checkRange(segment, kind) {
  if (
    !segment ||
    !Number.isFinite(segment.start) ||
    !Number.isFinite(segment.end) ||
    segment.start < 0 ||
    segment.end < segment.start
  )
    throw new TypeError(`Invalid ${kind} timestamps`);
}

function unionDuration(intervals) {
  let duration = 0,
    start,
    end;
  for (const interval of [...intervals].sort((a, b) => a.start - b.start)) {
    if (start === undefined) {
      start = interval.start;
      end = interval.end;
    } else if (interval.start <= end) end = Math.max(end, interval.end);
    else {
      duration += end - start;
      start = interval.start;
      end = interval.end;
    }
  }
  return duration + (start === undefined ? 0 : end - start);
}

function assignTimedSegment(segment, diarization) {
  const overlaps = diarization
    .filter((voice) => voice.start < segment.end && voice.end > segment.start)
    .map((voice) => ({
      start: Math.max(segment.start, voice.start),
      end: Math.min(segment.end, voice.end),
      speaker: voice.speaker,
    }));
  if (overlaps.length) {
    // Simultaneous voices cannot be split into words from segment timestamps.
    // Do not force one person's identity onto the other person's words.
    for (let left = 0; left < overlaps.length; left++)
      for (let right = left + 1; right < overlaps.length; right++)
        if (
          overlaps[left].speaker !== overlaps[right].speaker &&
          Math.min(overlaps[left].end, overlaps[right].end) -
            Math.max(overlaps[left].start, overlaps[right].start) >
            EPSILON
        )
          return { speakerAssignment: "ambiguous" };

    const bySpeaker = new Map();
    for (const overlap of overlaps) {
      const intervals = bySpeaker.get(overlap.speaker) || [];
      intervals.push(overlap);
      bySpeaker.set(overlap.speaker, intervals);
    }
    const ranked = [...bySpeaker]
      .map(([speaker, intervals]) => ({
        speaker,
        seconds: unionDuration(intervals),
      }))
      .sort((a, b) => b.seconds - a.seconds);
    const covered = unionDuration(overlaps);
    if (
      !ranked[0].speaker ||
      ranked[0].speaker === "unknown" ||
      ranked[0].seconds / covered < MIN_DOMINANT_SHARE ||
      covered / (segment.end - segment.start) < MIN_VOICED_COVERAGE
    )
      return { speakerAssignment: "ambiguous" };
    return { speaker: ranked[0].speaker, speakerAssignment: "overlap" };
  }

  // A tiny boundary gap may be VAD padding. A long silence is not evidence of
  // any speaker, and an equal-distance boundary between two voices is unknown.
  const distanceBySpeaker = new Map();
  for (const voice of diarization) {
    if (!voice.speaker || voice.speaker === "unknown") continue;
    const distance = Math.max(0, voice.start - segment.end, segment.start - voice.end);
    distanceBySpeaker.set(
      voice.speaker,
      Math.min(distance, distanceBySpeaker.get(voice.speaker) ?? Infinity)
    );
  }
  const nearest = [...distanceBySpeaker].sort((a, b) => a[1] - b[1]);
  if (!nearest.length || nearest[0][1] > MAX_NEAREST_GAP_SECONDS + EPSILON)
    return { speakerAssignment: "unknown" };
  if (nearest[1] && Math.abs(nearest[0][1] - nearest[1][1]) <= EPSILON)
    return { speakerAssignment: "ambiguous" };
  return { speaker: nearest[0][0], speakerAssignment: "nearest" };
}

function splitTimedWords(segment) {
  const words = segment.words;
  if (!Array.isArray(words) || !words.length) return null;
  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    if (
      !word ||
      typeof word.text !== "string" ||
      !Number.isFinite(word.start) ||
      !Number.isFinite(word.end) ||
      word.start < 0 ||
      word.end < word.start ||
      word.start < segment.start - 0.25 ||
      word.end > segment.end + 0.25
    )
      return null;
    if (index && word.start < words[index - 1].start - EPSILON) return null;
  }
  const normalize = (text) => text.replace(/\s+/g, " ").trim();
  const concatenated = words.map((word) => word.text).join("");
  let separator = "";
  if (normalize(concatenated) !== normalize(segment.text)) {
    // Some providers already supply complete words without their leading space.
    if (
      !words.every((word) => word.text.trim() && !/\s/.test(word.text.trim())) ||
      normalize(words.map((word) => word.text).join(" ")) !== normalize(segment.text)
    )
      return null;
    separator = " ";
  }
  let rawText = "";
  const ranges = words.map((word, index) => {
    if (index) rawText += separator;
    const from = rawText.length;
    rawText += word.text;
    return { ...word, from, to: rawText.length };
  });
  const rawWords = [...rawText.matchAll(/\S+/g)];
  const sourceWords = [...segment.text.matchAll(/\S+/g)];
  if (
    !rawWords.length ||
    rawWords.length !== sourceWords.length ||
    rawWords.some((word, index) => word[0] !== sourceWords[index][0])
  )
    return null;
  // If one timed token spans several words, no per-word times can be derived
  // honestly. Fall back to the coarse segment instead of splitting its clock.
  if (
    ranges.some(
      (range) =>
        rawWords.filter((word) => word.index < range.to && word.index + word[0].length > range.from)
          .length > 1
    )
  )
    return null;
  let cursor = 0;
  return rawWords.map((word, index) => {
    const pieces = ranges.filter(
      (range) => word.index < range.to && word.index + word[0].length > range.from
    );
    const sourceEnd =
      index === sourceWords.length - 1
        ? segment.text.length
        : sourceWords[index].index + sourceWords[index][0].length;
    const text = segment.text.slice(cursor, sourceEnd);
    cursor = sourceEnd;
    return {
      text,
      start: Math.min(...pieces.map((piece) => piece.start)),
      end: Math.max(...pieces.map((piece) => piece.end)),
    };
  });
}

function mergeTimedSpeakers(diarizationSegments, transcriptSegments, durationSeconds) {
  if (!Array.isArray(transcriptSegments) || !Array.isArray(diarizationSegments))
    throw new TypeError("Timed transcript and diarization must be arrays");
  for (const segment of transcriptSegments) {
    checkRange(segment, "transcript");
    if (typeof segment.text !== "string") throw new TypeError("Invalid transcript text");
    if (
      Number.isFinite(durationSeconds) &&
      durationSeconds > 0 &&
      segment.end > durationSeconds + 0.25
    )
      throw new TypeError("Transcript timestamps exceed the recording duration");
  }
  for (const voice of diarizationSegments) checkRange(voice, "diarization");
  const voicedIntervals = diarizationSegments.filter((voice) => voice.end > voice.start);
  return transcriptSegments.flatMap((segment) => {
    const timedWords = splitTimedWords(segment);
    if (!timedWords)
      return [
        {
          text: segment.text,
          start: segment.start,
          end: segment.end,
          ...assignTimedSegment(segment, voicedIntervals),
        },
      ];
    const assigned = [];
    for (const word of timedWords) {
      const item = { ...word, ...assignTimedSegment(word, voicedIntervals) };
      const previous = assigned[assigned.length - 1];
      if (
        previous &&
        previous.speaker === item.speaker &&
        previous.speakerAssignment === item.speakerAssignment
      ) {
        previous.text += item.text;
        previous.end = Math.max(previous.end, item.end);
      } else assigned.push(item);
    }
    return assigned;
  });
}

module.exports = {
  mergeTimedSpeakers,
  MIN_DOMINANT_SHARE,
  MIN_VOICED_COVERAGE,
  MAX_NEAREST_GAP_SECONDS,
};
