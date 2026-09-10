import { getRequestLocale, getRequestMessages } from "@/lib/i18n/server";
import { selectLocale } from "@/modules/auth/preferences";
import { User, Globe, Building2, ShieldCheck, Check } from "lucide-react";

interface UserSettingsProps {
  username?: string | null;
  organizationName?: string | null;
}

export async function UserSettings({
  username,
  organizationName,
}: UserSettingsProps) {
  const locale = await getRequestLocale();
  const m = await getRequestMessages();

  return (
    <section className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {m.operations.userSettings}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {m.operations.languageDescription}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Language Preference Card */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Globe className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {m.operations.languagePreference}
              </h2>
              <p className="text-xs text-slate-500">
                {m.operations.language} / Language / Язык
              </p>
            </div>
          </div>

          <form action={selectLocale} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="user-locale-select"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-500"
              >
                {m.operations.language}
              </label>
              <select
                id="user-locale-select"
                name="locale"
                defaultValue={locale}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 shadow-xs transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="he">עברית (Hebrew)</option>
                <option value="en">English (English)</option>
                <option value="ru">Русский (Russian)</option>
              </select>
            </div>

            <button
              type="submit"
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-xs transition-all hover:bg-blue-700 active:scale-95"
            >
              <Check className="h-3.5 w-3.5" />
              <span>{m.operations.save}</span>
            </button>
          </form>
        </div>

        {/* User Profile Info Card */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <User className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {m.operations.userProfile}
              </h2>
              <p className="text-xs text-slate-500">{m.operations.employee}</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
              <span className="text-xs font-medium text-slate-500">
                {m.operations.username}
              </span>
              <span className="text-xs font-bold text-slate-900">
                {username}
              </span>
            </div>

            {organizationName ? (
              <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
                <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  <Building2 className="h-3.5 w-3.5 text-slate-400" />
                  <span>{m.operations.organization}</span>
                </span>
                <span className="text-xs font-bold text-slate-900">
                  {organizationName}
                </span>
              </div>
            ) : null}

            <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
              <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                <span>{m.operations.activeStatus}</span>
              </span>
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                Active
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
