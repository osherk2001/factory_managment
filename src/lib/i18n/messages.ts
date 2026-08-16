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
    auth: {
      title: "כניסה ל-FactoryFlow",
      username: "שם משתמש",
      password: "סיסמה",
      submit: "כניסה",
      submitting: "מתחבר...",
      invalidCredentials: "פרטי הכניסה אינם תקינים.",
    },
    app: {
      title: "FactoryFlow",
      welcome: "ברוך הבא",
      organization: "ארגון",
      noOrganization: "לא נמצא ארגון פעיל עבור החשבון.",
      organizationSelectionRequired: "יש לבחור ארגון לפני גישה לנתוני מפעל.",
      logout: "יציאה",
      loggingOut: "יוצא...",
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
    auth: {
      title: "Sign in to FactoryFlow",
      username: "Username",
      password: "Password",
      submit: "Sign in",
      submitting: "Signing in...",
      invalidCredentials: "The sign-in details are not valid.",
    },
    app: {
      title: "FactoryFlow",
      welcome: "Welcome",
      organization: "Organization",
      noOrganization: "No active organization was found for this account.",
      organizationSelectionRequired:
        "Select an organization before accessing factory data.",
      logout: "Sign out",
      loggingOut: "Signing out...",
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
    auth: {
      title: "Вход в FactoryFlow",
      username: "Имя пользователя",
      password: "Пароль",
      submit: "Войти",
      submitting: "Выполняется вход...",
      invalidCredentials: "Данные для входа неверны.",
    },
    app: {
      title: "FactoryFlow",
      welcome: "Добро пожаловать",
      organization: "Организация",
      noOrganization: "Для этой учетной записи нет активной организации.",
      organizationSelectionRequired:
        "Выберите организацию перед доступом к данным фабрики.",
      logout: "Выйти",
      loggingOut: "Выход...",
    },
  },
} as const;

export function getMessages(locale: Locale = defaultLocale) {
  return messages[locale];
}
