import { AbstractControl, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';

export const AUTH_VALIDATION_CONFIG = {
  name: { minLength: 1, maxLength: 60 },
  username: { minLength: 3, maxLength: 64 },
  password: { minLength: 12, maxLength: 128 },
  company: { minLength: 1, maxLength: 120 },
  phone: { minLength: 6, maxLength: 15 },
} as const;

export const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
export const USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/;
export const PHONE_PATTERN = /^\d{6,15}$/;

export function emailFormatValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as string;
    if (!value) return null;
    return EMAIL_PATTERN.test(value.trim()) ? null : { invalidEmail: true };
  };
}

export function usernameValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as string;
    if (!value) return null;
    const trimmed = value.trim();
    if (trimmed.length < AUTH_VALIDATION_CONFIG.username.minLength) {
      return { minlength: { requiredLength: AUTH_VALIDATION_CONFIG.username.minLength, actualLength: trimmed.length } };
    }
    if (trimmed.length > AUTH_VALIDATION_CONFIG.username.maxLength) {
      return { maxlength: { requiredLength: AUTH_VALIDATION_CONFIG.username.maxLength, actualLength: trimmed.length } };
    }
    return USERNAME_PATTERN.test(trimmed) ? null : { invalidUsername: true };
  };
}

export function phoneValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as string;
    if (!value) return null;
    const digits = value.trim();
    return PHONE_PATTERN.test(digits) ? null : { invalidPhone: true };
  };
}

export function passwordMatchValidator(
  passwordKey = 'password',
  confirmKey = 'confirmPassword',
): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const password = group.get(passwordKey)?.value;
    const confirm = group.get(confirmKey)?.value;
    if (!confirm) return null;
    return password === confirm ? null : { passwordMismatch: true };
  };
}

export const emailFieldValidators: ValidatorFn[] = [Validators.required, emailFormatValidator()];
export const loginPasswordValidators: ValidatorFn[] = [Validators.required];
export const signupPasswordValidators: ValidatorFn[] = [
  Validators.required,
  Validators.minLength(AUTH_VALIDATION_CONFIG.password.minLength),
  Validators.maxLength(AUTH_VALIDATION_CONFIG.password.maxLength),
];
export const confirmPasswordValidators: ValidatorFn[] = [Validators.required];
