"use client";

import { useEffect, useMemo, useReducer } from "react";
import { Card, SectionHeading } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { getLibrary, newId, saveDesign, StorageError } from "@/features/library/storage";
import { useQrModel } from "@/features/qr/use-qr-model";
import { isDynamicType } from "@/lib/dynamic-types";
import { buildPayloadFor, QR_TYPE_META, type PayloadResult, type QrType } from "@/lib/payloads/definitions";
import { utf8ByteLength } from "@/lib/qr/encode";
import type { UploadCredentials } from "@/features/dynamic/api";
import { DesignPanel } from "./design-panel";
import { createFromGenerator, updateFromGenerator } from "./dynamic-actions";
import type { FormApi } from "./forms/form-api";
import { AppForm, EmailForm, LocationForm, PhoneForm, SmsForm, TextForm, UrlForm, WhatsappForm } from "./forms/simple-forms";
import { EventForm, PaymentForm, SocialForm, VCardForm, WifiForm } from "./forms/structured-forms";
import { VideoForm } from "./forms/video-form";
import { ModePanel } from "./mode-panel";
import { PreviewPanel } from "./preview-panel";
import { generatorReducer, initialState } from "./state";
import { TypePicker } from "./type-picker";

export function Generator({ initialType = "url" }: { initialType?: QrType }) {
  const [state, dispatch] = useReducer(generatorReducer, initialType, initialState);
  const notify = useToast();

  const values = state.values[state.type];
  const result = useMemo(() => buildPayloadFor(state.type, values), [state.type, values]);
  const uploadMode = state.type === "video" && state.values.video.source === "upload";
  const isDynamic = isDynamicType(state.type) && (state.mode === "dynamic" || uploadMode);
  const content = isDynamic ? (state.dynamic?.shortUrl ?? "") : result.ok ? result.payload : "";
  // In upload mode the form has no payload of its own; the created short link is the content.
  const previewResult: PayloadResult =
    uploadMode && state.dynamic
      ? { ok: true, payload: state.dynamic.shortUrl, webUrl: state.dynamic.shortUrl, notes: [], video: null }
      : result;
  const model = useQrModel(content, state.style);

  // Opening a saved design from the library: /?load=<id>. Runs after hydration because
  // the library lives in this browser's localStorage.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("load");
    if (!id) return;
    const design = getLibrary().designs.find((d) => d.id === id);
    if (design) {
      dispatch({ kind: "load", id: design.id, name: design.name, type: design.type, values: design.values, style: design.style });
      notify(`Loaded “${design.name}”.`, "info");
    } else {
      notify("That saved design isn't in this browser's library.", "error");
    }
    params.delete("load");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}#generator`);
  }, [notify]);

  const api: FormApi<QrType> = {
    values,
    set: (field, value) => dispatch({ kind: "setField", field, value }),
    touch: (field) => dispatch({ kind: "touch", field }),
    error: (field) => {
      if (result.ok || !state.touched[`${state.type}.${field}`]) return undefined;
      return result.errors[field];
    },
  };

  /** A finished upload either creates the dynamic code or replaces the video of the existing one. */
  async function handleVideoUploaded(upload: UploadCredentials) {
    const presentation = state.presentation;
    if (state.dynamic) {
      const updated = await updateFromGenerator(state.dynamic, { upload, presentation });
      dispatch({ kind: "dynamicUpdated", dynamic: updated });
      notify("Video replaced. The printed code now plays the new video.");
      return;
    }
    const { dynamic, warning } = await createFromGenerator(state, "video", { upload }, presentation);
    dispatch({ kind: "dynamicCreated", dynamic });
    notify(warning ?? "Video uploaded and QR code created. It's saved in your library.", warning ? "error" : "success");
  }

  function handleSave() {
    if (!result.ok) return;
    const id = state.designId ?? newId();
    const name = state.name.trim() || `${QR_TYPE_META[state.type].label} QR code`;
    try {
      saveDesign({ id, name, type: state.type, values, style: state.style });
      dispatch({ kind: "designSaved", id });
      notify(state.designId ? "Saved changes to your library." : "Saved to your library (in this browser).");
    } catch (error) {
      notify(error instanceof StorageError ? error.message : "Couldn't save the design.", "error");
    }
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
      <Card className="p-5 sm:p-6 lg:col-start-1">
        <SectionHeading step={1} title="Choose a type" description="What should happen when someone scans the code?" />
        <div className="mt-5">
          <TypePicker value={state.type} onChange={(type) => dispatch({ kind: "setType", type })} />
        </div>
      </Card>

      <Card className="p-5 sm:p-6 lg:col-start-1">
        <SectionHeading step={2} title={`Add ${QR_TYPE_META[state.type].label.toLowerCase()} details`} />
        <form
          className="mt-5"
          noValidate
          aria-label={`${QR_TYPE_META[state.type].label} details`}
          onSubmit={(event) => event.preventDefault()}
        >
          <ContentForm
            type={state.type}
            api={api}
            result={result}
            video={{ hasCode: state.dynamic !== null, onUploaded: handleVideoUploaded }}
          />
        </form>
        <div className="mt-6 border-t border-border pt-5">
          <h3 className="mb-3 text-sm font-semibold text-fg">Static or dynamic</h3>
          <ModePanel state={state} result={result} uploadMode={uploadMode} dispatch={dispatch} />
        </div>
      </Card>

      {/* On large screens the preview sits in a sticky right column; on phones it follows the content step. */}
      <div className="lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:self-stretch">
        <div className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:rounded-2xl">
          <PreviewPanel
            type={state.type}
            result={previewResult}
            model={model}
            content={content}
            style={state.style}
            name={state.name}
            onNameChange={(name) => dispatch({ kind: "setName", name })}
            isDynamic={isDynamic}
            awaitingDynamic={isDynamic && !state.dynamic}
            awaitingMessage={
              uploadMode
                ? "Upload your video in step 2 — the QR code appears here as soon as it's hosted."
                : "Create the short link under “Static or dynamic” — the final QR code appears here."
            }
            onSave={uploadMode ? null : handleSave}
          />
        </div>
      </div>

      <Card className="p-5 sm:p-6 lg:col-start-1">
        <SectionHeading step={3} title="Customize the design" description="The preview updates as you change settings." />
        <div className="mt-5">
          <DesignPanel style={state.style} onChange={(patch) => dispatch({ kind: "setStyle", patch })} />
        </div>
      </Card>
    </div>
  );
}

function ContentForm({
  type,
  api,
  result,
  video,
}: {
  type: QrType;
  api: FormApi<QrType>;
  result: ReturnType<typeof buildPayloadFor>;
  video: { hasCode: boolean; onUploaded: (upload: UploadCredentials) => Promise<void> };
}) {
  // Each form is typed for its own fields; the generic api is narrowed by the switch on `type`.
  switch (type) {
    case "url":
      return <UrlForm api={api as FormApi<"url">} />;
    case "video":
      return (
        <VideoForm
          api={api as FormApi<"video">}
          video={result.ok ? result.video : null}
          hasCode={video.hasCode}
          onUploaded={video.onUploaded}
        />
      );
    case "text":
      return (
        <TextForm api={api as FormApi<"text">} byteLength={utf8ByteLength(String((api.values as { text: string }).text))} />
      );
    case "email":
      return <EmailForm api={api as FormApi<"email">} />;
    case "phone":
      return <PhoneForm api={api as FormApi<"phone">} />;
    case "sms":
      return <SmsForm api={api as FormApi<"sms">} />;
    case "whatsapp":
      return <WhatsappForm api={api as FormApi<"whatsapp">} />;
    case "wifi":
      return <WifiForm api={api as FormApi<"wifi">} />;
    case "vcard":
      return <VCardForm api={api as FormApi<"vcard">} />;
    case "location":
      return <LocationForm api={api as FormApi<"location">} />;
    case "social":
      return <SocialForm api={api as FormApi<"social">} />;
    case "event":
      return <EventForm api={api as FormApi<"event">} />;
    case "app":
      return <AppForm api={api as FormApi<"app">} />;
    case "payment":
      return <PaymentForm api={api as FormApi<"payment">} />;
  }
}
