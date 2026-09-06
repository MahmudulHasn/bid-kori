import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  PRODUCT_IMAGE_ACCEPT,
  PRODUCT_IMAGE_ALLOWED_MIME_TYPES,
  PRODUCT_IMAGE_MAX_BYTES,
  PRODUCT_IMAGE_MAX_COUNT,
  PRODUCT_IMAGE_MAX_PER_REQUEST,
  PRODUCT_IMAGE_UPLOAD_FIELD,
  buildProductImageDeleteApiPath,
  buildProductImagesApiPath,
  buildProductImagesFormData,
  getDefaultProductImage,
  productImageRemainingCapacity,
  validateProductImageSelection,
} from './productImageSafety.ts';
import type { Product, ProductImage } from './types.ts';

function fakeFile(
  name: string,
  options: { type?: string; size?: number } = {},
): File {
  const type = options.type ?? 'image/jpeg';
  const size = options.size ?? 1024;
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], name, { type, lastModified: 1 });
}

function productWithImages(count: number): Product {
  const images: ProductImage[] = Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    image: `/media/product_images/${i}.jpg`,
    uploaded_at: `2026-01-01T00:00:0${i}Z`,
  }));
  return {
    id: 42,
    title: 'Camera',
    images,
  };
}

describe('product image API paths', () => {
  it('builds list/upload and delete paths', () => {
    assert.equal(buildProductImagesApiPath(7), '/products/7/images/');
    assert.equal(
      buildProductImageDeleteApiPath(7, 12),
      '/products/7/images/12/',
    );
    assert.equal(PRODUCT_IMAGE_UPLOAD_FIELD, 'images');
  });
});

describe('buildProductImagesFormData', () => {
  it('appends one and many files under images', () => {
    const one = [fakeFile('a.jpg')];
    const formOne = buildProductImagesFormData(one);
    assert.deepEqual(formOne.getAll('images').length, 1);
    assert.equal(formOne.has('image'), false);

    const many = [fakeFile('a.jpg'), fakeFile('b.png', { type: 'image/png' })];
    const snap = many.slice();
    const formMany = buildProductImagesFormData(many);
    assert.equal(formMany.getAll('images').length, 2);
    assert.deepEqual(many, snap);
  });
});

describe('validateProductImageSelection', () => {
  it('accepts supported formats within limits', () => {
    for (const type of PRODUCT_IMAGE_ALLOWED_MIME_TYPES) {
      const result = validateProductImageSelection(
        [fakeFile(`ok.${type.split('/')[1]}`, { type })],
        productWithImages(0),
      );
      assert.equal(result.ok, true, type);
    }
  });

  it('rejects unsupported type, oversize, and over-request counts', () => {
    assert.equal(
      validateProductImageSelection(
        [fakeFile('x.txt', { type: 'text/plain' })],
        productWithImages(0),
      ).ok,
      false,
    );
    assert.equal(
      validateProductImageSelection(
        [fakeFile('big.jpg', { size: PRODUCT_IMAGE_MAX_BYTES + 1 })],
        productWithImages(0),
      ).ok,
      false,
    );
    const tooMany = Array.from({ length: PRODUCT_IMAGE_MAX_PER_REQUEST + 1 }, (_, i) =>
      fakeFile(`f${i}.jpg`),
    );
    assert.equal(
      validateProductImageSelection(tooMany, productWithImages(0)).ok,
      false,
    );
  });

  it('enforces remaining capacity against existing images', () => {
    assert.equal(PRODUCT_IMAGE_MAX_COUNT, 5);
    assert.equal(
      validateProductImageSelection(
        Array.from({ length: 5 }, (_, i) => fakeFile(`n${i}.jpg`)),
        productWithImages(0),
      ).ok,
      true,
    );
    assert.equal(
      validateProductImageSelection(
        [fakeFile('one.jpg')],
        productWithImages(4),
      ).ok,
      true,
    );
    assert.equal(
      validateProductImageSelection(
        [fakeFile('a.jpg'), fakeFile('b.jpg')],
        productWithImages(4),
      ).ok,
      false,
    );
    assert.equal(
      validateProductImageSelection(
        [fakeFile('a.jpg')],
        productWithImages(5),
      ).ok,
      false,
    );
    assert.equal(productImageRemainingCapacity(productWithImages(5)), 0);
  });

  it('fails whole batch when one file is invalid', () => {
    const result = validateProductImageSelection(
      [
        fakeFile('good.jpg'),
        fakeFile('bad.txt', { type: 'text/plain' }),
      ],
      productWithImages(0),
    );
    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /supported image type/i);
  });
});

describe('default product image', () => {
  it('uses first image and handles empty list', () => {
    const withImages = productWithImages(2);
    assert.equal(getDefaultProductImage(withImages)?.id, 1);
    assert.equal(getDefaultProductImage({ id: 1, title: 'X', images: [] }), null);
    assert.equal(getDefaultProductImage({ id: 1, title: 'X' }), null);
  });
});

describe('accept attribute', () => {
  it('lists jpeg/png/webp/gif', () => {
    assert.ok(PRODUCT_IMAGE_ACCEPT.includes('image/jpeg'));
    assert.ok(PRODUCT_IMAGE_ACCEPT.includes('image/png'));
    assert.ok(PRODUCT_IMAGE_ACCEPT.includes('image/webp'));
    assert.ok(PRODUCT_IMAGE_ACCEPT.includes('image/gif'));
  });
});

describe('product photo mutation eligibility mirrors edit freeze', () => {
  it('editable Product permits photo controls; frozen does not', async () => {
    const { canOfferSellerProductEdit } = await import('./seller.ts');
    const user = { id: 7 };
    const product: Product = {
      id: 1,
      title: 'Item',
      seller: 7,
      images: [],
    };
    const now = Date.parse('2026-06-01T12:00:00.000Z');
    const futureAuction = {
      id: 10,
      product: { id: 1, title: 'Item', seller: 7 },
      status: 'ACTIVE' as const,
      start_time: '2026-06-02T12:00:00.000Z',
      end_time: '2026-06-03T12:00:00.000Z',
      starting_bid: '100.00',
      current_highest_bid: '100.00',
    };
    const startedAuction = {
      ...futureAuction,
      start_time: '2026-05-01T12:00:00.000Z',
    };
    assert.equal(
      canOfferSellerProductEdit(product, user, [futureAuction], now),
      true,
    );
    assert.equal(
      canOfferSellerProductEdit(product, user, [startedAuction], now),
      false,
    );
  });
});
