export const locales = ["he", "en", "ru"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "he";

const messages = {
  he: {
    metadata: {
      title: "FactoryFlow",
      description: "תשתית מערכת המעקב הייצורית FactoryFlow",
    },
    home: {
      eyebrow: "FactoryFlow · שלב 1",
      title: "התשתית מוכנה",
      description: "זוהי נקודת הפתיחה למערכת מעקב ייצור מודולרית ובטוחה.",
      foundationAction: "המשך יבוא בשלב הבא",
    },
  },
  en: {
    metadata: {
      title: "FactoryFlow",
      description: "FactoryFlow manufacturing tracking foundation",
    },
    home: {
      eyebrow: "FactoryFlow · Phase 1",
      title: "The foundation is ready",
      description:
        "This is the starting point for a modular and secure manufacturing tracking system.",
      foundationAction: "Coming in the next phase",
    },
  },
  ru: {
    metadata: {
      title: "FactoryFlow",
      description: "Основа системы производственного отслеживания FactoryFlow",
    },
    home: {
      eyebrow: "FactoryFlow · Этап 1",
      title: "Основа готова",
      description:
        "Это отправная точка модульной и безопасной системы отслеживания производства.",
      foundationAction: "Появится на следующем этапе",
    },
  },
} as const;

export function getMessages(locale: Locale = defaultLocale) {
  return messages[locale];
}
