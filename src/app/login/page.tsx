import { getRequestMessages } from "@/lib/i18n/server";
import type { Metadata } from "next";

import { LoginForm } from "@/modules/auth/login-form";
import { LanguagePicker } from "@/components/language-picker";

export async function generateMetadata(): Promise<Metadata> {
  const messages = await getRequestMessages();
  return { title: `${messages.auth.title} · ${messages.app.title}` };
}

export default async function LoginPage() {
  const messages = await getRequestMessages();
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
        <LanguagePicker />
      </section>
    </main>
  );
}
