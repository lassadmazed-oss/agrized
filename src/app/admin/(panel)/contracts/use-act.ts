"use client";

// Running one of the module's acts, in the one place all four forms share.
//
// The reservations module keeps this hook private inside reservation-block.tsx because every act it has lives
// in that one file. The contracts module spreads its acts over four screens — the queue, the client file, the
// schedule and the document's own controls — so a private copy per file would be four chances for «what do we
// do after a refusal» to drift. Refusal is the part that matters: a Server Action here never throws for a
// business rule, it answers with an Arabic sentence, and that sentence must land next to the control that
// caused it rather than in a toast that has gone by the time the reader looks up.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/** Both shapes this module's actions answer with: the contract as it now stands, or a sentence. */
type ActResult = { ok: true } | { ok: false; message: string };

export function useAct(onDone: () => void = () => undefined) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const run = <T extends ActResult>(call: () => Promise<T>) => {
    setError(null);
    startTransition(async () => {
      const result = await call();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onDone();
      // The act changed money, and several screens read it. The Server Action already expired their caches;
      // this repaints the one the reader is looking at.
      router.refresh();
    });
  };

  return { error, pending, run, clearError: () => setError(null) };
}
