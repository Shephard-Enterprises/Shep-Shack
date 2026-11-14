-- Keep device events for diagnostics; only verified events count as pours.
alter table public.keg_scale_pours
  add column verification_status text not null default 'pending'
    check (verification_status in ('pending', 'confirmed', 'rejected')),
  add column verified_at timestamptz;

create index keg_scale_pours_pending_idx on public.keg_scale_pours(poured_at)
  where verification_status = 'pending';

comment on column public.keg_scale_pours.verification_status is
  'Server stability verdict. Raw device events must not count toward analytics until confirmed.';

-- Existing household SELECT policies and service-role write grants still apply.
notify pgrst, 'reload schema';
