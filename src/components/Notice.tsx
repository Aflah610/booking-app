export function Notice({ error, ok }: { error?: string; ok?: string }) {
  if (error) {
    return (
      <p role="alert" className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
        {error}
      </p>
    );
  }
  if (ok) {
    return (
      <p role="status" className="mb-4 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
        {ok}
      </p>
    );
  }
  return null;
}
