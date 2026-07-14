// Place this file at: functions/api/tiktok.js
// This makes it live at: https://instaboost-app.dargon4ek.workers.dev/api/tiktok
// (Pages Functions use file-based routing — the path in your repo IS the URL path.)

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const username = (url.searchParams.get("username") || "").replace(/^@/, "").trim();

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (!username) {
    return json({ error: "Missing username parameter" }, 400, corsHeaders);
  }

  try {
    const profileUrl = `https://www.tiktok.com/@${encodeURIComponent(username)}`;

    const res = await fetch(profileUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!res.ok) {
      return json(
        { error: `TikTok returned status ${res.status}` },
        502,
        corsHeaders
      );
    }

    const html = await res.text();
    const data = extractProfileData(html);

    if (!data) {
      return json(
        { error: "Could not read profile data (page structure may have changed, or the request was blocked)" },
        502,
        corsHeaders
      );
    }

    return json(data, 200, corsHeaders);
  } catch (err) {
    return json({ error: `Fetch failed: ${err.message}` }, 500, corsHeaders);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

function extractProfileData(html) {
  // Path 1: current TikTok page format
  const modernMatch = html.match(
    /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/
  );
  if (modernMatch) {
    try {
      const parsed = JSON.parse(modernMatch[1]);
      const userDetail =
        parsed?.__DEFAULT_SCOPE__?.["webapp.user-detail"]?.userInfo;
      if (userDetail?.user && userDetail?.stats) {
        const user = userDetail.user;
        const stats = userDetail.stats;
        return {
          followerCount: stats.followerCount ?? 0,
          heartCount: stats.heartCount ?? 0,
          videoCount: stats.videoCount ?? 0,
          signature: user.signature ?? "",
          nickname: user.nickname ?? username_fallback(user),
          avatar: user.avatarLarger || user.avatarMedium || user.avatarThumb || "",
        };
      }
    } catch (e) {
      // fall through to legacy path
    }
  }

  // Path 2: older fallback format
  const legacyMatch = html.match(
    /<script id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/
  );
  if (legacyMatch) {
    try {
      const parsed = JSON.parse(legacyMatch[1]);
      const userModule = parsed?.UserModule;
      const userKey = userModule?.users && Object.keys(userModule.users)[0];
      const statsKey = userModule?.stats && Object.keys(userModule.stats)[0];
      if (userKey && statsKey) {
        const user = userModule.users[userKey];
        const stats = userModule.stats[statsKey];
        return {
          followerCount: stats.followerCount ?? 0,
          heartCount: stats.heartCount ?? stats.heart ?? 0,
          videoCount: stats.videoCount ?? 0,
          signature: user.signature ?? "",
          nickname: user.nickname ?? "",
          avatar: user.avatarLarger || user.avatarMedium || user.avatarThumb || "",
        };
      }
    } catch (e) {
      // both paths failed
    }
  }

  return null;
}

function username_fallback(user) {
  return user?.uniqueId ?? "";
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}
