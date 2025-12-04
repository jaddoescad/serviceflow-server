-- Deal sources are company-specific selectable lead sources for deals

CREATE TABLE IF NOT EXISTS public.deal_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS deal_sources_company_id_idx ON public.deal_sources (company_id);

-- Seed defaults for all existing companies
INSERT INTO public.deal_sources (company_id, name, is_default)
SELECT c.id, src.name, TRUE
FROM public.companies c
CROSS JOIN (
  VALUES ('Google'), ('Facebook'), ('Word of mouth'), ('Website'), ('Other')
) AS src(name)
ON CONFLICT (company_id, name) DO NOTHING;
