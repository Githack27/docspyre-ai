import { AbstractControl, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';

/**
 * Centralised validation configuration for authentication forms.
 * Tweak limits here and every form picks the change up automatically.
 */
export const AUTH_VALIDATION_CONFIG = {
  name: { minLength: 2, maxLength: 50 },
  password: { minLength: 8, maxLength: 64 },
} as const;

/** Pragmatic email shape check (full RFC validation is left to the backend). */
export const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/** Requires at least one lowercase letter, one uppercase letter and one digit. */
export const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

/** Letters first, then letters/spaces/hyphens/apostrophes. */
export const NAME_PATTERN = /^[a-zA-Z][a-zA-Z\s'-]*$/;

/** Emits `{ invalidEmail: true }` when the value is present but malformed. */
export function emailFormatValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as string;
    if (!value) {
      return null;
    }
    return EMAIL_PATTERN.test(value) ? null : { invalidEmail: true };
  };
}

/** Emits `{ weakPassword: true }` when complexity requirements are not met. */
export function passwordStrengthValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as string;
    if (!value) {
      return null;
    }
    return PASSWORD_PATTERN.test(value) ? null : { weakPassword: true };
  };
}

/** Emits `{ invalidName: true }` when the name contains unsupported characters. */
export function nameFormatValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as string;
    if (!value) {
      return null;
    }
    return NAME_PATTERN.test(value.trim()) ? null : { invalidName: true };
  };
}

/**
 * Group-level validator that flags `{ passwordMismatch: true }` when the
 * confirm field does not match the password field.
 */
export function passwordMatchValidator(
  passwordKey = 'password',
  confirmKey = 'confirmPassword',
): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const password = group.get(passwordKey)?.value;
    const confirm = group.get(confirmKey)?.value;
    if (!confirm) {
      return null;
    }
    return password === confirm ? null : { passwordMismatch: true };
  };
}

/* ------------------------------------------------------------------ *
 * Reusable validator sets consumed by the auth forms.
 * ------------------------------------------------------------------ */

export const emailFieldValidators: ValidatorFn[] = [Validators.required, emailFormatValidator()];

/** Login only checks presence; strength is enforced at signup time. */
export const loginPasswordValidators: ValidatorFn[] = [Validators.required];

export const signupPasswordValidators: ValidatorFn[] = [
  Validators.required,
  Validators.minLength(AUTH_VALIDATION_CONFIG.password.minLength),
  Validators.maxLength(AUTH_VALIDATION_CONFIG.password.maxLength),
  passwordStrengthValidator(),
];

export const nameFieldValidators: ValidatorFn[] = [
  Validators.required,
  Validators.minLength(AUTH_VALIDATION_CONFIG.name.minLength),
  Validators.maxLength(AUTH_VALIDATION_CONFIG.name.maxLength),
  nameFormatValidator(),
];

export const confirmPasswordValidators: ValidatorFn[] = [Validators.required];
