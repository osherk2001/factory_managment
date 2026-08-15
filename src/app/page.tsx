import { Button } from "@/components/ui/button";
import { defaultLocale, getMessages } from "@/lib/i18n";

export default function HomePage() {
  const messages = getMessages(defaultLocale);

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <section className="w-full max-w-2xl space-y-8 rounded-xl border bg-white p-8 shadow-sm">
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">
            {messages.home.eyebrow}
          </p>
          <h1 className="text-4xl font-semibold tracking-tight">
            {messages.home.title}
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            {messages.home.description}
          </p>
        </div>
        <Button type="button">{messages.home.foundationAction}</Button>
      </section>
    </main>
  );
}
