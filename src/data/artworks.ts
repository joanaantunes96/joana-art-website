import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { artworkMetadata } from './artworkMetadata';

export interface Artwork {
  id: string;
  title: string;
  medium: string;
  year: string;
  dimensions: string;
  availability: string;
  description?: string;
  price?: string;
  stockQuantity?: number;
  squareItemId?: string;
  squareVariationId?: string;
  image: string;
  imageWidth?: number;
  imageHeight?: number;
  aspect?: 'portrait' | 'landscape' | 'square';
}

type ImageAspect = NonNullable<Artwork['aspect']>;

interface GalleryImage {
  fileName: string;
  number: number;
  width?: number;
  height?: number;
  aspect: ImageAspect;
}

const galleryImagesDirectory = join(process.cwd(), 'public', 'images', 'gallery');
const supportedImagePattern = /\.(jpe?g|png|webp)$/i;
const leadingNumberPattern = /^(\d+)/;
const fallbackGalleryImageManifest = [
  ['1.jpg', 1800, 1392],
  ['2.jpg', 1800, 1761],
  ['3.jpg', 1080, 810],
  ['4.jpg', 1440, 1800],
  ['4dc317ee-5713-49c3-ae6d-e2b587543b91.jpg', 1179, 1445],
  ['5.jpg', 1800, 1388],
  ['6.jpg', 1800, 1393],
  ['7.jpg', 1800, 1800],
  ['8.jpg', 1800, 1393],
  ['9.jpg', 1321, 1800],
  ['10.jpg', 1537, 1800],
  ['11.jpg', 1800, 1287],
  ['12.jpg', 1080, 1350],
  ['14.jpg', 1179, 1466],
  ['15.jpg', 1440, 1800],
  ['16.jpg', 1800, 1290],
  ['antunes-joana-on-the-line-2026.jpg', 1800, 1384],
  ['d466b30b-20fa-4363-88c3-f99f99280700.jpg', 1179, 881],
  ['img-4936.jpg', 1800, 761],
] as const;

function getImageNumber(fileName: string) {
  return Number(fileName.match(leadingNumberPattern)?.[1] ?? Number.POSITIVE_INFINITY);
}

function readJpegDimensions(buffer: Buffer) {
  let offset = 2;

  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) return undefined;

    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    const isStartOfFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker);

    if (isStartOfFrame) {
      return {
        width: buffer.readUInt16BE(offset + 7),
        height: buffer.readUInt16BE(offset + 5),
      };
    }

    offset += 2 + length;
  }

  return undefined;
}

function readWebpDimensions(buffer: Buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
    return undefined;
  }

  const format = buffer.toString('ascii', 12, 16);

  if (format === 'VP8X') {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }

  if (format === 'VP8L') {
    const b0 = buffer[21];
    const b1 = buffer[22];
    const b2 = buffer[23];
    const b3 = buffer[24];

    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    };
  }

  if (format === 'VP8 ') {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }

  return undefined;
}

function readImageDimensions(filePath: string) {
  const buffer = readFileSync(filePath);
  const extension = extname(filePath).toLowerCase();

  if (extension === '.png') {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  if (extension === '.jpg' || extension === '.jpeg') {
    return readJpegDimensions(buffer);
  }

  if (extension === '.webp') {
    return readWebpDimensions(buffer);
  }

  return undefined;
}

function getImageAspect(filePath: string): ImageAspect {
  const dimensions = readImageDimensions(filePath);

  if (!dimensions) return 'square';

  return dimensionsToAspect(dimensions.width, dimensions.height);
}

function dimensionsToAspect(width: number, height: number): ImageAspect {
  const ratio = width / height;

  if (ratio > 1.15) return 'landscape';
  if (ratio < 0.87) return 'portrait';
  return 'square';
}

function getFallbackGalleryImages(): GalleryImage[] {
  return fallbackGalleryImageManifest.map(([fileName, width, height]) => ({
    fileName,
    number: getImageNumber(fileName),
    width,
    height,
    aspect: dimensionsToAspect(width, height),
  }));
}

function formatRomanNumber(value: number) {
  const numerals = [
    ['M', 1000],
    ['CM', 900],
    ['D', 500],
    ['CD', 400],
    ['C', 100],
    ['XC', 90],
    ['L', 50],
    ['XL', 40],
    ['X', 10],
    ['IX', 9],
    ['V', 5],
    ['IV', 4],
    ['I', 1],
  ] as const;

  let remainder = value;
  let output = '';

  for (const [numeral, amount] of numerals) {
    while (remainder >= amount) {
      output += numeral;
      remainder -= amount;
    }
  }

  return output || String(value);
}

function readGalleryImages(): GalleryImage[] {
  try {
    return readdirSync(galleryImagesDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && supportedImagePattern.test(entry.name))
      .map((entry) => {
        const filePath = join(galleryImagesDirectory, entry.name);
        const dimensions = readImageDimensions(filePath);

        return {
          fileName: entry.name,
          number: getImageNumber(entry.name),
          width: dimensions?.width,
          height: dimensions?.height,
          aspect: getImageAspect(filePath),
        };
      })
      .sort((a, b) => a.number - b.number || a.fileName.localeCompare(b.fileName));
  } catch (error) {
    console.error('Local gallery fallback unavailable:', error);
    return getFallbackGalleryImages();
  }
}

const galleryImages: GalleryImage[] = readGalleryImages();

export const galleryWorks: Artwork[] = galleryImages.map((image, index) => {
  const id =
    Number.isFinite(image.number) ? String(image.number).padStart(2, '0') : image.fileName.replace(/\.[^.]+$/, '');
  const metadata = artworkMetadata[image.fileName] ?? artworkMetadata[String(image.number)] ?? {};
  const displayNumber = Number.isFinite(image.number) ? image.number : index + 1;

  return {
    id,
    title: metadata.title ?? `Untitled ${formatRomanNumber(displayNumber)}`,
    medium: metadata.medium ?? 'Fine art',
    year: metadata.year ?? 'Recent work',
    dimensions: metadata.dimensions ?? 'Dimensions available on request',
    availability: metadata.availability ?? 'Availability on request',
    description: metadata.description,
    image: `/images/gallery/${image.fileName}`,
    imageWidth: image.width,
    imageHeight: image.height,
    aspect: image.aspect,
  };
});

export const featuredWorks = galleryWorks.slice(0, 3);

export const heroImage = '/images/hero.jpg';
export const aboutImage = '/images/about.jpg';
