import Link from "next/link";

export function ComingSoon({ title }: { title: string }) {
  return (
    <section className="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
      <p className="text-sm font-semibold text-gold">قريباً</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-forest text-balance">{title}</h1>
      <p className="mt-4 leading-7 text-muted">هذا القسم غير متاح حالياً. سنفتحه قريباً.</p>
      <Link href="/" className="btn btn-secondary mt-8">
        العودة للصفحة الرئيسية
      </Link>
    </section>
  );
}

export function PreviewBanner() {
  return (
    <div role="status" className="border-b border-gold/30 bg-gold-soft px-4 py-2 text-center text-sm font-medium text-forest-700">
      معاينة داخلية: هذا القسم غير منشور للعموم، ويراه فريق AgriZed فقط.
    </div>
  );
}
