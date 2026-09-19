// =====================================
// IFL - APP PRINCIPAL (datos reales vía Supabase)
// Requiere que js/ifl-db.js se haya cargado antes.
// =====================================

const ADMIN_DISCORD_ID = "1149380955316957266";
const CURRENT_SEASON = 1; // Ajusta si cambias de temporada activa

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
  }

  // =================================
  // SESIÓN
  // =================================

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
          chip.textContent =
            m.status === "jugado"
              ? `${homeCode} ${m.home_goals}-${m.away_goals} ${awayCode}`
              : `${homeCode} vs ${awayCode}`;
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
    const stadium = match.stadium;
    const dateText = match.scheduled_at
      ? new Date(match.scheduled_at).toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" })
      : "Fecha por confirmar";

    box.innerHTML = `
      <button type="button" class="ifl-modal__close" id="match-modal-close">&times;</button>
      <div class="badge badge--season">Jornada ${match.matchday}</div>
      <h2 class="ifl-modal__title">${home} vs ${away}</h2>
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
      body += `
        <tr>
          <td class="standings__pos">${i + 1}</td>
          <td class="standings__club">${r.team.name}</td>
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
});
