-- Create the donations table
create table donations (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  sender text not null,
  amount numeric not null,
  message text,
  status text default 'pending' -- 'pending', 'played'
);

-- Enable Realtime for this table
alter publication supabase_realtime add table donations;

-- Create a Policy to allow anyone to INSERT (for public tip page)
alter table donations enable row level security;

create policy "Enable insert for everyone"
on "public"."donations"
as PERMISSIVE
for INSERT
to public
with check (true);

-- Create a Policy to allow reading only (for the Pi, technically public read is needed for realtime if using anon key, 
-- ideally we'd restrict update to authenticated, but for simplicity we might allow anon update for now or just insert)
-- For the Pi to UPDATE status to 'played', it needs permission.
-- Let's allow anon to update for now (low risk for a personal tip bot, but ideally use service_role key on backend)

create policy "Enable update for everyone"
on "public"."donations"
as PERMISSIVE
for UPDATE
to public
using (true);

create policy "Enable read for everyone"
on "public"."donations"
as PERMISSIVE
for SELECT
to public
using (true);
