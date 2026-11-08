-- Per-course UI style: 'decorated' (current themed ribbons/map) or 'minimal' (plain list).
-- UnitList.jsx and ExerciseList.jsx both branch on this; no RLS/data model change needed,
-- it's purely a presentation switch on data they already fetch.
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS ui_style text NOT NULL DEFAULT 'decorated';

ALTER TABLE public.courses ADD CONSTRAINT courses_ui_style_check
  CHECK (ui_style IN ('decorated', 'minimal'));

COMMENT ON COLUMN public.courses.ui_style IS 'decorated: themed ribbons/background map UI. minimal: plain list UI.';
