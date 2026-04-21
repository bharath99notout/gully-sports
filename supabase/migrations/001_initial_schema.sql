-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles (extends Supabase auth.users)
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  name text not null,
  phone text,
  avatar_url text,
  created_at timestamptz default now()
);

-- Sports enum
create type sport_type as enum ('cricket', 'football', 'badminton');

-- Match status enum
create type match_status as enum ('upcoming', 'live', 'completed');

-- Teams
create table teams (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  sport sport_type not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

-- Team members
create table team_members (
  id uuid default uuid_generate_v4() primary key,
  team_id uuid references teams(id) on delete cascade,
  player_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique(team_id, player_id)
);

-- Matches
create table matches (
  id uuid default uuid_generate_v4() primary key,
  sport sport_type not null,
  status match_status default 'upcoming',
  team_a_id uuid references teams(id) on delete set null,
  team_b_id uuid references teams(id) on delete set null,
  team_a_name text not null,
  team_b_name text not null,
  winner_team_id uuid references teams(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  played_at timestamptz default now(),
  created_at timestamptz default now(),
  -- Cricket specific
  cricket_overs integer,
  -- Badminton specific
  badminton_sets integer default 3
);

-- Match scores (flexible per sport)
create table match_scores (
  id uuid default uuid_generate_v4() primary key,
  match_id uuid references matches(id) on delete cascade,
  team_id uuid,
  team_name text not null,
  -- Cricket
  runs integer default 0,
  wickets integer default 0,
  overs_faced numeric(4,1) default 0,
  -- Football
  goals integer default 0,
  -- Badminton (sets as json array e.g. [21, 15, 18])
  sets jsonb,
  updated_at timestamptz default now()
);

-- Player match stats
create table player_match_stats (
  id uuid default uuid_generate_v4() primary key,
  match_id uuid references matches(id) on delete cascade,
  player_id uuid references profiles(id) on delete cascade,
  team_id uuid,
  sport sport_type not null,
  -- Cricket
  runs_scored integer default 0,
  wickets_taken integer default 0,
  -- Football
  goals_scored integer default 0,
  -- Badminton
  points_won integer default 0,
  created_at timestamptz default now(),
  unique(match_id, player_id)
);

-- Aggregate player stats view
create view player_stats as
select
  p.id as player_id,
  p.name,
  pms.sport,
  count(distinct pms.match_id) as matches_played,
  count(distinct case when m.winner_team_id = pms.team_id then pms.match_id end) as wins,
  count(distinct case when m.winner_team_id is not null and m.winner_team_id != pms.team_id then pms.match_id end) as losses,
  coalesce(sum(pms.runs_scored), 0) as total_runs,
  coalesce(sum(pms.wickets_taken), 0) as total_wickets,
  coalesce(sum(pms.goals_scored), 0) as total_goals
from profiles p
join player_match_stats pms on pms.player_id = p.id
join matches m on m.id = pms.match_id
group by p.id, p.name, pms.sport;

-- RLS Policies
alter table profiles enable row level security;
alter table teams enable row level security;
alter table team_members enable row level security;
alter table matches enable row level security;
alter table match_scores enable row level security;
alter table player_match_stats enable row level security;

-- Profiles: users can read all, update own
create policy "profiles_read_all" on profiles for select using (true);
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);
create policy "profiles_insert_own" on profiles for insert with check (auth.uid() = id);

-- Teams: anyone can read, authenticated can create
create policy "teams_read_all" on teams for select using (true);
create policy "teams_insert_auth" on teams for insert with check (auth.uid() is not null);
create policy "teams_update_own" on teams for update using (auth.uid() = created_by);
create policy "teams_delete_own" on teams for delete using (auth.uid() = created_by);

-- Team members
create policy "team_members_read_all" on team_members for select using (true);
create policy "team_members_insert_auth" on team_members for insert with check (auth.uid() is not null);
create policy "team_members_delete_auth" on team_members for delete using (auth.uid() is not null);

-- Matches: anyone can read, authenticated can create/update
create policy "matches_read_all" on matches for select using (true);
create policy "matches_insert_auth" on matches for insert with check (auth.uid() is not null);
create policy "matches_update_auth" on matches for update using (auth.uid() is not null);

-- Match scores
create policy "match_scores_read_all" on match_scores for select using (true);
create policy "match_scores_insert_auth" on match_scores for insert with check (auth.uid() is not null);
create policy "match_scores_update_auth" on match_scores for update using (auth.uid() is not null);

-- Player match stats
create policy "player_match_stats_read_all" on player_match_stats for select using (true);
create policy "player_match_stats_insert_auth" on player_match_stats for insert with check (auth.uid() is not null);
create policy "player_match_stats_update_auth" on player_match_stats for update using (auth.uid() is not null);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
