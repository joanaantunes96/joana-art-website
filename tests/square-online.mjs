import assert from 'node:assert/strict';
import { createServer } from '../node_modules/astro/node_modules/vite/dist/node/index.js';

const server = await createServer({ define: { 'import.meta.env.SQUARE_ACCESS_TOKEN': JSON.stringify('test-only') }, server: { middlewareMode: true }, appType: 'custom' });
const originalFetch = globalThis.fetch;
try {
  const { squareOnline, discoverProductUrls } = await server.ssrLoadModule('/src/data/squareOnline.ts');
  const { getAvailableWorks } = await server.ssrLoadModule('/src/data/squareArtworks.ts');
  const { GET } = await server.ssrLoadModule('/src/pages/buy/[itemId].ts');
  const sites = [{ id: squareOnline.siteId, domain: 'example.square.site', is_published: true }];
  let quantity = '1', location = squareOnline.locationId, id = 'EXACT-ID';
  let failApi = false, failSitemap = false, failPage = false;
  let path = '/product/unrelated-slug/EXACT-ID';
  let sitemapOverride;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input);
    if (url.hostname === 'connect.squareup.com') {
      assert.equal(init.cache, 'no-store');
      if (failApi) return new Response('{}', {status: 503});
      if (url.pathname.includes('/catalog/')) return Response.json({ objects: [
        {id,type:'ITEM',item_data:{name:'Never matched title',image_ids:['image'],variations:[{id:'variation',item_variation_data:{sellable:true,price_money:{amount:100,currency:'GBP'}}}]}},
        {id:'image',type:'IMAGE',image_data:{url:'https://example.com/art.jpg'}}
      ]});
      if (url.pathname.includes('/inventory/')) {
        assert.deepEqual(JSON.parse(init.body).location_ids, [squareOnline.locationId]);
        return Response.json({counts:[{catalog_object_id:'variation',state:'IN_STOCK',quantity,location_id:location}]});
      }
      return Response.json({sites});
    }
    assert.equal(init.headers, undefined, 'No credentials sent to storefront');
    assert.equal(init.redirect, 'error');
    if (url.pathname.endsWith('.xml')) {
      if (failSitemap) throw new Error('Offline');
      return new Response(sitemapOverride ?? `<urlset><url><loc>https://example.square.site${path}</loc></url></urlset>`);
    }
    return new Response('<html>Square product</html>', { status: failPage ? 404 : 200, headers:{'content-type':'text/html'} });
  };

  let result = await getAvailableWorks();
  assert.equal(result.works.length, 1);
  assert.equal(result.works[0].stockQuantity, 1);
  assert.equal(result.works[0].purchaseUrl, `https://example.square.site${path}`);
  assert.equal((await GET({params:{itemId:id}})).headers.get('Location'), result.works[0].purchaseUrl);
  for (quantity of ['0','-1','NaN']) assert.equal((await getAvailableWorks()).works.length, 0);
  assert.equal((await GET({params:{itemId:id}})).headers.get('Location'), '/contact?subject=purchase');
  quantity = '1'; location = 'OTHER';
  assert.equal((await getAvailableWorks()).works.length, 0);
  location = squareOnline.locationId;
  for (path of ['/product/EXACT-ID/OTHER', '/product/anything/PREFIX-EXACT-ID', '/product/anything/EXACT-ID?redirect=evil']) {
    assert.equal((await getAvailableWorks()).works[0].purchaseUrl, undefined);
  }
  path = '/product/new-painting/NEW-ID'; id = 'NEW-ID';
  assert.ok((await getAvailableWorks()).works[0].purchaseUrl, 'New catalogue IDs need no configuration');
  failSitemap = true;
  assert.equal((await getAvailableWorks()).works[0].purchaseUrl, undefined);
  failSitemap = false; failPage = true;
  assert.equal((await getAvailableWorks()).works[0].purchaseUrl, undefined);
  failPage = false;
  sites[0].is_published = false;
  assert.equal((await getAvailableWorks()).works[0].purchaseUrl, undefined);
  sites[0].is_published = true;
  sitemapOverride = '<urlset><url><loc>https://evil.example/product/x/NEW-ID</loc></url></urlset>';
  assert.equal((await getAvailableWorks()).works[0].purchaseUrl, undefined);
  sitemapOverride = '<urlset><url><loc>https://example.square.site/product/a/NEW-ID</loc></url><url><loc>https://example.square.site/product/b/NEW-ID</loc></url></urlset>';
  assert.equal((await getAvailableWorks()).works[0].purchaseUrl, undefined);
  sitemapOverride = '<!DOCTYPE x [<!ENTITY x SYSTEM "file:///secret">]><urlset/>';
  await assert.rejects(discoverProductUrls(sites, [id]));
  failApi = true;
  result = await getAvailableWorks();
  assert.equal(result.works.length, 0);
  assert.ok(result.error);
  console.log('PASS: exact IDs, new items, stock/location, sold redirect, API/sitemap/page failures, unpublished site, foreign URLs, ambiguity, XML security, credential isolation');
} finally {
  globalThis.fetch = originalFetch;
  await server.close();
}
