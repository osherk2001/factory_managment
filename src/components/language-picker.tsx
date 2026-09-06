import { selectLocale } from "@/modules/auth/preferences";
import { getRequestLocale, getRequestMessages } from "@/lib/i18n/server";
export async function LanguagePicker() {
  const locale = await getRequestLocale();
  const m = await getRequestMessages();
  return (
    <form action={selectLocale} className="flex items-center gap-2">
      <label>
        <span className="sr-only">{m.operations.language}</span>
        <select
          aria-label={m.operations.language}
          name="locale"
          defaultValue={locale}
          className="max-w-28 rounded border bg-white p-2 text-sm"
        >
          <option value="he">עברית</option>
          <option value="en">English</option>
          <option value="ru">Русский</option>
        </select>
      </label>
      <button className="rounded border px-2 py-2 text-xs">
        {m.operations.save}
      </button>
    </form>
  );
}
