
CREATE TABLE public.realm_art (
  seed text PRIMARY KEY,
  title text,
  family text,
  storage_path text NOT NULL,
  public_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.realm_art TO anon, authenticated;
GRANT ALL ON public.realm_art TO service_role;

ALTER TABLE public.realm_art ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Realm art is publicly readable"
  ON public.realm_art
  FOR SELECT
  USING (true);
