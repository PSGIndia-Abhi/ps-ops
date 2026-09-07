import { httpClient } from './httpClient';
import type { CurrentUser, LoginResponse } from '../types/auth';

/**
 * Auth API module. Contracts match backend/src/routes/auth.routes.js exactly
 * (verified against source, not guessed):
 *   POST /api/auth/login        -> { token, role, user_id?, contact_id? }
 *   GET  /api/auth/me           -> current user profile
 *   PATCH /api/auth/me          -> { name?, email?, phone? }
 *   POST /api/auth/me/password  -> { currentPassword, newPassword }
 *   POST /api/auth/forgot-password/send-otp   -> { email }
 *   POST /api/auth/forgot-password/verify-otp -> { email, otp, newPassword }
 */

export async function login(email: string, password: string): Promise<LoginResponse> {
  const { data } = await httpClient.post<LoginResponse>('/api/auth/login', {
    email,
    password,
  });
  return data;
}

export async function fetchCurrentUser(): Promise<CurrentUser> {
  const { data } = await httpClient.get<CurrentUser>('/api/auth/me');
  return data;
}

export async function updateProfile(payload: {
  name?: string;
  email?: string;
  phone?: string;
}): Promise<CurrentUser> {
  const { data } = await httpClient.patch<CurrentUser>('/api/auth/me', payload);
  return data;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await httpClient.post('/api/auth/me/password', { currentPassword, newPassword });
}

export async function sendForgotPasswordOtp(email: string): Promise<void> {
  await httpClient.post('/api/auth/forgot-password/send-otp', { email });
}

export async function resetPasswordWithOtp(
  email: string,
  otp: string,
  newPassword: string,
): Promise<void> {
  await httpClient.post('/api/auth/forgot-password/verify-otp', { email, otp, newPassword });
}
