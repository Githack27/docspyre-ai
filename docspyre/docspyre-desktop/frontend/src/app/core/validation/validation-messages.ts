import { ValidationErrors } from '@angular/forms';

type MessageFactory = (label: string, error?: any) => string;

const VALIDATION_MESSAGES: Record<string, MessageFactory> = {
  required: (label) => `${label} is required.`,
  minlength: (label, error) => `${label} must be at least ${error.requiredLength} characters.`,
  maxlength: (label, error) => `${label} must not exceed ${error.requiredLength} characters.`,
  invalidEmail: () => 'Enter a valid email address.',
  invalidUsername: () => 'Letters, numbers, dots, dashes and underscores only.',
  invalidPhone: () => 'Phone number must contain 6 to 15 digits only.',
  passwordMismatch: () => 'Passwords do not match.',
};

export function resolveValidationMessage(
  errors: ValidationErrors | null | undefined,
  label: string,
): string {
  if (!errors) {
    return '';
  }
  const [key] = Object.keys(errors);
  const factory = VALIDATION_MESSAGES[key];
  return factory ? factory(label, errors[key]) : `${label} is invalid.`;
}
