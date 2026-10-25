"use client";

import { useEffect, useRef, useState } from "react";

type FbLoginResponse = { authResponse?: { code?: string } | null };
type Fb = {
  init(o: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }): void;
  login(cb: (r: FbLoginResponse) => void, o: Record<string, unknown>): void;
};
declare global {
  interface Window { FB?: Fb; fbAsyncInit?: () => void }
}

/**
 * Meta's embedded sign-up for an existing WhatsApp Business app number (Coexistence). Meta's window shows a QR code to scan
 * in the app on the phone; when it finishes we get a code and the account and number ids, and send them to `onDone`.
 */
export function ConnectWhatsApp({ appId, configId, onDone }: { appId: string; configId: string; onDone: (form: FormData) => Promise<void> }) {
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<"idle" | "open" | "saving" | "cancelled">("idle");
  const ids = useRef<{ wabaId?: string; phoneNumberId?: string }>({});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    window.fbAsyncInit = () => {
      window.FB?.init({ appId, autoLogAppEvents: true, xfbml: false, version: "v21.0" });
      setReady(true);
    };
    if (!document.getElementById("facebook-jssdk")) {
      const s = document.createElement("script");
      s.id = "facebook-jssdk";
      s.src = "https://connect.facebook.net/en_US/sdk.js";
      s.async = true;
      s.crossOrigin = "anonymous";
      document.body.appendChild(s);
    } else if (window.FB) queueMicrotask(() => setReady(true));

    // Meta posts the chosen account and number from its window before the login callback runs.
    const onMessage = (e: MessageEvent) => {
      if (!e.origin.endsWith("facebook.com")) return;
      try {
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
        if (data.event === "FINISH" || data.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") {
          ids.current = { wabaId: data.data?.waba_id, phoneNumberId: data.data?.phone_number_id };
        } else if (data.event === "CANCEL") setState("cancelled");
      } catch {
        // Not Meta's sign-up message.
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [appId]);

  const start = () => {
    setState("open");
    window.FB?.login(
      (r) => {
        const code = r.authResponse?.code;
        const { wabaId, phoneNumberId } = ids.current;
        if (!code || !wabaId || !phoneNumberId) {
          setState("cancelled");
          return;
        }
        const f = formRef.current!;
        (f.elements.namedItem("code") as HTMLInputElement).value = code;
        (f.elements.namedItem("wabaId") as HTMLInputElement).value = wabaId;
        (f.elements.namedItem("phoneNumberId") as HTMLInputElement).value = phoneNumberId;
        setState("saving");
        f.requestSubmit();
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" },
      },
    );
  };

  return (
    <form ref={formRef} action={onDone} className="grid gap-3">
      <input type="hidden" name="code" />
      <input type="hidden" name="wabaId" />
      <input type="hidden" name="phoneNumberId" />
      <div>
        <button type="button" className="btn" onClick={start} disabled={!ready || state === "open" || state === "saving"}>
          {state === "saving" ? "Connecting…" : state === "open" ? "Finish in Meta's window…" : "Connect WhatsApp Business app"}
        </button>
      </div>
      {state === "cancelled" && <p className="text-sm text-red-700">The connection wasn&apos;t finished. Try again and complete every step in Meta&apos;s window.</p>}
    </form>
  );
}
