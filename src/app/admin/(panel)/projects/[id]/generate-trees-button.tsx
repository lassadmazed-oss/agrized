"use client";

// «رقّم زيتونات هذا العرض» — the one button that turns projects.tree_count into real rows in public.trees, each
// with its own code (OFF-AIRPORT-0001…). The owner's «we just give each tree a number or an id»: until it is
// pressed the offer declares 500 trees that exist nowhere, and no screen can say what is available.
//
// It is idempotent in the database (staff_generate_trees inserts only the missing numbers), so the same button
// is also the renumber button when the rows and tree_count disagree. It is a button and not an <ActionForm>
// because the Server Action takes the offer id, not a form: there is nothing to type.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { formatCount } from "@/lib/format";

import { generateOfferTrees } from "../actions";

export function GenerateTreesButton({
  projectId,
  label,
  className = "btn btn-primary btn-sm",
}: {
  projectId: string;
  /** «رقّم زيتونات هذا العرض» the first time, «أعد ترقيم الزيتونات» when the counts disagree. */
  label: string;
  className?: string;
}) {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const run = () => {
    setResult(null);
    startTransition(async () => {
      const done = await generateOfferTrees(projectId);
      if (!done.ok) {
        setResult({ ok: false, message: done.message });
        return;
      }
      const parts = [
        done.added > 0 ? `${formatCount(done.added)} زيتونة جديدة` : null,
        done.removed > 0 ? `${formatCount(done.removed)} زيتونة زايدة تنحّات` : null,
      ].filter(Boolean);
      setResult({
        ok: true,
        message:
          parts.length > 0
            ? `تمّ الترقيم: ${parts.join(" · ")}. إجمالي زيتونات العرض: ${formatCount(done.total)}.`
            : `الزيتونات مرقّمة كيما لازم: ${formatCount(done.total)} زيتونة. ما تبدّل شيء.`,
      });
      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      <button type="button" onClick={run} disabled={pending} className={className}>
        {pending ? "جارٍ الترقيم…" : label}
      </button>
      {result ? (
        <p role={result.ok ? "status" : "alert"} className={`text-sm font-medium ${result.ok ? "text-success" : "text-danger"}`}>
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
