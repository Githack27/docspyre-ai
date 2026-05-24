'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export default function AuthCheck({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Skip auth check for login page
    if (pathname === '/login') {
      return;
    }

    // Check if user is authenticated
    const isAuthenticatedLocal = localStorage.getItem('isAuthenticated') === 'true';
    const isAuthenticatedSession = sessionStorage.getItem('isAuthenticated') === 'true';

    if (!isAuthenticatedLocal && !isAuthenticatedSession) {
      router.push('/login');
    }
  }, [pathname, router]);

  return <>{children}</>;
}
