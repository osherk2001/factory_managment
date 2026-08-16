"use client";

import { useActionState } from "react";

import { defaultLocale, getMessages } from "@/lib/i18n";

import { loginAction, type LoginActionState } from "./actions";

const messages = getMessages(defaultLocale);
const initialState: LoginActionState = { errorCode: null };

export function LoginForm() {
  const [state, formAction, isSubmitting] = useActionState(
    loginAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="username">
          {messages.auth.username}
        </label>
        <input
          autoComplete="username"
          className="flex h-11 w-full rounded-md border bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          id="username"
          name="username"
          required
          type="text"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="password">
          {messages.auth.password}
        </label>
        <input
          autoComplete="current-password"
          className="flex h-11 w-full rounded-md border bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          id="password"
          name="password"
          required
          type="password"
        />
      </div>

      {state.errorCode ? (
        <p aria-live="polite" className="text-destructive text-sm" role="alert">
          {messages.auth.invalidCredentials}
        </p>
      ) : null}

      <button
        className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? messages.auth.submitting : messages.auth.submit}
      </button>
    </form>
  );
}
