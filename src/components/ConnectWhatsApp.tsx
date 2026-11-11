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

/** "app": the number stays on the phone's WhatsApp Business app (Coexistence). "cloud": a number on Meta's platform only, put into service with a PIN. */
export function ConnectWhatsApp({ appId, configId, purpose, label, onDone, mode = "app" }: { appId: string; configId: string; purpose: "leads" | "messages"; label: string; onDone: (form: FormData) => Promise<void>; mode?: "app" | "cloud" }) {
  const [pin, setPin] = useState("");
  const [ids, setIds] = useState({ wabaId: "", phoneNumberId: "" });
  const pinReady = mode === "app" || (/^\d{6}$/.test(pin) && /^\d{5,25}$/.test(ids.wabaId) && /^\d{5,25}$/.test(ids.phoneNumberId));
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<"idle" | "open" | "saving" | "cancelled" | "incomplete">("idle");
  const waiting = useRef<ReturnType<typeof setTimeout> | null>(null);
  const owner = useRef(Symbol(purpose));
  const signup = useRef<{ code?: string; wabaId?: string; phoneNumberId?: string }>({});
  const formRef = useRef<HTMLFormElement>(null);

  const finish = () => {
    // A number with no phone app: Meta's window often returns only the sign-in, so the ids typed here are used.
    const typed = mode === "cloud" ? ids : {};
    const { code, wabaId = typed.wabaId, phoneNumberId = typed.phoneNumberId } = signup.current;
    if (activeConnection !== owner.current || !code || !wabaId || !phoneNumberId) return;
    // Clear first: a duplicate FINISH event cannot submit the form twice.
    activeConnection = null;
    if (waiting.current) clearTimeout(waiting.current);
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
      if (waiting.current) clearTimeout(waiting.current);
    };
  }, []);

  const sdkReadyRef = useRef(() => {});
  const sdkReady = () => {
    if (!window.FB) return;
    if (initialisedApp !== appId) {
      window.FB.init({ appId, autoLogAppEvents: false, xfbml: false, version: "v21.0" });
      initialisedApp = appId;
    }
    setReady(true);
  };
  useEffect(() => { sdkReadyRef.current = sdkReady; });

  // The page loads Meta's script once; a box that mounts after it has loaded must not wait for a load event that already came.
  useEffect(() => {
    const timer = setInterval(() => {
      if (window.FB) { sdkReadyRef.current(); clearInterval(timer); }
    }, 300);
    return () => clearInterval(timer);
  }, []);

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
        // Meta can close its window without ever sending the number (e.g. the account isn't ready for the API).
        // Stop waiting rather than spinning forever.
        waiting.current = setTimeout(() => {
          if (activeConnection !== owner.current) return;
          activeConnection = null;
          setState("incomplete");
        }, 20_000);
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: mode === "app" ? { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" } : { setup: {}, sessionInfoVersion: "3" },
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
      {mode === "cloud" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor={`waba-${purpose}`}>WhatsApp account id</label>
            <input className="input" id={`waba-${purpose}`} inputMode="numeric" value={ids.wabaId} onChange={(e) => setIds({ ...ids, wabaId: e.target.value.replace(/\D/g, "") })} />
          </div>
          <div>
            <label className="label" htmlFor={`phone-${purpose}`}>Phone number id</label>
            <input className="input" id={`phone-${purpose}`} inputMode="numeric" value={ids.phoneNumberId} onChange={(e) => setIds({ ...ids, phoneNumberId: e.target.value.replace(/\D/g, "") })} />
          </div>
        </div>
      )}
      {mode === "cloud" && (
        <div className="max-w-xs">
          <label className="label" htmlFor={`pin-${purpose}`}>Two-step PIN (6 digits)</label>
          <input className="input" id={`pin-${purpose}`} name="pin" type="password" inputMode="numeric" maxLength={6} autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
        </div>
      )}
      <div>
        <button type="button" className="btn" onClick={start} disabled={!ready || !pinReady || state === "open" || state === "saving"}>
          {state === "saving" ? "Connecting…" : state === "open" ? "Finish in Meta's window…" : label}
        </button>
      </div>
      {state === "incomplete" && (
        <p className="text-sm text-red-700">
          Meta signed you in but didn&apos;t send the WhatsApp number back, so nothing was saved. This usually means the number
          isn&apos;t ready for the API yet in Meta (check WhatsApp Manager). Try again once Meta shows it as Connected.
        </p>
      )}
      {state === "cancelled" && <p className="text-sm text-red-700">The connection wasn&apos;t finished. Try again and complete every step in Meta&apos;s window.</p>}
    </form>
  );
}
