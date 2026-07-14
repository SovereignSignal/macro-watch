import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BriefArticle } from '@/components/BriefArticle';
import { sanitizePublicBriefHtml, sanitizePublicBriefText } from '@/lib/security/public-brief-html';

const brief = (html: string) => ({
  date: '2026-07-12',
  kind: 'daily',
  subject: 'Security test',
  html,
});

describe('sanitizePublicBriefHtml', () => {
  it('removes executable and document-level markup instead of preserving active contents', () => {
    const dirty = [
      '<!doctype html><html><head><title>private</title><style>body{display:none}</style></head><body>',
      '<h2 onclick="alert(1)">Public heading</h2>',
      '<script>alert(1)</script>',
      '<iframe src="https://example.com">frame fallback</iframe>',
      '<svg onload="alert(2)"><script>alert(3)</script><circle /></svg>',
      '<object data="https://example.com/x"></object>',
      '<p style="background:url(javascript:alert(4))" onmouseover="alert(5)">Public copy</p>',
      '</body></html>',
    ].join('');

    const clean = sanitizePublicBriefHtml(dirty);

    expect(clean).toContain('<h2>Public heading</h2>');
    expect(clean).toContain('<p>Public copy</p>');
    expect(clean).not.toMatch(/doctype|<\/?(?:html|head|body|title|style|script|iframe|svg|circle|object)\b/i);
    expect(clean).not.toMatch(/on(?:click|load|mouseover)|javascript:/i);
    expect(clean).not.toContain('alert(1)');
    expect(clean).not.toContain('frame fallback');
  });

  it('preserves public article semantics, citations, safe links, and normalized data tables', () => {
    const clean = sanitizePublicBriefHtml(`
      <section>
        <h2 id="rates-outlook">Rates outlook</h2>
        <p><strong>Front-end</strong> yields moved <em>higher</em>.<sup><a href="#source-1">1</a></sup></p>
        <blockquote cite="https://www.federalreserve.gov/newsevents.htm">Policy remains data dependent.</blockquote>
        <table class="notion-table arbitrary"><caption>Market moves</caption><thead><tr><th scope="col">Asset</th><th scope="col">Move</th></tr></thead><tbody><tr><th scope="row">2Y</th><td>+9bp</td></tr></tbody></table>
        <ol><li id="source-1"><cite><a href="https://www.federalreserve.gov/newsevents.htm" title="Federal Reserve source">Federal Reserve</a></cite></li></ol>
        <p><a href="/briefs/2026-07-11#rates">Prior brief</a></p>
      </section>
    `);

    expect(clean).toContain('<section>');
    expect(clean).toContain('<h2 id="rates-outlook">Rates outlook</h2>');
    expect(clean).toContain('<strong>Front-end</strong>');
    expect(clean).toContain('<sup><a href="#source-1">1</a></sup>');
    expect(clean).toContain('<blockquote cite="https://www.federalreserve.gov/newsevents.htm">');
    expect(clean).toContain('<table class="data-table">');
    expect(clean).toContain('<caption>Market moves</caption>');
    expect(clean).toContain('<thead><tr><th scope="col">Asset</th>');
    expect(clean).toContain('<tbody><tr><th scope="row">2Y</th><td>+9bp</td>');
    expect(clean).toContain('href="https://www.federalreserve.gov/newsevents.htm"');
    expect(clean).toContain('href="/briefs/2026-07-11#rates"');
    expect(clean).not.toContain('notion-table');
    expect(clean).not.toContain('arbitrary');
  });

  it('preserves only allowlisted brief grouping classes', () => {
    const clean = sanitizePublicBriefHtml(`
      <div class="container">
        <div class="insight tracking"><p class="insight-title tracking">Cross-asset move</p><p>Detail.</p></div>
        <div class="delta-block"><p class="delta-title">Rates — hold</p><p class="delta-evidence">Evidence.</p></div>
        <div class="forward-event"><p class="event-title">CPI</p><span class="event-theme tracking">Rates</span></div>
      </div>
    `);

    expect(clean).not.toContain('container');
    expect(clean).not.toContain('tracking');
    expect(clean).toContain('<div class="insight"><p class="insight-title">');
    expect(clean).toContain('<div class="delta-block"><p class="delta-title">');
    expect(clean).toContain('<p class="delta-evidence">Evidence.</p>');
    expect(clean).toContain('<div class="forward-event"><p class="event-title">CPI</p>');
    expect(clean).toContain('<span class="event-theme">Rates</span>');
  });

  it('preserves deterministic prediction-lens grouping', () => {
    const clean = sanitizePublicBriefHtml(`
      <div class="prediction-lens tracking">
        <div class="prediction-strip"><div class="prediction-strip-title">Curated odds board</div>
          <div class="prediction-odds-row">Market A · YES 42%</div></div>
        <div class="prediction-card"><div class="prediction-card-title">Market B</div>
          <div class="prediction-card-stats">$2.5M tracked</div>
          <div class="prediction-card-quality">observable 55/100</div>
          <div class="prediction-card-read">Mixed anchor</div></div>
        <div class="prediction-lens-read">Lens read</div>
      </div>
    `);
    for (const className of [
      'prediction-lens', 'prediction-strip', 'prediction-strip-title',
      'prediction-odds-row', 'prediction-card', 'prediction-card-title',
      'prediction-card-stats', 'prediction-card-quality',
      'prediction-card-read', 'prediction-lens-read',
    ]) expect(clean).toContain(`class="${className}"`);
    expect(clean).not.toContain('tracking');
  });

  it('unwraps unsafe, private, Notion, and malformed anchors while retaining their labels', () => {
    const clean = sanitizePublicBriefHtml(`
      <p>
        <a href="javascript:alert(1)">script link</a>
        <a href="http://example.com">insecure link</a>
        <a href="https://127.0.0.1/admin">loopback link</a>
        <a href="https://10.0.0.8/private">private link</a>
        <a href="https://[::ffff:127.0.0.1]/admin">mapped loopback link</a>
        <a href="https://workspace.notion.site/Secret-abc">workspace link</a>
        <a href="https://example.com/report?author=analyst@example.com">email query link</a>
        <a href="/api/ingest/briefs">private endpoint</a>
        <a href="/%E0%A4%A">malformed link</a>
        <a>missing link</a>
      </p>
    `);

    expect(clean).not.toContain('<a');
    for (const label of [
      'script link',
      'insecure link',
      'loopback link',
      'private link',
      'mapped loopback link',
      'workspace link',
      'email query link',
      'private endpoint',
      'malformed link',
      'missing link',
    ]) {
      expect(clean).toContain(label);
    }
  });

  it('scrubs privacy leaks from visible text and attributes', () => {
    const clean = sanitizePublicBriefHtml(`
      <!-- notion-block-id: abc -->
      <div class="notion-page" data-notion-id="secret">
        Contact analyst@example.com or read file:///home/ubuntu/openclaw-workspace/private/brief.html.
        Build path: /Users/alice/research/private.md.
        Debug endpoints: http://localhost:3000/api/ingest/briefs and https://192.168.1.20/admin.
        Workspace: https://acme.notion.so/Secret-abc.
      </div>
    `);

    expect(clean).not.toMatch(/analyst@example\.com|file:\/\/|\/home\/ubuntu|\/Users\/alice/i);
    expect(clean).not.toMatch(/localhost|192\.168\.1\.20|notion(?:\.so|-page|-block|-id)/i);
    expect(clean).not.toContain('data-notion-id');
    expect(clean).toContain('[redacted');
  });

  it('scrubs entity-encoded privacy text and private wrapper blocks after canonical decoding', () => {
    const clean = sanitizePublicBriefHtml(`
      <p>Contact analyst&#64;example&#46;com.</p>
      <p>Nested contact analyst&amp;#64;example&amp;#46;com.</p>
      <p>Nested workspace https://team&amp;#46;notion&amp;#46;so/Secret.</p>
      <p>Nested path &amp;#47;home&amp;#47;ubuntu&amp;#47;private.</p>
      <section>📄 View this brief in Notion</section>
      <div>📋 SovsClaw Macro Brief Log — all briefs</div>
      <blockquote>Research log: /home/ubuntu/private/research.md</blockquote>
      <p><a href="https://%6eotion.so/private">encoded workspace</a></p>
      <p><a href="https://example.com/u/a%40example.com">encoded email</a></p>
      <p><a href="https://169.254.169.254/latest/meta-data/">link local</a></p>
    `);
    expect(clean).not.toMatch(/analyst@example|notion|Macro Brief Log|Research log|\/home\/ubuntu/i);
    expect(clean).not.toMatch(/href="[^"]*(?:%6eotion|%40example|169\.254)/i);
    expect(clean).toContain('encoded workspace');
    expect(clean).toContain('encoded email');
    expect(clean).toContain('link local');
  });

  it('drops private or malformed ol/time attributes while retaining public semantics', () => {
    const clean = sanitizePublicBriefHtml(`
      <ol start="file:///home/ubuntu/private/ledger" reversed="analyst@example.com"><li>Private attrs</li></ol>
      <ol start="3" reversed><li>Public attrs</li></ol>
      <time datetime="analyst@example.com">Bad date</time>
      <time datetime="2026-07-13T08:30:00-04:00">CPI</time>
    `);
    expect(clean).toContain('<ol><li>Private attrs</li></ol>');
    expect(clean).toContain('<ol start="3" reversed><li>Public attrs</li></ol>');
    expect(clean).toContain('<time>Bad date</time>');
    expect(clean).toContain('<time datetime="2026-07-13T08:30:00-04:00">CPI</time>');
    expect(clean).not.toMatch(/analyst@example|file:\/\/|\/home\/ubuntu/i);
  });

  it('canonicalizes deeply nested entities to a stable privacy-clean fixed point', () => {
    const dirty = '<p>Contact analyst&amp;amp;amp;#64;example&amp;amp;amp;#46;com at &amp;amp;amp;#47;home&amp;amp;amp;#47;ubuntu&amp;amp;amp;#47;private.</p>';
    const clean = sanitizePublicBriefHtml(dirty);
    expect(clean).not.toMatch(/analyst|example|\/home|&amp;#|&#/i);
    expect(sanitizePublicBriefHtml(clean)).toBe(clean);
  });

  it('drops embedded h1 titles because the page owns the article heading', () => {
    const out = sanitizePublicBriefHtml('<h1>Duplicate brief title</h1><p>Body survives.</p>');
    expect(out).not.toContain('Duplicate brief title');
    expect(out).toContain('<p>Body survives.</p>');
  });

  it('drops complete legacy footer and research-log blocks', () => {
    const clean = sanitizePublicBriefHtml(`
      <p>Public analysis survives.</p>
      <p>Research log (local only): /home/ubuntu/openclaw-workspace/private/log.md</p>
      <p>📄 View this brief in Notion</p>
      <p>📋 SovsClaw Macro Brief Log — all briefs</p>
    `);
    expect(clean).toContain('Public analysis survives.');
    expect(clean).not.toMatch(/Research log|local only|View this brief|Macro Brief Log|openclaw-workspace/i);
  });

  it('scrubs public subject and ping text independently of HTML rendering', () => {
    expect(sanitizePublicBriefText('Alert analyst@example.com at /home/ubuntu/private')).toBe(
      'Alert [redacted email] at [redacted path]',
    );
    expect(sanitizePublicBriefText('📄 View this brief in Notion')).toBe('');
    expect(sanitizePublicBriefText('Contact analyst&#64;example&#46;com')).toBe('Contact [redacted email]');
    expect(sanitizePublicBriefText('Contact analyst&amp;#64;example&amp;#46;com')).toBe('Contact [redacted email]');
    expect(sanitizePublicBriefText('📄 View this brief in Notion | 📋 SovsClaw Macro Brief Log — all briefs')).toBe('|');
  });

  it('removes em dashes from public brief text and html', () => {
    expect(sanitizePublicBriefText('Rates \u2014 hold')).toBe('Rates, hold');
    const html = sanitizePublicBriefHtml('<p>Oil&mdash; easing.</p><p>Fed &#8212; hold.</p>');

    expect(html).toContain('Oil, easing.');
    expect(html).toContain('Fed, hold.');
    expect(html).not.toContain('\u2014');
    expect(html).not.toMatch(/&mdash;|&#8212;|&#x2014;/i);
  });
});

it('sanitizes legacy database HTML immediately before dangerouslySetInnerHTML', () => {
  const markup = renderToStaticMarkup(
    <BriefArticle
      brief={brief(
        '<h2>Legacy row</h2><script>window.__pwned = true</script><p onclick="steal()">Safe text analyst@example.com</p>',
      )}
    />,
  );

  expect(markup).toContain('<h2>Legacy row</h2>');
  expect(markup).toContain('Safe text');
  expect(markup).not.toMatch(/script|onclick|analyst@example\.com|__pwned|steal\(\)/i);
});
