const DROP_HEADING = /prediction market lens|market snapshot|market dashboard/i;

function headingText(headingHtml: string): string {
  return headingHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function stripPredictionLensDivs(html: string): string {
  return html.replace(/<div class="prediction-lens">[\s\S]*?<\/div>/gi, '');
}

/** Close gaps left when a numbered section is removed (`5.` then `7.`). */
function renumberSectionHeadings(html: string): string {
  let next = 0;
  return html.replace(/<h2\b[^>]*>[\s\S]*?<\/h2>/gi, (heading) => {
    const match = headingText(heading).match(/^(\d+)\.\s+/);
    if (!match) return heading;
    next += 1;
    if (match[1] === String(next)) return heading;
    const number = match[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return heading.replace(new RegExp(`(^|>)\\s*${number}\\.`), `$1${next}.`);
  });
}

/**
 * Homepage already renders the structured dashboard and odds panels.
 * Drop the matching brief sections so the tape is not printed twice,
 * then renumber the headings that remain.
 */
export function stripBriefDuplicatePanels(html: string): string {
  const headingRe = /<h2\b[^>]*>[\s\S]*?<\/h2>/gi;
  const headings = [...html.matchAll(headingRe)];
  let body = html;
  if (headings.length > 0) {
    body = html.slice(0, headings[0].index ?? 0);
    for (let i = 0; i < headings.length; i += 1) {
      const start = headings[i].index ?? 0;
      const end = i + 1 < headings.length ? (headings[i + 1].index ?? html.length) : html.length;
      if (DROP_HEADING.test(headingText(headings[i][0]))) continue;
      body += html.slice(start, end);
    }
  }
  return renumberSectionHeadings(stripPredictionLensDivs(body).replace(/\n{3,}/g, '\n\n').trim());
}
