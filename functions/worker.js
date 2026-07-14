/**
 * Instaboost — TikTok metrics Worker
 *
 * Scrapes the public TikTok profile page (no login, no official API key)
 * and returns follower/like/video counts + basic profile info as JSON.
 *
 * Deploy: `wrangler deploy` (or paste into the Cloudflare dashboard editor).
 * Frontend already calls: GET /?username=<handle>
 */

export default {
  async fetch(request) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const rawUsername = url.searchParams.get("username") || "";
    const username = rawUsername.trim().replace(/^@/, "");

    if (!username) {
      return jsonResponse({ error: "Missing username parameter" }, 400, corsHeaders);
    }

    // Basic sanity check on the handle to avoid abuse / weird input reaching TikTok
    if (!/^[a-zA-Z0-9._]{1,64}$/.test(username)) {
      return jsonResponse({ error: "Invalid username format" }, 400, corsHeaders);
    }

    try {
      const profile = await scrapeTikTokProfile(username);
      return jsonResponse(profile, 200, corsHeaders);
    } catch (err) {
      return jsonResponse(
        { error: err.message || "Failed to fetch TikTok profile" },
        502,
        corsHeaders
      );
    }
  },
};

async function scrapeTikTokProfile(username) {
  const pageUrl = `https://www.tiktok.com/@${encodeURIComponent(username)}`;

  const res = await fetch(pageUrl, {
    headers: {
      // A real browser UA matters — TikTok's edge will often serve a stripped
      // "please enable JS / verify" page to obvious bot user-agents.
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    },
    cf: {
      // Don't let Cloudflare's own cache serve a stale/blocked page indefinitely
      cacheTtl: 0,
      cacheEverything: false,
    },
  });

  if (res.status === 404) {
    throw new Error("TikTok profile not found");
  }
  if (!res.ok) {
    throw new Error(`TikTok returned status ${res.status}`);
  }

  const html = await res.text();

  const data = extractUniversalData(html) || extractSigiState(html);
  if (!data || !data.user || !data.stats) {
    // Most common causes: handle doesn't exist, account is banned/private,
    // or TikTok served a bot-check page instead of the real profile.
    throw new Error(
      "Could not read profile data — the account may not exist, or TikTok blocked this request"
    );
  }

  const { user, stats } = data;

  return {
    followerCount: numberOrZero(stats.followerCount),
    followingCount: numberOrZero(stats.followingCount),
    heartCount: numberOrZero(stats.heartCount ?? stats.heart),
    videoCount: numberOrZero(stats.videoCount),
    nickname: user.nickname || username,
    signature: user.signature || "",
    avatar: user.avatarLarger || user.avatarMedium || user.avatarThumb || "",
    verified: Boolean(user.verified),
    fetchedAt: new Date().toISOString(),
  };
}

// --- Primary path: current TikTok page format (2023+) ---
function extractUniversalData(html) {
  const match = html.match(
    /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/
  );
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[1]);
    const scope = parsed?.__DEFAULT_SCOPE__?.["webapp.user-detail"];
    const userInfo = scope?.userInfo;
    if (!userInfo) return null;
    return { user: userInfo.user, stats: userInfo.stats };
  } catch {
    return null;
  }
}

// --- Fallback: older SIGI_STATE format, kept as a safety net ---
function extractSigiState(html) {
  const match = html.match(/<script id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[1]);
    const userModule = parsed?.UserModule;
    if (!userModule) return null;
    const users = userModule.users || {};
    const stats = userModule.stats || {};
    const firstKey = Object.keys(users)[0];
    if (!firstKey) return null;
    return { user: users[firstKey], stats: stats[firstKey] };
  } catch {
    return null;
  }
}

function numberOrZero(val) {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

function jsonResponse(obj, status, corsHeaders) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
