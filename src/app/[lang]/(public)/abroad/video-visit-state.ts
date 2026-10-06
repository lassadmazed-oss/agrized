// What the video-visit form shows after each submit. A file of its own because a "use server" file may only
// export async functions.

/**
 * What the visitor typed, handed back with a refusal: React resets a form after its action runs, and the fields
 * take these as their defaults, so a mistyped number costs one correction rather than the whole form.
 */
export type VideoVisitValues = { fullName: string; whatsapp: string; offer: string; note: string; consent: boolean };

export type VideoVisitState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      field?: "name" | "whatsapp" | "slot" | "consent";
      values: VideoVisitValues;
    }
  | { status: "done"; requestNo: string; at: string };

export const VIDEO_VISIT_IDLE: VideoVisitState = { status: "idle" };
