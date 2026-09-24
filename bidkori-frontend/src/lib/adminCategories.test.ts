import assert from 'node:assert/strict';
import test from 'node:test';

import {
  filterAdminCategories,
  validateCategoryInput,
  type AdminCategory,
} from './adminCategories.ts';

test('validateCategoryInput validates presence and formatting', () => {
  assert.equal(validateCategoryInput({ name: '' }).valid, false);
  assert.equal(validateCategoryInput({ name: '   ' }).valid, false);
  assert.equal(validateCategoryInput({ name: 'Valid Name' }).valid, true);
  assert.equal(
    validateCategoryInput({ name: 'Valid', slug: 'valid-slug-123' }).valid,
    true,
  );
  assert.equal(
    validateCategoryInput({ name: 'Valid', slug: 'Invalid Slug!' }).valid,
    false,
  );
  // Image validation
  const validFile = new File(['fake-png-content'], 'test.png', {
    type: 'image/png',
  });
  assert.equal(
    validateCategoryInput({ name: 'Valid', image: validFile }).valid,
    true,
  );
  const invalidTypeFile = new File(['fake-pdf'], 'doc.pdf', {
    type: 'application/pdf',
  });
  assert.equal(
    validateCategoryInput({ name: 'Valid', image: invalidTypeFile }).valid,
    false,
  );
});

test('filterAdminCategories filters by name and slug case-insensitively', () => {
  const categories: AdminCategory[] = [
    { id: 1, name: 'Electronics', slug: 'electronics', product_count: 5 },
    { id: 2, name: 'Laptops', slug: 'laptops', product_count: 2 },
    { id: 3, name: 'Gaming Consoles', slug: 'gaming-consoles', product_count: 8 },
  ];

  assert.equal(filterAdminCategories(categories, '').length, 3);
  assert.equal(filterAdminCategories(categories, 'lap').length, 1);
  assert.equal(filterAdminCategories(categories, 'lap')[0].name, 'Laptops');
  assert.equal(filterAdminCategories(categories, 'gaming').length, 1);
  assert.equal(filterAdminCategories(categories, 'nonexistent').length, 0);
});
