export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // Your deployed Apps Script Web App URL (ends with /exec)
  const SCRIPT = "https://script.google.com/macros/s/AKfycbwg9hAI7oD0Nn_ELHLlXzl1xVZOiPBKsgXi7thqx-tGVeCfiedVZw2OHQWJudk85faSww/exec";

  // Forward query string (?action=...)
  const target = new URL(SCRIPT);
  target.search = url.search;

  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response("", { status: 204, headers: corsHeaders() });
  }

  const init = {
    method: request.method,
    headers: { "Content-Type": "application/json" }
  };

  // Forward POST body to Apps Script
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text();
  }

  const resp = await fetch(target.toString(), init);
  const text = await resp.text();

  return new Response(text, {
    status: resp.status,
    headers: {
      ...corsHeaders(),
      "Content-Type": resp.headers.get("Content-Type") || "application/json"
    }
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
