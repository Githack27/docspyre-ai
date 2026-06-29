import { ValidationErrors } from '@angular/forms';

type MessageFactory = (label: string, error?: any) => string;

/** Maps a validation error key to a human-readable message. */
const VALIDATION_MESSAGES: Record<string, MessageFactory> = {
  required: (label) => `${label} is required.`,
  minlength: (label, error) => `${label} must be at least ${error.requiredLength} characters.`,
  maxlength: (label, error) => `${label} must not exceed ${error.requiredLength} characters.`,
  invalidEmail: () => 'Enter a valid email address.',
  weakPassword: () => 'Password must include uppercase, lowercase and a number.',
  invalidName: () => 'Enter a valid name.',
  passwordMismatch: () => 'Passwords do not match.',
};

/**
 * Resolves the first applicable error on a control into a display message.
 * Returns an empty string when there are no errors.
 */
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
