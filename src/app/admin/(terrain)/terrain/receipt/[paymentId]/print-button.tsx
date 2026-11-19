"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn btn-primary min-h-12 flex-1">
      🖨️ اطبع الوصل
    </button>
  );
}
