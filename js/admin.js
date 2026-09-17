/* =====================================
   IFL — PANEL DE ADMINISTRACIÓN
   Datos de ejemplo (no hay tablas de clubes/
   jugadores en Supabase todavía). En cuanto
   existan, sustituir CLUBS por una consulta real.
===================================== */

(function () {
  "use strict";

  const CLUBS = [
    { code: "P1", name: "Club P1", division: "primera", players: 24, status: "up", updated: "4 m" },
    { code: "P2", name: "Club P2", division: "primera", players: 22, status: "up", updated: "1 h" },
    { code: "P3", name: "Club P3", division: "primera", players: 25, status: "up", updated: "1 h" },
    { code: "P4", name: "Club P4", division: "primera", players: 21, status: "up", updated: "1 h" },
    { code: "P5", name: "Club P5", division: "primera", players: 23, status: "pending", manager: false },
    { code: "P6", name: "Club P6", division: "primera", players: 20, status: "pending", manager: false },
    { code: "P7", name: "Club P7", division: "primera", players: 24, status: "up", updated: "2 h" },
    { code: "P8", name: "Club P8", division: "primera", players: 22, status: "pending", manager: true },
    { code: "S1", name: "Club S1", division: "segunda", players: 24, status: "up", updated: "3 h" },
    { code: "S2", name: "Club S2", division: "segunda", players: 23, status: "up", updated: "3 h" },
    { code: "S3", name: "Club S3", division: "segunda", players: 25, status: "pending", manager: false },
    { code: "S4", name: "Club S4", division: "segunda", players: 24, status: "pending", manager: false },
    { code: "S5", name: "Club S5", division: "segunda", players: 21, status: "pending", manager: true },
    { code: "S6", name: "Club S6", division: "segunda", players: 26, status: "up", updated: "5 h" },
    { code: "S7", name: "Club S7", division: "segunda", players: 22, status: "pending", manager: false },
    { code: "S8", name: "Club S8", division: "segunda", players: 23, status: "pending", manager: true },
  ];

  /* ---------------------------------
     1. LISTA LATERAL DE CLUBES
  --------------------------------- */

  const clubsEl = document.getElementById("admin-clubs");

  const renderSideClubs = function (filterDivision, filterStatus, query) {
    clubsEl.innerHTML = "";

    ["primera", "segunda"].forEach(function (division) {
      if (filterDivision !== "todos" && filterDivision !== division) return;

      const items = CLUBS.filter(function (c) {
        if (c.division !== division) return false;
        if (filterStatus !== "cualquiera" && c.status !== (filterStatus === "actualizado" ? "up" : "pending")) return false;
        if (query && c.name.toLowerCase().indexOf(query) === -1) return false;
        return true;
      });

      if (!items.length) return;

      const group = document.createElement("div");
      group.className = "admin-clubs__group";
      group.innerHTML =
        "<span>" + (division === "primera" ? "Primera división" : "Segunda división") + "</span><span>" + items.length + "</span>";
      clubsEl.appendChild(group);

      items.forEach(function (c) {
        const row = document.createElement("div");
        row.className = "admin-club-row";
        row.innerHTML =
          '<span class="admin-club-row__bar admin-club-row__bar--' + (c.status === "up" ? "up" : "pending") + '"></span>' +
          '<div style="min-width:0;">' +
            '<div class="admin-club-row__name">' + c.name + "</div>" +
            '<div class="admin-club-row__meta">' + c.code + " · " + c.players + " jugadores</div>" +
          "</div>";
        clubsEl.appendChild(row);
      });
    });
  };

  /* ---------------------------------
     2. PANELES DE RESUMEN
  --------------------------------- */

  const updatedList = document.getElementById("admin-updated-list");
  const attentionList = document.getElementById("admin-attention-list");
  const attentionCount = document.getElementById("admin-attention-count");
  const pendingGrid = document.getElementById("admin-pending-grid");
  const pendingCount = document.getElementById("admin-pending-count");

  const updatedClubs = CLUBS.filter(function (c) { return c.status === "up"; });
  const noManagerClubs = CLUBS.filter(function (c) { return c.status === "pending" && c.manager === false; });
  const pendingClubs = CLUBS.filter(function (c) { return c.status === "pending"; });

  updatedClubs.forEach(function (c) {
    const row = document.createElement("div");
    row.className = "admin-row";
    row.innerHTML =
      '<div class="admin-row__body">' +
        '<div class="admin-row__name">' + c.name + "</div>" +
        '<div class="admin-row__meta">' + c.code + "</div>" +
      "</div>" +
      '<span class="admin-row__time">hace ' + c.updated + "</span>" +
      '<span class="admin-mini-toggle" aria-hidden="true"></span>';
    updatedList.appendChild(row);
  });

  noManagerClubs.forEach(function (c) {
    const row = document.createElement("div");
    row.className = "admin-row";
    row.innerHTML =
      '<span class="admin-row__dot admin-row__dot--warn"></span>' +
      '<div class="admin-row__body">' +
        '<div class="admin-row__name">' + c.name + "</div>" +
        '<div class="admin-row__meta">' + c.code + "</div>" +
      "</div>" +
      '<span class="admin-tag admin-tag--down">Sin entrenador</span>';
    attentionList.appendChild(row);
  });

  attentionCount.textContent = noManagerClubs.length;

  pendingClubs.forEach(function (c) {
    const card = document.createElement("div");
    card.className = "admin-card";
    card.innerHTML =
      '<span class="admin-card__badge">' + c.code + "</span>" +
      '<div class="admin-card__body">' +
        '<div class="admin-card__name">' + c.name + "</div>" +
        '<div class="admin-card__meta">' + c.code + " · " + c.players + " jugadores</div>" +
      "</div>" +
      '<span class="admin-card__tag">Pendiente</span>';
    pendingGrid.appendChild(card);
  });

  pendingCount.textContent = pendingClubs.length;

  /* ---------------------------------
     3. FILTROS Y BÚSQUEDA
  --------------------------------- */

  let activeDivision = "todos";
  let activeStatus = "cualquiera";

  const wireChips = function (containerId, attr, onChange) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.addEventListener("click", function (e) {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      container.querySelectorAll(".chip").forEach(function (c) {
        c.classList.toggle("is-active", c === chip);
      });
      onChange(chip.dataset[attr]);
    });
  };

  wireChips("division-chips", "division", function (value) {
    activeDivision = value;
    renderSideClubs(activeDivision, activeStatus, searchInput.value.trim().toLowerCase());
  });

  wireChips("status-chips", "status", function (value) {
    activeStatus = value;
    renderSideClubs(activeDivision, activeStatus, searchInput.value.trim().toLowerCase());
  });

  const searchInput = document.getElementById("admin-search");
  searchInput.addEventListener("input", function () {
    renderSideClubs(activeDivision, activeStatus, searchInput.value.trim().toLowerCase());
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && document.activeElement !== searchInput) {
      e.preventDefault();
      searchInput.focus();
    }
  });

  renderSideClubs(activeDivision, activeStatus, "");

  /* ---------------------------------
     4. SESIÓN (mismo Supabase que la app)
  --------------------------------- */

  const SUPABASE_URL = "https://boazhychmpxeuplyxzsi.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_C_iRhldD-coePRVqcNDCGA_oGIA1u3d";

  if (window.supabase) {
    const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

    const nameEl = document.getElementById("admin-name");
    const avatarEl = document.getElementById("admin-avatar");
    const fallbackEl = document.getElementById("admin-avatar-fallback");
    const signoutBtn = document.getElementById("admin-signout");

    const paintUser = function (user) {
      const discordName =
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.user_metadata?.preferred_username ||
        "Administrador";

      nameEl.textContent = discordName;

      const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture;

      if (avatarUrl) {
        avatarEl.src = avatarUrl;
        avatarEl.alt = discordName;
        avatarEl.hidden = false;
        fallbackEl.hidden = true;
        avatarEl.onerror = function () {
          avatarEl.hidden = true;
          fallbackEl.hidden = false;
        };
      } else {
        fallbackEl.textContent = discordName.charAt(0).toUpperCase();
        fallbackEl.hidden = false;
        avatarEl.hidden = true;
      }
    };

    supabaseClient.auth.getSession().then(function (res) {
      const session = res.data && res.data.session;
      if (session) {
        paintUser(session.user);
      } else {
        // Sin sesión: mandamos de vuelta al login de la app.
        window.location.href = "index.html";
      }
    });

    signoutBtn.addEventListener("click", function () {
      supabaseClient.auth.signOut().then(function () {
        window.location.href = "index.html";
      });
    });
  }
})();
