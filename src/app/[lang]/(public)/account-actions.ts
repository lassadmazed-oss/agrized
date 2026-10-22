"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { signOutClient } from "@/lib/client-auth";

/**
 * «موش إنت؟ اخرج» — signing out from a form that was pre-filled from the buyer's account.
 *
 * zitounti/actions.ts already has a signOut, and it revalidates the زيتونتي page because that is where it is
 * pressed. Pressed on a request form it would leave the form itself cached with the previous buyer's name
 * still in it, which is the one outcome this button exists to prevent. So this one revalidates and returns
 * to the page it was pressed on, whichever that is.
 *
 * THE PATH IS THE READER'S, SO IT IS TREATED AS UNTRUSTED. Only a single-slash absolute path is followed;
 * anything else — a full URL, a protocol-relative «//elsewhere», an empty field — goes to the home page.
 * A sign-out button that can be pointed at another site is a phishing step, not a convenience.
 */
export async function signOutFromForm(formData: FormData): Promise<void> {
  await signOutClient();

  const asked = String(formData.get("path") ?? "");
  const path = asked.startsWith("/") && !asked.startsWith("//") ? asked : "/";

  revalidatePath(path);
  redirect(path);
}
