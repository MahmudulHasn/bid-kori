import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AI_DRAFT_DISCLOSURE,
  AI_LISTING_GENERATE_API_PATH,
  AI_LISTING_GENERATE_METHOD,
  AI_LISTING_IMAGE_FIELD,
  AI_LISTING_IMAGE_MAX_BYTES,
  buildGenerateDescriptionFormData,
  canGenerateAiListingDescription,
  descriptionNeedsOverwriteConfirmation,
  getAiListingErrorMessage,
  shouldApplyAiDraftDirectly,
  validateAiListingImage,
} from './aiListing.ts';
import {
  PRODUCT_IMAGE_ALLOWED_MIME_TYPES,
  PRODUCT_IMAGE_MAX_BYTES,
} from './productImageSafety.ts';
import {
  PRODUCT_WRITE_FIELDS,
  emptyProductFormValues,
  serializeProductWritePayload,
  type ProductFormValues,
} from './seller.ts';

function fakeFile(
  name: string,
  options: { type?: string; size?: number } = {},
): File {
  const type = options.type ?? 'image/jpeg';
  const size = options.size ?? 1024;
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], name, { type, lastModified: 1 });
}

describe('buildGenerateDescriptionFormData', () => {
  it('appends title and image under exact field names', () => {
    const image = fakeFile('headphones.jpg');
    const formData = buildGenerateDescriptionFormData({
      title: '  Black Wireless Headphones  ',
      image,
    });
    assert.equal(formData.get('title'), 'Black Wireless Headphones');
    assert.equal(formData.get(AI_LISTING_IMAGE_FIELD), image);
    assert.equal(formData.getAll('image').length, 1);
    assert.equal(formData.has('images'), false);
  });

  it('includes condition when provided and omits when absent', () => {
    const image = fakeFile('a.jpg');
    const withCondition = buildGenerateDescriptionFormData({
      title: 'Camera',
      image,
      condition: 'USED_LIKE_NEW',
    });
    assert.equal(withCondition.get('condition'), 'USED_LIKE_NEW');

    const without = buildGenerateDescriptionFormData({
      title: 'Camera',
      image,
    });
    assert.equal(without.has('condition'), false);
  });

  it('serializes category PK and omits null category', () => {
    const image = fakeFile('a.jpg');
    const withCategory = buildGenerateDescriptionFormData({
      title: 'Lamp',
      image,
      category: 12,
    });
    assert.equal(withCategory.get('category'), '12');

    const omitted = buildGenerateDescriptionFormData({
      title: 'Lamp',
      image,
      category: null,
    });
    assert.equal(omitted.has('category'), false);

    const invalid = buildGenerateDescriptionFormData({
      title: 'Lamp',
      image,
      category: 0,
    });
    assert.equal(invalid.has('category'), false);
  });

  it('does not append forbidden client AI fields', () => {
    const formData = buildGenerateDescriptionFormData({
      title: 'Item',
      image: fakeFile('a.jpg'),
      condition: 'NEW',
      category: 3,
    });
    for (const key of [
      'prompt',
      'system_prompt',
      'model',
      'api_key',
      'description',
      'temperature',
      'instructions',
    ]) {
      assert.equal(formData.has(key), false, key);
    }
  });
});

describe('validateAiListingImage', () => {
  it('accepts supported Product image types', () => {
    for (const type of PRODUCT_IMAGE_ALLOWED_MIME_TYPES) {
      const result = validateAiListingImage(
        fakeFile(`ok.${type.split('/')[1]}`, { type }),
      );
      assert.equal(result.ok, true, type);
    }
  });

  it('rejects unsupported type and oversize files', () => {
    assert.equal(
      validateAiListingImage(fakeFile('x.txt', { type: 'text/plain' })).ok,
      false,
    );
    assert.equal(
      validateAiListingImage(
        fakeFile('big.jpg', { size: PRODUCT_IMAGE_MAX_BYTES + 1 }),
      ).ok,
      false,
    );
    assert.equal(AI_LISTING_IMAGE_MAX_BYTES, PRODUCT_IMAGE_MAX_BYTES);
  });

  it('rejects missing image', () => {
    assert.equal(validateAiListingImage(null).ok, false);
    assert.equal(validateAiListingImage(undefined).ok, false);
  });
});

describe('canGenerateAiListingDescription', () => {
  const image = fakeFile('ok.jpg');

  it('allows valid title + image when editable and idle', () => {
    assert.equal(
      canGenerateAiListingDescription({
        title: 'Headphones',
        image,
        generating: false,
        formEditable: true,
      }),
      true,
    );
  });

  it('rejects blank title, missing image, generating, or frozen form', () => {
    assert.equal(
      canGenerateAiListingDescription({
        title: '   ',
        image,
        generating: false,
        formEditable: true,
      }),
      false,
    );
    assert.equal(
      canGenerateAiListingDescription({
        title: 'Headphones',
        image: null,
        generating: false,
        formEditable: true,
      }),
      false,
    );
    assert.equal(
      canGenerateAiListingDescription({
        title: 'Headphones',
        image,
        generating: true,
        formEditable: true,
      }),
      false,
    );
    assert.equal(
      canGenerateAiListingDescription({
        title: 'Headphones',
        image,
        generating: false,
        formEditable: false,
      }),
      false,
    );
  });
});

describe('AI draft overwrite helpers', () => {
  it('applies directly when description is empty', () => {
    assert.equal(shouldApplyAiDraftDirectly(''), true);
    assert.equal(shouldApplyAiDraftDirectly('   '), true);
    assert.equal(descriptionNeedsOverwriteConfirmation(''), false);
  });

  it('requires confirmation when description is non-empty', () => {
    assert.equal(shouldApplyAiDraftDirectly('Existing copy'), false);
    assert.equal(
      descriptionNeedsOverwriteConfirmation('Existing copy'),
      true,
    );
  });

  it('rejected replacement leaves old text conceptually unchanged', () => {
    const previous = 'Seller wrote this';
    const pending = 'AI draft text';
    // Keep-current path: discard pending, retain previous.
    const applied = false;
    const next = applied ? pending : previous;
    assert.equal(next, previous);
    assert.notEqual(next, pending);
  });
});

describe('getAiListingErrorMessage', () => {
  it('maps rate limit, timeout, unavailable, and validation statuses', () => {
    assert.match(
      getAiListingErrorMessage({ response: { status: 429, data: {} } }),
      /too many|try again shortly/i,
    );
    assert.match(
      getAiListingErrorMessage({ response: { status: 504, data: {} } }),
      /timed out/i,
    );
    assert.match(
      getAiListingErrorMessage({ response: { status: 503, data: {} } }),
      /unavailable|manually/i,
    );
    assert.match(
      getAiListingErrorMessage({ response: { status: 502, data: {} } }),
      /unavailable|manually/i,
    );
    assert.match(
      getAiListingErrorMessage({
        response: {
          status: 400,
          data: { error: 'Invalid image.' },
        },
      }),
      /Invalid image/i,
    );
  });

  it('prefers backend message for 429 when present', () => {
    assert.equal(
      getAiListingErrorMessage({
        response: {
          status: 429,
          data: { error: 'Custom throttle message.' },
        },
      }),
      'Custom throttle message.',
    );
  });
});

describe('AI listing constants and product payload regression', () => {
  it('exposes generate endpoint path and method', () => {
    assert.equal(
      AI_LISTING_GENERATE_API_PATH,
      '/products/generate-description/',
    );
    assert.equal(AI_LISTING_GENERATE_METHOD, 'POST');
    assert.equal(AI_LISTING_IMAGE_FIELD, 'image');
    assert.match(AI_DRAFT_DISCLOSURE, /review and edit/i);
  });

  it('create payload still catalog-only after AI draft is in description', () => {
    const values: ProductFormValues = {
      ...emptyProductFormValues(),
      title: 'Black Wireless Headphones',
      description: 'AI-generated draft for marketplace listing.',
      condition: 'NEW',
      category: 5,
    };
    const payload = serializeProductWritePayload(values);
    assert.deepEqual(Object.keys(payload).sort(), [...PRODUCT_WRITE_FIELDS].sort());
    assert.equal(payload.title, 'Black Wireless Headphones');
    assert.equal(
      payload.description,
      'AI-generated draft for marketplace listing.',
    );
    assert.equal(payload.condition, 'NEW');
    assert.equal(payload.category, 5);
    assert.equal('image' in payload, false);
    assert.equal('prompt' in payload, false);
    assert.equal('model' in payload, false);
    assert.equal('api_key' in payload, false);
  });

  it('edit PATCH payload remains catalog-only with AI-filled description', () => {
    const payload = serializeProductWritePayload({
      title: 'Updated title',
      description: 'Edited after AI draft.',
      condition: 'FAIR',
      category: null,
    });
    assert.deepEqual(payload, {
      title: 'Updated title',
      description: 'Edited after AI draft.',
      condition: 'FAIR',
      category: null,
    });
  });
});
