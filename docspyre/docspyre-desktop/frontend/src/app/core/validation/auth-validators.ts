import { AbstractControl, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';


export const AUTH_VALIDATION_CONFIG = {
  name: { minLength: 2, maxLength: 50 },
  password: { minLength: 8, maxLength: 64 },
} as const;


export const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;


export const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;


export const NAME_PATTERN = /^[a-zA-Z][a-zA-Z\s'-]*$/;


export function emailFormatValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as string;
    if (!value) {
      return null;
    }
    return EMAIL_PATTERN.test(value) ? null : { invalidEmail: true };
  };
}


export function passwordStrengthValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as string;
    if (!value) {
      return null;
    }
    return PASSWORD_PATTERN.test(value) ? null : { weakPassword: true };
  };
}


export function nameFormatValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as string;
    if (!value) {
      return null;
    }
    return NAME_PATTERN.test(value.trim()) ? null : { invalidName: true };
  };
}


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


export const emailFieldValidators: ValidatorFn[] = [Validators.required, emailFormatValidator()];


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
