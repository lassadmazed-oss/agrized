/** Where a figure comes from (e.g. an owner example awaiting Finance), shown right above the fields it explains. */
export function NoteCallout({ note, inherited = false }: { note: string | null | undefined; inherited?: boolean }) {
  const text = note?.trim();
  if (!text) return null;
  return (
    <div role="note" className="rounded-xl border border-gold bg-gold-soft px-4 py-3 text-sm leading-6 text-forest-700">
      <span className="font-semibold">{inherited ? "ملاحظة القاعدة العامة: " : "ملاحظة: "}</span>
      <span className="whitespace-pre-line">{text}</span>
    </div>
  );
}
