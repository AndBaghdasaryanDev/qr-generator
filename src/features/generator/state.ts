import type { Presentation } from "@/lib/dynamic-types";
import { DEFAULT_VALUES, type AnyFormValues, type FormValuesByType, type QrType } from "@/lib/payloads/definitions";
import { DEFAULT_QR_STYLE, type QrStyle } from "@/lib/qr/style";

export type { Presentation };
export type Mode = "static" | "dynamic";

/** A dynamic code created during this session (also kept in the local library). */
export interface CreatedDynamic {
  code: string;
  shortUrl: string;
  manageToken: string;
  manageUrl: string;
  destinationUrl: string;
  presentation: Presentation;
  /** Whether the code points to an external link or to a video uploaded to this service. */
  source: "link" | "upload";
  fileName?: string;
}

export interface GeneratorState {
  type: QrType;
  values: FormValuesByType;
  /** `${type}.${field}` keys of fields the user has left at least once. */
  touched: Record<string, true>;
  style: QrStyle;
  name: string;
  mode: Mode;
  presentation: Presentation;
  dynamic: CreatedDynamic | null;
  /** Library entry this design is linked to, once saved or loaded. */
  designId: string | null;
}

export type GeneratorAction =
  | { kind: "setType"; type: QrType }
  | { kind: "setField"; field: string; value: string | boolean }
  | { kind: "touch"; field: string }
  | { kind: "setStyle"; patch: Partial<QrStyle> }
  | { kind: "setName"; name: string }
  | { kind: "setMode"; mode: Mode }
  | { kind: "setPresentation"; presentation: Presentation }
  | { kind: "dynamicCreated"; dynamic: CreatedDynamic }
  | { kind: "dynamicUpdated"; dynamic: CreatedDynamic }
  | { kind: "resetDynamic" }
  | { kind: "load"; id: string; name: string; type: QrType; values: AnyFormValues; style: QrStyle }
  | { kind: "designSaved"; id: string };

export function initialState(type: QrType = "url"): GeneratorState {
  return {
    type,
    values: DEFAULT_VALUES,
    touched: {},
    style: DEFAULT_QR_STYLE,
    name: "",
    mode: "static",
    presentation: "redirect",
    dynamic: null,
    designId: null,
  };
}

export function generatorReducer(state: GeneratorState, action: GeneratorAction): GeneratorState {
  switch (action.kind) {
    case "setType":
      if (action.type === state.type) return state;
      // A dynamic code belongs to the content it was created for; switching types starts fresh.
      return { ...state, type: action.type, dynamic: null, presentation: "redirect" };
    case "setField": {
      const current = state.values[state.type] as Record<string, string | boolean>;
      const next = {
        ...state,
        values: { ...state.values, [state.type]: { ...current, [action.field]: action.value } } as FormValuesByType,
      };
      // Uploaded videos default to the player page; links default to a plain redirect.
      if (state.type === "video" && action.field === "source") {
        return { ...next, presentation: action.value === "upload" ? "player" : "redirect" };
      }
      return next;
    }
    case "touch": {
      const key = `${state.type}.${action.field}`;
      return state.touched[key] ? state : { ...state, touched: { ...state.touched, [key]: true } };
    }
    case "setStyle":
      return { ...state, style: { ...state.style, ...action.patch } };
    case "setName":
      return { ...state, name: action.name };
    case "setMode":
      return { ...state, mode: action.mode };
    case "setPresentation":
      return { ...state, presentation: action.presentation };
    case "dynamicCreated":
      return { ...state, dynamic: action.dynamic, presentation: action.dynamic.presentation };
    case "dynamicUpdated":
      return { ...state, dynamic: action.dynamic, presentation: action.dynamic.presentation };
    case "resetDynamic":
      return { ...state, dynamic: null };
    case "load":
      return {
        ...initialState(action.type),
        values: { ...DEFAULT_VALUES, [action.type]: action.values } as FormValuesByType,
        style: action.style,
        name: action.name,
        designId: action.id,
      };
    case "designSaved":
      return { ...state, designId: action.id };
  }
}
