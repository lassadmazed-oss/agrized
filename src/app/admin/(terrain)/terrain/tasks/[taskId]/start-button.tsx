"use client";

import { useState, useTransition } from "react";

import { startFarmTask } from "../actions";

export function StartButton({ taskId }: { taskId: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await startFarmTask(taskId);
            setMessage(result ? { ok: result.ok, text: result.message } : null);
          })
        }
        className="btn btn-primary min-h-14 w-full text-lg"
      >
        ▶ بديت الخدمة
      </button>
      {message ? <p className={`text-sm font-semibold ${message.ok ? "text-success" : "text-danger"}`}>{message.text}</p> : null}
    </div>
  );
}
