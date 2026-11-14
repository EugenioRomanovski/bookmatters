begin;
select set_config('bm.test_owner',gen_random_uuid()::text,true),set_config('bm.test_other',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('bm.test_owner')::uuid),(current_setting('bm.test_other')::uuid);
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('bm.test_owner'),'role','authenticated')::text,true);
select set_config('bm.test_club',public.bm_create_reading_club('Test club','Integration test','Test book','Author',100,current_date,4,'','Test reader','19:30')::text,true);
do $$ begin
 if (select count(*) from public.bm_stages where club_id=current_setting('bm.test_club')::uuid)<>4 then raise exception 'Stages not created'; end if;
 if (select max(page_to) from public.bm_stages where club_id=current_setting('bm.test_club')::uuid)<>100 then raise exception 'Pages do not cover book'; end if;
 if (select min(meets_at at time zone 'UTC')::time from public.bm_stages where club_id=current_setting('bm.test_club')::uuid)<>'19:30'::time then raise exception 'Meeting time wrong'; end if;
end $$;
insert into public.bm_progress(club_id,user_id,page,note) values(current_setting('bm.test_club')::uuid,auth.uid(),25,'Private note');
insert into public.bm_posts(stage_id,user_id,display_name,body) select id,auth.uid(),'Test reader','First thought' from public.bm_stages where club_id=current_setting('bm.test_club')::uuid and position=1;
do $$ begin
 begin
 insert into public.bm_posts(stage_id,user_id,display_name,body) select id,auth.uid(),'Test reader','Future spoiler' from public.bm_stages where club_id=current_setting('bm.test_club')::uuid and position=4;
 raise exception 'Future post allowed';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('bm.test_other'),'role','authenticated')::text,true);
do $$ begin
 if exists(select 1 from public.bm_progress where club_id=current_setting('bm.test_club')::uuid) then raise exception 'Private note leaked'; end if;
 if exists(select 1 from public.bm_posts) then raise exception 'Nonmember read posts'; end if;
 begin
 insert into public.bm_members(club_id,user_id,display_name) values(current_setting('bm.test_club')::uuid,current_setting('bm.test_owner')::uuid,'Impersonation');
 raise exception 'Impersonation allowed';
 exception when insufficient_privilege then null; end;
end $$;
insert into public.bm_members(club_id,user_id,display_name) values(current_setting('bm.test_club')::uuid,auth.uid(),'Other reader');
do $$ begin
 if (select count(*) from public.bm_posts)<>1 then raise exception 'Member cannot read discussion'; end if;
 if exists(select 1 from public.bm_progress) then raise exception 'Member sees private note'; end if;
end $$;
set local role anon;
do $$ begin
 if not exists(select 1 from public.bm_clubs where id=current_setting('bm.test_club')::uuid) then raise exception 'Public catalog broken'; end if;
 begin
 perform * from public.bm_posts;
 raise exception 'Anon can query posts';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: atomic club creation, page coverage, meeting time, membership, spoiler protection, private notes, anonymous access; test data rolled back' as verification;
