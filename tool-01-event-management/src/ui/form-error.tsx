export function FormError({ message, fieldErrors }: { message: string | null; fieldErrors?: Record<string, string> }) {
  if (!message) return null;
  const fields = Object.entries(fieldErrors ?? {});
  return (
    <div role="alert" className="rounded-control border border-risk/30 bg-risk-bg px-3 py-2 text-table text-risk">
      <p className="font-medium">{message}</p>
      {fields.length > 1 ? (
        <ul className="mt-1 list-disc pl-5">
          {fields.map(([k, v]) => (
            <li key={k}>{v}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
