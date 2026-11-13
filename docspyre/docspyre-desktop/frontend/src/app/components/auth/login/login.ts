import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Button } from '../../shared/ui/button/button';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiErrorResponse, LicenseOption, RegistrationPayload } from '../../../core/auth/auth.models';
import { CountryOption, loadCountries } from '../../../core/auth/country-regions';
import {
  confirmPasswordValidators,
  emailFieldValidators,
  loginPasswordValidators,
  passwordMatchValidator,
  phoneValidator,
  signupPasswordValidators,
  usernameValidator,
} from '../../../core/validation/auth-validators';
import { resolveValidationMessage } from '../../../core/validation/validation-messages';

type AuthMode = 'login' | 'signup';
type Feedback = { type: 'success' | 'error'; text: string } | null;

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, Button],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly mode = signal<AuthMode>('login');
  protected readonly feedback = signal<Feedback>(null);
  protected readonly submitting = signal(false);

  protected readonly licenseOptions = signal<LicenseOption[]>([]);
  protected readonly licenseLoading = signal(false);
  protected readonly licenseError = signal<string | null>(null);

  protected readonly countries = signal<CountryOption[]>([]);
  protected readonly countriesLoading = signal(false);

  protected readonly selectedCountryCode = signal<string>('');
  protected readonly availableRegions = computed<string[]>(() => {
    const code = this.selectedCountryCode();
    if (!code) return [];
    const found = this.countries().find((c) => c.code === code);
    return found?.regions ?? [];
  });

  protected readonly loginForm: FormGroup = this.fb.group({
    username: ['', loginPasswordValidators],
    password: ['', loginPasswordValidators],
    remember: [false],
  });

  protected readonly signupForm: FormGroup = this.fb.group(
    {
      firstName: ['', [Validators.required, Validators.maxLength(60)]],
      lastName: ['', [Validators.required, Validators.maxLength(60)]],
      username: ['', [Validators.required, usernameValidator()]],
      email: ['', emailFieldValidators],
      companyName: ['', [Validators.required, Validators.maxLength(120)]],
      password: ['', signupPasswordValidators],
      confirmPassword: ['', confirmPasswordValidators],
      phone: ['', [Validators.required, phoneValidator()]],
      country: ['', [Validators.required]],
      state: [''],
      licensePlanId: ['', [Validators.required]],
      agreeTerms: [false, [Validators.requiredTrue]],
    },
    { validators: passwordMatchValidator() },
  );

  ngOnInit(): void {
    const remembered = this.auth.getRememberedUsername();
    if (remembered) {
      this.loginForm.patchValue({ username: remembered, remember: true });
    }

    this.signupForm.get('country')?.valueChanges.subscribe((code: string) => {
      this.selectedCountryCode.set(code);
      this.signupForm.get('state')?.setValue('');
    });
  }

  protected setMode(mode: AuthMode): void {
    this.mode.set(mode);
    this.feedback.set(null);
    if (mode === 'signup') {
      this.ensureSignupDataLoaded();
    }
  }

  private ensureSignupDataLoaded(): void {
    if (this.countries().length === 0 && !this.countriesLoading()) {
      this.countriesLoading.set(true);
      loadCountries()
        .then((items) => {
          this.countries.set(items);
          this.countriesLoading.set(false);
        })
        .catch(() => {
          this.countriesLoading.set(false);
        });
    }

    if (this.licenseOptions().length === 0 && !this.licenseLoading()) {
      this.licenseLoading.set(true);
      this.licenseError.set(null);
      this.auth.licenseOptions().subscribe({
        next: (opts) => {
          this.licenseOptions.set(opts);
          this.licenseLoading.set(false);
          if (opts.length > 0 && !this.signupForm.get('licensePlanId')?.value) {
            this.signupForm.patchValue({ licensePlanId: opts[0].id });
          }
        },
        error: (err: unknown) => {
          this.licenseLoading.set(false);
          this.licenseError.set(this.extractError(err));
        },
      });
    }
  }

  protected onLogin(): void {
    if (this.submitting() || this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    const { username, password, remember } = this.loginForm.getRawValue();

    this.auth.login({ username: username.trim(), password, remember }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.router.navigate(['/app']);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.feedback.set({ type: 'error', text: this.extractError(error) });
      },
    });
  }

  protected onSignup(): void {
    if (this.submitting() || this.signupForm.invalid) {
      this.signupForm.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    const formVal = this.signupForm.getRawValue();

    const payload: RegistrationPayload = {
      firstName: formVal.firstName.trim(),
      lastName: formVal.lastName.trim(),
      username: formVal.username.trim(),
      email: formVal.email.trim(),
      companyName: formVal.companyName.trim(),
      password: formVal.password,
      confirmPassword: formVal.confirmPassword,
      phone: formVal.phone.trim(),
      country: formVal.country,
      state: formVal.state?.trim() || '',
      licensePlanId: formVal.licensePlanId,
    };

    this.auth.register(payload).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.setMode('login');
        this.loginForm.patchValue({ username: payload.username, password: '' });
        this.feedback.set({
          type: 'success',
          text: `${res.message} You can sign in once your license is approved.`,
        });
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.feedback.set({ type: 'error', text: this.extractError(error) });
      },
    });
  }

  protected showError(form: FormGroup, controlName: string): boolean {
    const control = form.get(controlName);
    return !!control && control.invalid && (control.touched || control.dirty);
  }

  protected errorText(form: FormGroup, controlName: string, label: string): string {
    const control = form.get(controlName);
    return this.showError(form, controlName)
      ? resolveValidationMessage(control?.errors, label)
      : '';
  }

  protected showPasswordMismatch(): boolean {
    const confirm = this.signupForm.get('confirmPassword');
    return (
      this.signupForm.hasError('passwordMismatch') &&
      !!confirm &&
      (confirm.touched || confirm.dirty)
    );
  }

  private extractError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const body = error.error as (ApiErrorResponse & { error?: string | { message?: string }; details?: unknown; issues?: Array<{ message?: string }> }) | null;
      if (typeof body?.error === 'string') {
        return body.error;
      }
      if (typeof body?.error?.message === 'string') {
        return body.error.message;
      }
      if (typeof body?.message === 'string') {
        return body.message;
      }
      if (Array.isArray(body?.issues) && body.issues.length > 0 && typeof body.issues[0]?.message === 'string') {
        return body.issues[0].message;
      }
      if (error.status === 0) {
        return 'Unable to reach the server. Please check your connection.';
      }
      if (error.statusText && error.status !== 200) {
        return `Request failed (${error.status}: ${error.statusText})`;
      }
    }
    if (error instanceof Error) {
      return error.message;
    }
    return 'Something went wrong. Please try again.';
  }
}
