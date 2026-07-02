create table if not exists templates (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  category text not null,
  type text not null,
  content text not null,
  created_by uuid references auth.users(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create policy "Templates are viewable by all authenticated users."
  on templates for select
  to authenticated
  using (true);

create policy "Templates can be created by authenticated users."
  on templates for insert
  to authenticated
  with check (true);

