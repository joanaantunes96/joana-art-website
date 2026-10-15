import { XMLParser, XMLValidator } from 'fast-xml-parser';

// One-time store configuration, not a per-painting mapping. IDs are public identifiers.
export const squareOnline = {
  siteId: 'site_603912763931991352',
  locationId: 'LQT8K0ZCKNW3J',
};

export interface SquareSite {
  id: string;
  domain?: string;
  is_published?: boolean;
}

const parser = new XMLParser({ ignoreAttributes: true, processEntities: false });
const array = <T>(value: T | T[] | undefined): T[] => value == null ? [] : Array.isArray(value) ? value : [value];

function sameOriginUrl(value: unknown, origin: string): URL | undefined {
  if (typeof value !== 'string') return;
  try {
    const url = new URL(value);
    if (url.origin === origin && !url.username && !url.password && !url.hash && !url.search) return url;
  } catch { /* Ignore malformed sitemap entries. */ }
}

async function publicFetch(url: URL) {
  // Never forward Square API credentials to storefront requests or follow redirects.
  const response = await fetch(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('Square storefront unavailable');
  return response;
}

export async function discoverProductUrls(sites: SquareSite[], itemIds: string[]): Promise<Map<string, string>> {
  const site = sites.find(site => site.id === squareOnline.siteId && site.is_published);
  if (!site?.domain) return new Map();
  const root = new URL(`https://${site.domain}`);
  if (root.hostname !== site.domain || root.port || root.username || root.password) return new Map();

  const candidates = new Map<string, Set<string>>();
  const wanted = new Set(itemIds);
  const queue = [new URL('/sitemap.xml', root)];
  const visited = new Set<string>();
  while (queue.length) {
    const url = queue.shift()!;
    if (visited.has(url.href)) continue;
    if (visited.size >= 20) throw new Error('Square sitemap limit exceeded');
    visited.add(url.href);
    const response = await publicFetch(url);
    const xml = await response.text();
    if (xml.length > 2_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) {
      throw new Error('Invalid Square sitemap');
    }
    const document = parser.parse(xml);
    for (const child of array<{ loc?: unknown }>(document.sitemapindex?.sitemap)) {
      const next = sameOriginUrl(child.loc, root.origin);
      if (next) queue.push(next);
    }
    for (const entry of array<{ loc?: unknown }>(document.urlset?.url)) {
      const product = sameOriginUrl(entry.loc, root.origin);
      if (!product) continue;
      const segments = product.pathname.split('/').filter(Boolean);
      // Consume an observed canonical URL; never construct a slug from the title.
      if (segments.length !== 3 || segments[0] !== 'product' || !wanted.has(segments[2])) continue;
      const matches = candidates.get(segments[2]) ?? new Set<string>();
      matches.add(product.href);
      candidates.set(segments[2], matches);
    }
  }

  const verified = new Map<string, string>();
  for (const [id, urls] of candidates) {
    if (urls.size !== 1) continue;
    const url = [...urls][0];
    try {
      const response = await publicFetch(new URL(url));
      const isHtml = response.headers.get('content-type')?.includes('text/html');
      await response.body?.cancel();
      if (isHtml) verified.set(id, url);
    } catch { /* A broken or redirected product stays enquiry-only. */ }
  }
  return verified;
}
