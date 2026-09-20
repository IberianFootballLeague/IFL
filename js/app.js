// =====================================
// IFL - APP PRINCIPAL (datos reales vía Supabase)
// Requiere que js/ifl-db.js se haya cargado antes.
// =====================================

const ADMIN_DISCORD_ID = "1149380955316957266";
let CURRENT_SEASON = 1; // se sobreescribe con el valor real de la base de datos al cargar

document.addEventListener("DOMContentLoaded", async () => {
  const db = window.IFLDB;

  const loginPage = document.getElementById("login-page");
  const appPage = document.getElementById("app");
  const discordButton = document.getElementById("discord-login");

  if (!loginPage || !appPage || !discordButton || !db) {
    console.error("[IFL] Faltan elementos principales o js/ifl-db.js no se cargó.");
    return;
  }

  const discordLabel = discordButton.querySelector(".btn-discord__label");
  const logoutButton = document.getElementById("logout-button");
  const userInfo = document.getElementById("user-info");
  const userAvatar = document.getElementById("user-avatar");
  const userAvatarFallback = document.getElementById("user-avatar-fallback");

  let currentDiscordId = null;

  function setDiscordLabel(text) {
    if (discordLabel) discordLabel.textContent = text;
    else discordButton.textContent = text;
  }

  function showLogin() {
    loginPage.style.display = "flex";
    appPage.style.display = "none";
  }

  // =================================
  // DISCORD ID
  // =================================

  function addCandidate(list, value) {
    if (value === undefined || value === null) return;
    const s = String(value).trim();
    if (s && !list.includes(s)) list.push(s);
  }

  function getDiscordIdCandidates(user) {
    const candidates = [];
    if (!user) return candidates;
    const metadata = user.user_metadata || {};
    const appMetadata = user.app_metadata || {};
    const identities = Array.isArray(user.identities) ? user.identities : [];

    addCandidate(candidates, user.discord_id);
    addCandidate(candidates, user.discord_user_id);
    addCandidate(candidates, user.provider_id);
    addCandidate(candidates, metadata.discord_id);
    addCandidate(candidates, metadata.discord_user_id);
    addCandidate(candidates, metadata.provider_id);
    addCandidate(candidates, metadata.sub);
    addCandidate(candidates, appMetadata.discord_id);
    addCandidate(candidates, appMetadata.discord_user_id);
    addCandidate(candidates, appMetadata.provider_id);

    identities.forEach((identity) => {
      if (!identity) return;
      addCandidate(candidates, identity.provider_id);
      const d = identity.identity_data || {};
      addCandidate(candidates, d.id);
      addCandidate(candidates, d.user_id);
      addCandidate(candidates, d.discord_id);
      addCandidate(candidates, d.discord_user_id);
      addCandidate(candidates, d.provider_id);
      addCandidate(candidates, d.sub);
    });

    return candidates;
  }

  function primaryDiscordId(user) {
    const candidates = getDiscordIdCandidates(user);
    return candidates.length ? candidates[0] : null;
  }

  function isAdminUser(user) {
    return getDiscordIdCandidates(user).includes(ADMIN_DISCORD_ID);
  }

  function ensureAdminPanelLink(user) {
    const profileMenu = document.getElementById("profile-menu");
    if (!profileMenu) return;
    const existing = document.getElementById("admin-panel-menu-link");
    if (!isAdminUser(user)) {
      if (existing) existing.remove();
      return;
    }
    if (existing) return;

    const link = document.createElement("a");
    link.id = "admin-panel-menu-link";
    link.href = "admin.html";
    link.className = "profile-menu__item";
    link.textContent = "Admin Panel";

    const logoutItem = profileMenu.querySelector(".profile-menu__item--danger");
    if (logoutItem) profileMenu.insertBefore(link, logoutItem);
    else profileMenu.appendChild(link);
  }

  function ensureTutorialLink() {
    const profileMenu = document.getElementById("profile-menu");
    if (!profileMenu) return;
    if (document.getElementById("tutorial-menu-link")) return;

    const link = document.createElement("button");
    link.id = "tutorial-menu-link";
    link.type = "button";
    link.className = "profile-menu__item";
    link.textContent = "Ver tutorial";
    link.addEventListener("click", () => {
      if (window.IFLOnboarding) window.IFLOnboarding.open();
    });

    const sep = profileMenu.querySelector(".profile-menu__sep");
    if (sep) profileMenu.insertBefore(link, sep);
    else profileMenu.appendChild(link);
  }

  // =================================
  // MOSTRAR APP
  // =================================

  async function showApp(user) {
    loginPage.style.display = "none";
    appPage.style.display = "block";

    currentDiscordId = primaryDiscordId(user);

    const discordName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.user_metadata?.preferred_username ||
      user.user_metadata?.custom_claims?.global_name ||
      "Usuario de Discord";

    if (userInfo) userInfo.textContent = "Sesión iniciada como " + discordName;

    const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture;
    if (avatarUrl && userAvatar) {
      userAvatar.src = avatarUrl;
      userAvatar.alt = discordName;
      userAvatar.hidden = false;
      if (userAvatarFallback) userAvatarFallback.hidden = true;
      userAvatar.onerror = () => {
        userAvatar.hidden = true;
        if (userAvatarFallback) {
          userAvatarFallback.textContent = discordName.charAt(0).toUpperCase();
          userAvatarFallback.hidden = false;
        }
      };
    } else if (userAvatarFallback) {
      userAvatarFallback.textContent = discordName.charAt(0).toUpperCase();
      userAvatarFallback.hidden = false;
      if (userAvatar) userAvatar.hidden = true;
    }

    ensureAdminPanelLink(user);
    ensureTutorialLink();

    if (window.IFLOnboarding) window.IFLOnboarding.maybeAutoOpen();

    renderCareerLockState();
    setupNotifications();
    setupProfileControls();
    setupOnlinePresence();
    renderHero();
  }

  // =================================
  // SESIÓN
  // =================================

  try {
    CURRENT_SEASON = await db.getSetting("current_season", 1);
  } catch (e) {
    console.warn("[IFL] No se pudo leer la temporada activa, usando 1 por defecto.", e);
  }

  const {
    data: { session },
    error: sessionError,
  } = await db.client.auth.getSession();

  if (sessionError) {
    console.error("[IFL] Error comprobando la sesión:", sessionError);
    showLogin();
  } else if (session) {
    await showApp(session.user);
  } else {
    showLogin();
  }

  discordButton.addEventListener("click", async () => {
    discordButton.disabled = true;
    setDiscordLabel("Conectando...");

    const { error } = await db.client.auth.signInWithOAuth({
      provider: "discord",
      options: { redirectTo: window.location.origin + window.location.pathname },
    });

    if (error) {
      console.error("[IFL] Error iniciando sesión con Discord:", error);
      alert("No se pudo iniciar sesión con Discord.\n\n" + error.message);
      discordButton.disabled = false;
      setDiscordLabel("Iniciar sesión con Discord");
    }
  });

  db.client.auth.onAuthStateChange((event, session) => {
    if (session) showApp(session.user);
    else showLogin();
  });

  if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
      const { error } = await db.client.auth.signOut();
      if (error) {
        console.error("[IFL] Error cerrando sesión:", error);
        return;
      }
      showLogin();
    });
  }

  // =================================
  // NAVEGACIÓN
  // =================================

  const navLinks = document.querySelectorAll(".app-header__link");
  const views = document.querySelectorAll(".view");

  function showView(name) {
    views.forEach((section) => {
      section.hidden = section.dataset.viewPanel !== name;
    });
    navLinks.forEach((link) => {
      link.classList.toggle("is-active", link.dataset.view === name);
    });

    if (name === "calendario") renderCalendar();
    if (name === "clasificacion") renderStandings();
    if (name === "estadios") renderStadiums();
    if (name === "carrera") renderCareer();
    if (name === "premios") renderPremios();
  }

  navLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      showView(link.dataset.view);
    });
  });

  // =================================
  // CALENDARIO (real, con partidos y estadios)
  // =================================

  const calGrid = document.getElementById("calendar-grid");
  const calLabel = document.getElementById("cal-label");
  const calPrev = document.getElementById("cal-prev");
  const calNext = document.getElementById("cal-next");

  const monthNames = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];

  let calDate = new Date();
  calDate.setDate(1);
  let cachedMatches = [];
  let cachedStadiums = [];

  async function renderCalendar() {
    if (!calGrid) return;
    calGrid.innerHTML = "";

    try {
      cachedMatches = await db.getMatches(CURRENT_SEASON);
    } catch (e) {
      console.error("[IFL] Error cargando partidos:", e);
      cachedMatches = [];
    }

    const year = calDate.getFullYear();
    const month = calDate.getMonth();
    if (calLabel) calLabel.textContent = monthNames[month] + " " + year;

    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let startWeekday = firstDay.getDay() - 1;
    if (startWeekday < 0) startWeekday = 6;
    const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;

    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

    const matchesByDay = {};
    cachedMatches.forEach((m) => {
      if (!m.scheduled_at) return;
      const d = new Date(m.scheduled_at);
      if (d.getFullYear() !== year || d.getMonth() !== month) return;
      const day = d.getDate();
      (matchesByDay[day] = matchesByDay[day] || []).push(m);
    });

    for (let i = 0; i < totalCells; i++) {
      const dayNumber = i - startWeekday + 1;
      const cell = document.createElement("div");
      cell.className = "calendar-cell";

      if (dayNumber < 1 || dayNumber > daysInMonth) {
        cell.classList.add("calendar-cell--empty");
      } else {
        if (isCurrentMonth && dayNumber === today.getDate()) {
          cell.classList.add("calendar-cell--today");
        }

        const num = document.createElement("span");
        num.className = "calendar-cell__num";
        num.textContent = dayNumber;

        const slot = document.createElement("div");
        slot.className = "calendar-cell__slot";

        (matchesByDay[dayNumber] || []).forEach((m) => {
          const chip = document.createElement("button");
          chip.type = "button";
          chip.className = "match-chip";
          const homeCode = m.home_team ? m.home_team.code : "?";
          const awayCode = m.away_team ? m.away_team.code : "?";
          const homeCrest = m.home_team && m.home_team.logo_url ? `<img src="${m.home_team.logo_url}" alt="" class="match-chip__crest">` : "";
          const awayCrest = m.away_team && m.away_team.logo_url ? `<img src="${m.away_team.logo_url}" alt="" class="match-chip__crest">` : "";
          const scoreText =
            m.status === "jugado" ? `${m.home_goals}-${m.away_goals}` : "vs";
          chip.innerHTML = `${homeCrest}<span>${homeCode} ${scoreText} ${awayCode}</span>${awayCrest}`;
          chip.addEventListener("click", () => openMatchModal(m));
          slot.appendChild(chip);
        });

        cell.appendChild(num);
        cell.appendChild(slot);
      }

      calGrid.appendChild(cell);
    }
  }

  if (calPrev) calPrev.addEventListener("click", () => { calDate.setMonth(calDate.getMonth() - 1); renderCalendar(); });
  if (calNext) calNext.addEventListener("click", () => { calDate.setMonth(calDate.getMonth() + 1); renderCalendar(); });

  // Modal de partido: detalle + enlace al estadio
  function openMatchModal(match) {
    let modal = document.getElementById("match-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "match-modal";
      modal.className = "ifl-modal";
      modal.innerHTML = '<div class="ifl-modal__overlay"></div><div class="ifl-modal__box" id="match-modal-box"></div>';
      document.body.appendChild(modal);
      modal.querySelector(".ifl-modal__overlay").addEventListener("click", () => (modal.hidden = true));
    }

    const box = document.getElementById("match-modal-box");
    const home = match.home_team ? match.home_team.name : "Por confirmar";
    const away = match.away_team ? match.away_team.name : "Por confirmar";
    const homeCrest = match.home_team && match.home_team.logo_url ? `<img src="${match.home_team.logo_url}" alt="" class="ifl-modal__crest">` : "";
    const awayCrest = match.away_team && match.away_team.logo_url ? `<img src="${match.away_team.logo_url}" alt="" class="ifl-modal__crest">` : "";
    const stadium = match.stadium;
    const dateText = match.scheduled_at
      ? new Date(match.scheduled_at).toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" })
      : "Fecha por confirmar";

    box.innerHTML = `
      <button type="button" class="ifl-modal__close" id="match-modal-close">&times;</button>
      <div class="badge badge--season">Jornada ${match.matchday}</div>
      <h2 class="ifl-modal__title">${homeCrest}${home} vs ${away}${awayCrest}</h2>
      <p class="ifl-modal__meta">${dateText}</p>
      ${
        match.status === "jugado"
          ? `<p class="ifl-modal__score">${match.home_goals} - ${match.away_goals}</p>`
          : `<p class="ifl-modal__meta">Partido pendiente de jugarse</p>`
      }
      ${
        stadium
          ? `<button type="button" class="btn-ghost" id="match-modal-stadium-btn">Ver estadio: ${stadium.name}</button>`
          : `<p class="ifl-modal__meta">Estadio por confirmar</p>`
      }
    `;

    modal.hidden = false;
    document.getElementById("match-modal-close").addEventListener("click", () => (modal.hidden = true));

    const stadiumBtn = document.getElementById("match-modal-stadium-btn");
    if (stadiumBtn && stadium) {
      stadiumBtn.addEventListener("click", () => {
        modal.hidden = true;
        showView("estadios");
        navLinks.forEach((l) => l.classList.toggle("is-active", l.dataset.view === "estadios"));
        setTimeout(() => openStadiumModal(stadium), 150);
      });
    }
  }

  // =================================
  // CLASIFICACIÓN (calculada de verdad)
  // =================================

  function formChips(form) {
    if (!form || !form.length) return '<span class="is-muted">—</span>';
    return form.map((r) => {
      const cls = r === "W" ? "form-chip--w" : r === "L" ? "form-chip--l" : "form-chip--d";
      return `<span class="form-chip ${cls}">${r}</span>`;
    }).join("");
  }

  function buildStandingsTable(tableEl, rows) {
    if (!tableEl) return;
    let body = "";
    rows.forEach((r, i) => {
      const crest = r.team.logo_url ? `<img src="${r.team.logo_url}" alt="" class="team-crest team-crest--small">` : "";
      const diff = r.gf - r.gc;
      body += `
        <tr>
          <td class="standings__pos">${i + 1}</td>
          <td class="standings__club">${crest}${r.team.name}</td>
          <td class="is-num">${r.pj}</td>
          <td class="is-num">${diff > 0 ? "+" : ""}${diff}</td>
          <td class="is-num" style="font-weight:800;">${r.pts}</td>
          <td class="form-cell">${formChips(r.form)}</td>
        </tr>
      `;
    });
    tableEl.innerHTML = `
      <thead>
        <tr><th>#</th><th>Club</th><th>PJ</th><th>DG</th><th>Pts</th><th>Forma</th></tr>
      </thead>
      <tbody>${body || '<tr><td colspan="6" class="admin-table-empty">Aún no hay equipos en esta división.</td></tr>'}</tbody>
    `;
  }

  async function renderStandings() {
    try {
      const [primera, segunda] = await Promise.all([
        db.computeStandings(CURRENT_SEASON, "primera"),
        db.computeStandings(CURRENT_SEASON, "segunda"),
      ]);
      buildStandingsTable(document.getElementById("standings-primera"), primera);
      buildStandingsTable(document.getElementById("standings-segunda"), segunda);

      const setSubtitle = (id, rows) => {
        const el = document.getElementById(id);
        if (!el) return;
        const played = rows.reduce((sum, r) => sum + r.pj, 0) / 2;
        el.textContent = `${rows.length} equipos · ${played} partido${played === 1 ? "" : "s"} jugados`;
      };
      setSubtitle("primera-subtitle", primera);
      setSubtitle("segunda-subtitle", segunda);
    } catch (e) {
      console.error("[IFL] Error calculando clasificación:", e);
    }
  }

  // =================================
  // ESTADIOS
  // =================================

  const estadiosView = document.getElementById("view-estadios");

  async function renderStadiums() {
    if (!estadiosView) return;
    let list = estadiosView.querySelector("#stadiums-list");
    if (!list) {
      list = document.createElement("div");
      list.id = "stadiums-list";
      list.className = "stadiums-grid";
      estadiosView.appendChild(list);
    }

    try {
      cachedStadiums = await db.getStadiums();
    } catch (e) {
      console.error("[IFL] Error cargando estadios:", e);
      cachedStadiums = [];
    }

    list.innerHTML = "";
    if (!cachedStadiums.length) {
      list.innerHTML = '<p class="dashboard__placeholder">Todavía no hay estadios registrados.</p>';
      return;
    }

    cachedStadiums.forEach((s) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "stadium-card";
      card.innerHTML = `
        <div class="stadium-card__name">${s.name}</div>
        <div class="stadium-card__meta">${s.team ? s.team.name : "Sin equipo asignado"}</div>
        <div class="stadium-card__meta">${s.city || ""}${s.capacity ? " · " + s.capacity.toLocaleString("es-ES") + " asientos" : ""}</div>
      `;
      card.addEventListener("click", () => openStadiumModal(s));
      list.appendChild(card);
    });
  }

  function openStadiumModal(stadium) {
    let modal = document.getElementById("stadium-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "stadium-modal";
      modal.className = "ifl-modal";
      modal.innerHTML = '<div class="ifl-modal__overlay"></div><div class="ifl-modal__box" id="stadium-modal-box"></div>';
      document.body.appendChild(modal);
      modal.querySelector(".ifl-modal__overlay").addEventListener("click", () => (modal.hidden = true));
    }

    const box = document.getElementById("stadium-modal-box");
    box.innerHTML = `
      <button type="button" class="ifl-modal__close" id="stadium-modal-close">&times;</button>
      <h2 class="ifl-modal__title">${stadium.name}</h2>
      <p class="ifl-modal__meta">${stadium.team ? "Estadio de " + stadium.team.name : "Sin equipo asignado"}</p>
      <p class="ifl-modal__meta">${stadium.city || ""}${stadium.capacity ? " · " + stadium.capacity.toLocaleString("es-ES") + " asientos" : ""}</p>
      ${stadium.description ? `<p class="view-lead">${stadium.description}</p>` : ""}
    `;
    modal.hidden = false;
    document.getElementById("stadium-modal-close").addEventListener("click", () => (modal.hidden = true));
  }

  // =================================
  // MI CARRERA
  // =================================

  function renderCareerLockState() {
    // Se comprueba de forma perezosa al entrar en la vista (renderCareer),
    // esto solo deja preparado el contenedor.
  }

  async function renderCareer() {
    const section = document.getElementById("view-carrera");
    if (!section || !currentDiscordId) return;

    let career = null;
    try {
      career = await db.getPlayerCareer(currentDiscordId);
    } catch (e) {
      console.error("[IFL] Error cargando la carrera del jugador:", e);
    }

    if (!career) {
      section.innerHTML = `
        <h2 class="dashboard__title">Mi carrera</h2>
        <div class="locked-card">
          <span class="locked-card__icon" aria-hidden="true">🔒</span>
          <p class="locked-card__text">
            Necesitas un contrato activo o haber tenido una trayectoria en algún
            equipo de la IFL para poder ver tu carrera.
          </p>
        </div>
      `;
      return;
    }

    const { stats, contracts } = career;

    const contractsHTML = contracts
      .map(
        (c) => `
        <div class="admin-row">
          <div class="admin-row__body">
            <div class="admin-row__name">${c.team ? c.team.name : "Club desconocido"}</div>
            <div class="admin-row__meta">Temporada ${c.signed_season} · ${c.status}</div>
          </div>
        </div>`
      )
      .join("");

    section.innerHTML = `
      <h2 class="dashboard__title">Mi carrera</h2>
      ${career.player.avatar_url ? `<img src="${career.player.avatar_url}" alt="" class="career-avatar">` : ""}
      <div class="stat-grid" style="margin-bottom:28px;">
        <div class="stat-tile"><span class="stat-tile__value">${stats.goles}</span><span class="stat-tile__label">Goles</span></div>
        <div class="stat-tile"><span class="stat-tile__value">${stats.asistencias}</span><span class="stat-tile__label">Asistencias</span></div>
        <div class="stat-tile"><span class="stat-tile__value">${stats.partidos_jugados}</span><span class="stat-tile__label">Partidos jugados</span></div>
        <div class="stat-tile"><span class="stat-tile__value">${stats.tarjetas_amarillas}</span><span class="stat-tile__label">Tarjetas amarillas</span></div>
        <div class="stat-tile"><span class="stat-tile__value">${stats.tarjetas_rojas}</span><span class="stat-tile__label">Tarjetas rojas</span></div>
        <div class="stat-tile"><span class="stat-tile__value">${stats.mvps}</span><span class="stat-tile__label">MVPs</span></div>
      </div>
      <h3 class="table-heading">Trayectoria</h3>
      <div class="admin-panel"><div class="admin-panel__body">${contractsHTML || '<div class="admin-panel__empty">Sin contratos todavía.</div>'}</div></div>
    `;
  }

  // =================================
  // PORTADA (hero de Inicio)
  // =================================

  async function renderHero() {
    const hero = document.getElementById("hub-hero");
    if (!hero) return;

    const badge = document.getElementById("hero-season-badge");
    if (badge) badge.textContent = "Iberian Football League · Temporada " + CURRENT_SEASON;

    let stadiums = [], teams = [], contracts = [], matches = [];
    try {
      [stadiums, teams, contracts, matches] = await Promise.all([
        db.getStadiums(),
        db.getTeams(),
        db.getContracts(),
        db.getMatches(CURRENT_SEASON),
      ]);
    } catch (e) {
      console.error("[IFL] Error cargando datos para la portada:", e);
    }

    const withImages = stadiums.filter((s) => s.image_url);
    if (withImages.length) {
      const pick = withImages[Math.floor(Math.random() * withImages.length)];
      hero.style.backgroundImage = `url("${pick.image_url}")`;
    }

    const playedMatches = matches.filter((m) => m.status === "jugado");
    const totalGoals = playedMatches.reduce((sum, m) => sum + (m.home_goals || 0) + (m.away_goals || 0), 0);
    const activePlayers = contracts.filter((c) => c.status === "ACTIVO").length;

    const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    set("hero-stat-teams", teams.length);
    set("hero-stat-players", activePlayers);
    set("hero-stat-matches", playedMatches.length);
    set("hero-stat-goals", totalGoals);
  }

  // =================================
  // PREMIOS (goleadores, asistentes, playoff)
  // =================================

  function leaderboardRows(entries, label) {
    if (!entries.length) return `<div class="admin-panel__empty">Todavía no hay datos.</div>`;
    return entries.map((e, i) => `
      <div class="admin-row">
        <span class="admin-row__dot admin-row__dot--up" style="width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;background:var(--accent);">${i + 1}</span>
        <div class="admin-row__body">
          <div class="admin-row__name">${e.player.roblox_username}</div>
          <div class="admin-row__meta">${e.team ? e.team.name : ""}</div>
        </div>
        <span class="admin-tag" style="background:rgba(88,101,242,.15);color:var(--accent);border:1px solid rgba(88,101,242,.35);">${e.count} ${label}</span>
      </div>
    `).join("");
  }

  async function renderPremios() {
    const section = document.getElementById("view-premios");
    if (!section) return;

    section.innerHTML = `<h2 class="dashboard__title">Premios</h2>`;

    let scorers = [], assists = [], playoffMatch = null;
    try {
      [scorers, assists, playoffMatch] = await Promise.all([
        db.getLeaderboard(CURRENT_SEASON, "gol", 10),
        db.getLeaderboard(CURRENT_SEASON, "asistencia", 10),
        db.getPlayoffMatch(CURRENT_SEASON),
      ]);
    } catch (e) {
      console.error("[IFL] Error cargando premios:", e);
    }

    const board = document.createElement("div");
    board.className = "admin-panels";
    board.style.gridTemplateColumns = "1fr 1fr";
    board.innerHTML = `
      <div class="admin-panel">
        <div class="admin-panel__head"><div class="admin-panel__head-title">Máximos goleadores</div></div>
        <div class="admin-panel__body">${leaderboardRows(scorers, "goles")}</div>
      </div>
      <div class="admin-panel">
        <div class="admin-panel__head"><div class="admin-panel__head-title">Máximos asistentes</div></div>
        <div class="admin-panel__body">${leaderboardRows(assists, "asist.")}</div>
      </div>
    `;
    section.appendChild(board);

    if (playoffMatch) {
      const home = playoffMatch.home_team;
      const away = playoffMatch.away_team;
      const bracket = document.createElement("div");
      bracket.style.marginTop = "28px";
      bracket.innerHTML = `
        <h3 class="table-heading">Playoff de ascenso (Segunda División)</h3>
        <div class="admin-panel" style="padding:24px;text-align:center;">
          <div style="display:flex;align-items:center;justify-content:center;gap:20px;flex-wrap:wrap;">
            <div style="text-align:center;">
              ${home?.logo_url ? `<img src="${home.logo_url}" class="ifl-modal__crest" style="width:48px;height:48px;">` : ""}
              <div style="font-family:var(--font-display);font-weight:700;margin-top:6px;">${home ? home.name : "?"}</div>
            </div>
            <div style="font-family:var(--font-display);font-weight:800;font-size:28px;">
              ${playoffMatch.status === "jugado" ? `${playoffMatch.home_goals} - ${playoffMatch.away_goals}` : "VS"}
            </div>
            <div style="text-align:center;">
              ${away?.logo_url ? `<img src="${away.logo_url}" class="ifl-modal__crest" style="width:48px;height:48px;">` : ""}
              <div style="font-family:var(--font-display);font-weight:700;margin-top:6px;">${away ? away.name : "?"}</div>
            </div>
          </div>
          <p class="ifl-modal__meta" style="margin-top:14px;">${playoffMatch.status === "jugado" ? "Playoff finalizado" : "Partido único · pendiente de jugarse"}</p>
        </div>
      `;
      section.appendChild(bracket);
    }
  }

  // =================================
  // NOTIFICACIONES
  // =================================

  const NOTIF_ICONS = { partido_programado: "📅", partido_resultado: "⚽" };

  function readSiteSettings() {
    try { return JSON.parse(localStorage.getItem("ifl-settings") || "{}"); } catch (e) { return {}; }
  }

  function timeAgo(iso) {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "ahora mismo";
    if (mins < 60) return `hace ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `hace ${hours} h`;
    const days = Math.floor(hours / 24);
    return `hace ${days} d`;
  }

  async function setupNotifications() {
    const accountBox = document.querySelector(".app-header__account");
    if (!accountBox || document.getElementById("notif-button")) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "notif-button";
    btn.className = "app-header__profile notif-bell";
    btn.title = "Notificaciones";
    btn.innerHTML = `
      <span class="notif-bell__icon">📬</span>
      <span id="notif-badge" class="notif-badge" hidden>0</span>
    `;

    const panel = document.createElement("div");
    panel.id = "notif-panel";
    panel.className = "notif-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <div class="notif-panel__head">📬 <span>Notificaciones</span></div>
      <div id="notif-list" class="notif-panel__list"></div>
    `;

    accountBox.insertBefore(btn, accountBox.firstChild);
    accountBox.appendChild(panel);

    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const willOpen = panel.hidden;
      panel.hidden = !panel.hidden;
      if (willOpen) {
        await loadNotifications();
        try { localStorage.setItem("ifl-notif-read-at", new Date().toISOString()); } catch (err) {}
        updateNotifBadge(0);
      }
    });

    document.addEventListener("click", (e) => {
      if (!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) panel.hidden = true;
    });

    await checkUnreadNotifications();
  }

  function updateNotifBadge(count) {
    const badge = document.getElementById("notif-badge");
    if (!badge) return;
    if (count > 0) {
      badge.hidden = false;
      badge.textContent = count > 9 ? "9+" : String(count);
    } else {
      badge.hidden = true;
    }
  }

  async function loadNotifications() {
    const list = document.getElementById("notif-list");
    if (!list) return;
    list.innerHTML = `<div class="notif-empty">Cargando…</div>`;

    let items = [];
    try { items = await db.getNotifications(20); } catch (e) { console.error(e); }

    if (!items.length) {
      list.innerHTML = `<div class="notif-empty">📭 Aún no hay notificaciones.</div>`;
      return;
    }

    list.innerHTML = items.map((n) => `
      <div class="notif-item">
        <span class="notif-item__icon">${NOTIF_ICONS[n.type] || "🔔"}</span>
        <div class="notif-item__body">
          <div class="notif-item__title">${n.title}</div>
          <div class="notif-item__meta">${n.body || ""} · ${timeAgo(n.created_at)}</div>
        </div>
      </div>
    `).join("");
  }

  async function checkUnreadNotifications() {
    const settings = readSiteSettings();
    if (settings.notifPartidos === false) return;

    let items = [];
    try { items = await db.getNotifications(20); } catch (e) { return; }
    if (!items.length) return;

    let lastRead = null;
    try { lastRead = localStorage.getItem("ifl-notif-read-at"); } catch (e) {}

    const unreadCount = lastRead
      ? items.filter((n) => new Date(n.created_at) > new Date(lastRead)).length
      : items.length;

    updateNotifBadge(unreadCount);
  }

  // =================================
  // PERSONAS CONECTADAS AHORA MISMO
  // =================================

  function setupOnlinePresence() {
    const key = currentDiscordId || ("anon-" + Math.random().toString(36).slice(2));
    db.trackOnlinePresence(key, (count) => {
      const el = document.getElementById("online-now-count");
      if (el) el.textContent = count;
    });
  }

  // =================================
  // MI PERFIL: foto y visibilidad reales
  // =================================

  async function setupProfileControls() {
    const avatarInput = document.getElementById("settings-avatar-upload");
    const visibilityToggle = document.getElementById("setting-public-profile");
    const visibilityNote = document.getElementById("profile-visibility-note");

    let myPlayer = null;
    try { myPlayer = await db.getPlayerByDiscordId(currentDiscordId); } catch (e) { console.error(e); }

    if (!myPlayer) {
      if (visibilityNote) {
        visibilityNote.hidden = false;
        visibilityNote.textContent = "Todavía no tienes ficha de jugador (hace falta un contrato para tenerla), así que esta opción no aplica aún.";
      }
      if (visibilityToggle) visibilityToggle.disabled = true;
      if (avatarInput) avatarInput.disabled = true;
      return;
    }

    if (visibilityToggle) {
      visibilityToggle.disabled = false;
      visibilityToggle.checked = myPlayer.is_public !== false;
      visibilityToggle.addEventListener("change", async () => {
        try {
          await db.updatePlayerVisibility(myPlayer.id, visibilityToggle.checked);
        } catch (e) {
          console.error(e);
          alert("No se pudo guardar el cambio de visibilidad.");
        }
      });
    }

    if (avatarInput) {
      avatarInput.disabled = false;
      avatarInput.addEventListener("change", async () => {
        const file = avatarInput.files && avatarInput.files[0];
        if (!file) return;

        const statusEl = document.getElementById("avatar-upload-status");
        if (statusEl) { statusEl.hidden = false; statusEl.textContent = "Comprobando la imagen…"; }

        try {
          const dataUrl = await readImageAsSafeDataURL(file, (msg) => {
            if (statusEl) statusEl.textContent = msg;
          });
          await db.updateMyAvatar(currentDiscordId, dataUrl);

          const headerAvatar = document.getElementById("user-avatar");
          const headerFallback = document.getElementById("user-avatar-fallback");
          if (headerAvatar) { headerAvatar.src = dataUrl; headerAvatar.hidden = false; }
          if (headerFallback) headerFallback.hidden = true;

          if (statusEl) { statusEl.textContent = "Foto actualizada ✅"; setTimeout(() => (statusEl.hidden = true), 2500); }
        } catch (e) {
          console.error(e);
          if (statusEl) statusEl.textContent = "❌ " + (e.message || "No se pudo subir la imagen.");
          avatarInput.value = "";
        }
      });
    }
  }

  const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB
  const NSFW_THRESHOLD = 0.7;
  let nsfwModelPromise = null;

  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("No se pudo cargar " + src));
      document.head.appendChild(s);
    });
  }

  async function getNsfwModel() {
    if (nsfwModelPromise) return nsfwModelPromise;
    nsfwModelPromise = (async () => {
      await loadScriptOnce("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.15.0/dist/tf.min.js");
      await loadScriptOnce("https://cdn.jsdelivr.net/npm/nsfwjs@2.4.2/dist/nsfwjs.min.js");
      return window.nsfwjs.load();
    })();
    return nsfwModelPromise;
  }

  // Valida que sea una imagen real, de tamaño razonable, y pasa un
  // control automático de contenido (mejor esfuerzo: si el modelo no
  // carga por lo que sea, se deja subir igualmente para no bloquear
  // al usuario, pero se avisa por consola).
  function readImageAsSafeDataURL(file, onProgress) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith("image/")) {
        reject(new Error("El archivo tiene que ser una imagen."));
        return;
      }
      if (file.size > MAX_AVATAR_BYTES) {
        reject(new Error("La imagen pesa demasiado (máximo 2 MB)."));
        return;
      }

      const reader = new FileReader();
      reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
      reader.onload = async () => {
        const dataUrl = reader.result;
        const img = new Image();
        img.onerror = () => reject(new Error("El archivo no es una imagen válida."));
        img.onload = async () => {
          try {
            onProgress && onProgress("Pasando el control de seguridad…");
            const model = await getNsfwModel();
            const predictions = await model.classify(img);
            const risky = predictions.find(
              (p) => ["Porn", "Hentai", "Sexy"].includes(p.className) && p.probability > NSFW_THRESHOLD
            );
            if (risky) {
              reject(new Error("Esta imagen no ha pasado el control de seguridad. Prueba con otra foto."));
              return;
            }
          } catch (e) {
            console.warn("[IFL] No se pudo ejecutar el control automático de imagen, se deja pasar igualmente:", e);
          }
          resolve(dataUrl);
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
  }

  // =================================
  // BUSCADOR PÚBLICO DE JUGADORES
  // =================================

  const playerSearchInput = document.getElementById("player-search-input");
  const playerSearchResults = document.getElementById("player-search-results");
  const playerProfileBox = document.getElementById("player-profile-box");

  if (playerSearchInput) {
    let debounceTimer = null;
    playerSearchInput.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      const q = playerSearchInput.value.trim();
      if (!q) { playerSearchResults.innerHTML = ""; return; }
      debounceTimer = setTimeout(async () => {
        let results = [];
        try { results = await db.searchPlayers(q); } catch (e) { console.error(e); }
        playerSearchResults.innerHTML = results.map((p) => `
          <div class="admin-row" style="cursor:pointer;" data-player-id="${p.id}">
            <div class="admin-row__body">
              <div class="admin-row__name">${p.roblox_username}</div>
              <div class="admin-row__meta">${p.discord_username}</div>
            </div>
          </div>
        `).join("") || '<div class="admin-panel__empty">Sin resultados.</div>';
      }, 250);
    });

    playerSearchResults.addEventListener("click", async (e) => {
      const row = e.target.closest("[data-player-id]");
      if (!row) return;
      await showPlayerProfile(row.getAttribute("data-player-id"));
    });
  }

  async function showPlayerProfile(playerId) {
    if (!playerProfileBox) return;
    playerProfileBox.innerHTML = `<div class="admin-panel__empty">Cargando…</div>`;

    let profile = null;
    try { profile = await db.getPlayerPublicProfile(playerId); } catch (e) { console.error(e); }
    if (!profile) { playerProfileBox.innerHTML = `<div class="admin-panel__empty">No se encontró ese jugador.</div>`; return; }

    const { player, isPublic, stats, contracts } = profile;
    const avatarHTML = player.avatar_url
      ? `<img src="${player.avatar_url}" class="career-avatar" alt="">`
      : `<div class="career-avatar" style="display:flex;align-items:center;justify-content:center;background:var(--accent);font-family:var(--font-display);font-weight:700;font-size:32px;">${player.roblox_username.charAt(0).toUpperCase()}</div>`;

    if (!isPublic) {
      playerProfileBox.innerHTML = `
        <div class="locked-card">
          ${avatarHTML}
          <h3 style="margin:6px 0 0;color:var(--white);">${player.roblox_username}</h3>
          <p class="locked-card__text">Este usuario tiene desactivada la visualización del perfil.</p>
        </div>
      `;
      return;
    }

    const currentClub = contracts.find((c) => c.status === "ACTIVO");

    playerProfileBox.innerHTML = `
      <div class="locked-card" style="align-items:center;">
        ${avatarHTML}
        <h3 style="margin:6px 0 0;color:var(--white);">${player.roblox_username}</h3>
        <p class="ifl-modal__meta">${currentClub ? "Actualmente en " + currentClub.team.name : "Sin club actualmente"}</p>
      </div>
      <div class="stat-grid" style="margin-top:20px;">
        <div class="stat-tile"><span class="stat-tile__value">${stats.goles}</span><span class="stat-tile__label">Goles</span></div>
        <div class="stat-tile"><span class="stat-tile__value">${stats.asistencias}</span><span class="stat-tile__label">Asistencias</span></div>
        <div class="stat-tile"><span class="stat-tile__value">${stats.partidos_jugados}</span><span class="stat-tile__label">Partidos jugados</span></div>
        <div class="stat-tile"><span class="stat-tile__value">${stats.tarjetas_amarillas}</span><span class="stat-tile__label">Tarjetas amarillas</span></div>
        <div class="stat-tile"><span class="stat-tile__value">${stats.tarjetas_rojas}</span><span class="stat-tile__label">Tarjetas rojas</span></div>
        <div class="stat-tile"><span class="stat-tile__value">${stats.mvps}</span><span class="stat-tile__label">MVPs</span></div>
      </div>
    `;
  }
});
