-- Lead Alert Bot — fire a webhook to the Render service whenever a rep
-- submits a new lead (INSERT into public.new_clients).
--
-- EASIEST PATH: use the Supabase Dashboard instead (see README, Step 4).
-- Only run this SQL if you prefer doing it by hand. Replace the two
-- placeholders below first:
--   <RENDER_URL>     e.g. https://lead-alert-bot.onrender.com
--   <WEBHOOK_SECRET> the exact value you set in Render's WEBHOOK_SECRET

-- Requires the pg_net extension (preinstalled on Supabase).
create extension if not exists pg_net with schema extensions;

drop trigger if exists new_lead_telegram_alert on public.new_clients;

create trigger new_lead_telegram_alert
after insert on public.new_clients
for each row
execute function supabase_functions.http_request(
  '<RENDER_URL>/webhook/new-lead',
  'POST',
  '{"Content-Type":"application/json","x-webhook-secret":"<WEBHOOK_SECRET>"}',
  '{}',
  '5000'
);
