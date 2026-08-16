import { validateEnvironment } from "./env-validation";

export const env = validateEnvironment(process.env);
