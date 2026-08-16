import argon2 from "argon2";
import { z } from "zod";

export const MIN_PASSWORD_LENGTH = 10;

// This fixed Argon2id hash is used only when no account hash exists, so valid
// credential attempts still perform password verification without a real user
// secret being stored in source control.
const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,p=4,t=3$xRK0ShlKqCiSuhk/Ue3IeA$QadE3ZG0FkFBVH7OjsW/U02ztLdgCcMthkoyS2xeHzg";

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
  const validatedPassword = passwordSchema.safeParse(password);
  if (!validatedPassword.success) {
    return false;
  }

  try {
    return await argon2.verify(
      passwordHash ?? DUMMY_PASSWORD_HASH,
      validatedPassword.data,
    );
  } catch {
    return false;
  }
}
