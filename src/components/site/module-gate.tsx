import { Leaf } from "lucide-react";
import Link from "next/link";

import { OliveBranch } from "@/components/site/olive-decor";

export function ComingSoon({ title }: { title: string }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      <div className="relative mx-auto max-w-2xl overflow-hidden rounded-3xl border border-line bg-cream px-6 py-16 text-center shadow-card sm:px-12">
        <OliveBranch className="-end-12 -top-12 w-44 -rotate-[30deg]" flip />
        <span className="icon-bubble relative mx-auto">
          <Leaf aria-hidden="true" className="size-7" strokeWidth={1.6} />
        </span>
        <p className="mt-6">
          <span className="pill pill-butter">قريباً</span>
        </p>
        <h1 className="section-title mt-3 text-4xl">{title}</h1>
        <p className="section-lead mx-auto mt-4 max-w-md">هذا القسم غير متاح حالياً. سنفتحه قريباً.</p>
        <Link href="/" className="btn btn-primary mt-8">
          العودة للصفحة الرئيسية
        </Link>
      </div>
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
