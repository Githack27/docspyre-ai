'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './login.module.css';

export default function Logout() {
  const router = useRouter();

  useEffect(() => {
    const performLogout = async () => {
      localStorage.removeItem('isAuthenticated');
      localStorage.removeItem('userEmail');
      sessionStorage.removeItem('isAuthenticated');
      sessionStorage.removeItem('userEmail');

      await fetch('/auth/logout', { method: 'POST' });

      router.push('/login');
    };

    performLogout();
  }, [router]);

  return (
    <div className={styles['logout-container']}>
      <div className={styles['logout-spinner']} />
      <p>Logging out...</p>
    </div>
  );
}
