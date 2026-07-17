/**
 * GRAND — Worker backend
 * Routes:
 *   GET    /api/categories
 *   GET    /api/products              ?category=slug&new=1&search=text&limit=&offset=
 *   GET    /api/products/:slug
 *   GET    /api/me                    (auth) upserts user from Telegram initData, returns profile + favorite ids
 *   GET    /api/favorites             (auth)
 *   POST   /api/favorites/:slug       (auth)
 *   DELETE /api/favorites/:slug       (auth)
 *   GET    /api/cart                  (auth)
 *   POST   /api/cart                  (auth) { productSlug, size, color, qty }
 *   PATCH  /api/cart/:id              (auth) { qty }
 *   DELETE /api/cart/:id              (auth)
 *   POST   /api/orders                (auth) checkout — creates order from current cart, clears cart
 *   GET    /api/orders                (auth)
 *   GET    /api/addresses             (auth)
 *   POST   /api/addresses             (auth) { label, fullName, phone, city, addressLine, postalCode }
 *   PATCH  /api/addresses/:id         (auth) { setDefault:true } or any subset of the fields above
 *   DELETE /api/addresses/:id         (auth)
 *   GET    /api/payment-methods       (auth)
 *   POST   /api/payment-methods       (auth) { brand, last4, expMonth, expYear, label } — display-only, never a full card number
 *   PATCH  /api/payment-methods/:id   (auth) { setDefault:true }
 *   DELETE /api/payment-methods/:id   (auth)
 *
 * Everything else falls through to static assets (env.ASSETS), which serves index.html.
 *
 * Auth: every authenticated request must include header `X-Telegram-Init-Data`
 * (the raw `Telegram.WebApp.initData` string). It is verified against BOT_TOKEN
 * on every request — stateless, no session table needed.
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function errorResponse(message, status = 400) {
  return json({ error: message }, status);
}

// ---- Telegram initData verification -------------------------------------

async function hmacSha256(keyBytes, message) {
  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
}

function bufToHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function verifyTelegramInitData(initData, botToken) {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const pairs = [];
  for (const [key, value] of params.entries()) pairs.push(`${key}=${value}`);
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secretKeyBuf = await hmacSha256(new TextEncoder().encode('WebAppData'), botToken);
  const computedHashBuf = await hmacSha256(new Uint8Array(secretKeyBuf), dataCheckString);
  const computedHash = bufToHex(computedHashBuf);

  if (computedHash !== hash) return null;

  // optional: reject stale initData (older than 24h)
  const authDate = Number(params.get('auth_date') || 0);
  if (authDate && Date.now() / 1000 - authDate > 86400) return null;

  const userRaw = params.get('user');
  if (!userRaw) return null;
  try {
    return JSON.parse(userRaw);
  } catch {
    return null;
  }
}

async function requireUser(request, env) {
  const initData = request.headers.get('X-Telegram-Init-Data') || '';
  const tgUser = await verifyTelegramInitData(initData, env.BOT_TOKEN);
  if (!tgUser) return null;

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO users (telegram_id, username, first_name, last_name, photo_url, is_premium, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(telegram_id) DO UPDATE SET
       username=excluded.username, first_name=excluded.first_name, last_name=excluded.last_name,
       photo_url=excluded.photo_url, is_premium=excluded.is_premium, last_seen_at=excluded.last_seen_at`
  ).bind(
    tgUser.id, tgUser.username || null, tgUser.first_name || null, tgUser.last_name || null,
    tgUser.photo_url || null, tgUser.is_premium ? 1 : 0, now
  ).run();

  const row = await env.DB.prepare(`SELECT * FROM users WHERE telegram_id = ?`).bind(tgUser.id).first();
  return row;
}

// ---- Product shaping -------------------------------------------------------

async function attachProductExtras(env, products) {
  if (products.length === 0) return products;
  const ids = products.map((p) => p.id);
  const placeholders = ids.map(() => '?').join(',');

  const [sizes, colors, care] = await Promise.all([
    env.DB.prepare(`SELECT * FROM product_sizes WHERE product_id IN (${placeholders}) ORDER BY sort_order`).bind(...ids).all(),
    env.DB.prepare(`SELECT * FROM product_colors WHERE product_id IN (${placeholders}) ORDER BY sort_order`).bind(...ids).all(),
    env.DB.prepare(`SELECT * FROM product_care WHERE product_id IN (${placeholders}) ORDER BY sort_order`).bind(...ids).all(),
  ]);

  const byProduct = (rows) => {
    const map = {};
    for (const r of rows.results) {
      (map[r.product_id] = map[r.product_id] || []).push(r);
    }
    return map;
  };
  const sizeMap = byProduct(sizes);
  const colorMap = byProduct(colors);
  const careMap = byProduct(care);

  return products.map((p) => ({
    ...p,
    sizes: (sizeMap[p.id] || []).map((s) => ({ size: s.size, stock: s.stock })),
    colors: (colorMap[p.id] || []).map((c) => ({ name: c.name, hex: c.hex })),
    care: (careMap[p.id] || []).map((c) => ({ icon: c.icon, title: c.title, description: c.description })),
  }));
}

// ---- Router ----------------------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (!pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    try {
      // GET /api/categories
      if (pathname === '/api/categories' && request.method === 'GET') {
        const { results } = await env.DB.prepare(`SELECT * FROM categories ORDER BY sort_order`).all();
        return json(results);
      }

      // GET /api/products
      if (pathname === '/api/products' && request.method === 'GET') {
        const category = url.searchParams.get('category');
        const isNew = url.searchParams.get('new');
        const search = url.searchParams.get('search');
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
        const offset = parseInt(url.searchParams.get('offset') || '0', 10);

        let sql = `SELECT p.* FROM products p
                   LEFT JOIN categories c ON c.id = p.category_id
                   WHERE p.is_active = 1`;
        const binds = [];

        if (category) { sql += ` AND c.slug = ?`; binds.push(category); }
        if (isNew === '1') { sql += ` AND p.is_new = 1`; }
        if (search) { sql += ` AND (p.name LIKE ? OR p.material LIKE ? OR p.subtitle LIKE ?)`; binds.push(`%${search}%`, `%${search}%`, `%${search}%`); }

        sql += ` ORDER BY p.sort_order LIMIT ? OFFSET ?`;
        binds.push(limit, offset);

        const { results } = await env.DB.prepare(sql).bind(...binds).all();
        const shaped = await attachProductExtras(env, results);
        return json({ products: shaped, limit, offset });
      }

      // GET /api/products/:slug
      let m = pathname.match(/^\/api\/products\/([^/]+)$/);
      if (m && request.method === 'GET') {
        const product = await env.DB.prepare(
          `SELECT p.*, c.slug AS category_slug, c.name AS category_name
           FROM products p LEFT JOIN categories c ON c.id = p.category_id
           WHERE p.slug = ? AND p.is_active = 1`
        ).bind(m[1]).first();
        if (!product) return errorResponse('Product not found', 404);
        const [shaped] = await attachProductExtras(env, [product]);
        return json(shaped);
      }

      // GET /api/me
      if (pathname === '/api/me' && request.method === 'GET') {
        const user = await requireUser(request, env);
        if (!user) return errorResponse('Unauthorized', 401);
        const { results: favs } = await env.DB.prepare(
          `SELECT p.slug FROM favorites f JOIN products p ON p.id = f.product_id WHERE f.user_id = ?`
        ).bind(user.id).all();
        return json({
          user: {
            id: user.id, telegramId: user.telegram_id, username: user.username,
            firstName: user.first_name, lastName: user.last_name,
            photoUrl: user.photo_url, isPremium: !!user.is_premium,
          },
          favoriteSlugs: favs.map((f) => f.slug),
        });
      }

      // ---- Favorites (auth) ----
      if (pathname === '/api/favorites' && request.method === 'GET') {
        const user = await requireUser(request, env);
        if (!user) return errorResponse('Unauthorized', 401);
        const { results } = await env.DB.prepare(
          `SELECT p.* FROM favorites f JOIN products p ON p.id = f.product_id
           WHERE f.user_id = ? ORDER BY f.created_at DESC`
        ).bind(user.id).all();
        const shaped = await attachProductExtras(env, results);
        return json(shaped);
      }

      m = pathname.match(/^\/api\/favorites\/([^/]+)$/);
      if (m && (request.method === 'POST' || request.method === 'DELETE')) {
        const user = await requireUser(request, env);
        if (!user) return errorResponse('Unauthorized', 401);
        const product = await env.DB.prepare(`SELECT id FROM products WHERE slug = ?`).bind(m[1]).first();
        if (!product) return errorResponse('Product not found', 404);

        if (request.method === 'POST') {
          await env.DB.prepare(
            `INSERT INTO favorites (user_id, product_id) VALUES (?, ?) ON CONFLICT DO NOTHING`
          ).bind(user.id, product.id).run();
        } else {
          await env.DB.prepare(`DELETE FROM favorites WHERE user_id = ? AND product_id = ?`)
            .bind(user.id, product.id).run();
        }
        return json({ ok: true });
      }

      // ---- Cart (auth) ----
      if (pathname === '/api/cart' && request.method === 'GET') {
        const user = await requireUser(request, env);
        if (!user) return errorResponse('Unauthorized', 401);
        const { results } = await env.DB.prepare(
          `SELECT ci.id, ci.size, ci.color, ci.qty, p.*
           FROM cart_items ci JOIN products p ON p.id = ci.product_id
           WHERE ci.user_id = ? ORDER BY ci.created_at DESC`
        ).bind(user.id).all();
        return json(results.map((r) => ({
          cartItemId: r.id, size: r.size, color: r.color, qty: r.qty,
          product: { id: r.id, slug: r.slug, name: r.name, price_cents: r.price_cents, currency: r.currency, image_url: r.image_url },
        })));
      }

      if (pathname === '/api/cart' && request.method === 'POST') {
        const user = await requireUser(request, env);
        if (!user) return errorResponse('Unauthorized', 401);
        const body = await request.json().catch(() => ({}));
        const { productSlug, size = null, color = null, qty = 1 } = body;
        const product = await env.DB.prepare(`SELECT id FROM products WHERE slug = ?`).bind(productSlug).first();
        if (!product) return errorResponse('Product not found', 404);

        const existing = await env.DB.prepare(
          `SELECT id, qty FROM cart_items WHERE user_id=? AND product_id=? AND size IS ? AND color IS ?`
        ).bind(user.id, product.id, size, color).first();

        if (existing) {
          await env.DB.prepare(`UPDATE cart_items SET qty = qty + ? WHERE id = ?`).bind(qty, existing.id).run();
        } else {
          await env.DB.prepare(
            `INSERT INTO cart_items (user_id, product_id, size, color, qty) VALUES (?,?,?,?,?)`
          ).bind(user.id, product.id, size, color, qty).run();
        }
        return json({ ok: true });
      }

      m = pathname.match(/^\/api\/cart\/(\d+)$/);
      if (m && request.method === 'PATCH') {
        const user = await requireUser(request, env);
        if (!user) return errorResponse('Unauthorized', 401);
        const body = await request.json().catch(() => ({}));
        const qty = Math.max(1, parseInt(body.qty, 10) || 1);
        await env.DB.prepare(`UPDATE cart_items SET qty = ? WHERE id = ? AND user_id = ?`)
          .bind(qty, m[1], user.id).run();
        return json({ ok: true });
      }

      if (m && request.method === 'DELETE') {
        const user = await requireUser(request, env);
        if (!user) return errorResponse('Unauthorized', 401);
        await env.DB.prepare(`DELETE FROM cart_items WHERE id = ? AND user_id = ?`).bind(m[1], user.id).run();
        return json({ ok: true });
      }

      // ---- Orders (auth) ----
      if (pathname === '/api/orders' && request.method === 'POST') {
        const user = await requireUser(request, env);
        if (!user) return errorResponse('Unauthorized', 401);

        const { results: items } = await env.DB.prepare(
          `SELECT ci.size, ci.color, ci.qty, p.id AS product_id, p.name, p.price_cents, p.currency
           FROM cart_items ci JOIN products p ON p.id = ci.product_id WHERE ci.user_id = ?`
        ).bind(user.id).all();

        if (items.length === 0) return errorResponse('Cart is empty', 400);

        const currency = items[0].currency;
        const total = items.reduce((sum, it) => sum + it.price_cents * it.qty, 0);

        const orderResult = await env.DB.prepare(
          `INSERT INTO orders (user_id, total_cents, currency) VALUES (?, ?, ?)`
        ).bind(user.id, total, currency).run();
        const orderId = orderResult.meta.last_row_id;

        const stmts = items.map((it) =>
          env.DB.prepare(
            `INSERT INTO order_items (order_id, product_id, product_name, size, color, qty, price_cents)
             VALUES (?,?,?,?,?,?,?)`
          ).bind(orderId, it.product_id, it.name, it.size, it.color, it.qty, it.price_cents)
        );
        stmts.push(env.DB.prepare(`DELETE FROM cart_items WHERE user_id = ?`).bind(user.id));
        await env.DB.batch(stmts);

        return json({ orderId, total_cents: total, currency }, 201);
      }

      if (pathname === '/api/orders' && request.method === 'GET') {
        const user = await requireUser(request, env);
        if (!user) return errorResponse('Unauthorized', 401);
        const { results: orders } = await env.DB.prepare(
          `SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC`
        ).bind(user.id).all();
        for (const order of orders) {
          const { results: items } = await env.DB.prepare(
            `SELECT * FROM order_items WHERE order_id = ?`
          ).bind(order.id).all();
          order.items = items;
        }
        return json(orders);
      }

      // ---- Addresses (auth) ----
      if (pathname === '/api/addresses' && request.method === 'GET') {
        const user = await requireUser(request, env);
        if (!user) return errorResponse('Unauthorized', 401);
        const { results } = await env.DB.prepare(
          `SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC`
        ).bind(user.id).all();
        return json(results);
      }

      if (pathname === '/api/addresses' && request.method === 'POST') {
        const user = await requireUser(request, env);
        if (!user) return errorResponse('Unauthorized', 401);
        const body = await request.json().catch(() => ({}));
        const { label, fullName, phone, city, addressLine, postalCode } = body;
        if (!fullName || !phone || !city || !addressLine) {
          return errorResponse('fullName, phone, city and addressLine are required', 400);
        }
        const { results: existing } = await env.DB.prepare(
          `SELECT id FROM addresses WHERE user_id = ?`
        ).bind(user.id).all();
        const isDefault = existing.length === 0 ? 1 : 0;

        const result = await env.DB.prepare(
          `INSERT INTO addresses (user_id, label, full_name, phone, city, address_line, postal_code, is_default)
           VALUES (?,?,?,?,?,?,?,?)`
        ).bind(user.id, label || null, fullName, phone, city, addressLine, postalCode || null, isDefault).run();

        return json({ id: result.meta.last_row_id }, 201);
      }

      m = pathname.match(/^\/api\/addresses\/(\d+)$/);
      if (m && request.method === 'PATCH') {
        const user = await requireUser(request, env);
        if (!user) return errorResponse('Unauthorized', 401);
        const body = await request.json().catch(() => ({}));

        if (body.setDefault) {
          await env.DB.batch([
            env.DB.prepare(`UPDATE addresses SET is_default = 0 WHERE user_id = ?`).bind(user.id),
            env.DB.prepare(`UPDATE addresses SET is_default = 1 WHERE id = ? AND user_id = ?`).bind(m[1], user.id),
          ]);
          return json({ ok: true });
        }

        const fields = ['label', 'fullName', 'phone', 'city', 'addressLine', 'postalCode'];
        const colMap = { label: 'label', fullName: 'full_name', phone: 'phone', city: 'city', addressLine: 'address_line', postalCode: 'postal_code' };
        const sets = [];
        const binds = [];
        for (const f of fields) {
          if (body[f] !== undefined) { sets.push(`${colMap[f]} = ?`); binds.push(body[f]); }
        }
        if (sets.length === 0) return errorResponse('No fields to update', 400);
        binds.push(m[1], user.id);
        await env.DB.prepare(`UPDATE addresses SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).bind(...binds).run();
        return json({ ok: true });
      }

      if (m && request.method === 'DELETE') {
        const user = await requireUser(request, env);
        if (!user) return errorResponse('Unauthorized', 401);
        await env.DB.prepare(`DELETE FROM addresses WHERE id = ? AND user_id = ?`).bind(m[1], user.id).run();
        return json({ ok: true });
      }

      // ---- Payment methods (auth) ----
      // Display-only records. This endpoint never accepts a full card number or CVV —
      // only the non-sensitive brand/last4/expiry a real payment processor (Stripe,
      // Telegram Payments, etc.) would return after tokenizing a card. Wire an actual
      // gateway's tokenization flow in before accepting real cards.
      if (pathname === '/api/payment-methods' && request.method === 'GET') {
        const user = await requireUser(request, env);
        if (!user) return errorResponse('Unauthorized', 401);
        const { results } = await env.DB.prepare(
          `SELECT * FROM payment_methods WHERE user_id = ? ORDER BY is_default DESC, created_at DESC`
        ).bind(user.id).all();
        return json(results);
      }

      if (pathname === '/api/payment-methods' && request.method === 'POST') {
        const user = await requireUser(request, env);
        if (!user) return errorResponse('Unauthorized', 401);
        const body = await request.json().catch(() => ({}));
        const { brand, last4, expMonth, expYear, label } = body;
        if (!brand || !last4 || !/^\d{4}$/.test(String(last4))) {
          return errorResponse('brand and a 4-digit last4 are required', 400);
        }
        const { results: existing } = await env.DB.prepare(
          `SELECT id FROM payment_methods WHERE user_id = ?`
        ).bind(user.id).all();
        const isDefault = existing.length === 0 ? 1 : 0;

        const result = await env.DB.prepare(
          `INSERT INTO payment_methods (user_id, brand, last4, exp_month, exp_year, label, is_default)
           VALUES (?,?,?,?,?,?,?)`
        ).bind(user.id, brand, String(last4), expMonth || null, expYear || null, label || null, isDefault).run();

        return json({ id: result.meta.last_row_id }, 201);
      }

      m = pathname.match(/^\/api\/payment-methods\/(\d+)$/);
      if (m && request.method === 'PATCH') {
        const user = await requireUser(request, env);
        if (!user) return errorResponse('Unauthorized', 401);
        const body = await request.json().catch(() => ({}));
        if (!body.setDefault) return errorResponse('Only setDefault is supported', 400);
        await env.DB.batch([
          env.DB.prepare(`UPDATE payment_methods SET is_default = 0 WHERE user_id = ?`).bind(user.id),
          env.DB.prepare(`UPDATE payment_methods SET is_default = 1 WHERE id = ? AND user_id = ?`).bind(m[1], user.id),
        ]);
        return json({ ok: true });
      }

      if (m && request.method === 'DELETE') {
        const user = await requireUser(request, env);
        if (!user) return errorResponse('Unauthorized', 401);
        await env.DB.prepare(`DELETE FROM payment_methods WHERE id = ? AND user_id = ?`).bind(m[1], user.id).run();
        return json({ ok: true });
      }

      return errorResponse('Not found', 404);
    } catch (err) {
      return errorResponse(`Server error: ${err.message}`, 500);
    }
  },
};
