import type { Metadata } from "next";

import { defaultLocale, getMessages } from "@/lib/i18n";
import { LoginForm } from "@/modules/auth/login-form";

const messages = getMessages(defaultLocale);

export const metadata: Metadata = {
  title: `${messages.auth.title} · FactoryFlow`,
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-md space-y-8 rounded-xl border bg-white p-8 shadow-sm">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            FactoryFlow
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {messages.auth.title}
          </h1>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
