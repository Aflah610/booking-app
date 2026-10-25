"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type FbLoginResponse = { authResponse?: { code?: string } | null };
type Fb = {
  init(o: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }): void;
  login(cb: (r: FbLoginResponse) => void, o: Record<string, unknown>): void;
};
declare global {
  interface Window { FB?: Fb }
}

// Two connection cards share one SDK and one Meta popup at a time.
let activeConnection: symbol | null = null;
let initialisedApp: string | null = null;

export function ConnectWhatsApp({ appId, configId, purpose, label, onDone }: { appId: string; configId: string; purpose: "leads" | "messages"; label: string; onDone: (form: FormData) => Promise<void> }) {
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<"idle" | "open" | "saving" | "cancelled">("idle");
  const owner = useRef(Symbol(purpose));
  const signup = useRef<{ code?: string; wabaId?: string; phoneNumberId?: string }>({});
  const formRef = useRef<HTMLFormElement>(null);

  const finish = () => {
    const { code, wabaId, phoneNumberId } = signup.current;
    if (activeConnection !== owner.current || !code || !wabaId || !phoneNumberId) return;
    // Clear first: a duplicate FINISH event cannot submit the form twice.
    activeConnection = null;
    const f = formRef.current!;
    for (const [name, value] of Object.entries({ code, wabaId, phoneNumberId })) {
      (f.elements.namedItem(name) as HTMLInputElement).value = value;
    }
    setState("saving");
    f.requestSubmit();
  };
  const finishRef = useRef(finish);
  useEffect(() => { finishRef.current = finish; });

  useEffect(() => {
    const key = owner.current;
    const onMessage = (e: MessageEvent) => {
      if (activeConnection !== key || !["https://www.facebook.com", "https://web.facebook.com"].includes(e.origin)) return;
      try {
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
        if (data.event === "FINISH" || data.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") {
          signup.current = { ...signup.current, wabaId: data.data?.waba_id, phoneNumberId: data.data?.phone_number_id };
          finishRef.current();
        } else if (data.event === "CANCEL" || data.event === "ERROR") {
          activeConnection = null;
          setState("cancelled");
        }
      } catch {
        // Other messages do not belong to the sign-up flow.
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (activeConnection === key) activeConnection = null;
    };
  }, []);

  const sdkReady = () => {
    if (!window.FB) return;
    if (initialisedApp !== appId) {
      window.FB.init({ appId, autoLogAppEvents: false, xfbml: false, version: "v21.0" });
      initialisedApp = appId;
    }
    setReady(true);
  };

  const start = () => {
    if (!window.FB || activeConnection) return;
    activeConnection = owner.current;
    signup.current = {};
    setState("open");
    window.FB.login(
      (r) => {
        if (activeConnection !== owner.current) return;
        if (!r.authResponse?.code) {
          activeConnection = null;
          setState("cancelled");
          return;
        }
        signup.current.code = r.authResponse.code;
        // The code and FINISH event may arrive in either order.
        finishRef.current();
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
      <Script id="facebook-jssdk" src="https://connect.facebook.net/en_US/sdk.js" strategy="afterInteractive" onLoad={sdkReady} onReady={sdkReady} />
      <input type="hidden" name="purpose" value={purpose} />
      <input type="hidden" name="code" />
      <input type="hidden" name="wabaId" />
      <input type="hidden" name="phoneNumberId" />
      <div>
        <button type="button" className="btn" onClick={start} disabled={!ready || state === "open" || state === "saving"}>
          {state === "saving" ? "Connecting…" : state === "open" ? "Finish in Meta's window…" : label}
        </button>
      </div>
      {state === "cancelled" && <p className="text-sm text-red-700">The connection wasn&apos;t finished. Try again and complete every step in Meta&apos;s window.</p>}
    </form>
  );
}
