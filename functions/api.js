export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  try {
    // For alpha, we only support Station 1
    // Later you’ll add stationId -> scriptUrl mapping here.
    const scriptUrl = env.STATION1_SCRIPT_URL; // set in Cloudflare env vars
    const apiKey = env.API_KEY; // set in Cloudflare env vars

    // Forward query params to Apps Script
    const target = new URL(scriptUrl);
    for (const [k, v] of url.searchParams.entries()) target.searchParams.set(k, v);

    // Add auth key
    target.searchParams.set("key", apiKey);

    let resp;
    if (request.method === "GET") {
      resp = await fetch(target.toString(), { method: "GET" });
    } else {
      const bodyText = await request.text();
      const bodyJson = bodyText ? JSON.parse(bodyText) : {};
      bodyJson.key = apiKey;

      resp = await fetch(target.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyJson),
      });
    }

    const text = await resp.text();
    return new Response(text, {
      status: resp.status,
      headers: {
        ...corsHeaders(),
        "Content-Type": "application/json",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
