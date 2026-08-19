create policy "household members can read notification events"
on public.notification_events for select to authenticated
using (true);
