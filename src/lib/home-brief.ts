const DROP_HEADING = /prediction market lens|market snapshot/i;

function headingText(headingHtml: string): string {
  return headingHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function stripPredictionLensDivs(html: string): string {
  return html.replace(/<div class="prediction-lens">[\s\S]*?<\/div>/gi, '');
}

/**
 * Homepage already renders the structured dashboard and odds panels.
 * Drop the matching brief sections so the tape is not printed twice.
 */
export function stripBriefDuplicatePanels(html: string): string {
  const headingRe = /<h2\b[^>]*>[\s\S]*?<\/h2>/gi;
  const headings = [...html.matchAll(headingRe)];
  if (headings.length === 0) return stripPredictionLensDivs(html).replace(/\n{3,}/g, '\n\n').trim();

  let out = html.slice(0, headings[0].index ?? 0);
  for (let i = 0; i < headings.length; i += 1) {
    const start = headings[i].index ?? 0;
    const end = i + 1 < headings.length ? (headings[i + 1].index ?? html.length) : html.length;
    const section = html.slice(start, end);
    if (DROP_HEADING.test(headingText(headings[i][0]))) continue;
    out += section;
  }
  return stripPredictionLensDivs(out).replace(/\n{3,}/g, '\n\n').trim();
}
