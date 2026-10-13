import type { FormValuesByType, QrType } from "@/lib/payloads/definitions";

export interface FormApi<K extends QrType> {
  values: FormValuesByType[K];
  set: (field: keyof FormValuesByType[K] & string, value: string | boolean) => void;
  /** Error to display for a field (only after the user has left it). */
  error: (field: keyof FormValuesByType[K] & string) => string | undefined;
  touch: (field: keyof FormValuesByType[K] & string) => void;
}

/** Props for a text input bound to a form field. */
export function bind<K extends QrType>(api: FormApi<K>, field: keyof FormValuesByType[K] & string) {
  return {
    name: field,
    value: String(api.values[field] ?? ""),
    onChange: (event: { target: { value: string } }) => api.set(field, event.target.value),
    onBlur: () => api.touch(field),
    error: api.error(field),
  };
}
