import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Button } from '../../shared/ui/button/button';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiErrorResponse } from '../../../core/auth/auth.models';
import {
  confirmPasswordValidators,
  emailFieldValidators,
  loginPasswordValidators,
  nameFieldValidators,
  passwordMatchValidator,
  signupPasswordValidators,
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

  protected readonly loginForm: FormGroup = this.fb.group({
    email: ['', emailFieldValidators],
    password: ['', loginPasswordValidators],
    remember: [false],
  });

  protected readonly signupForm: FormGroup = this.fb.group(
    {
      fullName: ['', nameFieldValidators],
      email: ['', emailFieldValidators],
      password: ['', signupPasswordValidators],
      confirmPassword: ['', confirmPasswordValidators],
    },
    { validators: passwordMatchValidator() },
  );

  ngOnInit(): void {
    const rememberedEmail = this.auth.getRememberedEmail();
    if (rememberedEmail) {
      this.loginForm.patchValue({ email: rememberedEmail, remember: true });
    }
  }

  protected setMode(mode: AuthMode): void {
    this.mode.set(mode);
    this.feedback.set(null);
  }

  protected onLogin(): void {
    if (this.submitting() || this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    const { email, password, remember } = this.loginForm.getRawValue();

    this.auth.login({ email, password, remember }).subscribe({
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
    const { fullName, email, password } = this.signupForm.getRawValue();

    this.auth.register({ fullName, email, password }).subscribe({
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
      const body = error.error as ApiErrorResponse | null;
      if (body?.error?.message) {
        return body.error.message;
      }
      if (error.status === 0) {
        return 'Unable to reach the server. Please try again.';
      }
    }
    return 'Something went wrong. Please try again.';
  }
}
