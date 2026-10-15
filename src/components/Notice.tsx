export function Notice({ error, ok }: { error?: string; ok?: string }) {
  if (error) {
    return (
      <p role="alert" className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
        {error}
      </p>
    );
  }
  if (ok) {
    return (
      <p role="status" className="mb-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
        {ok}
      </p>
    );
  }
  return null;
}
