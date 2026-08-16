"use server";

import { AuthError } from "next-auth";

import { signIn, signOut } from "@/auth";

import { credentialsSchema } from "./authenticate";

export type LoginActionState = {
  errorCode: "INVALID_CREDENTIALS" | null;
};

export async function loginAction(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const parsedCredentials = credentialsSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });

  if (!parsedCredentials.success) {
    return { errorCode: "INVALID_CREDENTIALS" };
  }

  try {
    await signIn("credentials", {
      username: parsedCredentials.data.username,
      password: parsedCredentials.data.password,
      redirectTo: "/app",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { errorCode: "INVALID_CREDENTIALS" };
    }

    throw error;
  }

  return { errorCode: null };
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
