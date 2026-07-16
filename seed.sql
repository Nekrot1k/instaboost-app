-- GRAND — seed data (migrated from the hardcoded PRODUCTS array)
-- Apply with: wrangler d1 execute grand-db --file=./seed.sql (add --remote for production)

INSERT INTO categories (slug, name, sort_order) VALUES
  ('odyag',      'Одяг',       1),
  ('aksesuary',  'Аксесуари',  2),
  ('vzuttya',    'Взуття',     3);

-- ── Одяг ─────────────────────────────────────────────────────────
INSERT INTO products (slug, name, category_id, subtitle, material, description, quote, price_cents, currency, badge, image_url, is_new, sort_order) VALUES
  ('blazer', 'Structured Blazer', (SELECT id FROM categories WHERE slug='odyag'),
    'Outerwear / Grand Edition', 'Wool / Silk Blend',
    'Втілення архітектурної точності та сучасних технологій. Створений для тих, хто цінує структурну цілісність та функціональний мінімалізм.',
    NULL, 2450000, 'UAH', 'Limited',
    'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=600&q=80', 0, 1),

  ('pant', 'Architect Pant', (SELECT id FROM categories WHERE slug='odyag'),
    'Bottoms / Structural Line', 'Raw Cotton / Charcoal',
    'Прямий силует із заниженою посадкою. Виготовлений з щільної бавовни для чіткої архітектурної драпіровки.',
    NULL, 1820000, 'UAH', NULL,
    'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=600&q=80', 1, 2),

  ('gilet', 'Vector Gilet', (SELECT id FROM categories WHERE slug='odyag'),
    'Vests / Utility Core', 'Tech Nylon / Thermal',
    'Технічний жилет з множинними кишенями для повсякденного утилітарного стилю.',
    NULL, 1590000, 'UAH', 'New Season',
    'https://images.unsplash.com/photo-1544923246-77307dd654cb?w=600&q=80', 1, 3),

  ('knit', 'Sculpted Knit', (SELECT id FROM categories WHERE slug='odyag'),
    'Knitwear / Obsidian Lab', 'Merino / Cashmere',
    'Об''ємний светр із суміші мериносу та кашеміру. М''яка структура з чіткими лініями плеча.',
    NULL, 1240000, 'UAH', NULL,
    'https://images.unsplash.com/photo-1576871337622-98d48d1cf531?w=600&q=80', 1, 4),

  ('trench', 'Tech Trench II', (SELECT id FROM categories WHERE slug='odyag'),
    'Технічний верхній одяг', 'Outerwear / Grand Edition',
    'Втілення архітектурної точності та сучасних технологій. Tech Trench II створений для тих, хто цінує структурну цілісність та функціональний мінімалізм. Виготовлений з тришарового композитного нейлону, що забезпечує абсолютний захист від вітру та вологи при збереженні повітропроникності.',
    'Монументальна форма зустрічається з утилітарною функцією.', 1850000, 'UAH', 'New Arrival',
    'https://images.unsplash.com/photo-1520975916090-3105956dac38?w=700&q=80', 1, 5),

  ('pullover', 'Carbon Pullover', (SELECT id FROM categories WHERE slug='odyag'),
    'Knitwear / Obsidian Lab', 'Bottoms / Structural Line',
    'Легкий пуловер із карбоновою фактурою пряжі.',
    NULL, 45000, 'USD', NULL,
    'https://images.unsplash.com/photo-1614179689702-355944cd0918?w=600&q=80', 1, 6);

-- ── Аксесуари ────────────────────────────────────────────────────
INSERT INTO products (slug, name, category_id, subtitle, material, description, quote, price_cents, currency, badge, image_url, is_new, sort_order) VALUES
  ('clutch', 'Titanium Clutch', (SELECT id FROM categories WHERE slug='aksesuary'),
    'Accessories / Titanium Series', 'Accessories',
    'Мінімалістичний клатч з титановою рамкою та магнітним замком.',
    NULL, 89000, 'USD', NULL,
    'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=600&q=80', 1, 1),

  ('mono', 'Mono Vision X', (SELECT id FROM categories WHERE slug='aksesuary'),
    'Eyewear / Brutalist Frame', 'Eyewear',
    'Скульптурна оправа з моноблочною лінзою.',
    NULL, 38000, 'USD', NULL,
    'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=600&q=80', 1, 2),

  ('scarf', 'Void Scarf', (SELECT id FROM categories WHERE slug='aksesuary'),
    'Accessories / Ethereal Series', 'Accessories',
    'Невагомий шарф з мерсеризованої вовни.',
    NULL, 21000, 'USD', NULL,
    'https://images.unsplash.com/photo-1520903920243-5b0205a7a9a1?w=600&q=80', 1, 3),

  ('carryall', 'Box Carryall', (SELECT id FROM categories WHERE slug='aksesuary'),
    'Accessories', 'Leather',
    'Структурована сумка з жорсткими гранями та знімним ременем.',
    NULL, 2400000, 'UAH', NULL,
    'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=600&q=80', 0, 4);

-- ── Взуття ───────────────────────────────────────────────────────
INSERT INTO products (slug, name, category_id, subtitle, material, description, quote, price_cents, currency, badge, image_url, is_new, sort_order) VALUES
  ('boot', 'Titan Boot', (SELECT id FROM categories WHERE slug='vzuttya'),
    'Footwear / Brutalist Walk', 'Footwear',
    'Масивний черевик з протекторною підошвою та посиленим носком.',
    NULL, 95000, 'USD', NULL,
    'https://images.unsplash.com/photo-1608256246200-53e635b5b65f?w=600&q=80', 1, 1),

  ('derbies', 'Mono Derbies', (SELECT id FROM categories WHERE slug='vzuttya'),
    'Footwear', 'Leather',
    'Класичні дербі з гладкої телячої шкіри на мінімалістичній підошві.',
    NULL, 1220000, 'UAH', NULL,
    'https://images.unsplash.com/photo-1614252369475-531eba835eb1?w=600&q=80', 0, 2);

-- ── Sizes ────────────────────────────────────────────────────────
-- Apparel: S/M/L/XL
INSERT INTO product_sizes (product_id, size, stock, sort_order)
SELECT id, size, 12, ord FROM products,
  (SELECT 'S' AS size, 1 AS ord UNION SELECT 'M', 2 UNION SELECT 'L', 3 UNION SELECT 'XL', 4)
WHERE slug IN ('blazer','pant','gilet','knit','trench','pullover');

-- Footwear: EU sizes
INSERT INTO product_sizes (product_id, size, stock, sort_order)
SELECT id, size, 6, ord FROM products,
  (SELECT '40' AS size, 1 AS ord UNION SELECT '41', 2 UNION SELECT '42', 3 UNION SELECT '43', 4 UNION SELECT '44', 5)
WHERE slug IN ('boot','derbies');

-- Accessories: one size
INSERT INTO product_sizes (product_id, size, stock, sort_order)
SELECT id, 'ONE SIZE', 20, 1 FROM products WHERE slug IN ('clutch','mono','scarf','carryall');

-- ── Colors ───────────────────────────────────────────────────────
INSERT INTO product_colors (product_id, name, hex, sort_order)
SELECT id, 'Obsidian Black', '#1a1a1a', 1 FROM products;

-- ── Care info (trench keeps its original copy; others get generic defaults) ─
INSERT INTO product_care (product_id, icon, title, description, sort_order)
SELECT id, '📐', 'Крій', 'Анатомічний силует з артикульованими рукавами.', 1 FROM products WHERE slug='trench';
INSERT INTO product_care (product_id, icon, title, description, sort_order)
SELECT id, '💧', 'Захист', 'DWR покриття та проклеєні шви.', 2 FROM products WHERE slug='trench';

INSERT INTO product_care (product_id, icon, title, description, sort_order)
SELECT id, '📐', 'Крій', 'Мінімалістичний силует з чіткими лініями.', 1 FROM products WHERE slug != 'trench';
INSERT INTO product_care (product_id, icon, title, description, sort_order)
SELECT id, '✂', 'Догляд', 'Дотримуйтесь інструкцій на ярлику виробу.', 2 FROM products WHERE slug != 'trench';
