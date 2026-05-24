'use client';

import { usePathname } from 'next/navigation';
import React from 'react';
import ShellLayout from '@/components/layout/ShellLayout';
import AuthCheck from '@/components/auth/AuthCheck';

const SHELL_EXCLUDED_PATHS = ['/login'];

interface LayoutShellProps {
  children: React.ReactNode;
}

export default function LayoutShell({ children }: LayoutShellProps) {
  const pathname = usePathname();
  const excludeShell = SHELL_EXCLUDED_PATHS.some((path) => pathname.startsWith(path));

  if (excludeShell) {
    return <>{children}</>;
  }

  return (
    <AuthCheck>
      <ShellLayout>{children}</ShellLayout>
    </AuthCheck>
  );
}
