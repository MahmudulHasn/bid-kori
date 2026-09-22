import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWinnerDetailsApiPath,
  buildWinnerDetailsSubmitApiPath,
  getResumeStep,
  getStepPercentage,
  isValidBdPhone,
  isValidEmail,
  normalizePhone,
  validateStep1,
  validateStep2,
  validateStep3,
} from './winnerDetailsPure.ts';

describe('winnerDetails helpers', () => {
  it('normalizes and validates Bangladeshi phone numbers', () => {
    assert.equal(normalizePhone('01712-345 678'), '01712345678');
    assert.equal(isValidBdPhone('01712345678'), true);
    assert.equal(isValidBdPhone('+8801812345678'), true);
    assert.equal(isValidBdPhone('8801912345678'), true);
    assert.equal(isValidBdPhone('01312345678'), true);
    assert.equal(isValidBdPhone('01412345678'), true);

    // Invalid numbers
    assert.equal(isValidBdPhone('12345'), false);
    assert.equal(isValidBdPhone('01212345678'), false); // 012 is invalid operator
    assert.equal(isValidBdPhone('abcdefghijk'), false);
  });

  it('validates email addresses', () => {
    assert.equal(isValidEmail(''), true); // optional
    assert.equal(isValidEmail(undefined), true);
    assert.equal(isValidEmail('buyer@test.com'), true);
    assert.equal(isValidEmail('invalid-email'), false);
  });

  it('validates Step 1: Personal Information', () => {
    const valid = validateStep1({
      full_name: 'Tanvir Hossain',
      phone: '01711223344',
      email: 'tanvir@test.com',
    });
    assert.equal(valid.valid, true);
    assert.deepEqual(valid.errors, {});

    const invalid = validateStep1({
      full_name: '',
      phone: 'invalid',
      email: 'bad-email',
    });
    assert.equal(invalid.valid, false);
    assert.ok(invalid.errors.full_name);
    assert.ok(invalid.errors.phone);
    assert.ok(invalid.errors.email);
  });

  it('validates Step 2: Delivery Address', () => {
    const valid = validateStep2({
      address_line: 'House 15, Road 2, Block C',
      area: 'Banani',
      district: 'Dhaka',
      division: 'Dhaka',
      postal_code: '1213',
    });
    assert.equal(valid.valid, true);

    const invalid = validateStep2({
      address_line: 'H 1',
      area: '',
      district: '',
      division: '',
    });
    assert.equal(invalid.valid, false);
    assert.ok(invalid.errors.address_line);
    assert.ok(invalid.errors.area);
    assert.ok(invalid.errors.district);
    assert.ok(invalid.errors.division);
  });

  it('validates Step 3: Delivery Preferences', () => {
    const validPhone = validateStep3({
      preferred_contact_method: 'PHONE',
      delivery_note: 'Call before delivery.',
    });
    assert.equal(validPhone.valid, true);

    const validEmail = validateStep3(
      {
        preferred_contact_method: 'EMAIL',
        delivery_note: 'Send email notification.',
      },
      'buyer@test.com'
    );
    assert.equal(validEmail.valid, true);

    const missingEmail = validateStep3(
      {
        preferred_contact_method: 'EMAIL',
      },
      ''
    );
    assert.equal(missingEmail.valid, false);
    assert.ok(missingEmail.errors.preferred_contact_method);

    const invalid = validateStep3({
      preferred_contact_method: undefined,
      delivery_note: 'x'.repeat(501),
    });
    assert.equal(invalid.valid, false);
    assert.ok(invalid.errors.preferred_contact_method);
    assert.ok(invalid.errors.delivery_note);
  });

  it('computes resume step correctly', () => {
    assert.equal(getResumeStep(0), 1);
    assert.equal(getResumeStep(1), 2);
    assert.equal(getResumeStep(2), 3);
    assert.equal(getResumeStep(3), 4);
    assert.equal(getResumeStep(4), 4);
    assert.equal(getResumeStep(1, 'COMPLETED'), 4);
  });

  it('computes progress percentage correctly', () => {
    assert.equal(getStepPercentage(1), 25);
    assert.equal(getStepPercentage(2), 50);
    assert.equal(getStepPercentage(3), 75);
    assert.equal(getStepPercentage(4), 100);
    assert.equal(getStepPercentage(0), 0);
  });

  it('builds correct API routes', () => {
    assert.equal(buildWinnerDetailsApiPath(42), '/buyer/won/42/winner-details/');
    assert.equal(buildWinnerDetailsSubmitApiPath(42), '/buyer/won/42/winner-details/submit/');
  });
});
