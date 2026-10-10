import type { Artwork } from './artworks';

const SQUARE_API_BASE = 'https://connect.squareup.com';
const SQUARE_VERSION = '2026-09-16';

interface SquareMoney {
  amount?: number;
  currency?: string;
}

interface SquareCustomAttributeValue {
  name?: string;
  string_value?: string;
  number_value?: string;
  boolean_value?: boolean;
  selection_uid_values?: string[];
}

interface SquareCatalogObject {
  id: string;
  type: string;
  is_deleted?: boolean;
  category_data?: {
    name?: string;
  };
  item_data?: {
    name?: string;
    description?: string;
    category_id?: string;
    categories?: Array<{ id?: string }>;
    image_ids?: string[];
    variations?: SquareCatalogObject[];
    custom_attribute_values?: Record<string, SquareCustomAttributeValue>;
  };
  item_variation_data?: {
    name?: string;
    price_money?: SquareMoney;
    track_inventory?: boolean;
    sellable?: boolean;
    custom_attribute_values?: Record<string, SquareCustomAttributeValue>;
  };
  image_data?: {
    name?: string;
    url?: string;
  };
}

interface SquareCatalogResponse {
  objects?: SquareCatalogObject[];
  cursor?: string;
  errors?: Array<{ detail?: string }>;
}

interface InventoryCount {
  catalog_object_id?: string;
  state?: string;
  quantity?: string;
}

interface SquareInventoryResponse {
  counts?: InventoryCount[];
  cursor?: string;
  errors?: Array<{ detail?: string }>;
}

export interface AvailableWorksResult {
  works: Artwork[];
  error?: string;
}

function getToken() {
  return import.meta.env.SQUARE_ACCESS_TOKEN;
}

function getArtworkCategoryIds() {
  return (import.meta.env.SQUARE_ARTWORK_CATEGORY_IDS ?? '')
    .split(',')
    .map((value: string) => value.trim())
    .filter(Boolean);
}

function getArtworkCategoryNames() {
  return (import.meta.env.SQUARE_ARTWORK_CATEGORY_NAMES ?? '')
    .split(',')
    .map((value: string) => value.trim().toLowerCase())
    .filter(Boolean);
}

async function squareFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();

  if (!token) {
    throw new Error('SQUARE_ACCESS_TOKEN is not configured.');
  }

  const response = await fetch(`${SQUARE_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Square-Version': SQUARE_VERSION,
      ...init?.headers,
    },
  });

  const payload = (await response.json().catch(() => ({}))) as T & {
    errors?: Array<{ detail?: string }>;
  };

  if (!response.ok) {
    const detail = payload.errors?.map((error) => error.detail).filter(Boolean).join(' ');
    throw new Error(detail || `Square request failed with ${response.status}.`);
  }

  return payload;
}

async function listCatalogObjects(types: string[]) {
  const objects: SquareCatalogObject[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({ types: types.join(',') });
    if (cursor) params.set('cursor', cursor);

    const payload = await squareFetch<SquareCatalogResponse>(`/v2/catalog/list?${params.toString()}`);
    objects.push(...(payload.objects ?? []));
    cursor = payload.cursor;
  } while (cursor);

  return objects.filter((object) => !object.is_deleted);
}

async function retrieveInventoryCounts(variationIds: string[]) {
  const counts: InventoryCount[] = [];
  let cursor: string | undefined;

  if (variationIds.length === 0) return counts;

  do {
    const body: Record<string, unknown> = {
      catalog_object_ids: variationIds,
      states: ['IN_STOCK'],
    };

    if (cursor) body.cursor = cursor;

    const payload = await squareFetch<SquareInventoryResponse>('/v2/inventory/counts/batch-retrieve', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    counts.push(...(payload.counts ?? []));
    cursor = payload.cursor;
  } while (cursor);

  return counts;
}

function getItemCategoryIds(item: SquareCatalogObject) {
  return [
    item.item_data?.category_id,
    ...(item.item_data?.categories?.map((category) => category.id) ?? []),
  ].filter(Boolean) as string[];
}

function shouldIncludeSaleItem(item: SquareCatalogObject, categoryNamesById: Map<string, string>) {
  if (item.type !== 'ITEM' || !item.item_data) return false;
  if (!item.item_data.image_ids?.length) return false;
  if (!item.item_data.variations?.some((variation) => variation.item_variation_data?.sellable !== false)) return false;

  const categoryIds = getArtworkCategoryIds();
  const categoryNames = getArtworkCategoryNames();
  const itemCategoryIds = getItemCategoryIds(item);

  if (categoryIds.length > 0 && !itemCategoryIds.some((id) => categoryIds.includes(id))) return false;

  if (
    categoryNames.length > 0 &&
    !itemCategoryIds.some((id) => categoryNames.includes(categoryNamesById.get(id)?.toLowerCase() ?? ''))
  ) {
    return false;
  }

  return true;
}

function moneyToDisplay(money?: SquareMoney) {
  if (money?.amount == null || !money.currency) return undefined;

  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: money.currency,
    maximumFractionDigits: 2,
  }).format(money.amount / 100);
}

function getCustomValue(
  sources: Array<Record<string, SquareCustomAttributeValue> | undefined>,
  names: string[],
) {
  for (const source of sources) {
    if (!source) continue;

    for (const [key, value] of Object.entries(source)) {
      const label = `${key} ${value.name ?? ''}`.toLowerCase();

      if (!names.some((name) => label.includes(name))) continue;

      if (value.string_value) return value.string_value;
      if (value.number_value) return value.number_value;
      if (value.boolean_value != null) return String(value.boolean_value);
      if (value.selection_uid_values?.length) return value.selection_uid_values.join(', ');
    }
  }

  return undefined;
}

function splitDescription(description?: string) {
  return (description ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function inferMedium(description?: string) {
  return splitDescription(description).find((line) => /oil|acrylic|watercolour|board|canvas|paper/i.test(line));
}

function inferDimensions(description?: string) {
  return splitDescription(description).find((line) => /\d+\s*x\s*\d+/i.test(line));
}

function quantityForVariation(counts: InventoryCount[], variationId: string) {
  return counts
    .filter((count) => count.catalog_object_id === variationId && count.state === 'IN_STOCK')
    .reduce((total, count) => total + Number(count.quantity ?? 0), 0);
}

function mapAvailableItemToArtwork(
  item: SquareCatalogObject,
  imageById: Map<string, SquareCatalogObject>,
  counts: InventoryCount[],
) {
  const variations = item.item_data?.variations?.filter((variation) => variation.item_variation_data?.sellable !== false) ?? [];
  const availableVariation = variations.find((variation) => quantityForVariation(counts, variation.id) > 0);

  if (!availableVariation) return undefined;

  const variationData = availableVariation.item_variation_data;
  const imageId = item.item_data?.image_ids?.find((id) => imageById.get(id)?.image_data?.url);
  const imageUrl = imageId ? imageById.get(imageId)?.image_data?.url : undefined;

  if (!imageUrl || !variationData) return undefined;

  const customSources = [item.item_data?.custom_attribute_values, variationData.custom_attribute_values];
  const description = item.item_data?.description;
  const dimensions =
    getCustomValue(customSources, ['dimension', 'size']) ?? inferDimensions(description) ?? 'Dimensions available on request';
  const medium = getCustomValue(customSources, ['medium', 'material']) ?? inferMedium(description) ?? 'Original painting';
  const stockQuantity = quantityForVariation(counts, availableVariation.id);

  return {
    id: item.id,
    title: item.item_data?.name ?? 'Untitled',
    medium,
    year: getCustomValue(customSources, ['year', 'date']) ?? '',
    dimensions,
    availability: 'Available',
    description,
    image: imageUrl,
    price: moneyToDisplay(variationData.price_money),
    stockQuantity,
    squareItemId: item.id,
    squareVariationId: availableVariation.id,
  } satisfies Artwork;
}

export async function getAvailableWorks(): Promise<AvailableWorksResult> {
  try {
    const catalogObjects = await listCatalogObjects(['ITEM', 'IMAGE', 'CATEGORY']);
    const imageById = new Map(catalogObjects.filter((object) => object.type === 'IMAGE').map((image) => [image.id, image]));
    const categoryNamesById = new Map(
      catalogObjects
        .filter((object) => object.type === 'CATEGORY')
        .map((category) => [category.id, category.category_data?.name ?? '']),
    );
    const items = catalogObjects.filter((object) => shouldIncludeSaleItem(object, categoryNamesById));
    const variationIds = items.flatMap((item) => item.item_data?.variations?.map((variation) => variation.id) ?? []);
    const inventoryCounts = await retrieveInventoryCounts(variationIds);
    const works = items
      .map((item) => mapAvailableItemToArtwork(item, imageById, inventoryCounts))
      .filter(Boolean) as Artwork[];

    return { works };
  } catch (error) {
    console.error('Square available works unavailable:', error);

    return {
      works: [],
      error: error instanceof Error ? error.message : 'Available works are temporarily unavailable.',
    };
  }
}
