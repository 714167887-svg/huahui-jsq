import { calculateProtectedMetrics } from "../_lib/protected-calc.js";

export async function onRequestPost(context) {
  let payload = {};
  try {
    payload = await context.request.json();
  } catch (err) {
    return Response.json(
      { error: "INVALID_JSON" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
  const result = calculateProtectedMetrics(payload || {});
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
