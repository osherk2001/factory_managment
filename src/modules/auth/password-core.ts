import argon2 from "argon2";
import { z } from "zod";

export const MIN_PASSWORD_LENGTH = 10;

export const passwordSchema = z
  .string()
  .min(
    MIN_PASSWORD_LENGTH,
    `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
  )
  .max(256, "Password is too long");

export async function hashPassword(password: string): Promise<string> {
  const validatedPassword = passwordSchema.parse(password);

  return argon2.hash(validatedPassword, {
    type: argon2.argon2id,
  });
}

export async function verifyPassword(
  password: string,
  passwordHash: string | null,
): Promise<boolean> {
  if (!passwordHash) {
    return false;
  }

  const validatedPassword = passwordSchema.safeParse(password);
  if (!validatedPassword.success) {
    return false;
  }

  try {
    return await argon2.verify(passwordHash, validatedPassword.data);
  } catch {
    return false;
  }
}
