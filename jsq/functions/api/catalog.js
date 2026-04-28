import { getPublicModelCatalog } from "../_lib/model-catalog.js";

export async function onRequestGet() {
  return Response.json(
    { models: getPublicModelCatalog() },
    { headers: { "Cache-Control": "public, max-age=3600" } }
  );
}
