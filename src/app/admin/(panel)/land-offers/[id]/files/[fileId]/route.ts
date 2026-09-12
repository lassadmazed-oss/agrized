import { getStaffSession, hasRole, LAND_OFFER_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LAND_OFFER_BUCKET } from "@/lib/supabase/storage-upload";

/** Opens a landowner document through a short-lived link, and records who opened it (AUD-03). */
export async function GET(_request: Request, context: RouteContext<"/admin/land-offers/[id]/files/[fileId]">) {
  const session = await getStaffSession();
  if (!session || !hasRole(session, LAND_OFFER_ROLES)) {
    return new Response("Forbidden", { status: 403 });
  }

  const { id, fileId } = await context.params;
  const supabase = await createClient();
  const { data: file } = await supabase
    .from("land_offer_files")
    .select("id, storage_path, file_name")
    .eq("id", fileId)
    .eq("land_offer_id", id)
    .maybeSingle();
  if (!file) {
    return new Response("Not found", { status: 404 });
  }

  const { data: signed, error } = await supabase.storage.from(LAND_OFFER_BUCKET).createSignedUrl(file.storage_path, 300);
  if (error || !signed) {
    return new Response("The file could not be opened", { status: 500 });
  }

  await supabase.rpc("log_action", {
    p_action: "document.open",
    p_entity: "land_offer_files",
    p_entity_id: file.id,
    p_data: { file_name: file.file_name, land_offer_id: id },
  });

  return Response.redirect(signed.signedUrl, 302);
}
