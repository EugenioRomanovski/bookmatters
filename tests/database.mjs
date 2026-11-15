import { PGlite } from "@electric-sql/pglite";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(
  `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key default gen_random_uuid()); create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid $$;`,
);
await db.exec(
  `grant usage on schema auth to anon,authenticated;create table public.profiles(user_id uuid primary key references auth.users(id),username text unique,display_name text default '',updated_at timestamptz default now());create table public.friendships(requester uuid references auth.users(id),addressee uuid references auth.users(id),status text default 'pending',created_at timestamptz default now(),updated_at timestamptz default now(),primary key(requester,addressee));create unique index friend_pair on public.friendships(least(requester,addressee),greatest(requester,addressee));alter table public.profiles enable row level security;alter table public.friendships enable row level security;create policy profiles_read on public.profiles for select using(true);create policy friends_read on public.friendships for select using(requester=auth.uid() or addressee=auth.uid());grant select on public.profiles,public.friendships to authenticated;`,
);
await db.exec(
  await readFile(new URL("../database/schema.sql", import.meta.url), "utf8"),
);
const ids = (
  await db.query(
    "insert into auth.users select gen_random_uuid() from generate_series(1,3) returning id",
  )
).rows.map((r) => r.id);
const [owner, friend, stranger] = ids;
await db.query(
  "insert into profiles(user_id,username,display_name) values($1,'bm_owner','Owner'),($2,'bm_friend','Friend'),($3,'bm_stranger','Stranger')",
  ids,
);
async function as(id, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: id, role }),
  ]);
  await db.exec("set role " + role);
}
async function create({
  mode = "chapters",
  visibility = "closed",
  units = 12,
} = {}) {
  return (
    await db.query(
      "select public.bm_create_club_v2('Test club','Description','Book','Author',$1,current_date,4,'','Test reader','19:30',$2,$3) id",
      [units, mode, visibility],
    )
  ).rows[0].id;
}
async function count(table, condition = "", params = []) {
  return +(
    await db.query(
      `select count(*) n from public.${table} ${condition}`,
      params,
    )
  ).rows[0].n;
}
async function denied(sql, args = []) {
  let failed = false;
  try {
    await db.query(sql, args);
  } catch (e) {
    failed = true;
  }
  assert(failed, "Expected forbidden operation: " + sql);
}
await as(owner);
const legacy = (
  await db.query(
    "select bm_create_reading_club('Legacy club','','Old book','',100,current_date,4,'','Owner') id",
  )
).rows[0].id;
await db.exec("reset role");
await db.exec(
  await readFile(
    new URL(
      "../database/changes/private-clubs-friends-chapters.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
await as(owner);
const closed = await create(),
  open = await create({ mode: "pages", visibility: "open", units: 101 });
const defaultClub = (
  await db.query(
    "select bm_create_club_v2('Default club','','New book','',8,current_date,4,'','Owner') id",
  )
).rows[0].id;
assert.equal(
  (
    await db.query("select reading_mode from bm_clubs where id=$1", [
      defaultClub,
    ])
  ).rows[0].reading_mode,
  "chapters",
);
let legacyRow = (await db.query("select * from bm_clubs where id=$1", [legacy]))
  .rows[0];
assert.equal(legacyRow.reading_mode, "pages");
assert.equal(legacyRow.pages, 100);
assert.equal(legacyRow.visibility, "open");
const chapterStages = (
  await db.query("select * from bm_stages where club_id=$1 order by position", [
    closed,
  ])
).rows;
assert.deepEqual(
  chapterStages.map((s) => [s.chapter_from, s.chapter_to, s.page_from]),
  [
    [1, 3, null],
    [4, 6, null],
    [7, 9, null],
    [10, 12, null],
  ],
);
assert.equal(
  (await db.query("select * from bm_clubs where id=$1", [closed])).rows[0]
    .pages,
  null,
);
const pageStages = (
  await db.query("select * from bm_stages where club_id=$1 order by position", [
    open,
  ])
).rows;
assert.equal(pageStages.at(-1).page_to, 101);
assert.equal(pageStages[0].page_from, 1);
await db.query(
  "insert into bm_progress(club_id,user_id,page,chapter,note) values($1,$2,0,2,'Private')",
  [closed, owner],
);
await denied(
  "update bm_progress set chapter=13 where club_id=$1 and user_id=$2",
  [closed, owner],
);
await denied("update bm_progress set page=10 where club_id=$1 and user_id=$2", [
  closed,
  owner,
]);
await db.query(
  "insert into bm_posts(stage_id,user_id,display_name,body) values($1,$2,'Owner','Private thought')",
  [chapterStages[0].id, owner],
);
await denied(
  "insert into bm_posts(stage_id,user_id,display_name,body) values($1,$2,'Owner','Spoiler')",
  [chapterStages[3].id, owner],
);
await as(stranger);
assert.equal(await count("bm_clubs", "where id=$1", [closed]), 0);
assert.equal(await count("bm_members", "where club_id=$1", [closed]), 0);
assert.equal(await count("bm_stages", "where club_id=$1", [closed]), 0);
assert.equal(
  await count("bm_posts", "where stage_id=$1", [chapterStages[0].id]),
  0,
);
await denied(
  "insert into bm_members(club_id,user_id,display_name) values($1,$2,'Intruder')",
  [closed, stranger],
);
await db.query(
  "insert into bm_members(club_id,user_id,display_name) values($1,$2,'Public reader')",
  [open, stranger],
);
await as(owner);
await denied(
  "insert into bm_invitations(club_id,sender_id,recipient_id) values($1,$2,$3)",
  [closed, owner, friend],
);
await db.exec("reset role");
await db.query(
  "insert into friendships(requester,addressee,status) values($1,$2,'accepted')",
  [owner, friend],
);
await db.query(
  "insert into friendships(requester,addressee,status) values($1,$2,'accepted')",
  [friend, stranger],
);
await as(owner);
const invitation = (
  await db.query(
    "insert into bm_invitations(club_id,sender_id,recipient_id) values($1,$2,$3) returning id",
    [closed, owner, friend],
  )
).rows[0].id;
await as(stranger);
assert.equal(await count("bm_invitations"), 0);
await denied("select bm_respond_club_invite($1,true,'Stranger')", [invitation]);
await as(friend);
assert.equal(await count("bm_clubs", "where id=$1", [closed]), 1);
assert.equal(await count("bm_members", "where club_id=$1", [closed]), 0);
assert.equal(await count("bm_stages", "where club_id=$1", [closed]), 0);
assert.equal(await count("bm_progress"), 0);
assert.equal(await count("bm_posts"), 0);
assert.equal(
  (
    await db.query("select bm_respond_club_invite($1,true,'Friend') id", [
      invitation,
    ])
  ).rows[0].id,
  closed,
);
assert.equal(await count("bm_invitations"), 0);
assert.equal(await count("bm_members", "where club_id=$1", [closed]), 2);
assert.equal(
  await count("bm_posts", "where stage_id=$1", [chapterStages[0].id]),
  1,
);
assert.equal(await count("bm_progress"), 0);
await denied(
  "insert into bm_invitations(club_id,sender_id,recipient_id) values($1,$2,$3)",
  [closed, friend, stranger],
);
assert.equal(
  (
    await db.query(
      "update bm_clubs set visibility='open' where id=$1 returning id",
      [closed],
    )
  ).rows.length,
  0,
);
await db.query("delete from bm_members where club_id=$1 and user_id=$2", [
  closed,
  friend,
]);
assert.equal(await count("bm_clubs", "where id=$1", [closed]), 0);
await as(owner);
const invite2 = (
  await db.query(
    "insert into bm_invitations(club_id,sender_id,recipient_id) values($1,$2,$3) returning id",
    [closed, owner, friend],
  )
).rows[0].id;
await as(friend);
await db.query("select bm_respond_club_invite($1,false,'Friend')", [invite2]);
assert.equal(await count("bm_clubs", "where id=$1", [closed]), 0);
await as(owner);
const revoked = (
  await db.query(
    "insert into bm_invitations(club_id,sender_id,recipient_id) values($1,$2,$3) returning id",
    [closed, owner, friend],
  )
).rows[0].id;
await db.query("delete from bm_invitations where id=$1", [revoked]);
await as(friend);
assert.equal(await count("bm_clubs", "where id=$1", [closed]), 0);
await denied("select bm_respond_club_invite($1,true,'Friend')", [revoked]);
await as(stranger);
const publicInvite = (
  await db.query(
    "insert into bm_invitations(club_id,sender_id,recipient_id) values($1,$2,$3) returning id",
    [open, stranger, friend],
  )
).rows[0].id;
await as(friend);
await db.query("select bm_respond_club_invite($1,true,'Friend')", [
  publicInvite,
]);
assert.equal(
  await count("bm_members", "where club_id=$1 and user_id=$2", [open, friend]),
  1,
);
await as(owner);
await db.query("update bm_clubs set visibility='open' where id=$1", [closed]);
await as(stranger);
assert.equal(await count("bm_clubs", "where id=$1", [closed]), 1);
await as(owner);
await db.query("update bm_clubs set visibility='closed' where id=$1", [closed]);
await as(null, "anon");
assert.equal(await count("bm_clubs", "where id=$1", [closed]), 0);
assert.equal(await count("bm_clubs", "where id=$1", [open]), 1);
await denied("select * from bm_invitations");
await denied(
  "select bm_create_club_v2('A','','B','',12,current_date,4,'','A')",
);
console.log(
  "PASS: legacy preservation, chapters/page coverage, public join, private club/roster/plan isolation, friendship requirement, own invite acceptance/decline/revocation, public member invitations, no cross-user invite access, member permissions, spoiler protection, private progress, visibility changes, anonymous access.",
);
await db.close();
