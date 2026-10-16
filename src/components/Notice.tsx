export function Notice({ error, ok }: { error?: string; ok?: string }) {
  if (error) {
    return (
      <p role="alert" className="mb-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </p>
    );
  }
  if (ok) {
    return (
      <p role="status" className="mb-6 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
        {ok}
      </p>
    );
  }
  return null;
}
