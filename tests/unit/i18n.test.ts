import { describe, expect, it } from "vitest";

import { defaultLocale, getMessages, locales } from "../../src/lib/i18n";

describe("i18n foundation", () => {
  it("uses Hebrew as the default locale", () => {
    expect(defaultLocale).toBe("he");
    expect(getMessages(defaultLocale).home.title).toBe("התשתית מוכנה");
  });

  it("exposes the initial supported locales", () => {
    expect(locales).toEqual(["he", "en", "ru"]);
  });
});
