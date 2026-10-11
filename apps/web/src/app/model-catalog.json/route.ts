import { getModelCatalog } from "../../lib/model-catalog";

export async function GET() {
  try {
    return Response.json(await getModelCatalog(), { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } });
  } catch {
    return Response.json({ error: "Model catalog temporarily unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
