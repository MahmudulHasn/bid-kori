import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CATEGORIES_API_PATH } from './categories.ts';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'categoriesApi.ts'), 'utf8');

describe('categoriesApi', () => {
  it('fetchCategories uses /categories/', () => {
    assert.equal(CATEGORIES_API_PATH, '/categories/');
    assert.match(source, /CATEGORIES_API_PATH/);
    assert.match(source, /api\.get/);
  });

  it('is read-only — no mutation helpers', () => {
    assert.match(source, /fetchCategories/);
    assert.match(source, /categoriesFetcher/);
    assert.doesNotMatch(source, /\.post\(/);
    assert.doesNotMatch(source, /\.patch\(/);
    assert.doesNotMatch(source, /\.put\(/);
    assert.doesNotMatch(source, /\.delete\(/);
    assert.doesNotMatch(source, /createCategory|updateCategory|deleteCategory/);
  });
});
