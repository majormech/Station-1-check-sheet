export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  try {
    const scriptUrl = env.STATION1_SCRIPT_URL;
    if (!scriptUrl) throw new Error("Missing STATION1_SCRIPT_URL");

    // Forward query params
    const target = new URL(scriptUrl);
    for (const [k, v] of url.searchParams.entries()) {
      target.searchParams.set(k, v);
    }

    let upstream;
    if (request.method === "GET") {
      upstream = await fetch(target.toString());
    } else if (request.method === "POST") {
      const body = await request.text();
      upstream = await fetch(target.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body
      });
    } else {
      return new Response(
        JSON.stringify({ ok: false, error: "Method not allowed" }),
        { status: 405, headers: corsHeaders() }
      );
    }

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { ...corsHeaders(), "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: corsHeaders() }
    );
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
