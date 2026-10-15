-- ============================================================
-- Migration: 005_blogs.sql
-- Creates blogs table + RLS policies + auto-updated_at trigger
-- Roles: digital_marketing (CRUD), superadmin/master_admin (CRUD),
--        public/anonymous (SELECT published only)
-- ============================================================

-- 1. Ensure the digital_marketing role exists
INSERT INTO roles (name, description)
VALUES ('digital_marketing', 'Digital Marketing team — manages blog content and SEO')
ON CONFLICT (name) DO NOTHING;

-- 2. Create blogs table
CREATE TABLE IF NOT EXISTS blogs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title               text NOT NULL,
  slug                text NOT NULL UNIQUE,
  content_layout      jsonb NOT NULL DEFAULT '[]'::jsonb,
  status              text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'published', 'scheduled')),
  published_at        timestamptz,
  author_id           uuid REFERENCES staffs(id) ON DELETE SET NULL,
  meta_title          text CHECK (char_length(meta_title) <= 60),
  meta_description    text CHECK (char_length(meta_description) <= 160),
  focus_keywords      text[],
  og_image            text,
  canonical_url       text,
  dynamic_schema_json jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- 3. Index slug for fast SEO lookups
CREATE INDEX IF NOT EXISTS idx_blogs_slug   ON blogs (slug);
CREATE INDEX IF NOT EXISTS idx_blogs_status ON blogs (status);
CREATE INDEX IF NOT EXISTS idx_blogs_author ON blogs (author_id);
CREATE INDEX IF NOT EXISTS idx_blogs_scheduled_publish ON blogs (status, published_at) WHERE status IN ('draft', 'scheduled');

-- 4. Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_blogs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_blogs_updated_at ON blogs;
CREATE TRIGGER trg_blogs_updated_at
  BEFORE UPDATE ON blogs
  FOR EACH ROW EXECUTE FUNCTION update_blogs_updated_at();

-- 5. Enable RLS
ALTER TABLE blogs ENABLE ROW LEVEL SECURITY;

-- 6. Helper: resolve the calling user's role name from the staffs table
CREATE OR REPLACE FUNCTION get_staff_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT r.name
  FROM   staffs s
  JOIN   roles  r ON r.id = s.role_id
  WHERE  s.id = auth.uid()
  LIMIT  1;
$$;

-- 7. RLS Policies

-- 7a. Privileged users (digital_marketing, superadmin, master_admin) — full CRUD
CREATE POLICY "blogs_privileged_select"
  ON blogs FOR SELECT
  USING (
    get_staff_role() IN ('digital_marketing', 'superadmin', 'master_admin')
  );

CREATE POLICY "blogs_privileged_insert"
  ON blogs FOR INSERT
  WITH CHECK (
    get_staff_role() IN ('digital_marketing', 'superadmin', 'master_admin')
  );

CREATE POLICY "blogs_privileged_update"
  ON blogs FOR UPDATE
  USING (
    get_staff_role() IN ('digital_marketing', 'superadmin', 'master_admin')
  )
  WITH CHECK (
    get_staff_role() IN ('digital_marketing', 'superadmin', 'master_admin')
  );

CREATE POLICY "blogs_privileged_delete"
  ON blogs FOR DELETE
  USING (
    get_staff_role() IN ('digital_marketing', 'superadmin', 'master_admin')
  );

-- 7b. Anonymous / public — read published blogs, or scheduled blogs whose publish time has arrived
CREATE POLICY "blogs_public_select"
  ON blogs FOR SELECT
  USING (
    status = 'published'
    OR (
      status IN ('draft', 'scheduled')
      AND published_at IS NOT NULL
      AND published_at <= now()
    )
  );

