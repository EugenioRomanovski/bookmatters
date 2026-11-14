-- Bookmatters uses existing Encore Auth. Existing app tables remain untouched.
create table public.bm_clubs (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(name) between 1 and 100), description text not null default '' check(length(description)<=2000),
 book text not null check(length(book) between 1 and 200), author text not null default '' check(length(author)<=150),
 pages integer not null check(pages between 1 and 10000), starts_on date not null, weeks integer not null check(weeks between 1 and 52),
 meeting_url text not null default '' check(length(meeting_url)<=1000 and (meeting_url='' or meeting_url ~ '^https://')),
 created_at timestamptz not null default now()
);
create table public.bm_members (
 club_id uuid not null references public.bm_clubs(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
 display_name text not null check(length(display_name) between 1 and 80), created_at timestamptz not null default now(), primary key(club_id,user_id)
);
create index bm_members_user_idx on public.bm_members(user_id);
create table public.bm_stages (
 id uuid primary key default gen_random_uuid(), club_id uuid not null references public.bm_clubs(id) on delete cascade,
 position integer not null check(position>0), title text not null check(length(title)<=200), page_from integer not null check(page_from>0), page_to integer not null check(page_to>=page_from),
 opens_at timestamptz not null, meets_at timestamptz not null, unique(club_id,position), check(meets_at>opens_at)
);
create table public.bm_posts (
 id uuid primary key default gen_random_uuid(), stage_id uuid not null references public.bm_stages(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, display_name text not null check(length(display_name) between 1 and 80),
 body text not null check(length(body) between 1 and 5000), kind text not null default 'thought' check(kind in ('thought','question','quote')),
 created_at timestamptz not null default now()
);
create index bm_posts_stage_idx on public.bm_posts(stage_id,created_at);
create table public.bm_progress (
 club_id uuid not null references public.bm_clubs(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
 page integer not null default 0 check(page between 0 and 10000), note text not null default '' check(length(note)<=10000), updated_at timestamptz not null default now(), primary key(club_id,user_id)
);
alter table public.bm_clubs enable row level security;
alter table public.bm_members enable row level security;
alter table public.bm_stages enable row level security;
alter table public.bm_posts enable row level security;
alter table public.bm_progress enable row level security;
create policy clubs_read on public.bm_clubs for select using(true);
create policy clubs_create on public.bm_clubs for insert to authenticated with check(owner_id=(select auth.uid()));
create policy clubs_edit on public.bm_clubs for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
-- Clubs are public: only chosen display names are exposed, never emails.
create policy members_read on public.bm_members for select using(true);
create policy members_join on public.bm_members for insert to authenticated with check(user_id=(select auth.uid()));
create policy members_leave on public.bm_members for delete to authenticated using(user_id=(select auth.uid()));
create policy stages_read on public.bm_stages for select using(true);
create policy stages_create on public.bm_stages for insert to authenticated with check(exists(select 1 from public.bm_clubs c where c.id=club_id and c.owner_id=(select auth.uid())));
create policy posts_read on public.bm_posts for select to authenticated using(exists(select 1 from public.bm_stages s join public.bm_members m on m.club_id=s.club_id where s.id=stage_id and m.user_id=(select auth.uid()) and s.opens_at<=now()));
create policy posts_create on public.bm_posts for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.bm_stages s join public.bm_members m on m.club_id=s.club_id where s.id=stage_id and m.user_id=(select auth.uid()) and s.opens_at<=now()));
create policy posts_delete on public.bm_posts for delete to authenticated using(user_id=(select auth.uid()));
create policy progress_read on public.bm_progress for select to authenticated using(user_id=(select auth.uid()));
create policy progress_insert on public.bm_progress for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.bm_members m where m.club_id=bm_progress.club_id and m.user_id=(select auth.uid())));
create policy progress_edit on public.bm_progress for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
grant select on public.bm_clubs,public.bm_members,public.bm_stages to anon,authenticated;
grant insert,update on public.bm_clubs to authenticated;
grant insert,delete on public.bm_members to authenticated;
grant insert on public.bm_stages to authenticated;
grant select,insert,delete on public.bm_posts to authenticated;
grant select,insert,update on public.bm_progress to authenticated;
-- Atomic creation: runs as the caller and respects all RLS policies.
create function public.bm_create_reading_club(p_name text,p_description text,p_book text,p_author text,p_pages integer,p_start date,p_weeks integer,p_meeting text,p_display_name text,p_meeting_time time default '19:00')
returns uuid language plpgsql security invoker set search_path='' as $$
declare cid uuid; i integer;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_weeks>p_pages then raise exception 'Too many stages for page count'; end if;
 insert into public.bm_clubs(owner_id,name,description,book,author,pages,starts_on,weeks,meeting_url) values(auth.uid(),p_name,p_description,p_book,p_author,p_pages,p_start,p_weeks,p_meeting) returning id into cid;
 insert into public.bm_members values(cid,auth.uid(),p_display_name,now());
 for i in 1..p_weeks loop
 insert into public.bm_stages(club_id,position,title,page_from,page_to,opens_at,meets_at) values(cid,i,'Неделя '||i,floor((i-1)::numeric*p_pages/p_weeks)+1,floor(i::numeric*p_pages/p_weeks),(p_start+(i-1)*7)::timestamp at time zone 'UTC',(p_start+i*7+p_meeting_time) at time zone 'UTC');
 end loop;
 return cid;
end $$;
revoke all on function public.bm_create_reading_club(text,text,text,text,integer,date,integer,text,text,time) from public,anon;
grant execute on function public.bm_create_reading_club(text,text,text,text,integer,date,integer,text,text,time) to authenticated;

-- Prevent default Supabase grants from allowing anonymous private-table requests.
revoke all on public.bm_posts,public.bm_progress from anon;
