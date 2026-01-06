export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // Locked GAS Web App URL (ends with /exec)
  const SCRIPT =
    "https://script.google.com/macros/s/AKfycbwg9hAI7oD0Nn_ELHLlXzl1xVZOiPBKsgXi7thqx-tGVeCfiedVZw2OHQWJudk85faSww/exec";

  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response("", { status: 204, headers: corsHeaders() });
  }

  // Build target URL (forward query string)
  const target = new URL(SCRIPT);
  target.search = url.search;

  // Forward method + a couple headers
  const init = {
    method: request.method,
    headers: new Headers()
  };

  const passHeaders = ["accept", "content-type"];
  for (const h of passHeaders) {
    const v = request.headers.get(h);
    if (v) init.headers.set(h, v);
  }

  // If no content-type was provided for POST/PUT, assume JSON
  if (
    request.method !== "GET" &&
    request.method !== "HEAD" &&
    request.method !== "OPTIONS" &&
    !init.headers.get("content-type")
  ) {
    init.headers.set("content-type", "application/json");
  }

  // Forward body for non-GET/HEAD
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text();
  }

  let resp;
  try {
    resp = await fetch(target.toString(), init);
  } catch (err) {
    return jsonError(502, "Proxy fetch failed", String(err));
  }

  const contentType = resp.headers.get("content-type") || "";
  const text = await resp.text();

  // If GAS returns HTML, convert to JSON error (prevents JSON.parse crash)
  if (contentType.includes("text/html") || text.trim().startsWith("<!DOCTYPE")) {
    return jsonError(
      502,
      "Upstream returned HTML (GAS error/login/deploy issue)",
      text.slice(0, 500)
    );
  }

  // Pass through
  const outHeaders = {
    ...corsHeaders(),
    "Content-Type": contentType || "application/json",
    "Cache-Control": "no-store"
  };

  return new Response(text, { status: resp.status, headers: outHeaders });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept"
  };
}

function jsonError(status, error, detail) {
  return new Response(JSON.stringify({ ok: false, error, detail }), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}
