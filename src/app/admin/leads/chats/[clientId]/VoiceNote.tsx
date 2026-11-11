"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const MAX_SECONDS = 5 * 60;

/** Chrome records WebM, which WhatsApp refuses; decode it and encode MP3 (mono, 24 kHz, 48 kbps) in the browser. */
async function toMp3(recording: Blob): Promise<Blob> {
  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const rate = 24_000;
  const decoded = await new OfflineAudioContext(1, 1, rate).decodeAudioData(await recording.arrayBuffer());
  const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i));
  const pcm = new Int16Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) {
    let v = 0;
    for (const ch of channels) v += ch[i];
    v = Math.max(-1, Math.min(1, v / channels.length));
    pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  const encoder = new Mp3Encoder(1, rate, 48);
  const parts: Uint8Array[] = [];
  for (let i = 0; i < pcm.length; i += 1152) {
    const chunk = encoder.encodeBuffer(pcm.subarray(i, i + 1152));
    if (chunk.length) parts.push(new Uint8Array(chunk));
  }
  const end = encoder.flush();
  if (end.length) parts.push(new Uint8Array(end));
  return new Blob(parts as BlobPart[], { type: "audio/mpeg" });
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function VoiceNote({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "recording" | "ready" | "sending">("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    recorder.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  async function start() {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Allow the microphone for book.mindlap.in in your browser, then try again.");
      return;
    }
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      if (timer.current) clearInterval(timer.current);
      try {
        const mp3 = await toMp3(new Blob(chunks, { type: rec.mimeType }));
        setPreview({ blob: mp3, url: URL.createObjectURL(mp3) });
        setState("ready");
      } catch {
        setError("Couldn't prepare the recording. Try again.");
        setState("idle");
      }
    };
    recorder.current = rec;
    rec.start();
    setSeconds(0);
    setState("recording");
    timer.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_SECONDS && rec.state === "recording") rec.stop();
        return s + 1;
      });
    }, 1000);
  }

  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  function discard() {
    setPreview(null);
    setState("idle");
  }

  async function send() {
    if (!preview) return;
    setState("sending");
    setError(null);
    const body = new FormData();
    body.append("audio", preview.blob, "voice-note.mp3");
    const res = await fetch(`/api/whatsapp/chat/${clientId}/voice`, { method: "POST", body }).catch(() => null);
    const json = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    if (!res?.ok) {
      setError(json?.error ?? "Couldn't send the voice note. Check the connection and try again.");
      setState("ready");
      return;
    }
    setPreview(null);
    setState("idle");
    router.refresh();
  }

  return (
    <div className="grid gap-2">
      {state === "idle" && (
        <button type="button" className="btn-ghost justify-self-start" onClick={start}>
          <span aria-hidden="true">🎤</span> Record voice note
        </button>
      )}
      {state === "recording" && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-red-700" role="status">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600 motion-reduce:animate-none" aria-hidden="true" />
            Recording {clock(seconds)}
          </span>
          <button type="button" className="btn" onClick={stop}>Stop</button>
        </div>
      )}
      {(state === "ready" || state === "sending") && preview && (
        <div className="flex flex-wrap items-center gap-3">
          <audio controls src={preview.url} className="max-w-full" />
          <button type="button" className="btn" onClick={send} disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Send voice note"}</button>
          <button type="button" className="btn-ghost" onClick={discard} disabled={state === "sending"}>Discard</button>
        </div>
      )}
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
    </div>
  );
}
