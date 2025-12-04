-- Align default deal sources with the new standard set and seed missing ones for all companies

-- Ensure table exists in case the create migration was skipped locally
DO $$
BEGIN
  IF to_regclass('public.deal_sources') IS NULL THEN
    CREATE TABLE public.deal_sources (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      is_default BOOLEAN DEFAULT FALSE,
      created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (company_id, name)
    );

    CREATE INDEX deal_sources_company_id_idx ON public.deal_sources (company_id);

    -- Initial defaults
    INSERT INTO public.deal_sources (company_id, name, is_default)
    SELECT c.id, src.name, TRUE
    FROM public.companies c
    CROSS JOIN (
      VALUES ('Google'), ('Facebook'), ('Word of mouth'), ('Website'), ('Other')
    ) AS src(name)
    ON CONFLICT (company_id, name) DO NOTHING;
  END IF;
END$$;

-- Normalize casing for Word of Mouth
UPDATE public.deal_sources
SET name = 'Word of Mouth'
WHERE LOWER(name) = 'word of mouth';

-- Seed new defaults if missing
INSERT INTO public.deal_sources (company_id, name, is_default)
SELECT c.id, src.name, TRUE
FROM public.companies c
CROSS JOIN (
  VALUES
    ('Google'),
    ('Facebook'),
    ('Word of Mouth'),
    ('Angi'),
    ('Yard Sign'),
    ('Repeat Customer'),
    ('Website'),
    ('Instagram'),
    ('Phone Call'),
    ('Mail'),
    ('Other')
) AS src(name)
ON CONFLICT (company_id, name) DO NOTHING;
