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

  function buildStandingsTable(tableEl, rows) {
    if (!tableEl) return;
    let body = "";
    rows.forEach((r, i) => {
      const crest = r.team.logo_url ? `<img src="${r.team.logo_url}" alt="" class="team-crest team-crest--small">` : "";
      body += `
        <tr>
          <td class="standings__pos">${i + 1}</td>
          <td class="standings__club">${crest}${r.team.name}</td>
          <td>${r.pts}</td>
          <td>${r.pg}</td>
          <td>${r.pp}</td>
          <td>${r.pe}</td>
          <td>${r.gf}</td>
          <td>${r.gc}</td>
        </tr>
      `;
    });
    tableEl.innerHTML = `
      <thead>
        <tr><th>Pos</th><th>Club</th><th>Pts</th><th>G</th><th>P</th><th>E</th><th>GF</th><th>GC</th></tr>
      </thead>
      <tbody>${body || '<tr><td colspan="8" class="admin-table-empty">Aún no hay equipos en esta división.</td></tr>'}</tbody>
    `;
  }

  async function renderStandings() {
    try {
      const primera = await db.computeStandings(CURRENT_SEASON, "primera");
      const segunda = await db.computeStandings(CURRENT_SEASON, "segunda");
      buildStandingsTable(document.getElementById("standings-primera"), primera);
      buildStandingsTable(document.getElementById("standings-segunda"), segunda);
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

  function readSiteSettings() {
    try { return JSON.parse(localStorage.getItem("ifl-settings") || "{}"); } catch (e) { return {}; }
  }

  async function setupNotifications() {
    const accountBox = document.querySelector(".app-header__account");
    if (!accountBox || document.getElementById("notif-button")) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "notif-button";
    btn.className = "app-header__profile";
    btn.style.marginRight = "-6px";
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.7 21a2 2 0 0 1-3.4 0" stroke-linecap="round"/></svg>
      <span id="notif-dot" style="display:none;width:7px;height:7px;border-radius:50%;background:var(--down);margin-left:-4px;"></span>
    `;

    const panel = document.createElement("div");
    panel.id = "notif-panel";
    panel.className = "profile-menu";
    panel.hidden = true;
    panel.innerHTML = `<div class="profile-menu__head"><span class="profile-menu__name">Notificaciones</span></div><div id="notif-list" style="max-height:340px;overflow-y:auto;"></div>`;

    accountBox.insertBefore(btn, accountBox.firstChild);
    accountBox.style.position = "relative";
    accountBox.appendChild(panel);

    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const willOpen = panel.hidden;
      panel.hidden = !panel.hidden;
      if (willOpen) {
        await loadNotifications();
        try { localStorage.setItem("ifl-notif-read-at", new Date().toISOString()); } catch (err) {}
        const dot = document.getElementById("notif-dot");
        if (dot) dot.style.display = "none";
      }
    });

    document.addEventListener("click", (e) => {
      if (!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) panel.hidden = true;
    });

    await checkUnreadNotifications();
  }

  async function loadNotifications() {
    const list = document.getElementById("notif-list");
    if (!list) return;
    let items = [];
    try { items = await db.getNotifications(20); } catch (e) { console.error(e); }

    if (!items.length) {
      list.innerHTML = '<div class="admin-panel__empty">Sin notificaciones todavía.</div>';
      return;
    }

    list.innerHTML = items.map((n) => `
      <div class="profile-menu__item" style="cursor:default;flex-direction:column;align-items:flex-start;gap:2px;">
        <strong style="color:var(--white);">${n.title}</strong>
        <span style="font-size:12px;color:var(--gray-3);">${n.body || ""}</span>
      </div>
    `).join("");
  }

  async function checkUnreadNotifications() {
    const settings = readSiteSettings();
    if (settings.notifPartidos === false) return;

    let items = [];
    try { items = await db.getNotifications(5); } catch (e) { return; }
    if (!items.length) return;

    let lastRead = null;
    try { lastRead = localStorage.getItem("ifl-notif-read-at"); } catch (e) {}

    const hasUnread = !lastRead || new Date(items[0].created_at) > new Date(lastRead);
    const dot = document.getElementById("notif-dot");
    if (dot) dot.style.display = hasUnread ? "inline-block" : "none";
  }
});
