begin;
select set_config('bm.test_owner',gen_random_uuid()::text,true),set_config('bm.test_friend',gen_random_uuid()::text,true),set_config('bm.test_stranger',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('bm.test_owner')::uuid),(current_setting('bm.test_friend')::uuid),(current_setting('bm.test_stranger')::uuid);
insert into public.profiles(user_id,username,display_name) select v::uuid,'bmt_'||substring(replace(v,'-','') from 1 for 16),'Temporary test reader' from unnest(array[current_setting('bm.test_owner'),current_setting('bm.test_friend'),current_setting('bm.test_stranger')]) v;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('bm.test_owner'),'role','authenticated')::text,true);
select set_config('bm.closed',public.bm_create_club_v2('Temporary private test','','Test book','',12,current_date,4,'','Test owner','19:30','chapters','closed')::text,true);
select set_config('bm.open',public.bm_create_club_v2('Temporary public test','','Test book','',101,current_date,4,'','Test owner','19:30','pages','open')::text,true);
do $$ begin
 if (select count(*) from public.bm_stages where club_id=current_setting('bm.closed')::uuid)<>4 then raise exception 'Missing chapter stages'; end if;
 if (select max(chapter_to) from public.bm_stages where club_id=current_setting('bm.closed')::uuid)<>12 then raise exception 'Chapter coverage failed'; end if;
 if (select max(page_to) from public.bm_stages where club_id=current_setting('bm.open')::uuid)<>101 then raise exception 'Page coverage failed'; end if;
 if (select min(meets_at at time zone 'UTC')::time from public.bm_stages where club_id=current_setting('bm.closed')::uuid)<>'19:30'::time then raise exception 'Meeting time failed'; end if;
end $$;
insert into public.bm_progress(club_id,user_id,chapter,note) values(current_setting('bm.closed')::uuid,auth.uid(),2,'Temporary private note');
insert into public.bm_posts(stage_id,user_id,display_name,body) select id,auth.uid(),'Test owner','Temporary thought' from public.bm_stages where club_id=current_setting('bm.closed')::uuid and position=1;
do $$ begin
 begin
 update public.bm_progress set chapter=13 where club_id=current_setting('bm.closed')::uuid and user_id=auth.uid();
 raise exception 'Progress limit was not enforced'; exception when insufficient_privilege then null; end;
 begin
 insert into public.bm_posts(stage_id,user_id,display_name,body) select id,auth.uid(),'Owner','Spoiler' from public.bm_stages where club_id=current_setting('bm.closed')::uuid and position=4;
 raise exception 'Future spoiler was allowed'; exception when insufficient_privilege then null; end;
 begin
 insert into public.bm_invitations(club_id,sender_id,recipient_id) values(current_setting('bm.closed')::uuid,auth.uid(),current_setting('bm.test_friend')::uuid);
 raise exception 'Nonfriend invitation was allowed'; exception when insufficient_privilege then null; end;
end $$;
select public.send_friend_request('bmt_'||substring(replace(current_setting('bm.test_friend'),'-','') from 1 for 16));
select set_config('request.jwt.claims',json_build_object('sub',current_setting('bm.test_friend'),'role','authenticated')::text,true);
do $$ begin
 if exists(select 1 from public.bm_clubs where id=current_setting('bm.closed')::uuid) then raise exception 'Private club leaked'; end if;
 if exists(select 1 from public.bm_members where club_id=current_setting('bm.closed')::uuid) then raise exception 'Private roster leaked'; end if;
 if exists(select 1 from public.bm_stages where club_id=current_setting('bm.closed')::uuid) then raise exception 'Private plan leaked'; end if;
 begin
 insert into public.bm_members(club_id,user_id,display_name) values(current_setting('bm.closed')::uuid,auth.uid(),'Uninvited');
 raise exception 'Uninvited join was allowed'; exception when insufficient_privilege then null; end;
 if not public.accept_friend_request(current_setting('bm.test_owner')::uuid) then raise exception 'Friend acceptance failed'; end if;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('bm.test_owner'),'role','authenticated')::text,true);
with invitation as (insert into public.bm_invitations(club_id,sender_id,recipient_id) values(current_setting('bm.closed')::uuid,auth.uid(),current_setting('bm.test_friend')::uuid) returning id) select set_config('bm.invitation',id::text,true) from invitation;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('bm.test_stranger'),'role','authenticated')::text,true);
do $$ begin
 if exists(select 1 from public.bm_invitations where id=current_setting('bm.invitation')::uuid) then raise exception 'Invitation leaked to stranger'; end if;
 begin
 perform public.bm_respond_club_invite(current_setting('bm.invitation')::uuid,true,'Intruder');
 raise exception 'Stranger could accept invitation'; exception when raise_exception then if SQLERRM='Stranger could accept invitation' then raise; end if; end;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('bm.test_friend'),'role','authenticated')::text,true);
do $$ begin
 if not exists(select 1 from public.bm_clubs where id=current_setting('bm.closed')::uuid) then raise exception 'Invitee cannot see book metadata'; end if;
 if exists(select 1 from public.bm_members where club_id=current_setting('bm.closed')::uuid) then raise exception 'Invitee sees roster before joining'; end if;
 if exists(select 1 from public.bm_stages where club_id=current_setting('bm.closed')::uuid) then raise exception 'Invitee sees plan before joining'; end if;
end $$;
select public.bm_respond_club_invite(current_setting('bm.invitation')::uuid,true,'Test friend');
do $$ begin
 if (select count(*) from public.bm_members where club_id=current_setting('bm.closed')::uuid)<>2 then raise exception 'Membership acceptance failed'; end if;
 if not exists(select 1 from public.bm_posts p join public.bm_stages s on s.id=p.stage_id where s.club_id=current_setting('bm.closed')::uuid) then raise exception 'Member cannot read discussion'; end if;
 if exists(select 1 from public.bm_progress where club_id=current_setting('bm.closed')::uuid) then raise exception 'Private note leaked'; end if;
 if exists(select 1 from public.bm_invitations where id=current_setting('bm.invitation')::uuid) then raise exception 'Accepted invitation not consumed'; end if;
end $$;
select public.send_friend_request('bmt_'||substring(replace(current_setting('bm.test_stranger'),'-','') from 1 for 16));
select set_config('request.jwt.claims',json_build_object('sub',current_setting('bm.test_stranger'),'role','authenticated')::text,true);
select public.accept_friend_request(current_setting('bm.test_friend')::uuid);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('bm.test_friend'),'role','authenticated')::text,true);
do $$ begin
 begin
 insert into public.bm_invitations(club_id,sender_id,recipient_id) values(current_setting('bm.closed')::uuid,auth.uid(),current_setting('bm.test_stranger')::uuid);
 raise exception 'Nonowner invited to closed club'; exception when insufficient_privilege then null; end;
end $$;
delete from public.bm_members where club_id=current_setting('bm.closed')::uuid and user_id=auth.uid();
do $$ begin if exists(select 1 from public.bm_clubs where id=current_setting('bm.closed')::uuid) then raise exception 'Private access remained after leaving'; end if; end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('bm.test_owner'),'role','authenticated')::text,true);
with invitation as (insert into public.bm_invitations(club_id,sender_id,recipient_id) values(current_setting('bm.closed')::uuid,auth.uid(),current_setting('bm.test_friend')::uuid) returning id) select set_config('bm.invitation',id::text,true) from invitation;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('bm.test_friend'),'role','authenticated')::text,true);
select public.bm_respond_club_invite(current_setting('bm.invitation')::uuid,false,'Friend');
do $$ begin if exists(select 1 from public.bm_clubs where id=current_setting('bm.closed')::uuid) then raise exception 'Declined club remains visible'; end if; end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('bm.test_owner'),'role','authenticated')::text,true);
update public.bm_clubs set visibility='open' where id=current_setting('bm.closed')::uuid;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('bm.test_stranger'),'role','authenticated')::text,true);
do $$ begin if not exists(select 1 from public.bm_clubs where id=current_setting('bm.closed')::uuid) then raise exception 'Open visibility failed'; end if; end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('bm.test_owner'),'role','authenticated')::text,true);
update public.bm_clubs set visibility='closed' where id=current_setting('bm.closed')::uuid;
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $$ begin
 if exists(select 1 from public.bm_clubs where id=current_setting('bm.closed')::uuid) then raise exception 'Private club visible anonymously'; end if;
 if not exists(select 1 from public.bm_clubs where id=current_setting('bm.open')::uuid) then raise exception 'Public club invisible anonymously'; end if;
 begin
 perform * from public.bm_invitations;
 raise exception 'Anonymous invitation access allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: production transaction verified chapter/page plans, shared friend RPCs, invitations, private club/roster/plan isolation, accepted membership, private notes, spoiler and progress limits, member permissions, visibility, anonymous access. All test data rolled back.' as verification;
