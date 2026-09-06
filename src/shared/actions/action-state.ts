export type ActionState = { errorCode: string | null; success: boolean };
export type FormAction = (
  previous: ActionState,
  form: FormData,
) => Promise<ActionState>;

export function formString(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}
