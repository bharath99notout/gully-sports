-- Players added to a specific match (independent of teams)
create table match_players (
  id uuid default uuid_generate_v4() primary key,
  match_id uuid references matches(id) on delete cascade,
  player_id uuid references profiles(id) on delete cascade,
  team_name text not null,
  created_at timestamptz default now(),
  unique(match_id, player_id)
);

alter table match_players enable row level security;
create policy "match_players_read_all" on match_players for select using (true);
create policy "match_players_insert_auth" on match_players for insert with check (auth.uid() is not null);
create policy "match_players_delete_auth" on match_players for delete using (auth.uid() is not null);

-- Catches column on player stats
alter table player_match_stats add column if not exists catches_taken integer default 0;

-- Live batting/bowling state stored on the match row
alter table matches add column if not exists batting_team_name text;
alter table matches add column if not exists striker_id uuid references profiles(id) on delete set null;
alter table matches add column if not exists non_striker_id uuid references profiles(id) on delete set null;
alter table matches add column if not exists bowler_id uuid references profiles(id) on delete set null;
