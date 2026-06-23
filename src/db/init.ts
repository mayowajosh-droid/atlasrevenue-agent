import { pool } from "../config.js";

export async function initDb() {
  if (!pool) {
    console.log("[db] DATABASE_URL not set. Using memory store.");
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS scans (
      id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL,
      company_name TEXT NOT NULL,
      input_json JSONB NOT NULL,
      procurement_json JSONB,
      report_markdown TEXT,
      error_message TEXT,
      pdf_storage_key TEXT,
      pdf_storage_url TEXT,
      pdf_storage_etag TEXT,
      pdf_storage_updated_at TIMESTAMPTZ
    );
  `);

  await pool.query(`ALTER TABLE scans ADD COLUMN IF NOT EXISTS procurement_json JSONB;`);
  await pool.query(`ALTER TABLE scans ADD COLUMN IF NOT EXISTS pdf_storage_key TEXT;`);
  await pool.query(`ALTER TABLE scans ADD COLUMN IF NOT EXISTS pdf_storage_url TEXT;`);
  await pool.query(`ALTER TABLE scans ADD COLUMN IF NOT EXISTS pdf_storage_etag TEXT;`);
  await pool.query(`ALTER TABLE scans ADD COLUMN IF NOT EXISTS pdf_storage_updated_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE scans ADD COLUMN IF NOT EXISTS progress_stage TEXT;`);
  await pool.query(`ALTER TABLE scans ADD COLUMN IF NOT EXISTS user_id TEXT;`);
  await pool.query(`ALTER TABLE scans ADD COLUMN IF NOT EXISTS capability_statement TEXT;`);
  await pool.query(`ALTER TABLE scans ADD COLUMN IF NOT EXISTS outreach_emails TEXT;`);
  await pool.query(`ALTER TABLE scans ADD COLUMN IF NOT EXISTS frameworks_assessment TEXT;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      tier TEXT NOT NULL DEFAULT 'free',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      stripe_subscription_status TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      setup_token TEXT,
      setup_token_expires TIMESTAMPTZ
    );
  `);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS setup_token TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS setup_token_expires TIMESTAMPTZ`);

  await pool.query(`DO $$ BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname='public' AND tablename='subscriptions')
       AND NOT EXISTS (SELECT FROM pg_tables WHERE schemaname='public' AND tablename='alert_subscriptions')
    THEN ALTER TABLE subscriptions RENAME TO alert_subscriptions; END IF;
  END $$`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS alert_subscriptions (
      id TEXT PRIMARY KEY,
      scan_id TEXT NOT NULL,
      company_name TEXT NOT NULL,
      email TEXT NOT NULL,
      input_json JSONB NOT NULL,
      alerted_notice_ids TEXT[] NOT NULL DEFAULT '{}',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL,
      last_alerted_at TIMESTAMPTZ
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS homepage_signals (
      id            TEXT PRIMARY KEY,
      category      TEXT NOT NULL,
      title         TEXT NOT NULL,
      buyer         TEXT,
      source        TEXT NOT NULL,
      source_url    TEXT NOT NULL,
      notice_date   TIMESTAMPTZ,
      deadline_date TIMESTAMPTZ,
      value_amount  BIGINT,
      status        TEXT NOT NULL,
      fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`ALTER TABLE homepage_signals ADD COLUMN IF NOT EXISTS deadline_date TIMESTAMPTZ`);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_homepage_signals_cat_fetched
      ON homepage_signals (category, fetched_at DESC);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS briefing_subscribers (
      id          TEXT PRIMARY KEY,
      email       TEXT NOT NULL,
      category    TEXT,
      source      TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (email)
    );
  `);
  await pool.query(`ALTER TABLE briefing_subscribers ADD COLUMN IF NOT EXISTS source TEXT`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS desk_cache (
      slug        TEXT PRIMARY KEY,
      data        JSONB NOT NULL,
      cached_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS visitor_logs (
      id          BIGSERIAL PRIMARY KEY,
      ip          TEXT,
      path        TEXT,
      user_agent  TEXT,
      referer     TEXT,
      visited_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_visitor_logs_visited ON visitor_logs (visited_at DESC);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS visitor_events (
      id          BIGSERIAL PRIMARY KEY,
      event       TEXT NOT NULL,
      path        TEXT,
      meta        JSONB,
      ip          TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_visitor_events_created ON visitor_events (created_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_visitor_events_event ON visitor_events (event, created_at DESC);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      stripe_session_id TEXT NOT NULL UNIQUE,
      stripe_payment_intent TEXT,
      plan TEXT NOT NULL,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'gbp',
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS webhook_events (
      stripe_event_id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      payload JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'processed',
      processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_audit (
      id BIGSERIAL PRIMARY KEY,
      admin_user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT,
      meta_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      dek TEXT,
      eyebrow TEXT,
      hero_prompt TEXT,
      hero_image_url TEXT,
      body_md TEXT NOT NULL DEFAULT '',
      desk TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      author_id TEXT NOT NULL,
      published_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      views INTEGER NOT NULL DEFAULT 0,
      reading_time INTEGER NOT NULL DEFAULT 1,
      og_image TEXT,
      seo_title TEXT,
      seo_description TEXT,
      tags TEXT
    );
    CREATE TABLE IF NOT EXISTS article_revisions (
      id TEXT PRIMARY KEY,
      article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body_md TEXT NOT NULL,
      editor_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS article_assets (
      id TEXT PRIMARY KEY,
      article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'still',
      prompt TEXT,
      prompt_hash TEXT,
      image_url TEXT,
      caption TEXT,
      position_key TEXT NOT NULL,
      rendered_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      parent_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      is_author_reply BOOLEAN NOT NULL DEFAULT false,
      like_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS comment_likes (
      id TEXT PRIMARY KEY,
      comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      is_author BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(comment_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS slug_redirects (
      old_slug TEXT PRIMARY KEY,
      article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`ALTER TABLE articles ADD COLUMN IF NOT EXISTS like_count INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE articles ADD COLUMN IF NOT EXISTS tags TEXT`);
  await pool.query(`ALTER TABLE comments ADD COLUMN IF NOT EXISTS guest_name TEXT`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS article_likes (
      id TEXT PRIMARY KEY,
      article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      fingerprint TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(article_id, fingerprint)
    )
  `);
  console.log("[db] ready");
}
