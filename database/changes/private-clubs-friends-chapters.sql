-- Additive upgrade. Existing clubs retain public visibility and page plans.
alter table public.bm_clubs add column visibility text not null default 'open' check(visibility in ('open','closed'));
alter table public.bm_clubs add column reading_mode text not null default 'pages' check(reading_mode in ('pages','chapters'));
alter table public.bm_clubs add column chapters integer check(chapters between 1 and 10000);
alter table public.bm_clubs alter column pages drop not null;
alter table public.bm_clubs add constraint bm_club_reading_units check((reading_mode='pages' and pages is not null and chapters is null) or (reading_mode='chapters' and chapters is not null and pages is null));
alter table public.bm_stages alter column page_from drop not null;
alter table public.bm_stages alter column page_to drop not null;
alter table public.bm_stages add column chapter_from integer check(chapter_from>0);
alter table public.bm_stages add column chapter_to integer;
alter table public.bm_stages add constraint bm_stage_reading_units check((page_from is not null and page_to is not null and chapter_from is null and chapter_to is null) or (page_from is null and page_to is null and chapter_from is not null and chapter_to is not null and chapter_to>=chapter_from));
alter table public.bm_progress add column chapter integer not null default 0 check(chapter between 0 and 10000);
create table public.bm_invitations (
 id uuid primary key default gen_random_uuid(), club_id uuid not null references public.bm_clubs(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade, recipient_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), unique(club_id,recipient_id), check(sender_id<>recipient_id)
);
create index bm_invitations_recipient_idx on public.bm_invitations(recipient_id);
create index bm_invitations_sender_idx on public.bm_invitations(sender_id);
alter table public.bm_invitations enable row level security;
revoke all on public.bm_invitations from anon,authenticated;
grant select,insert,delete on public.bm_invitations to authenticated;
-- Membership lookups deliberately bypass their own RLS to avoid recursive
-- club/member/invitation policies. Helpers are in a non-exposed schema, take no
-- user identity argument, and always authorize the current auth.uid().
create schema if not exists bm_private;
revoke all on schema bm_private from public;
grant usage on schema bm_private to anon,authenticated;
create function bm_private.can_read_club(cid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.bm_clubs c where c.id=cid and (c.visibility='open' or (auth.uid() is not null and (c.owner_id=auth.uid() or exists(select 1 from public.bm_members m where m.club_id=cid and m.user_id=auth.uid())))))
$$;
create function bm_private.can_view_club(cid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select bm_private.can_read_club(cid) or (auth.uid() is not null and exists(select 1 from public.bm_invitations i where i.club_id=cid and i.recipient_id=auth.uid()))
$$;
create function bm_private.can_join_club(cid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.bm_clubs c where c.id=cid and (c.visibility='open' or c.owner_id=auth.uid() or exists(select 1 from public.bm_invitations i where i.club_id=cid and i.recipient_id=auth.uid())))
$$;
create function bm_private.can_invite_friend(cid uuid,friend_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and friend_id<>auth.uid()
 and exists(select 1 from public.friendships f where f.status='accepted' and ((f.requester=auth.uid() and f.addressee=friend_id) or (f.addressee=auth.uid() and f.requester=friend_id)))
 and exists(select 1 from public.bm_clubs c where c.id=cid and (c.owner_id=auth.uid() or (c.visibility='open' and exists(select 1 from public.bm_members m where m.club_id=cid and m.user_id=auth.uid()))))
 and not exists(select 1 from public.bm_members m where m.club_id=cid and m.user_id=friend_id)
$$;
revoke all on all functions in schema bm_private from public;
grant execute on function bm_private.can_read_club(uuid),bm_private.can_view_club(uuid) to anon,authenticated;
grant execute on function bm_private.can_join_club(uuid),bm_private.can_invite_friend(uuid,uuid) to authenticated;
alter policy clubs_read on public.bm_clubs using(visibility='open' or owner_id=(select auth.uid()) or bm_private.can_view_club(id));
alter policy members_read on public.bm_members using(bm_private.can_read_club(club_id));
alter policy stages_read on public.bm_stages using(bm_private.can_read_club(club_id));
alter policy members_join on public.bm_members with check(user_id=(select auth.uid()) and bm_private.can_join_club(club_id));
create policy invitations_read on public.bm_invitations for select to authenticated using(recipient_id=(select auth.uid()) or sender_id=(select auth.uid()));
create policy invitations_send on public.bm_invitations for insert to authenticated with check(sender_id=(select auth.uid()) and bm_private.can_invite_friend(club_id,recipient_id));
create policy invitations_remove on public.bm_invitations for delete to authenticated using(recipient_id=(select auth.uid()) or sender_id=(select auth.uid()));
alter policy progress_insert on public.bm_progress with check(user_id=(select auth.uid()) and exists(select 1 from public.bm_members m join public.bm_clubs c on c.id=m.club_id where m.club_id=bm_progress.club_id and m.user_id=(select auth.uid()) and ((c.reading_mode='pages' and bm_progress.page<=c.pages and bm_progress.chapter=0) or (c.reading_mode='chapters' and bm_progress.chapter<=c.chapters and bm_progress.page=0))));
alter policy progress_edit on public.bm_progress with check(user_id=(select auth.uid()) and exists(select 1 from public.bm_members m join public.bm_clubs c on c.id=m.club_id where m.club_id=bm_progress.club_id and m.user_id=(select auth.uid()) and ((c.reading_mode='pages' and bm_progress.page<=c.pages and bm_progress.chapter=0) or (c.reading_mode='chapters' and bm_progress.chapter<=c.chapters and bm_progress.page=0))));
create function public.bm_create_club_v2(p_name text,p_description text,p_book text,p_author text,p_units integer,p_start date,p_weeks integer,p_meeting text,p_display_name text,p_meeting_time time default '19:00',p_mode text default 'chapters',p_visibility text default 'open') returns uuid language plpgsql security invoker set search_path='' as $$
declare cid uuid; i integer; lo integer; hi integer;
begin
 if auth.uid() is null then raise exception 'Войдите в аккаунт'; end if;
 if p_units is null or p_units<1 or p_units>10000 or p_weeks is null or p_weeks<1 or p_weeks>52 or p_weeks>p_units then raise exception 'Число недель должно быть от 1 до 52 и не больше числа глав или страниц'; end if;
 if p_mode not in ('pages','chapters') or p_visibility not in ('open','closed') then raise exception 'Некорректные настройки клуба'; end if;
 insert into public.bm_clubs(owner_id,name,description,book,author,pages,chapters,reading_mode,visibility,starts_on,weeks,meeting_url)
 values(auth.uid(),p_name,p_description,p_book,p_author,case when p_mode='pages' then p_units end,case when p_mode='chapters' then p_units end,p_mode,p_visibility,p_start,p_weeks,p_meeting) returning id into cid;
 insert into public.bm_members(club_id,user_id,display_name) values(cid,auth.uid(),p_display_name);
 for i in 1..p_weeks loop
 lo:=floor((i-1)::numeric*p_units/p_weeks)+1; hi:=floor(i::numeric*p_units/p_weeks);
 insert into public.bm_stages(club_id,position,title,page_from,page_to,chapter_from,chapter_to,opens_at,meets_at)
 values(cid,i,'Неделя '||i,case when p_mode='pages' then lo end,case when p_mode='pages' then hi end,case when p_mode='chapters' then lo end,case when p_mode='chapters' then hi end,(p_start+(i-1)*7)::timestamp at time zone 'UTC',(p_start+i*7+p_meeting_time) at time zone 'UTC');
 end loop;
 return cid;
end $$;
revoke all on function public.bm_create_club_v2(text,text,text,text,integer,date,integer,text,text,time,text,text) from public,anon;
grant execute on function public.bm_create_club_v2(text,text,text,text,integer,date,integer,text,text,time,text,text) to authenticated;
create function public.bm_respond_club_invite(p_invitation uuid,p_accept boolean,p_display_name text) returns uuid language plpgsql security invoker set search_path='' as $$
declare cid uuid;
begin
 if auth.uid() is null then raise exception 'Войдите в аккаунт'; end if;
 select club_id into cid from public.bm_invitations where id=p_invitation and recipient_id=auth.uid();
 if cid is null then raise exception 'Приглашение уже отозвано или недоступно'; end if;
 if p_accept then
 insert into public.bm_members(club_id,user_id,display_name) values(cid,auth.uid(),p_display_name) on conflict do nothing;
 end if;
 delete from public.bm_invitations where id=p_invitation and recipient_id=auth.uid();
 return case when p_accept then cid else null end;
end $$;
revoke all on function public.bm_respond_club_invite(uuid,boolean,text) from public,anon;
grant execute on function public.bm_respond_club_invite(uuid,boolean,text) to authenticated;
