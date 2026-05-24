"use client";

import { ButtonHTMLAttributes, ReactNode } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'text';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = ({
  children,
  className = '',
  variant = 'primary',
  size = 'md',
  type = 'button',
  ...props
}: ButtonProps) => {
  // Simple styling class builder matching realistic UI rules
  const baseClass = "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";
  
  const variantClasses = {
    primary: "bg-[#0F172A] text-white hover:bg-[#1E293B] dark:bg-[#F8FAFC] dark:text-[#0F172A] dark:hover:bg-[#E2E8F0]",
    secondary: "bg-[#F1F5F9] text-[#0F172A] hover:bg-[#E2E8F0] dark:bg-[#1E293B] dark:text-[#F8FAFC] dark:hover:bg-[#334155]",
    outline: "border border-[#E2E8F0] bg-transparent hover:bg-[#F1F5F9] dark:border-[#334155] dark:hover:bg-[#1E293B]",
    text: "bg-transparent hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B]",
  };

  const sizeClasses = {
    sm: "h-8 rounded-md px-3 text-xs",
    md: "h-10 rounded-md px-4 py-2 text-sm",
    lg: "h-11 rounded-md px-8 text-base",
  };

  const combinedClassName = `${baseClass} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`.trim();

  return (
    <button
      type={type}
      className={combinedClassName}
      {...props}
    >
      {children}
    </button>
  );
};
