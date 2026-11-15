import React, { useState, useEffect, useRef } from "react";
import {
  Users,
  UserPlus,
  Check,
  X,
  ArrowRight,
  RefreshCw,
  LockKeyhole,
  BookOpen,
} from "lucide-react";
export function useCommunity(db, user) {
  const identity = useRef(user?.id);
  identity.current = user?.id;
  const [profile, setProfile] = useState(null),
    [relations, setRelations] = useState([]),
    [people, setPeople] = useState([]),
    [invites, setInvites] = useState([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setError("");
    setProfile(null);
    setRelations([]);
    setPeople([]);
    setInvites([]);
    if (user) load(() => live);
    const update = () => {
      if (document.visibilityState === "visible") load(() => live);
    };
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    const timer = setInterval(update, 30000);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [user?.id]);
  async function load(isCurrent = () => true) {
    if (!user) return;
    const viewer = user.id;
    try {
      const [p, f, i] = await Promise.all([
        db
          .from("profiles")
          .select("user_id,username,display_name")
          .eq("user_id", user.id)
          .maybeSingle(),
        db.from("friendships").select("requester,addressee,status"),
        db
          .from("bm_invitations")
          .select("*")
          .order("created_at", { ascending: false }),
      ]);
      if (p.error || f.error || i.error) throw p.error || f.error || i.error;
      const ids = [
        ...new Set(
          f.data.map((r) =>
            r.requester === user.id ? r.addressee : r.requester,
          ),
        ),
      ];
      const ps = ids.length
        ? await db
            .from("profiles")
            .select("user_id,username,display_name")
            .in("user_id", ids)
        : { data: [] };
      if (ps.error) throw ps.error;
      if (!isCurrent() || identity.current !== viewer) return;
      setProfile(p.data);
      setRelations(f.data);
      setPeople(ps.data);
      setInvites(i.data);
    } catch (e) {
      if (isCurrent() && identity.current === viewer) setError(e.message);
    }
  }
  async function action(fn) {
    setBusy(true);
    setError("");
    try {
      const result = await fn();
      await load();
      return { ok: true, value: result };
    } catch (e) {
      setError(
        e.code === "23505"
          ? "Такое имя или приглашение уже существует."
          : e.message,
      );
      return { ok: false };
    } finally {
      setBusy(false);
    }
  }
  const person = (r) =>
    people.find(
      (p) =>
        p.user_id === (r.requester === user?.id ? r.addressee : r.requester),
    ) || {
      user_id: r.requester === user?.id ? r.addressee : r.requester,
      display_name: "Читатель",
      username: "",
    };
  return {
    db,
    user,
    profile,
    invites,
    busy,
    error,
    setError,
    load,
    action,
    friends: relations.filter((r) => r.status === "accepted").map(person),
    incoming: relations
      .filter((r) => r.status === "pending" && r.addressee === user?.id)
      .map(person),
    outgoing: relations
      .filter((r) => r.status === "pending" && r.requester === user?.id)
      .map(person),
    relations,
    async request(username) {
      return action(async () => {
        const r = await db.rpc("send_friend_request", { p_username: username });
        if (r.error) throw r.error;
        if (r.data === "not_found")
          throw new Error("Читатель с таким именем не найден");
        if (r.data === "self") throw new Error("Это ваш профиль");
        return r.data;
      });
    },
    async accept(id) {
      return action(async () => {
        const r = await db.rpc("accept_friend_request", { p_requester: id });
        if (r.error) throw r.error;
      });
    },
    async remove(id) {
      return action(async () => {
        const r = await db
          .from("friendships")
          .delete()
          .or(
            `and(requester.eq.${user.id},addressee.eq.${id}),and(requester.eq.${id},addressee.eq.${user.id})`,
          );
        if (r.error) throw r.error;
      });
    },
    async invite(clubId, friendId) {
      return action(async () => {
        const r = await db.from("bm_invitations").insert({
          club_id: clubId,
          sender_id: user.id,
          recipient_id: friendId,
        });
        if (r.error) throw r.error;
      });
    },
    async respond(id, accept, name) {
      return action(async () => {
        const r = await db.rpc("bm_respond_club_invite", {
          p_invitation: id,
          p_accept: accept,
          p_display_name: name,
        });
        if (r.error) throw r.error;
        return r.data;
      });
    },
  };
}
function Person({ person, children }) {
  return (
    <div className="social-person">
      <span className="avatar">
        {(person.display_name || person.username || "Ч")[0]}
      </span>
      <div>
        <b>{person.display_name || person.username || "Читатель"}</b>
        <small>
          {person.username ? "@" + person.username : "Профиль читателя"}
        </small>
      </div>
      <div className="social-actions">{children}</div>
    </div>
  );
}
export function Community({
  community: c,
  clubs,
  name,
  onOpen,
  onRespond,
  onAuth,
  account = false,
  onSignOut,
}) {
  const [username, setUsername] = useState(""),
    [displayName, setDisplayName] = useState(name),
    [search, setSearch] = useState(""),
    [results, setResults] = useState([]),
    [searching, setSearching] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    setUsername(c.profile?.username || "");
    setDisplayName(c.profile?.display_name || name);
  }, [c.profile?.user_id, c.profile?.username, c.profile?.display_name, name]);
  useEffect(() => {
    let live = true;
    const q = search
      .trim()
      .replace(/^@/, "")
      .toLowerCase()
      .replace(/[^a-z0-9_.]/g, "");
    setResults([]);
    if (q.length < 2 || !c.user) {
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      const r = await c.db
        .from("profiles")
        .select("user_id,username,display_name")
        .like("username", q + "%")
        .neq("user_id", c.user.id)
        .limit(12);
      if (live) {
        setResults(r.data || []);
        setSearching(false);
        if (r.error) c.setError(r.error.message);
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [search, c.user?.id]);
  if (!c.user)
    return (
      <section className="social-page">
        <p className="eyebrow">ВАШ КНИЖНЫЙ КРУГ</p>
        <h1>
          Вместе
          <br />
          <em>интереснее.</em>
        </h1>
        <div className="panel empty">
          <Users size={32} />
          <h2>Друзья и приглашения</h2>
          <p>
            Войдите, чтобы найти друзей, принимать приглашения и собирать свой
            клуб.
          </p>
          <button className="primary" onClick={onAuth}>
            Войти <ArrowRight size={16} />
          </button>
        </div>
      </section>
    );
  const inbox = c.invites.filter((i) => i.recipient_id === c.user.id);
  async function save(e) {
    e.preventDefault();
    const normalized = username.trim().replace(/^@/, "").toLowerCase();
    if (!/^[a-z0-9_][a-z0-9_.]{1,22}[a-z0-9_]$/.test(normalized)) {
      c.setError(
        "Имя: 3–24 символа, латиница, цифры, точка и подчёркивание. Точка не может быть по краям.",
      );
      return;
    }
    const result = await c.action(async () => {
      const r = await c.db.from("profiles").upsert({
        user_id: c.user.id,
        username: normalized,
        display_name: displayName.trim(),
        updated_at: new Date().toISOString(),
      });
      if (r.error) throw r.error;
    });
    if (result.ok)
      setMessage("Профиль сохранён. Друзья найдут вас по @" + normalized);
  }
  return (
    <section className="social-page">
      <div className="social-heading">
        <div>
          <p className="eyebrow">
            {account ? "ВАШ АККАУНТ" : "ХОРОШИЕ КНИГИ СБЛИЖАЮТ"}
          </p>
          <h1>
            {account ? (
              "Ваш профиль."
            ) : (
              <>
                Ваши <em>люди.</em>
              </>
            )}
          </h1>
        </div>
        <button
          className="glass-icon"
          aria-label="Обновить друзей и приглашения"
          disabled={c.busy}
          onClick={() => c.action(() => Promise.resolve())}
        >
          <RefreshCw size={20} />
        </button>
      </div>
      {c.error && (
        <div role="alert" className="error">
          {c.error}
          <button
            className="icon"
            aria-label="Закрыть"
            onClick={() => c.setError("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {message && (
        <p role="status" className="success-note">
          {message}
        </p>
      )}
      {(account || !c.profile?.username) && (
        <div className="panel profile-panel">
          <h2>Как вас найти</h2>
          <p>
            Профиль и друзья общие с Encore и Winenote. Email остаётся
            приватным.
          </p>
          <form onSubmit={save}>
            <label>
              Имя в клубе
              <input
                required
                maxLength={80}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="nickname"
              />
            </label>
            <label>
              Уникальное имя пользователя
              <input
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={25}
                placeholder="@your_name"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </label>
            <button className="primary" disabled={c.busy}>
              Сохранить профиль
            </button>
          </form>
          {account && (
            <button className="text-btn signout" onClick={onSignOut}>
              Выйти из аккаунта
            </button>
          )}
        </div>
      )}
      {!account && (
        <>
          <div className="panel">
            <div className="social-section-title">
              <h2>Приглашения в клубы</h2>
              <span className="count">{inbox.length}</span>
            </div>
            {inbox.length ? (
              inbox.map((i) => {
                const club = clubs.find((club) => club.id === i.club_id);
                return (
                  <article className="invitation-card" key={i.id}>
                    <span className="invite-book">
                      <BookOpen size={22} />
                    </span>
                    <div>
                      <span className="eyebrow">
                        {club?.visibility === "closed" ? (
                          <>
                            <LockKeyhole size={11} /> ЗАКРЫТЫЙ КЛУБ
                          </>
                        ) : (
                          "ПРИГЛАШЕНИЕ"
                        )}
                      </span>
                      <h3>{club?.name || "Книжный клуб"}</h3>
                      <p>
                        {club?.book} {club?.author && "· " + club.author}
                      </p>
                      <div className="actions">
                        <button
                          className="primary"
                          disabled={c.busy}
                          onClick={() => onRespond(i, true)}
                        >
                          Присоединиться
                        </button>
                        <button
                          className="secondary"
                          disabled={c.busy}
                          onClick={() => onRespond(i, false)}
                        >
                          Отклонить
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })
            ) : (
              <p className="social-empty">
                Когда друг пригласит вас читать, приглашение появится здесь.
              </p>
            )}
          </div>
          {c.incoming.length > 0 && (
            <div className="panel">
              <h2>Хотят подружиться</h2>
              {c.incoming.map((p) => (
                <Person key={p.user_id} person={p}>
                  <button
                    className="primary small-btn"
                    disabled={c.busy}
                    onClick={() => c.accept(p.user_id)}
                  >
                    <Check size={16} />
                    Принять
                  </button>
                  <button
                    className="glass-icon"
                    aria-label="Отклонить заявку"
                    disabled={c.busy}
                    onClick={() => c.remove(p.user_id)}
                  >
                    <X size={16} />
                  </button>
                </Person>
              ))}
            </div>
          )}
          <div className="panel">
            <h2>Найти читателя</h2>
            <p>Попросите друга поделиться именем @username.</p>
            <label className="social-search">
              <UserPlus size={20} />
              <input
                aria-label="Поиск по имени пользователя"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="@имя_друга"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </label>
            {searching && <p className="social-empty">Ищем читателей…</p>}
            {results.map((p) => {
              const linked = c.relations.find(
                (r) => r.requester === p.user_id || r.addressee === p.user_id,
              );
              return (
                <Person key={p.user_id} person={p}>
                  {linked ? (
                    <small>
                      {linked.status === "accepted"
                        ? "Уже друзья"
                        : linked.addressee === c.user.id
                          ? "Входящая заявка"
                          : "Заявка отправлена"}
                    </small>
                  ) : (
                    <button
                      className="primary small-btn"
                      disabled={c.busy}
                      onClick={() => c.request(p.username)}
                    >
                      <PlusIcon />
                      Добавить
                    </button>
                  )}
                </Person>
              );
            })}
            {search.trim().length >= 2 && !searching && !results.length && (
              <p className="social-empty">
                Читателей с таким именем пока не нашли.
              </p>
            )}
          </div>
          <div className="panel">
            <div className="social-section-title">
              <h2>Друзья</h2>
              <span className="count">{c.friends.length}</span>
            </div>
            {c.friends.length ? (
              c.friends.map((p) => (
                <Person key={p.user_id} person={p}>
                  <button
                    className="text-btn"
                    disabled={c.busy}
                    onClick={() => c.remove(p.user_id)}
                  >
                    Удалить
                  </button>
                </Person>
              ))
            ) : (
              <p className="social-empty">
                Найдите друга по имени выше — и читайте вместе.
              </p>
            )}
          </div>
          {c.outgoing.length > 0 && (
            <div className="panel">
              <h2>Отправленные заявки</h2>
              {c.outgoing.map((p) => (
                <Person key={p.user_id} person={p}>
                  <button
                    className="text-btn"
                    disabled={c.busy}
                    onClick={() => c.remove(p.user_id)}
                  >
                    Отменить
                  </button>
                </Person>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
function PlusIcon() {
  return <UserPlus size={15} />;
}
export function InviteFriends({ community: c, club, members, onFriends }) {
  const sent = c.invites.filter(
    (i) => i.club_id === club.id && i.sender_id === c.user?.id,
  );
  return (
    <div className="invite-friends">
      <p>
        Друг получит приглашение во вкладке «Друзья». Ссылку отправлять не
        нужно.
      </p>
      {c.error && (
        <div role="alert" className="error">
          {c.error}
        </div>
      )}
      {c.friends.length ? (
        c.friends.map((p) => {
          const joined = members.some(
            (m) => m.club_id === club.id && m.user_id === p.user_id,
          );
          const invite = sent.find((i) => i.recipient_id === p.user_id);
          return (
            <Person key={p.user_id} person={p}>
              {joined ? (
                <small>Уже в клубе</small>
              ) : invite ? (
                <button
                  className="text-btn"
                  disabled={c.busy}
                  onClick={() =>
                    c.action(async () => {
                      const r = await c.db
                        .from("bm_invitations")
                        .delete()
                        .eq("id", invite.id);
                      if (r.error) throw r.error;
                    })
                  }
                >
                  Отозвать
                </button>
              ) : (
                <button
                  className="primary small-btn"
                  disabled={c.busy}
                  onClick={() => c.invite(club.id, p.user_id)}
                >
                  Пригласить
                </button>
              )}
            </Person>
          );
        })
      ) : (
        <div className="empty">
          <Users size={28} />
          <p>Сначала добавьте друга в свой круг.</p>
          <button className="primary" onClick={onFriends}>
            Найти друзей
          </button>
        </div>
      )}
    </div>
  );
}
