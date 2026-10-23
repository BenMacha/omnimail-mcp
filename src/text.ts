/** Plain-text helpers. Output is plain text for the AI, never rendered as HTML. */

/** Applies a replacement until the string stops changing (handles nested or split tags). */
function replaceUntilStable(value: string, pattern: RegExp, replacement: string): string {
  let previous: string;
  let current = value;
  do {
    previous = current;
    current = current.replace(pattern, replacement);
  } while (current !== previous);
  return current;
}

/** Removes every tag; any leftover "<" or ">" is dropped as well. */
export function stripTags(html: string): string {
  return replaceUntilStable(html, /<[^<>]*>/g, "").replace(/[<>]/g, "");
}

/** Converts an HTML body to readable text. */
export function htmlToText(html: string): string {
  const withoutCode = replaceUntilStable(html, /<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "");
  const text = stripTags(withoutCode.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li|h\d)>/gi, "\n"));
  return (
    text
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // "&amp;" last, so "&amp;lt;" becomes "&lt;" and not "<".
      .replace(/&amp;/g, "&")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/** MIME types returned as text by attachment_get. */
export function isTextMime(contentType: string): boolean {
  return /^(text\/[\w.+-]+|application\/(json|xml|csv|[\w.+-]+\+(json|xml)))$/i.test(contentType.split(";")[0].trim());
}
