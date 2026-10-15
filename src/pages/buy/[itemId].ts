import type { APIRoute } from 'astro';
import { getAvailableWorks } from '../../data/squareArtworks';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const { works } = await getAvailableWorks();
  const artwork = works.find(work => work.squareItemId === params.itemId);
  const destination = artwork?.purchaseUrl && (artwork.stockQuantity ?? 0) > 0
    ? artwork.purchaseUrl
    : '/contact?subject=purchase';
  return new Response(null, { status: 303, headers: { Location: destination, 'Cache-Control': 'no-store' } });
};
