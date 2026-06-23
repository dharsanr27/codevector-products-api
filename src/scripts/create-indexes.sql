
CREATE INDEX IF NOT EXISTS idx_products_created_at_id
    ON products (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_products_category_created_at_id
    ON products (category, created_at DESC, id DESC);