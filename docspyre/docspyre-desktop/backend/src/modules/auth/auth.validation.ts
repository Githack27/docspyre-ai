import { z } from 'zod';
import { PORTAL_PASSWORD_LENGTH } from '../../constants/licenseConstants';

const username = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(
    /^[a-zA-Z0-9._-]+$/,
    'Username may contain letters, numbers, dots, dashes and underscores only',
  )
  .transform((value) => value.toLowerCase());

const text = (max: number) => z.string().trim().min(1).max(max);

export const loginSchema = z
  .object({
    username,
    password: z.string().min(1).max(PORTAL_PASSWORD_LENGTH.maximum),
  })
  .strict();

export const registerSchema = z
  .object({
    firstName: text(60),
    lastName: text(60),
    username,
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
    companyName: text(120),
    password: z
      .string()
      .min(PORTAL_PASSWORD_LENGTH.minimum)
      .max(PORTAL_PASSWORD_LENGTH.maximum),
    confirmPassword: z.string(),
    phone: z
      .string()
      .regex(/^\d{6,15}$/, 'Phone number must contain 6 to 15 digits only'),
    country: z.string().regex(/^[A-Z]{2}$/, 'Select a country'),
    state: z.string().trim().max(120).default(''),
    licensePlanId: z.string().uuid('Select a license'),
  })
  .strict()
  .refine((input) => input.password === input.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
