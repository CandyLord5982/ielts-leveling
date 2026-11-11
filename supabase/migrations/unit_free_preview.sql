-- Free preview units: in a public course, non-enrolled students can open units
-- marked is_free; once any unit in the course is free, the rest are locked for them.
-- Public courses with no free units stay fully open (default false keeps old behavior).
alter table public.units
  add column if not exists is_free boolean not null default false;
