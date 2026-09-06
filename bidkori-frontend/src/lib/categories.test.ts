import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildCategorySelectOptions,
  CATEGORIES_API_PATH,
  CATEGORY_EMPTY_SELECT_VALUE,
  categorySelectValue,
  getCategoryCatalogStatus,
  isProductCategoryFieldEditable,
  parseCategoryValue,
  resolveCategoryLabel,
  unwrapCategoryList,
} from './categories.ts';
import type { Category } from './types.ts';

const sample: Category[] = [
  { id: 3, name: 'Electronics', slug: 'electronics' },
  { id: 5, name: 'Fashion', slug: 'fashion' },
];

describe('categories API path', () => {
  it('uses /categories/ for the catalog', () => {
    assert.equal(CATEGORIES_API_PATH, '/categories/');
  });
});

describe('unwrapCategoryList', () => {
  it('maps array responses and rejects malformed rows', () => {
    assert.deepEqual(unwrapCategoryList(sample), sample);
    assert.deepEqual(
      unwrapCategoryList({ results: sample }),
      sample,
    );
    assert.deepEqual(
      unwrapCategoryList([{ id: 1, name: 'X' }]),
      [],
    );
    assert.deepEqual(unwrapCategoryList(null), []);
  });
});

describe('parseCategoryValue / categorySelectValue', () => {
  it('selected category becomes numeric PK', () => {
    assert.equal(parseCategoryValue('3'), 3);
    assert.equal(categorySelectValue(3), '3');
  });

  it('empty selection becomes null', () => {
    assert.equal(parseCategoryValue(CATEGORY_EMPTY_SELECT_VALUE), null);
    assert.equal(parseCategoryValue(''), null);
    assert.equal(parseCategoryValue(undefined), null);
    assert.equal(categorySelectValue(null), CATEGORY_EMPTY_SELECT_VALUE);
    assert.equal(categorySelectValue(undefined), CATEGORY_EMPTY_SELECT_VALUE);
  });

  it('rejects non-positive and non-integer values', () => {
    assert.equal(parseCategoryValue('0'), null);
    assert.equal(parseCategoryValue('-1'), null);
    assert.equal(parseCategoryValue('1.5'), null);
    assert.equal(parseCategoryValue('abc'), null);
  });
});

describe('category labels and options', () => {
  it('resolves known names and falls back for unknown IDs', () => {
    assert.equal(resolveCategoryLabel(3, sample), 'Electronics');
    assert.equal(resolveCategoryLabel(null, sample), 'None');
    assert.equal(resolveCategoryLabel(99, sample), 'Category #99');
  });

  it('adds a fallback option for stale selected IDs', () => {
    const options = buildCategorySelectOptions(sample, 99);
    assert.equal(options[0]?.value, '99');
    assert.match(options[0]?.label ?? '', /unavailable/);
    assert.equal(options.length, 3);
  });

  it('handles empty catalog safely', () => {
    assert.deepEqual(buildCategorySelectOptions([], null), []);
    assert.equal(getCategoryCatalogStatus([], null, false), 'empty');
  });
});

describe('catalog status', () => {
  it('reports loading, error, ready, and empty without crashing', () => {
    assert.equal(getCategoryCatalogStatus(undefined, null, true), 'loading');
    assert.equal(
      getCategoryCatalogStatus(undefined, new Error('fail'), false),
      'error',
    );
    assert.equal(getCategoryCatalogStatus(sample, null, false), 'ready');
    assert.equal(getCategoryCatalogStatus([], null, false), 'empty');
  });

  it('failed catalog still allows null category selection', () => {
    assert.equal(
      getCategoryCatalogStatus(undefined, new Error('fail'), false),
      'error',
    );
    assert.equal(parseCategoryValue(CATEGORY_EMPTY_SELECT_VALUE), null);
  });
});

describe('freeze-aware category field', () => {
  it('disables category when product fields are not editable', () => {
    assert.equal(isProductCategoryFieldEditable(true), true);
    assert.equal(isProductCategoryFieldEditable(false), false);
  });
});
