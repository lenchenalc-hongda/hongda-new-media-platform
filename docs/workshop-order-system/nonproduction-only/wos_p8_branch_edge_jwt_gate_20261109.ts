// WOS P8 — disposable Supabase development branch ONLY.
// No service-role use, no secrets, no business data or Storage mutations.
// Deployed with verify_jwt=true to prove the platform blocks anonymous calls.
// Remove by deleting the temporary Supabase branch after this rehearsal.
Deno.serve(async (_request: Request): Promise<Response> => {
  return new Response(JSON.stringify({
    ok: true,
    contract: "wos-p8-isolated-edge-jwt-gate",
    mode: "nonproduction-only"
  }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
});
