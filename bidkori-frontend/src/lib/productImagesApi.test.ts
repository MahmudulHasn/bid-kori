import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PRODUCT_IMAGE_UPLOAD_FIELD,
  buildProductImageDeleteApiPath,
  buildProductImagesApiPath,
} from './productImageSafety.ts';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'productImagesApi.ts'), 'utf8');

describe('productImagesApi', () => {
  it('uses Product image REST paths and multipart images field', () => {
    assert.equal(buildProductImagesApiPath(3), '/products/3/images/');
    assert.equal(
      buildProductImageDeleteApiPath(3, 9),
      '/products/3/images/9/',
    );
    assert.equal(PRODUCT_IMAGE_UPLOAD_FIELD, 'images');
    assert.match(source, /uploadProductImages/);
    assert.match(source, /deleteProductImage/);
    assert.match(source, /buildProductImagesFormData/);
    assert.doesNotMatch(source, /localStorage|TOKEN_KEY/);
  });
});
