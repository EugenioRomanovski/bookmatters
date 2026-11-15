import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import {
  BookOpen,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Users,
  MessageCircle,
  CalendarDays,
  Bookmark,
  X,
  Check,
  LockKeyhole,
  ChevronLeft,
  Leaf,
  LogOut,
  Link,
  Search,
  Menu,
  Send,
  Trash2,
  UserCircle,
  Settings2,
  Globe2,
} from "lucide-react";
import "./style.css";
import { useCommunity, Community, InviteFriends } from "./community.jsx";
const db = createClient(
  "https://api.brainsome.app",
  "sb_publishable_gD0M11LHLg4PJWxA8rKatQ_zn69qbw_",
  {
    auth: {
      storageKey: "bookmatters.auth",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
const date = (v) =>
  new Date(v).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
const today = () => new Date().toISOString().slice(0, 10);
const demo = {
  id: "demo",
  name: "Между строк",
  book: "Искусство любить",
  author: "Эрих Фромм",
  description:
    "Читаем о любви как о практике: внимательно, с вопросами к себе и без готовых ответов.",
  pages: 224,
  weeks: 4,
  starts_on: today(),
  meeting_url: "",
};
const demoStages = Array.from({ length: 4 }, (_, i) => ({
  id: "demo-" + i,
  position: i + 1,
  title: [
    "Любовь — это искусство?",
    "Теория любви",
    "Любовь и современный мир",
    "Практика любви",
  ][i],
  page_from: i * 56 + 1,
  page_to: (i + 1) * 56,
  opens_at: new Date(Date.now() + i * 604800000).toISOString(),
  meets_at: new Date(Date.now() + (i + 1) * 604800000).toISOString(),
}));
function Cover({
  book = demo.book,
  author = demo.author,
  small = false,
  tone = 0,
}) {
  return (
    <div className={"cover tone" + tone + (small ? " small" : "")}>
      <span className="cover-top">
        БИБЛИОТЕКА
        <br />
        МЕДЛЕННОГО ЧТЕНИЯ
      </span>
      <div className="cover-title">{book}</div>
      <div className="cover-art">
        <span />
        <span />
        <span />
      </div>
      <span className="cover-author">{author}</span>
      <span className="cover-bottom">BOOKMATTERS / ЧИТАЕМ ВМЕСТЕ</span>
    </div>
  );
}
const chapterMode = (c) => c?.reading_mode === "chapters";
const totalUnits = (c) => (chapterMode(c) ? c.chapters : c.pages);
const unitShort = (c) => (chapterMode(c) ? "гл." : "стр.");
const stageRange = (s, c) =>
  !s
    ? ""
    : chapterMode(c)
      ? `Главы ${s.chapter_from}–${s.chapter_to}`
      : `Страницы ${s.page_from}–${s.page_to}`;
function App() {
  const [user, setUser] = useState(null),
    [clubs, setClubs] = useState([]),
    [members, setMembers] = useState([]),
    [view, setView] = useState("discover"),
    [club, setClub] = useState(null),
    [stages, setStages] = useState([]),
    [stage, setStage] = useState(0),
    [tab, setTab] = useState("discussion"),
    [posts, setPosts] = useState([]),
    [progress, setProgress] = useState({ page: 0, note: "" }),
    [modal, setModal] = useState(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [mobile, setMobile] = useState(false);
  const [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [sent, setSent] = useState(false),
    [signup, setSignup] = useState(false),
    [nickname, setNickname] = useState(localStorage.getItem("bm-name") || ""),
    [body, setBody] = useState(""),
    [kind, setKind] = useState("thought");
  const community = useCommunity(db, user);
  const [readingMode, setReadingMode] = useState("chapters");
  const [visibility, setVisibility] = useState("open");
  const [unitCount, setUnitCount] = useState(12);
  const [settingsVisibility, setSettingsVisibility] = useState("open");
  const incomingCount =
    community.incoming.length +
    community.invites.filter((i) => i.recipient_id === user?.id).length;
  useEffect(() => {
    if (community.profile?.display_name) {
      setNickname(community.profile.display_name);
      localStorage.setItem("bm-name", community.profile.display_name);
    }
  }, [community.profile?.display_name]);
  const mine =
      club &&
      members.some((m) => m.club_id === club.id && m.user_id === user?.id),
    isDemo = club?.id === "demo",
    active = stages[stage],
    locked = active && new Date(active.opens_at) > new Date();
  const name = nickname.trim() || "Читатель";
  const isOwner = Boolean(user && club && club.owner_id === user.id);
  const canInvite = mine && (club?.visibility !== "closed" || isOwner);
  const progressKey = chapterMode(club) ? "chapter" : "page";
  const activeId = useRef(null);
  const viewerId = useRef(user?.id);
  viewerId.current = user?.id;
  activeId.current = active?.id;
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement;
    document.body.style.overflow = "hidden";
    const key = (e) => {
      if (e.key === "Escape" && !busy) setModal(null);
      if (e.key === "Tab") {
        const nodes = [
          ...document.querySelectorAll(
            "[role=dialog] button,[role=dialog] input,[role=dialog] textarea,[role=dialog] select",
          ),
        ].filter((n) => !n.disabled);
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [modal, busy]);
  async function run(fn) {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(
        e.message === "Failed to fetch"
          ? "Не удалось подключиться. Проверьте соединение и попробуйте ещё раз."
          : e.message,
      );
    } finally {
      setBusy(false);
    }
  }
  function toast(t) {
    setNotice(t);
    setTimeout(() => setNotice(""), 4500);
  }
  async function refresh() {
    const identity = viewerId.current;
    setLoading(true);
    try {
      const [c, m] = await Promise.all([
        db
          .from("bm_clubs")
          .select("*")
          .order("created_at", { ascending: false }),
        db.from("bm_members").select("*"),
      ]);
      if (c.error || m.error) throw c.error || m.error;
      if (identity !== viewerId.current) return;
      setClubs(c.data);
      setMembers(m.data);
    } catch (e) {
      setError("Не удалось загрузить клубы. " + e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    db.auth
      .getSession()
      .then(({ data }) => setUser(data.session?.user || null));
    const { data } = db.auth.onAuthStateChange((_, s) =>
      setUser(s?.user || null),
    );
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    setClubs([]);
    setMembers([]);
    if (!user) {
      setClub(null);
      setView("discover");
    }
    refresh();
  }, [user?.id]);
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("club");
    if (id === "demo") {
      openClub(demo);
      return;
    }
    if (id && clubs.length) {
      const c = clubs.find((c) => c.id === id);
      if (c) openClub(c);
    }
  }, [clubs.map((c) => c.id).join(",")]);
  useEffect(() => {
    if (!user) {
      setPosts([]);
      setProgress({ page: 0, note: "" });
      return;
    }
    if (club && !isDemo) {
      run(async () => {
        const p = await db
          .from("bm_progress")
          .select("*")
          .eq("club_id", club.id)
          .eq("user_id", user.id)
          .maybeSingle();
        if (p.error) throw p.error;
        setProgress(p.data || { page: 0, note: "" });
      });
    }
  }, [user?.id, club?.id]);
  async function loadPosts(s) {
    if (!s || isDemo || !user) {
      setPosts([]);
      return;
    }
    const r = await db
      .from("bm_posts")
      .select("*")
      .eq("stage_id", s.id)
      .order("created_at");
    if (r.error) throw r.error;
    if (activeId.current === s.id) setPosts(r.data);
  }
  useEffect(() => {
    setPosts([]);
    if (active && user && !isDemo && !locked) run(() => loadPosts(active));
  }, [active?.id, user?.id, mine]);
  function home(v) {
    setView(v);
    setClub(null);
    setMobile(false);
    history.replaceState(null, "", location.pathname);
    setError("");
  }
  async function openClub(c) {
    setClub(c);
    setView("club");
    setTab("discussion");
    setStage(0);
    setProgress({ page: 0, note: "" });
    setPosts([]);
    history.replaceState(null, "", "?club=" + c.id);
    if (c.id === "demo") {
      setStages(demoStages);
      return;
    }
    setStages([]);
    await run(async () => {
      const r = await db
        .from("bm_stages")
        .select("*")
        .eq("club_id", c.id)
        .order("position");
      if (r.error) throw r.error;
      setStages(r.data);
      const idx = r.data.findLastIndex(
        (s) => new Date(s.opens_at) <= new Date(),
      );
      setStage(Math.max(0, idx));
    });
  }
  function openClubLink(event, selectedClub) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) return;
    event.preventDefault();
    openClub(selectedClub);
  }
  function auth() {
    setModal("auth");
    setError("");
  }
  async function join() {
    if (!user) return auth();
    if (isDemo) {
      setModal("create");
      return;
    }
    await run(async () => {
      const invitation = community.invites.find(
        (i) => i.club_id === club.id && i.recipient_id === user.id,
      );
      const r = invitation
        ? await db.rpc("bm_respond_club_invite", {
            p_invitation: invitation.id,
            p_accept: true,
            p_display_name: name,
          })
        : await db
            .from("bm_members")
            .insert({ club_id: club.id, user_id: user.id, display_name: name });
      if (r.error) throw r.error;
      await community.load();
      await refresh();
      toast("Вы в клубе. Приятного чтения!");
    });
  }
  async function saveProgress(e) {
    e.preventDefault();
    await run(async () => {
      const r = await db.from("bm_progress").upsert({
        club_id: club.id,
        user_id: user.id,
        page: chapterMode(club) ? 0 : Number(progress.page || 0),
        chapter: chapterMode(club) ? Number(progress.chapter || 0) : 0,
        note: progress.note,
        updated_at: new Date().toISOString(),
      });
      if (r.error) throw r.error;
      toast("Сохранено. У каждого свой темп.");
    });
  }
  async function send(e) {
    e.preventDefault();
    if (!body.trim()) return;
    await run(async () => {
      const r = await db.from("bm_posts").insert({
        stage_id: active.id,
        user_id: user.id,
        display_name: name,
        body: body.trim(),
        kind,
      });
      if (r.error) throw r.error;
      setBody("");
      await loadPosts(active);
    });
  }
  async function authenticate(e) {
    e.preventDefault();
    await run(async () => {
      localStorage.setItem("bm-name", name);
      if (!sent) {
        const r = await db.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: signup,
            emailRedirectTo: location.origin,
          },
        });
        if (r.error) throw r.error;
        setSent(true);
      } else {
        const r = await db.auth.verifyOtp({
          email,
          token: code.trim(),
          type: "email",
        });
        if (r.error) throw r.error;
        setModal(null);
        setSent(false);
        setCode("");
        toast("Рады видеть вас в Bookmatters");
      }
    });
  }
  async function create(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    if (Number(f.get("weeks")) > Number(f.get("units"))) {
      setError(
        "Недель не может быть больше, чем глав или страниц. Уменьшите число недель.",
      );
      return;
    }
    await run(async () => {
      const r = await db.rpc("bm_create_club_v2", {
        p_name: f.get("name").trim(),
        p_description: f.get("description").trim(),
        p_book: f.get("book").trim(),
        p_author: f.get("author").trim(),
        p_units: Number(f.get("units")),
        p_mode: readingMode,
        p_visibility: visibility,
        p_start: f.get("start"),
        p_weeks: Number(f.get("weeks")),
        p_meeting: f.get("meeting").trim(),
        p_display_name: name,
        p_meeting_time: f.get("meeting_time"),
      });
      if (r.error) throw r.error;
      setModal(null);
      await refresh();
      const c = await db.from("bm_clubs").select("*").eq("id", r.data).single();
      if (c.error) throw c.error;
      await openClub(c.data);
      toast("Клуб создан. Пригласите друзей читать вместе!");
    });
  }
  async function respondInvite(invitation, accept) {
    const result = await community.respond(invitation.id, accept, name);
    if (!result.ok) return;
    await refresh();
    if (accept) {
      const c = await db
        .from("bm_clubs")
        .select("*")
        .eq("id", result.value)
        .single();
      if (c.error) {
        setError(c.error.message);
        return;
      }
      await openClub(c.data);
      toast("Вы в клубе. Приятного чтения!");
    } else toast("Приглашение отклонено");
  }
  async function saveClubSettings(e) {
    e.preventDefault();
    await run(async () => {
      const r = await db
        .from("bm_clubs")
        .update({ visibility: settingsVisibility })
        .eq("id", club.id)
        .select()
        .single();
      if (r.error) throw r.error;
      setClub(r.data);
      await refresh();
      setModal(null);
      toast("Доступ к клубу обновлён");
    });
  }
  useEffect(() => {
    if (user) refresh();
  }, [community.invites.map((i) => i.id).join(",")]);
  useEffect(() => {
    if (user && ["friends", "account"].includes(view)) community.load();
  }, [view]);
  const filtered = clubs.filter(
    (c) =>
      (view !== "discover" || c.visibility !== "closed") &&
      (view !== "my" ||
        members.some((m) => m.club_id === c.id && m.user_id === user?.id)) &&
      (c.name + " " + c.book + " " + c.author)
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="app">
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <a
          href="/"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            home("discover");
          }}
        >
          <BookOpen size={26} />
          <span>
            bookmatters<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="sidebar-middle">
          <p className="eyebrow">ВАШЕ МЕСТО ДЛЯ ЧТЕНИЯ</p>
          <nav>
            <button
              className={view === "discover" ? "selected" : ""}
              onClick={() => home("discover")}
            >
              <Search size={18} />
              Открыть клубы <span>↗</span>
            </button>
            <button
              className={view === "my" ? "selected" : ""}
              onClick={() => home("my")}
            >
              <BookOpen size={18} />
              Мои клубы{" "}
              {user && (
                <i>
                  {
                    clubs.filter((c) =>
                      members.some(
                        (m) => m.club_id === c.id && m.user_id === user.id,
                      ),
                    ).length
                  }
                </i>
              )}
            </button>
            <button
              className={view === "friends" ? "selected" : ""}
              onClick={() => home("friends")}
            >
              <Users size={18} />
              Друзья {incomingCount > 0 && <i>{incomingCount}</i>}
            </button>
            <button
              className={view === "account" ? "selected" : ""}
              onClick={() => home("account")}
            >
              <UserCircle size={18} />
              Профиль
            </button>
            <button
              className={view === "about" ? "selected" : ""}
              onClick={() => home("about")}
            >
              <Leaf size={18} />О медленном чтении
            </button>
          </nav>
          <div className="sidebar-note">
            <span className="little-star">✳</span>
            <p>
              Хорошей книге
              <br />
              нужно время.
              <br />И собеседник.
            </p>
            <small>
              Меньше страниц.
              <br />
              Больше смысла.
            </small>
          </div>
        </div>
        <div className="account">
          {user ? (
            <>
              <div className="avatar">{name[0]}</div>
              <div>
                <b>{name}</b>
                <small>Время для книги</small>
              </div>
              <button
                className="icon"
                title="Выйти"
                onClick={() =>
                  run(async () => {
                    await db.auth.signOut();
                    home("discover");
                  })
                }
              >
                <LogOut size={17} />
              </button>
            </>
          ) : (
            <button className="account-login" onClick={auth}>
              <div className="avatar">
                <Users size={18} />
              </div>
              <span>
                Войти в Bookmatters <ArrowUpRight size={16} />
              </span>
            </button>
          )}
        </div>
      </aside>
      <div className="workspace">
        <header>
          <button
            className="icon mobile-menu"
            onClick={() => (user ? home("account") : auth())}
            aria-label="Открыть профиль"
          >
            <UserCircle />
          </button>
          <div className="breadcrumbs">
            Книжное сообщество <span>/</span>{" "}
            <b>
              {club
                ? club.name
                : view === "my"
                  ? "Мои клубы"
                  : view === "friends"
                    ? "Друзья"
                    : view === "account"
                      ? "Профиль"
                      : view === "about"
                        ? "Наш подход"
                        : "Открыть клубы"}
            </b>
          </div>
          <span className="header-motto">
            <span /> Без спешки, вместе
          </span>
          <button
            className="primary small-btn"
            onClick={() => (user ? setModal("create") : auth())}
          >
            <Plus size={16} />
            Создать клуб
          </button>
        </header>
        <main>
          {error && (
            <div role="alert" className="error">
              {error}
              <button
                className="icon"
                aria-label="Закрыть ошибку"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {!club && ["friends", "account"].includes(view) && (
            <Community
              community={community}
              clubs={clubs}
              name={name}
              onAuth={auth}
              onRespond={respondInvite}
              account={view === "account"}
              onSignOut={() =>
                run(async () => {
                  await db.auth.signOut();
                  home("discover");
                })
              }
            />
          )}
          {!club && ["discover", "my"].includes(view) && (
            <>
              <section className="intro">
                <div>
                  <p className="eyebrow">
                    BOOKMATTERS — КЛУБЫ МЕДЛЕННОГО ЧТЕНИЯ
                  </p>
                  <h1>
                    {view === "my" ? (
                      "Ваши книжные встречи."
                    ) : (
                      <>
                        Читать глубже.
                        <br />
                        <em>Быть ближе.</em>
                      </>
                    )}
                  </h1>
                  <p>
                    {view === "my"
                      ? "Здесь живут ваши книги, мысли и разговоры."
                      : "Одна книга, небольшой круг, общий ритм. Место, где можно остановиться на одной странице — и найти целый мир."}
                  </p>
                </div>
                <div className="intro-art" aria-hidden="true">
                  <div className="orb" />
                  <div className="book book-a">
                    the art
                    <br />
                    of noticing<span>СМОТРЕТЬ ВНИМАТЕЛЬНЕЕ</span>
                  </div>
                  <div className="book book-b">
                    жить
                    <br />
                    <i>читая.</i>
                    <span>BOOKMATTERS</span>
                  </div>
                  <span className="art-star">✳</span>
                  <div className="art-caption">ХОРОШИЕ ИСТОРИИ СБЛИЖАЮТ</div>
                </div>
              </section>
              <div className="section-head">
                <div>
                  <h2>
                    {view === "my" ? "Мои клубы" : "Найдите своих читателей"}{" "}
                    <span className="count">{filtered.length}</span>
                  </h2>
                  <p>
                    {view === "my"
                      ? "Продолжите с того места, на котором остановились."
                      : "Присоединяйтесь к открытому клубу или соберите свой."}
                  </p>
                </div>
                <label className="search">
                  <Search size={17} />
                  <input
                    aria-label="Найти клуб или книгу"
                    placeholder="Книга, автор или клуб"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
              {loading ? (
                <div className="empty">Расставляем книги по полкам…</div>
              ) : (
                <div className="club-grid">
                  {filtered.map((c, i) => (
                    <a
                      className="club-card"
                      key={c.id}
                      href={"/?club=" + c.id}
                      aria-label={"Открыть клуб «" + c.name + "» — " + c.book}
                      onClick={(event) => openClubLink(event, c)}
                    >
                      <div className={"card-cover color" + (i % 3)}>
                        <Cover
                          book={c.book}
                          author={c.author}
                          small
                          tone={i % 3}
                        />
                        <span className="badge">
                          {c.visibility === "closed" ? (
                            <>
                              <LockKeyhole size={10} /> Закрытый клуб
                            </>
                          ) : (
                            <>
                              <Globe2 size={10} /> Открытый клуб
                            </>
                          )}
                        </span>
                      </div>
                      <div className="card-info">
                        <span className="eyebrow">{c.name}</span>
                        <h3>{c.book}</h3>
                        <p>{c.author || "Совместное чтение"}</p>
                        <div className="card-meta">
                          <span>
                            <Users size={14} />
                            {
                              members.filter((m) => m.club_id === c.id).length
                            }{" "}
                            читателей
                          </span>
                          <span>{c.weeks} нед.</span>
                        </div>
                        <span className="text-btn">
                          Заглянуть в клуб <ArrowUpRight size={17} />
                        </span>
                      </div>
                    </a>
                  ))}
                  {view === "discover" && !query && (
                    <a
                      className="club-card demo-card"
                      href="/?club=demo"
                      aria-label="Посмотреть пример клуба «Между строк»"
                      onClick={(event) => openClubLink(event, demo)}
                    >
                      <div className="card-cover">
                        <Cover small />
                        <span className="badge">Пример клуба</span>
                      </div>
                      <div className="card-info">
                        <span className="eyebrow">КАК ВСЁ УСТРОЕНО</span>
                        <h3>Искусство любить</h3>
                        <p>Эрих Фромм · «Между строк»</p>
                        <div className="card-meta">
                          <span>
                            <BookOpen size={14} />4 этапа чтения
                          </span>
                          <span>224 стр.</span>
                        </div>
                        <span className="text-btn">
                          Посмотреть пример <ArrowUpRight size={17} />
                        </span>
                      </div>
                    </a>
                  )}
                  {!query && (
                    <button
                      className="create-card"
                      onClick={() => (user ? setModal("create") : auth())}
                    >
                      <span className="plus-circle">
                        <Plus size={26} />
                      </span>
                      <h3>
                        Ваша книга.
                        <br />
                        Ваш круг.
                      </h3>
                      <p>
                        Пригласите друзей и задайте
                        <br />
                        комфортный ритм чтения.
                      </p>
                      <span className="text-btn">
                        Создать книжный клуб <ArrowRight size={17} />
                      </span>
                    </button>
                  )}
                  {!filtered.length && (query || view === "my") && (
                    <div className="empty">
                      <BookOpen size={28} />
                      <h3>
                        {query
                          ? "Пока ничего не нашлось"
                          : "Здесь начнётся ваша история"}
                      </h3>
                      <p>
                        {query
                          ? "Попробуйте другой запрос."
                          : user
                            ? "Присоединитесь к клубу или создайте свой."
                            : "Войдите, чтобы собрать свои книжные клубы."}
                      </p>
                      <button
                        className="secondary"
                        onClick={() =>
                          query
                            ? setQuery("")
                            : user
                              ? home("discover")
                              : auth()
                        }
                      >
                        {query
                          ? "Сбросить поиск"
                          : user
                            ? "Выбрать клуб"
                            : "Войти"}
                      </button>
                    </div>
                  )}
                </div>
              )}
              <section className="manifesto">
                <span className="little-star">✳</span>
                <div>
                  <p className="eyebrow">НЕ МАРАФОН. ВСТРЕЧА.</p>
                  <h2>
                    Здесь не считают прочитанные книги.
                    <br />
                    <em>Здесь замечают, что они меняют.</em>
                  </h2>
                </div>
                <button
                  className="circle-btn"
                  aria-label="О медленном чтении"
                  onClick={() => home("about")}
                >
                  <ArrowUpRight />
                </button>
              </section>
            </>
          )}
          {view === "about" && (
            <section className="about">
              <p className="eyebrow">НАШ ПОДХОД</p>
              <h1>
                Книги — повод.
                <br />
                <em>Разговор — главное.</em>
              </h1>
              <p className="lead">
                Медленное чтение возвращает книге пространство в нашей жизни. Не
                нужно читать быстрее. Можно читать внимательнее.
              </p>
              <div className="principles">
                {[
                  [
                    "01",
                    "Небольшой круг",
                    "Соберите людей, с которыми хочется думать вслух. Открытый клуб доступен всем, а закрытый — только вашему кругу по приглашению.",
                  ],
                  [
                    "02",
                    "Общий ритм",
                    "Организатор выбирает книгу, главы или страницы и число недель. Мы делим чтение на небольшие этапы. Вы отмечаете свой прогресс без соревнования.",
                  ],
                  [
                    "03",
                    "Без спойлеров",
                    "Обсуждение каждого этапа открывается в день его начала. Вопросы, цитаты и мысли остаются рядом с нужными страницами.",
                  ],
                  [
                    "04",
                    "Живая встреча",
                    "В конце каждого этапа — повод собраться. Добавьте ссылку на онлайн-встречу или договоритесь о месте в обсуждении. Встречи в расписании указаны в UTC.",
                  ],
                ].map(([n, t, p]) => (
                  <article key={n}>
                    <span>{n}</span>
                    <h2>{t}</h2>
                    <p>{p}</p>
                  </article>
                ))}
              </div>
              <button
                className="primary"
                onClick={() => (user ? setModal("create") : auth())}
              >
                Собрать свой круг <ArrowRight size={17} />
              </button>
            </section>
          )}
          {club && (
            <>
              <button className="back" onClick={() => home("discover")}>
                <ChevronLeft size={16} />
                Все клубы
              </button>
              <section className="club-hero">
                <div className="hero-cover">
                  <Cover book={club.book} author={club.author} />
                </div>
                <div className="hero-info">
                  <p className="eyebrow">
                    {isDemo
                      ? "ПРИМЕР КЛУБА · ЗНАКОМСТВО С BOOKMATTERS"
                      : club.visibility === "closed"
                        ? "ЗАКРЫТЫЙ КНИЖНЫЙ КЛУБ"
                        : "ОТКРЫТЫЙ КНИЖНЫЙ КЛУБ"}{" "}
                    / {club.name}
                  </p>
                  <h1>{club.book}</h1>
                  <p className="author">{club.author}</p>
                  <p>{club.description}</p>
                  <div className="hero-meta">
                    <span>
                      <CalendarDays size={17} />
                      {club.weeks} недель
                    </span>
                    <span>
                      <BookOpen size={17} />
                      {totalUnits(club)} {unitShort(club)}
                    </span>
                    <span>
                      <Users size={17} />
                      {isDemo
                        ? "Ваш будущий круг"
                        : club.visibility === "closed" && !mine
                          ? "По приглашению"
                          : members.filter((m) => m.club_id === club.id)
                              .length + " читателей"}
                    </span>
                  </div>
                  <div className="actions">
                    {!mine && (
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={join}
                      >
                        {isDemo ? "Создать похожий клуб" : "Присоединиться"}
                        <ArrowRight size={17} />
                      </button>
                    )}
                    {mine && (
                      <span className="member-label">
                        <Check size={17} />
                        Вы в клубе
                      </span>
                    )}
                    {!isDemo && club.visibility !== "closed" && (
                      <button
                        className="secondary"
                        onClick={() =>
                          run(async () => {
                            await navigator.clipboard.writeText(
                              location.origin + "/?club=" + club.id,
                            );
                            toast("Ссылка на клуб скопирована");
                          })
                        }
                      >
                        <Link size={16} />
                        Скопировать ссылку
                      </button>
                    )}
                    {canInvite && (
                      <button
                        className="primary"
                        onClick={() => {
                          community.setError("");
                          setModal("invite");
                        }}
                      >
                        <Users size={17} />
                        Пригласить друзей
                      </button>
                    )}
                    {isOwner && (
                      <button
                        className="glass-icon"
                        aria-label="Настройки клуба"
                        onClick={() => {
                          setSettingsVisibility(club.visibility || "open");
                          setModal("settings");
                        }}
                      >
                        <Settings2 size={19} />
                      </button>
                    )}
                  </div>
                </div>
              </section>
              <div className="reading-layout">
                <section>
                  <div className="tabs" role="tablist">
                    {[
                      ["discussion", "Обсуждение"],
                      ["plan", "План чтения"],
                      ["notes", "Мой дневник"],
                      ["people", "Участники"],
                    ].map(([v, t]) => (
                      <button
                        role="tab"
                        aria-selected={tab === v}
                        key={v}
                        className={tab === v ? "active" : ""}
                        onClick={() => setTab(v)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  {tab === "plan" ? (
                    <div className="stage-list">
                      {stages.map((s, i) => (
                        <button
                          key={s.id}
                          className={
                            i === stage ? "stage-row chosen" : "stage-row"
                          }
                          onClick={() => {
                            setStage(i);
                            setTab("discussion");
                          }}
                        >
                          <span className="stage-num">{i + 1}</span>
                          <div>
                            <b>{s.title}</b>
                            <p>
                              {stageRange(s, club)} · {date(s.opens_at)} —{" "}
                              {date(s.meets_at)}
                            </p>
                          </div>
                          {new Date(s.opens_at) > new Date() ? (
                            <LockKeyhole size={17} />
                          ) : (
                            <ArrowRight size={17} />
                          )}
                        </button>
                      ))}
                    </div>
                  ) : tab === "people" ? (
                    <div className="panel">
                      <h2>Круг читателей</h2>
                      <p>
                        {club.visibility === "closed"
                          ? "Участников видят только члены закрытого клуба."
                          : "Выбранные имена участников открытого клуба видны всем."}
                      </p>
                      {isDemo ? (
                        <p>В вашем клубе здесь появятся участники.</p>
                      ) : (
                        members
                          .filter((m) => m.club_id === club.id)
                          .map((m) => (
                            <div className="person" key={m.user_id}>
                              <span className="avatar">
                                {m.display_name[0]}
                              </span>
                              <b>{m.display_name}</b>
                              <small>
                                {m.user_id === club.owner_id
                                  ? "Организатор"
                                  : "Читатель"}
                              </small>
                            </div>
                          ))
                      )}
                      {mine && user.id !== club.owner_id && (
                        <button
                          className="text-btn"
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              const r = await db
                                .from("bm_members")
                                .delete()
                                .eq("club_id", club.id)
                                .eq("user_id", user.id);
                              if (r.error) throw r.error;
                              await refresh();
                              setPosts([]);
                              home("my");
                              toast("Вы вышли из клуба");
                            })
                          }
                        >
                          Выйти из клуба
                        </button>
                      )}
                    </div>
                  ) : tab === "notes" ? (
                    <div className="panel">
                      <p className="eyebrow">ТОЛЬКО ДЛЯ ВАС</p>
                      <h2>Мысли на полях</h2>
                      <p>Личный дневник и прогресс доступны только вам.</p>
                      {mine ? (
                        <form onSubmit={saveProgress}>
                          <label>
                            {chapterMode(club)
                              ? "Прочитано глав"
                              : "Я на странице"}
                            <input
                              type="number"
                              min="0"
                              max={totalUnits(club)}
                              required
                              value={progress[progressKey] || 0}
                              onChange={(e) =>
                                setProgress({
                                  ...progress,
                                  [progressKey]: e.target.value,
                                })
                              }
                            />
                          </label>
                          <label>
                            Что хочется запомнить
                            <textarea
                              rows="8"
                              maxLength="10000"
                              value={progress.note}
                              onChange={(e) =>
                                setProgress({
                                  ...progress,
                                  note: e.target.value,
                                })
                              }
                              placeholder="Цитата, вопрос к себе или мысль, которая осталась с вами…"
                            />
                          </label>
                          <button className="primary" disabled={busy}>
                            Сохранить
                          </button>
                        </form>
                      ) : (
                        <button className="primary" onClick={join}>
                          {isDemo
                            ? "Создать свой клуб"
                            : "Вступить и начать дневник"}
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="discussion-top">
                        <div>
                          <p className="eyebrow">
                            {active
                              ? "НЕДЕЛЯ " + active.position
                              : "ПЛАН ЧТЕНИЯ"}
                          </p>
                          <h2>{active?.title || "Загружаем этапы…"}</h2>
                          <p>{stageRange(active, club)}</p>
                        </div>
                        <select
                          aria-label="Выбрать этап"
                          value={stage}
                          onChange={(e) => setStage(Number(e.target.value))}
                        >
                          {stages.map((s, i) => (
                            <option value={i} key={s.id}>
                              Неделя {s.position}
                            </option>
                          ))}
                        </select>
                      </div>
                      {locked ? (
                        <div className="empty panel">
                          <LockKeyhole />
                          <h3>Всему своё время</h3>
                          <p>
                            Обсуждение откроется {date(active.opens_at)}. Пока
                            остаёмся на текущем этапе.
                          </p>
                        </div>
                      ) : isDemo ? (
                        <div className="demo-discussion panel">
                          <span className="badge">
                            Так выглядит пространство обсуждения
                          </span>
                          <h3>С каким вопросом вы начинаете эту книгу?</h3>
                          <p>
                            Можно поделиться мыслью, задать вопрос или сохранить
                            цитату. Здесь не бывает неправильных интерпретаций.
                          </p>
                          <blockquote>
                            «Любовь — это искусство?»
                            <small>Вопрос для первой встречи</small>
                          </blockquote>
                          <button
                            className="text-btn"
                            onClick={() => (user ? setModal("create") : auth())}
                          >
                            Начать разговор в своём клубе{" "}
                            <ArrowRight size={17} />
                          </button>
                        </div>
                      ) : !mine ? (
                        <div className="empty panel">
                          <MessageCircle />
                          <h3>Разговор начинается с знакомства</h3>
                          <p>
                            Вступите в клуб, чтобы читать обсуждения и делиться
                            мыслями.
                          </p>
                          <button className="primary" onClick={join}>
                            Присоединиться
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="prompt-card">
                            <span>ВОПРОС ДЛЯ РАЗГОВОРА</span>
                            <p>
                              Какая мысль в этом отрывке заставила вас
                              остановиться?
                            </p>
                          </div>
                          <form className="composer" onSubmit={send}>
                            <textarea
                              aria-label="Ваша мысль"
                              required
                              maxLength="5000"
                              rows="3"
                              placeholder="Оставьте мысль, цитату или вопрос…"
                              value={body}
                              onChange={(e) => setBody(e.target.value)}
                            />
                            <div>
                              <select
                                aria-label="Тип сообщения"
                                value={kind}
                                onChange={(e) => setKind(e.target.value)}
                              >
                                <option value="thought">Мысль</option>
                                <option value="question">Вопрос</option>
                                <option value="quote">Цитата</option>
                              </select>
                              <button
                                className="primary small-btn"
                                disabled={busy || !body.trim()}
                              >
                                <Send size={15} />
                                Поделиться
                              </button>
                            </div>
                          </form>
                          <div className="post-head">
                            <h3>
                              Разговор{" "}
                              <span className="count">{posts.length}</span>
                            </h3>
                            <button
                              className="text-btn"
                              disabled={busy}
                              onClick={() => run(() => loadPosts(active))}
                            >
                              Обновить
                            </button>
                          </div>
                          {posts.length ? (
                            posts.map((p) => (
                              <article className="post" key={p.id}>
                                <div className="post-by">
                                  <span className="avatar">
                                    {p.display_name[0]}
                                  </span>
                                  <b>{p.display_name}</b>
                                  <small>
                                    {date(p.created_at)} ·{" "}
                                    {
                                      {
                                        thought: "Мысль",
                                        question: "Вопрос",
                                        quote: "Цитата",
                                      }[p.kind]
                                    }
                                  </small>
                                  {p.user_id === user?.id && (
                                    <button
                                      className="icon"
                                      aria-label="Удалить сообщение"
                                      disabled={busy}
                                      onClick={() =>
                                        run(async () => {
                                          const r = await db
                                            .from("bm_posts")
                                            .delete()
                                            .eq("id", p.id);
                                          if (r.error) throw r.error;
                                          await loadPosts(active);
                                        })
                                      }
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  )}
                                </div>
                                <p>{p.body}</p>
                              </article>
                            ))
                          ) : (
                            <p className="muted empty">
                              Пока тихо. Пусть первая мысль будет вашей.
                            </p>
                          )}
                        </>
                      )}
                    </>
                  )}
                </section>
                <aside className="reading-aside">
                  <div className="panel progress-panel">
                    <p className="eyebrow">ВАШ РИТМ</p>
                    <h3>
                      {chapterMode(club)
                        ? "Глава за главой."
                        : "По одной странице."}
                    </h3>
                    <p>
                      У каждого свой темп.
                      <br />
                      Здесь нет отстающих.
                    </p>
                    <div className="progress-line">
                      <span
                        style={{
                          width:
                            Math.min(
                              100,
                              (Number(progress[progressKey] || 0) /
                                totalUnits(club)) *
                                100,
                            ) + "%",
                        }}
                      />
                    </div>
                    <div className="progress-caption">
                      <b>
                        {mine ? progress[progressKey] || 0 : 0}{" "}
                        <small>
                          / {totalUnits(club)} {unitShort(club)}
                        </small>
                      </b>
                      <Bookmark size={17} />
                    </div>
                    {mine && (
                      <button
                        className="text-btn"
                        onClick={() => setTab("notes")}
                      >
                        Отметить прогресс <ArrowRight size={15} />
                      </button>
                    )}
                  </div>
                  <div className="panel meeting-panel">
                    <CalendarDays size={22} />
                    <p className="eyebrow">СЛЕДУЮЩАЯ ВСТРЕЧА</p>
                    <h3>{active ? date(active.meets_at) : "Скоро"}</h3>
                    <p>
                      По завершении этапа ·{" "}
                      {active
                        ? new Date(active.meets_at).toISOString().slice(11, 16)
                        : "19:00"}{" "}
                      UTC
                      <br />
                      Время встречи указано в UTC.
                    </p>
                    {club.meeting_url ? (
                      <a
                        className="text-btn"
                        href={club.meeting_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Перейти к встрече <ArrowUpRight size={16} />
                      </a>
                    ) : (
                      <small>Место и время обсудим вместе.</small>
                    )}
                    {active && (
                      <button
                        className="text-btn"
                        onClick={() => {
                          const start = new Date(active.meets_at),
                            end = new Date(start.getTime() + 3600000),
                            fmt = (d) =>
                              d
                                .toISOString()
                                .replace(/[-:]/g, "")
                                .split(".")[0] + "Z",
                            safe = (s) =>
                              s
                                .replace(/\\/g, "\\\\")
                                .replace(/\n/g, "\\n")
                                .replace(/[,;]/g, " ");
                          const content = [
                            "BEGIN:VCALENDAR",
                            "VERSION:2.0",
                            "PRODID:-//Bookmatters//Reading//RU",
                            "BEGIN:VEVENT",
                            "UID:" + active.id + "@bookmatters.brainsome.app",
                            "DTSTAMP:" + fmt(new Date()),
                            "DTSTART:" + fmt(start),
                            "DTEND:" + fmt(end),
                            "SUMMARY:" + safe(club.name + " — " + active.title),
                            "DESCRIPTION:Книжная встреча. Подтвердите точное время с организатором.",
                            "END:VEVENT",
                            "END:VCALENDAR",
                          ].join("\r\n");
                          const url = URL.createObjectURL(
                            new Blob([content], { type: "text/calendar" }),
                          );
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = "bookmatters.ics";
                          a.click();
                          setTimeout(() => URL.revokeObjectURL(url), 1000);
                        }}
                      >
                        Добавить в календарь <Plus size={14} />
                      </button>
                    )}
                  </div>
                  <p className="aside-quote">
                    «Чтение — это разговор
                    <br />с самим собой.
                    <br />
                    <em>
                      А иногда — начало
                      <br />
                      разговора с другим.»
                    </em>
                  </p>
                </aside>
              </div>
            </>
          )}
          <footer>
            <span className="footer-brand">bookmatters.</span>
            <span>Для книг, которым нужно время.</span>
            <span>Читаем вместе, чувствуем по-своему.</span>
          </footer>
        </main>
      </div>
      <nav className="mobile-tabbar" aria-label="Основная навигация">
        {[
          ["discover", "Обзор", Search],
          ["my", "Мои клубы", BookOpen],
          ["friends", "Друзья", Users],
          ["account", "Профиль", UserCircle],
        ].map(([v, title, Icon]) => (
          <button
            key={v}
            className={
              view === v || (view === "club" && v === "my") ? "active" : ""
            }
            aria-current={view === v ? "page" : undefined}
            onClick={() => home(v)}
          >
            <span>
              <Icon size={23} />
              {v === "friends" && incomingCount > 0 && <i>{incomingCount}</i>}
            </span>
            <small>{title}</small>
          </button>
        ))}
      </nav>
      {notice && (
        <div role="status" className="toast">
          <Check size={18} />
          {notice}
        </div>
      )}
      {modal && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setModal(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <button
              className="modal-close icon"
              onClick={() => setModal(null)}
              aria-label="Закрыть"
            >
              <X />
            </button>
            <BookOpen className="modal-mark" />
            <p className="eyebrow">ВАШ КНИЖНЫЙ КРУГ</p>
            <h2 id="modal-title">
              {modal === "auth"
                ? sent
                  ? "Проверьте почту"
                  : signup
                    ? "Добро пожаловать."
                    : "С возвращением."
                : modal === "invite"
                  ? "Позовите своих."
                  : modal === "settings"
                    ? "Кому открыт ваш клуб?"
                    : "Начнём с одной книги."}
            </h2>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            {modal === "auth" ? (
              <>
                <p>
                  Один аккаунт для Bookmatters, Encore и Winenote. Вход по коду
                  из письма.
                </p>
                <form onSubmit={authenticate}>
                  {!sent ? (
                    <>
                      <div className="auth-switch">
                        <button
                          type="button"
                          className={!signup ? "active" : ""}
                          onClick={() => setSignup(false)}
                        >
                          Войти
                        </button>
                        <button
                          type="button"
                          className={signup ? "active" : ""}
                          onClick={() => setSignup(true)}
                        >
                          Зарегистрироваться
                        </button>
                      </div>
                      <label>
                        Email
                        <input
                          required
                          type="email"
                          name="email"
                          inputMode="email"
                          autoComplete="email"
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          autoFocus
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <p>
                        Введите код из письма для <b>{email}</b>. Также
                        проверьте папку «Спам».
                      </p>
                      <label>
                        Одноразовый код
                        <input
                          autoFocus
                          required
                          type="text"
                          name="one-time-code"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          minLength="6"
                          maxLength="10"
                          value={code}
                          onChange={(e) => setCode(e.target.value)}
                          placeholder="Код из письма"
                        />
                      </label>
                    </>
                  )}
                  <button className="primary full" disabled={busy}>
                    {busy
                      ? "Подождите…"
                      : sent
                        ? "Подтвердить код"
                        : "Получить код"}
                    <ArrowRight size={16} />
                  </button>
                  {sent && (
                    <button
                      className="text-btn"
                      type="button"
                      onClick={() => {
                        setSent(false);
                        setCode("");
                      }}
                    >
                      Изменить адрес / отправить ещё раз
                    </button>
                  )}
                </form>
                <small className="fine">
                  Пароль не нужен. Имя для клуба можно задать в профиле после
                  входа. Email другим участникам не показывается.
                </small>
              </>
            ) : modal === "invite" ? (
              <InviteFriends
                community={community}
                club={club}
                members={members}
                onFriends={() => {
                  setModal(null);
                  home("friends");
                }}
              />
            ) : modal === "settings" ? (
              <form onSubmit={saveClubSettings}>
                <label>
                  Тип клуба
                  <select
                    value={settingsVisibility}
                    onChange={(e) => setSettingsVisibility(e.target.value)}
                  >
                    <option value="open">Открытый — для всех читателей</option>
                    <option value="closed">
                      Закрытый — только по приглашению
                    </option>
                  </select>
                </label>
                <p className="fine">
                  Закрытый клуб исчезнет из общего каталога. Состав и обсуждения
                  будут доступны участникам, а приглашения отправляет
                  организатор. Все текущие участники сохранят доступ.
                </p>
                <button className="primary full" disabled={busy}>
                  Сохранить настройки
                </button>
              </form>
            ) : (
              <>
                <p>
                  Выберите свой круг и комфортный ритм чтения. Мы подготовим
                  план встреч.
                </p>
                <form onSubmit={create}>
                  <label>
                    Название клуба
                    <input
                      name="name"
                      required
                      maxLength="100"
                      placeholder="Например, Между строк"
                      autoFocus
                    />
                  </label>
                  <div className="form-row">
                    <label>
                      Книга
                      <input
                        name="book"
                        required
                        maxLength="200"
                        defaultValue={isDemo ? demo.book : ""}
                        placeholder="Название"
                      />
                    </label>
                    <label>
                      Автор
                      <input
                        name="author"
                        maxLength="150"
                        defaultValue={isDemo ? demo.author : ""}
                        placeholder="Имя автора"
                      />
                    </label>
                  </div>
                  <label>
                    О чём ваш клуб
                    <textarea
                      name="description"
                      rows="2"
                      maxLength="2000"
                      placeholder="Что хочется обсудить? Кого вы ждёте?"
                    />
                  </label>
                  <fieldset className="choice-field">
                    <legend>Кто может вступить?</legend>
                    <div className="choice-grid">
                      {[
                        [
                          "open",
                          "Открытый",
                          "Виден в каталоге. Вступить может любой читатель.",
                          Globe2,
                        ],
                        [
                          "closed",
                          "Закрытый",
                          "Личный круг. Только приглашённые организатором друзья.",
                          LockKeyhole,
                        ],
                      ].map(([value, title, hint, Icon]) => (
                        <label
                          key={value}
                          className={
                            visibility === value
                              ? "choice-card chosen"
                              : "choice-card"
                          }
                        >
                          <input
                            type="radio"
                            name="visibility"
                            value={value}
                            checked={visibility === value}
                            onChange={() => setVisibility(value)}
                          />
                          <Icon size={21} />
                          <b>{title}</b>
                          <span>{hint}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset className="choice-field">
                    <legend>Как будем читать?</legend>
                    <div className="segmented">
                      {[
                        ["chapters", "По главам"],
                        ["pages", "По страницам"],
                      ].map(([value, title]) => (
                        <label
                          key={value}
                          className={readingMode === value ? "active" : ""}
                        >
                          <input
                            type="radio"
                            name="mode"
                            value={value}
                            checked={readingMode === value}
                            onChange={() => {
                              setReadingMode(value);
                              setUnitCount(value === "chapters" ? 12 : 224);
                            }}
                          />
                          {title}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="form-row three">
                    <label>
                      {readingMode === "chapters"
                        ? "Всего глав"
                        : "Всего страниц"}
                      <input
                        type="number"
                        name="units"
                        required
                        min="1"
                        max="10000"
                        value={unitCount}
                        onChange={(e) => setUnitCount(e.target.value)}
                      />
                    </label>
                    <label>
                      Недель
                      <input
                        type="number"
                        name="weeks"
                        required
                        min="1"
                        max="52"
                        defaultValue={4}
                      />
                    </label>
                    <label>
                      Начинаем
                      <input
                        type="date"
                        name="start"
                        required
                        defaultValue={today()}
                      />
                    </label>
                  </div>
                  <label>
                    Время еженедельных встреч (UTC)
                    <input
                      name="meeting_time"
                      type="time"
                      required
                      defaultValue="19:00"
                    />
                  </label>
                  <label>
                    Ссылка на встречи (необязательно)
                    <input
                      type="url"
                      pattern="https://.*"
                      name="meeting"
                      placeholder="https://meet.google.com/…"
                      maxLength="1000"
                    />
                  </label>
                  <p className="fine">
                    {visibility === "closed"
                      ? "Закрытый клуб виден только участникам и приглашённым друзьям."
                      : "Открытый клуб виден в общем каталоге."}{" "}
                    План создаётся автоматически: один этап в неделю,{" "}
                    {readingMode === "chapters" ? "главы" : "страницы"} делятся
                    поровну. Недель не может быть больше, чем{" "}
                    {readingMode === "chapters" ? "глав" : "страниц"}. Личные
                    заметки видны только вам.
                  </p>
                  <button className="primary full" disabled={busy}>
                    {busy ? "Создаём…" : "Создать клуб"}
                    <ArrowRight size={16} />
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener(
    "load",
    () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch((error) =>
          console.warn("Service worker registration failed", error),
        );
    },
    { once: true },
  );
}
