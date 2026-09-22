import type { ContactMethod } from './types.ts';

export const BD_DIVISIONS = [
  'Dhaka',
  'Chattogram',
  'Rajshahi',
  'Khulna',
  'Barishal',
  'Sylhet',
  'Rangpur',
  'Mymensingh',
] as const;

export const BD_PHONE_REGEX = /^(\+?880|0)?1[3-9]\d{8}$/;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizePhone(value: string | undefined | null): string {
  if (!value) return '';
  return value.replace(/[\s\-()]/g, '');
}

export function isValidBdPhone(value: string | undefined | null): boolean {
  if (!value) return false;
  const cleaned = normalizePhone(value);
  return BD_PHONE_REGEX.test(cleaned);
}

export function isValidEmail(value: string | undefined | null): boolean {
  if (!value) return true; // optional
  return EMAIL_REGEX.test(value.trim());
}

export type Step1Data = {
  full_name?: string;
  phone?: string;
  email?: string;
};

export type Step2Data = {
  address_line?: string;
  area?: string;
  district?: string;
  division?: string;
  postal_code?: string;
};

export type Step3Data = {
  preferred_contact_method?: ContactMethod;
  delivery_note?: string;
};

export function validateStep1(data: Step1Data): {
  valid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};
  const name = data.full_name?.trim() ?? '';
  const phone = data.phone?.trim() ?? '';
  const email = data.email?.trim() ?? '';

  if (!name) {
    errors.full_name = 'Full name is required.';
  } else if (name.length < 2) {
    errors.full_name = 'Full name must be at least 2 characters.';
  }

  if (!phone) {
    errors.phone = 'Phone number is required for fulfillment.';
  } else if (!isValidBdPhone(phone)) {
    errors.phone = 'Enter a valid Bangladeshi phone number (e.g. 017XXXXXXXX).';
  }

  if (email && !isValidEmail(email)) {
    errors.email = 'Enter a valid email address.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateStep2(data: Step2Data): {
  valid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};
  const address = data.address_line?.trim() ?? '';
  const area = data.area?.trim() ?? '';
  const district = data.district?.trim() ?? '';
  const division = data.division?.trim() ?? '';

  if (!address) {
    errors.address_line = 'Delivery address is required.';
  } else if (address.length < 5) {
    errors.address_line = 'Address must be at least 5 characters.';
  }

  if (!area) {
    errors.area = 'Area or Upazila is required.';
  }

  if (!district) {
    errors.district = 'District is required.';
  }

  if (!division) {
    errors.division = 'Division is required.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateStep3(data: Step3Data, email?: string): {
  valid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};
  const method = data.preferred_contact_method;
  const note = data.delivery_note ?? '';

  if (!method || (method !== 'PHONE' && method !== 'EMAIL')) {
    errors.preferred_contact_method = 'Please select a preferred contact method.';
  } else if (method === 'EMAIL' && email !== undefined && !email.trim()) {
    errors.preferred_contact_method = 'A valid email is required when preferred contact method is Email.';
  }

  if (note.length > 500) {
    errors.delivery_note = 'Delivery note cannot exceed 500 characters.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/** Determine which step number (1–4) the user should resume at based on saved progress. */
export function getResumeStep(completedStep: number, status?: string): number {
  if (status === 'COMPLETED') return 4;
  if (completedStep <= 0) return 1;
  if (completedStep === 1) return 2;
  if (completedStep === 2) return 3;
  return 4;
}

/** Semantic progress percentage for steps 1 through 4. */
export function getStepPercentage(step: number): number {
  switch (step) {
    case 1:
      return 25;
    case 2:
      return 50;
    case 3:
      return 75;
    case 4:
      return 100;
    default:
      return 0;
  }
}

/** Build path for winner fulfillment details API. */
export function buildWinnerDetailsApiPath(auctionId: number | string): string {
  return `/buyer/won/${auctionId}/winner-details/`;
}

export function buildWinnerDetailsSubmitApiPath(auctionId: number | string): string {
  return `/buyer/won/${auctionId}/winner-details/submit/`;
}
