create table public.assistant_request_metrics (
  request_id uuid primary key references public.assistant_requests(id) on delete cascade,
  recorded_at timestamptz not null default now(),
  model text not null,
  outcome text not null check (outcome in ('success', 'error')),
  error_stage text check (error_stage in ('context', 'model', 'parse', 'save')),
  total_ms integer not null check (total_ms >= 0),
  context_ms integer check (context_ms >= 0),
  model_ms integer check (model_ms >= 0),
  input_tokens integer check (input_tokens >= 0),
  cached_input_tokens integer check (cached_input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  dashboard_sections text[] not null default '{}',
  fitness_context boolean not null default false
);
alter table public.assistant_request_metrics enable row level security;
revoke all on public.assistant_request_metrics from anon, authenticated;
grant all on public.assistant_request_metrics to service_role;
comment on table public.assistant_request_metrics is
  'Server-only timing, token usage and failure stages. Contains no chat content. Expires with the request after 90 days.';
notify pgrst, 'reload schema';
