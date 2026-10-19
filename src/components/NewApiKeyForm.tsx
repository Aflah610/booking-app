"use client";

import { useActionState } from "react";
import { createApiKeyAction, type NewApiKeyState } from "@/app/admin/actions";

export function NewApiKeyForm({ scope = "website", placeholder = "e.g. Main website" }: { scope?: "website" | "otp"; placeholder?: string }) {
  const [state, action, pending] = useActionState<NewApiKeyState, FormData>(createApiKeyAction, null);
  return (
    <div className="grid gap-4">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="scope" value={scope} />
        <div className="min-w-56 flex-1">
          <label className="label" htmlFor="name">Name</label>
          <input className="input" id="name" name="name" placeholder={placeholder} required />
        </div>
        <button className="btn" type="submit" disabled={pending}>Create key</button>
      </form>
      {state?.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      {state?.key && (
        <div role="status" className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm">
          <p className="mb-2 text-green-700">Copy the key for “{state.name}” now. It is shown only once.</p>
          <input className="input font-mono" readOnly value={state.key} aria-label="New API key" />
        </div>
      )}
    </div>
  );
}
