-- New courses default to the minimal (study path list) UI. Existing courses keep whatever
-- ui_style they already have; switch individual courses in Course Management -> Interface style.
ALTER TABLE public.courses ALTER COLUMN ui_style SET DEFAULT 'minimal';
