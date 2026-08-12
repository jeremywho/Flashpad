/**
 * Pure derivation of the two lines of text on a note card.
 *
 * Notes carry no separate title field — the first non-blank line of the body is
 * the title. The card therefore has to build its preview from what comes *after*
 * that line, otherwise every card prints the same sentence twice.
 *
 * Length is deliberately not capped here. The title ellipsises via CSS
 * (`white-space: nowrap` + `text-overflow`) and the preview clamps to two lines
 * via `-webkit-line-clamp`, so a character cap would only cut text short early
 * on a wide list and leave a second "..." behind the CSS one.
 */

/**
 * Leading markdown that titles a line but should not be read as part of it.
 * Hashes match at end-of-string too: lines are trimmed before this runs, so a
 * half-typed "## " arrives as "##" with the separating space already gone.
 * The space is still required before other text, which keeps "#tag" and
 * "#13941" intact.
 */
const LEADING_MARKER = /^(?:#{1,6}(?:\s+|$)|>\s*|[-*+]\s+(?:\[[ xX]\]\s*)?|\d+[.)]\s+)/;

function stripMarker(line: string): string {
  return line.replace(LEADING_MARKER, '').trim();
}

export interface NoteCardText {
  title: string;
  /** Empty when the note has nothing beyond its first line. */
  preview: string;
}

export function getNoteCardText(content: string): NoteCardText {
  const lines = content.split('\n').map(line => line.trim()).filter(Boolean);

  return {
    title: stripMarker(lines[0] ?? '') || 'Untitled',
    preview: lines.slice(1, 3).map(stripMarker).filter(Boolean).join(' '),
  };
}
