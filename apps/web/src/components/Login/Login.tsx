'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import styles from './login.module.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const router = useRouter();

  const onLogin = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsLoading(true);

    // Simulate login - accept any credentials for now
    setTimeout(async () => {
      if (email && password) {
        // Store auth state in localStorage/sessionStorage
        if (rememberMe) {
          localStorage.setItem('isAuthenticated', 'true');
          localStorage.setItem('userEmail', email);
        } else {
          sessionStorage.setItem('isAuthenticated', 'true');
          sessionStorage.setItem('userEmail', email);
        }
        
        // Set cookie for middleware
        await fetch('/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, rememberMe }),
        });
        
        // Redirect to home
        router.push('/home');
      } else {
        setErrorMessage('Please enter both email and password');
        setIsLoading(false);
      }
    }, 1000);
  };

  return (
    <div className={styles['login-page']}>
      {/* Left Section: Brand & Slogan */}
      <div className={styles['login-left']}>
        <div className={styles['brand-section']}>
          <div className={styles['logo-container']}>
            <img src="/images/Docspyre_logo.png" alt="DocSpyre AI Logo" className={styles['brand-logo']} />
          </div>
          <h1 className={styles['brand-title']}>DocSpyre AI</h1>
          <p className={styles['brand-description']}>Transform your documents with intelligent AI-powered analysis and insights</p>
        </div>
      </div>

      {/* Right Section: Form */}
      <div className={styles['login-right']}>
        <div className={styles['login-form-container']}>
          <div className={styles['form-header']}>
            <h2>Welcome Back</h2>
            <p className={styles['subtitle']}>Sign in to your account</p>
          </div>

          {errorMessage && (
            <div className={styles['error-message']}>
              <i className="bi bi-exclamation-circle"></i>
              {errorMessage}
            </div>
          )}

          <form onSubmit={onLogin} className={styles['login-form']}>
            <div className={styles['form-group']}>
              <label htmlFor="email">Email Address</label>
              <div className={styles['input-wrapper']}>
                <i className="bi bi-envelope"></i>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  name="email"
                  placeholder="Enter your email"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className={styles['form-group']}>
              <label htmlFor="password">Password</label>
              <div className={styles['input-wrapper']}>
                <i className="bi bi-lock"></i>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  name="password"
                  placeholder="Enter your password"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className={styles['form-options']}>
              <label className={styles['remember-me']}>
                <input 
                  type="checkbox" 
                  name="remember" 
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>Remember me</span>
              </label>
              <a href="#" className={styles['forgot-password']}>Forgot password?</a>
            </div>

            <button
              type="submit"
              className={styles['login-button']}
              disabled={isLoading}
            >
              {isLoading ? (
                <span className={styles['button-loading']}>
                  <i className="bi bi-arrow-repeat spinner-spin"></i>
                  Signing in...
                </span>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </form>

          <div className={styles['signup-section']}>
            <p>Don&apos;t have an account? <a href="#" className={styles['signup-link']}>Sign up here</a></p>
          </div>
        </div>
      </div>
    </div>
  );
}
