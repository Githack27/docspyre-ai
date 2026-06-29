import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Button } from '../../shared/ui/button/button';
import { AuthService } from '../../../core/auth/auth.service';
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
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }
    const { email, password, remember } = this.loginForm.getRawValue();
    const result = this.auth.login({ email, password, remember });
    this.feedback.set({ type: result.success ? 'success' : 'error', text: result.message });

    if (result.success) {
      this.router.navigate(['/app']);
    }
  }

  protected onSignup(): void {
    if (this.signupForm.invalid) {
      this.signupForm.markAllAsTouched();
      return;
    }
    const { fullName, email, password } = this.signupForm.getRawValue();
    const result = this.auth.signup({ fullName, email, password });
    this.feedback.set({ type: result.success ? 'success' : 'error', text: result.message });

    if (result.success) {
      this.signupForm.reset();
      this.setMode('login');
      this.loginForm.patchValue({ email });
      this.feedback.set({ type: 'success', text: 'Account created. Please sign in.' });
    }
  }

  /** Whether a control should surface its validation error. */
  protected showError(form: FormGroup, controlName: string): boolean {
    const control = form.get(controlName);
    return !!control && control.invalid && (control.touched || control.dirty);
  }

  /** Resolves the active control error into a display message. */
  protected errorText(form: FormGroup, controlName: string, label: string): string {
    const control = form.get(controlName);
    return this.showError(form, controlName)
      ? resolveValidationMessage(control?.errors, label)
      : '';
  }

  /** Surfaces the group-level password mismatch on the confirm field. */
  protected showPasswordMismatch(): boolean {
    const confirm = this.signupForm.get('confirmPassword');
    return (
      this.signupForm.hasError('passwordMismatch') &&
      !!confirm &&
      (confirm.touched || confirm.dirty)
    );
  }
}
