import { createClient } from "npm:@supabase/supabase-js@2";

const GRAPH_VERSION = "v26.0";
const SITE_URL = "https://gajremithali.github.io/Digital-Shield/";

function base64urlDecode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "==".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return new Uint8Array([...binary].map((c) => c.charCodeAt(0)));
}

async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

function equalBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function verifyState(state: string, secret: string) {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) throw new Error("Invalid Facebook OAuth state.");
  const expected = await hmac(secret, encoded);
  if (!equalBytes(expected, base64urlDecode(signature))) throw new Error("Invalid Facebook OAuth state.");
  const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(encoded)));
  if (!payload?.user_id || !payload?.exp || Date.now() > Number(payload.exp)) {
    throw new Error("Facebook OAuth state expired. Please try again.");
  }
  return String(payload.user_id);
}

function redirect(status: string, message?: string) {
  const url = new URL(SITE_URL);
  url.searchParams.set("oauth", status);
  if (message) url.searchParams.set("message", message.slice(0, 300));
  return Response.redirect(url.toString(), 302);
}

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const appId = Deno.env.get("FACEBOOK_APP_ID");
    const appSecret = Deno.env.get("FACEBOOK_APP_SECRET");
    const redirectUri = Deno.env.get("FACEBOOK_REDIRECT_URI");
    const stateSecret = Deno.env.get("FACEBOOK_OAUTH_STATE_SECRET");

    if (!supabaseUrl || !serviceRoleKey || !appId || !appSecret || !redirectUri || !stateSecret) {
      return redirect("facebook_error", "Facebook OAuth is not configured yet.");
    }

    const requestUrl = new URL(req.url);
    const code = requestUrl.searchParams.get("code");
    const state = requestUrl.searchParams.get("state");
    const error = requestUrl.searchParams.get("error");
    const errorReason = requestUrl.searchParams.get("error_reason");

    if (error) {
      return redirect("facebook_cancelled", errorReason || "Facebook authorization was cancelled.");
    }
    if (!code || !state) return redirect("facebook_error", "Facebook did not return the required authorization code.");

    const userId = await verifyState(state, stateSecret);

    const tokenUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);

    const tokenResponse = await fetch(tokenUrl);
    const tokenJson = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenJson.access_token) {
      console.error("Facebook token exchange failed:", tokenJson);
      return redirect("facebook_error", "Facebook authorization could not be completed.");
    }

    const graphUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/me`);
    graphUrl.searchParams.set("fields", "id,name,picture.type(large)");
    graphUrl.searchParams.set("access_token", tokenJson.access_token);

    const profileResponse = await fetch(graphUrl);
    const profile = await profileResponse.json();
    if (!profileResponse.ok || !profile.id) {
      console.error("Facebook profile request failed:", profile);
      return redirect("facebook_error", "Facebook authorized the connection, but the profile data could not be read.");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const signals = {
      account_type: "Facebook account",
      api_access: true,
      api_provider: "Meta Graph API",
      facebook_user_id: String(profile.id),
      display_name: profile.name || null,
      profile_picture_url: profile.picture?.data?.url || null,
      profile_data_accessed: true,
      public_profile: null,
      contact_visible: null,
      location_visible: null,
      external_link: null,
      bio_sensitive: null,
      public_activity: null,
      weak_privacy_settings: null,
      private_content_accessed: false,
    };

    const { error: signalError } = await supabase.from("social_signals").upsert({
      user_id: userId,
      app_name: "Facebook",
      source: "facebook_api",
      signals,
      collected_at: new Date().toISOString(),
    }, { onConflict: "user_id,app_name,source" });

    if (signalError) {
      console.error("Facebook signal save failed:", signalError);
      return redirect("facebook_error", "Facebook connected, but Digital Shield could not save the authorized signal.");
    }

    const { error: connectionError } = await supabase.from("app_connections").upsert({
      user_id: userId,
      app_name: "Facebook",
      permission_status: "authorized",
      connected_at: new Date().toISOString(),
    }, { onConflict: "user_id,app_name" });

    if (connectionError) console.error("Facebook connection save failed:", connectionError);

    return redirect("facebook_success");
  } catch (error) {
    console.error("facebook-callback:", error);
    return redirect("facebook_error", error instanceof Error ? error.message : "Facebook authorization failed.");
  }
});
