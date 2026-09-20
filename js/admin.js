/* =====================================
   IFL — PANEL DE ADMINISTRACIÓN (Supabase real)
   Requiere js/ifl-db.js cargado antes de este archivo.
===================================== */

(function () {
  "use strict";

  const db = window.IFLDB;
  const ADMIN_DISCORD_ID = "1149380955316957266";
  const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos de inactividad → cierre de sesión automático

  const CURRENT_SEASON_FALLBACK = 1;

  // =====================================
  // ESTADO EN MEMORIA (se recarga de Supabase)
  // =====================================

  const state = {
    teams: [],
    stadiums: [],
    contracts: [],
    matches: [],
    admins: [],
    season: CURRENT_SEASON_FALLBACK,
    isSuperAdmin: false,
    currentDiscordId: null,
    currentDiscordName: null,
  };

  // =====================================
  // UTILIDADES
  // =====================================

  function escapeHTML(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function formatDate(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch (e) {
      return "—";
    }
  }

  function formatDateTime(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
    } catch (e) {
      return "—";
    }
  }

  function divisionLabel(div) {
    if (div === "primera") return "Primera";
    if (div === "segunda") return "Segunda";
    return "Sin asignar";
  }

  function toast(message, isError) {
    let el = document.getElementById("admin-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "admin-toast";
      el.className = "admin-toast";
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.toggle("admin-toast--error", !!isError);
    el.classList.add("is-visible");
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove("is-visible"), 3200);
  }

  const MAX_LOGO_BYTES = 300 * 1024; // ~300 KB, para no disparar el tamaño de la base de datos

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      if (!file) { resolve(null); return; }
      if (file.size > MAX_LOGO_BYTES) {
        reject(new Error("La imagen pesa demasiado. Usa un archivo de menos de 300 KB (recomendado: PNG cuadrado, 256×256)."));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
      reader.readAsDataURL(file);
    });
  }

  async function withBusy(button, fn) {
    const original = button ? button.textContent : null;
    if (button) { button.disabled = true; button.textContent = "Guardando…"; }
    try {
      await fn();
    } catch (e) {
      console.error("[IFL Admin]", e);
      toast("Error: " + (e.message || "algo ha fallado"), true);
    } finally {
      if (button) { button.disabled = false; button.textContent = original; }
    }
  }

  // =====================================
  // ELEMENTOS
  // =====================================

  const clubsEl = document.getElementById("admin-clubs");
  const searchInput = document.getElementById("admin-search");
  const topSearchInput = document.getElementById("admin-top-search");
  const updatedList = document.getElementById("admin-updated-list");
  const attentionList = document.getElementById("admin-attention-list");
  const attentionCount = document.getElementById("admin-attention-count");
  const pendingGrid = document.getElementById("admin-pending-grid");
  const pendingCount = document.getElementById("admin-pending-count");
  const updatedPct = document.getElementById("admin-updated-pct");
  const seasonLabelEl = document.getElementById("admin-season-label");
  const seasonBadgeEl = document.getElementById("contracts-season-badge");

  let activeDivision = "todos";
  let activeStatus = "cualquiera";

  // =====================================
  // CARGA DE DATOS
  // =====================================

  async function reloadAll() {
    const [teams, stadiums, contracts, matches, season] = await Promise.all([
      db.getTeams(),
      db.getStadiums(),
      db.getContracts(),
      db.getMatches(null),
      db.getSetting("current_season", CURRENT_SEASON_FALLBACK).catch(() => CURRENT_SEASON_FALLBACK),
    ]);
    state.teams = teams;
    state.stadiums = stadiums;
    state.contracts = contracts;
    state.matches = matches;
    state.season = season;

    if (state.isSuperAdmin) {
      try { state.admins = await db.getAdmins(); } catch (e) { state.admins = []; }
    }
  }

  function teamPlayerCount(teamId) {
    return state.contracts.filter((c) => c.team_id === teamId && c.status === "ACTIVO").length;
  }

  function teamHasStatus(team) {
    // "Actualizado" = tiene al menos un contrato activo, "Pendiente" = sin plantilla
    return teamPlayerCount(team.id) > 0 ? "up" : "pending";
  }

  // =====================================
  // SIDEBAR: CLUBES
  // =====================================

  function renderSideClubs(filterDivision, filterStatus, query) {
    if (!clubsEl) return;
    clubsEl.innerHTML = "";

    const groups = [
      { key: "primera", label: "Primera división" },
      { key: "segunda", label: "Segunda división" },
      { key: "null", label: "Sin asignar" },
    ];

    groups.forEach((g) => {
      if (filterDivision !== "todos" && filterDivision !== g.key) return;

      const items = state.teams.filter((t) => {
        const div = t.division || "null";
        if (div !== g.key) return false;
        const status = teamHasStatus(t);
        if (filterStatus !== "cualquiera" && status !== (filterStatus === "actualizado" ? "up" : "pending")) return false;
        if (query && t.name.toLowerCase().indexOf(query) === -1) return false;
        return true;
      });

      if (!items.length) return;

      const group = document.createElement("div");
      group.className = "admin-clubs__group";
      group.innerHTML = `<span>${g.label}</span><span>${items.length}</span>`;
      clubsEl.appendChild(group);

      items.forEach((t) => {
        const status = teamHasStatus(t);
        const row = document.createElement("div");
        row.className = "admin-club-row";
        row.innerHTML = `
          <span class="admin-club-row__bar admin-club-row__bar--${status === "up" ? "up" : "pending"}"></span>
          <div style="min-width:0;">
            <div class="admin-club-row__name">${escapeHTML(t.name)}</div>
            <div class="admin-club-row__meta">${escapeHTML(t.code)} · ${teamPlayerCount(t.id)} jugadores</div>
          </div>
        `;
        clubsEl.appendChild(row);
      });
    });

    if (!clubsEl.children.length) {
      clubsEl.innerHTML = '<div class="admin-panel__empty">Sin resultados.</div>';
    }
  }

  function wireChips(containerId, attr, onChange) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      container.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", c === chip));
      onChange(chip.dataset[attr]);
    });
  }

  wireChips("division-chips", "division", (value) => {
    activeDivision = value;
    renderSideClubs(activeDivision, activeStatus, (searchInput?.value || "").trim().toLowerCase());
  });

  wireChips("status-chips", "status", (value) => {
    activeStatus = value;
    renderSideClubs(activeDivision, activeStatus, (searchInput?.value || "").trim().toLowerCase());
  });

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      renderSideClubs(activeDivision, activeStatus, searchInput.value.trim().toLowerCase());
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== searchInput) {
      e.preventDefault();
      if (searchInput) searchInput.focus();
    }
  });

  // Buscador superior: jugadores/contratos por nombre de Discord o Roblox
  if (topSearchInput) {
    topSearchInput.disabled = false;
    topSearchInput.placeholder = "Buscar jugador (Discord o Roblox)…";
    let resultsBox = null;

    function closeResults() {
      if (resultsBox) resultsBox.remove();
      resultsBox = null;
    }

    topSearchInput.addEventListener("input", () => {
      const q = topSearchInput.value.trim().toLowerCase();
      closeResults();
      if (!q) return;

      const matches = state.contracts.filter((c) => {
        const p = c.player;
        if (!p) return false;
        return (p.roblox_username || "").toLowerCase().includes(q) || (p.discord_username || "").toLowerCase().includes(q);
      }).slice(0, 8);

      resultsBox = document.createElement("div");
      resultsBox.className = "admin-search-results";
      if (!matches.length) {
        resultsBox.innerHTML = '<div class="admin-panel__empty">Sin resultados.</div>';
      } else {
        matches.forEach((c) => {
          const row = document.createElement("div");
          row.className = "admin-row";
          row.style.cursor = "pointer";
          row.innerHTML = `
            <div class="admin-row__body">
              <div class="admin-row__name">${escapeHTML(c.player.roblox_username)}</div>
              <div class="admin-row__meta">${escapeHTML(c.player.discord_username)} · ${c.team ? escapeHTML(c.team.name) : "Sin club"}</div>
            </div>
          `;
          row.addEventListener("click", () => {
            showAdminView("contracts");
            closeResults();
            topSearchInput.value = "";
          });
          resultsBox.appendChild(row);
        });
      }
      topSearchInput.parentElement.appendChild(resultsBox);
    });

    document.addEventListener("click", (e) => {
      if (resultsBox && !topSearchInput.parentElement.contains(e.target)) closeResults();
    });
  }

  // =====================================
  // OVERVIEW
  // =====================================

  function renderOverview() {
    const teams = state.teams;
    const updatedTeams = teams.filter((t) => teamHasStatus(t) === "up");
    const pendingTeams = teams.filter((t) => teamHasStatus(t) === "pending");
    const totalPlayers = state.contracts.filter((c) => c.status === "ACTIVO").length;
    const activeContracts = state.contracts.filter((c) => c.status === "ACTIVO");

    const subtitle = document.getElementById("admin-overview-subtitle");
    if (subtitle) {
      subtitle.textContent = `Temporada ${state.season} · ${teams.length} clubes · ${state.contracts.length} contratos registrados`;
    }

    const seasonInput = document.getElementById("season-edit-input");
    if (seasonInput && document.activeElement !== seasonInput) seasonInput.value = state.season;

    const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };

    set("stat-teamsheets-current", updatedTeams.length);
    set("stat-teamsheets-total", "/" + teams.length);
    const pct = teams.length ? Math.round((updatedTeams.length / teams.length) * 100) : 0;
    const bar = document.getElementById("stat-teamsheets-bar");
    if (bar) bar.style.width = pct + "%";
    if (updatedPct) updatedPct.textContent = pct + "% done";
    set("stat-players", totalPlayers);
    set("stat-players-foot", totalPlayers + " jugadores con contrato activo");
    set("stat-squads", teams.length);
    set("stat-contracts-active", activeContracts.length);
    set("stat-contracts-foot", (state.contracts.length - activeContracts.length) + " inactivos");

    if (updatedList) {
      updatedList.innerHTML = updatedTeams.map((t) => `
        <div class="admin-row">
          <div class="admin-row__body">
            <div class="admin-row__name">${escapeHTML(t.name)}</div>
            <div class="admin-row__meta">${escapeHTML(t.code)}</div>
          </div>
        </div>
      `).join("") || '<div class="admin-panel__empty">Nada actualizado todavía.</div>';
    }

    if (attentionList) {
      attentionList.innerHTML = pendingTeams.map((t) => `
        <div class="admin-row">
          <span class="admin-row__dot admin-row__dot--warn"></span>
          <div class="admin-row__body">
            <div class="admin-row__name">${escapeHTML(t.name)}</div>
            <div class="admin-row__meta">${escapeHTML(t.code)}</div>
          </div>
          <span class="admin-tag admin-tag--down">Sin plantilla</span>
        </div>
      `).join("") || '<div class="admin-panel__empty">Todo en orden.</div>';
    }

    if (attentionCount) attentionCount.textContent = pendingTeams.length;

    if (pendingGrid) {
      pendingGrid.innerHTML = pendingTeams.map((t) => `
        <div class="admin-card">
          <span class="admin-card__badge">${escapeHTML(t.code)}</span>
          <div class="admin-card__body">
            <div class="admin-card__name">${escapeHTML(t.name)}</div>
            <div class="admin-card__meta">${escapeHTML(t.code)} · ${teamPlayerCount(t.id)} jugadores</div>
          </div>
          <span class="admin-card__tag">Pendiente</span>
        </div>
      `).join("");
    }

    if (pendingCount) pendingCount.textContent = pendingTeams.length;
  }

  const seasonEditInput = document.getElementById("season-edit-input");
  const seasonEditSave = document.getElementById("season-edit-save");
  const exportDataBtn = document.getElementById("export-data-btn");

  if (seasonEditSave) {
    seasonEditSave.addEventListener("click", () => {
      const value = parseInt(seasonEditInput.value, 10);
      if (!value || value < 1) { alert("Introduce un número de temporada válido."); return; }
      withBusy(seasonEditSave, async () => {
        await db.setSetting("current_season", value);
        state.season = value;
        await reloadAll();
        renderAll();
        toast("Temporada actualizada.");
      });
    });
  }

  function csvEscape(value) {
    const s = String(value == null ? "" : value);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function downloadCSV(filename, rows) {
    const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (exportDataBtn) {
    exportDataBtn.addEventListener("click", () => {
      const teamsRows = [["Código", "Nombre", "División", "Jugadores"]].concat(
        state.teams.map((t) => [t.code, t.name, divisionLabel(t.division), teamPlayerCount(t.id)])
      );
      const contractsRows = [["Discord", "Roblox", "Club", "Precio", "Temporada firmado", "Temporadas restantes", "Estado"]].concat(
        state.contracts.map((c) => [
          c.player?.discord_username || "", c.player?.roblox_username || "", c.team?.name || "",
          c.price, c.signed_season, c.seasons_left, c.status,
        ])
      );
      const matchesRows = [["Jornada", "Local", "Visitante", "Estadio", "Fecha", "Estado", "Goles local", "Goles visitante", "Playoff"]].concat(
        state.matches.map((m) => [
          m.matchday, m.home_team?.name || "", m.away_team?.name || "", m.stadium?.name || "",
          formatDateTime(m.scheduled_at), m.status, m.home_goals ?? "", m.away_goals ?? "", m.is_playoff ? "Sí" : "No",
        ])
      );

      downloadCSV("ifl_equipos.csv", teamsRows);
      setTimeout(() => downloadCSV("ifl_contratos.csv", contractsRows), 300);
      setTimeout(() => downloadCSV("ifl_partidos.csv", matchesRows), 600);
      toast("Exportando 3 archivos CSV…");
    });
  }

  // =====================================
  // EQUIPOS (con edición inline + Guardar)
  // =====================================

  const teamForm = document.getElementById("team-form");
  const teamsTableBody = document.getElementById("teams-table-body");
  let editingTeamId = null;

  function renderTeamsView() {
    if (!teamsTableBody) return;
    const subtitle = document.getElementById("admin-teams-subtitle");
    if (subtitle) subtitle.textContent = state.teams.length + " clubes en total";

    if (!state.teams.length) {
      teamsTableBody.innerHTML = '<tr><td colspan="5" class="admin-table-empty">Todavía no hay equipos.</td></tr>';
      return;
    }

    teamsTableBody.innerHTML = state.teams.map((t) => {
      const crest = t.logo_url
        ? `<img src="${t.logo_url}" alt="" class="team-crest">`
        : `<span class="team-crest team-crest--empty"></span>`;

      if (editingTeamId === t.id) {
        return `
          <tr data-team-row="${t.id}">
            <td>${crest}<input class="admin-input" data-edit="logo" type="file" accept="image/*" style="margin-top:6px;max-width:160px;"></td>
            <td><input class="admin-input" data-edit="name" value="${escapeHTML(t.name)}"></td>
            <td><input class="admin-input" data-edit="code" maxlength="4" value="${escapeHTML(t.code)}"></td>
            <td>
              <select class="admin-select" data-edit="division">
                <option value="" ${!t.division ? "selected" : ""}>Sin asignar</option>
                <option value="primera" ${t.division === "primera" ? "selected" : ""}>Primera</option>
                <option value="segunda" ${t.division === "segunda" ? "selected" : ""}>Segunda</option>
              </select>
            </td>
            <td>${teamPlayerCount(t.id)}</td>
            <td class="admin-table__actions">
              <button type="button" class="btn-admin btn-admin--small btn-admin--solid" data-save-team="${t.id}">Guardar</button>
              <button type="button" class="btn-admin btn-admin--small" data-cancel-edit-team="${t.id}">Cancelar</button>
            </td>
          </tr>
        `;
      }
      return `
        <tr>
          <td>${crest}</td>
          <td class="standings__club">${escapeHTML(t.name)}</td>
          <td>${escapeHTML(t.code)}</td>
          <td>${divisionLabel(t.division)}</td>
          <td class="is-num">${teamPlayerCount(t.id)}</td>
          <td class="admin-table__actions">
            <button type="button" class="btn-admin btn-admin--small" data-edit-team="${t.id}">Editar</button>
            <button type="button" class="btn-admin btn-admin--small btn-admin--danger" data-delete-team="${t.id}">Eliminar</button>
          </td>
        </tr>
      `;
    }).join("");
  }

  if (teamForm) {
    teamForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = document.getElementById("team-name")?.value.trim();
      const code = document.getElementById("team-code")?.value.trim().toUpperCase();
      const division = document.getElementById("team-division")?.value || null;
      const submitBtn = teamForm.querySelector('button[type="submit"]');

      if (!name || !code) return;
      if (state.teams.some((t) => t.code === code)) {
        alert(`Ya existe un equipo con el código "${code}". Usa otro código.`);
        return;
      }

      withBusy(submitBtn, async () => {
        const fileInput = document.getElementById("team-logo");
        const file = fileInput && fileInput.files && fileInput.files[0];
        const logoUrl = await readFileAsDataURL(file);

        await db.addTeam({ code, name, division, logo_url: logoUrl });
        teamForm.reset();
        await reloadAll();
        renderAll();
        toast("Equipo añadido.");
      });
    });
  }

  if (teamsTableBody) {
    teamsTableBody.addEventListener("click", (e) => {
      const editBtn = e.target.closest("[data-edit-team]");
      if (editBtn) {
        editingTeamId = editBtn.getAttribute("data-edit-team");
        renderTeamsView();
        return;
      }

      const cancelBtn = e.target.closest("[data-cancel-edit-team]");
      if (cancelBtn) {
        editingTeamId = null;
        renderTeamsView();
        return;
      }

      const saveBtn = e.target.closest("[data-save-team]");
      if (saveBtn) {
        const id = saveBtn.getAttribute("data-save-team");
        const row = document.querySelector(`[data-team-row="${id}"]`);
        const patch = {
          name: row.querySelector('[data-edit="name"]').value.trim(),
          code: row.querySelector('[data-edit="code"]').value.trim().toUpperCase(),
          division: row.querySelector('[data-edit="division"]').value || null,
        };
        withBusy(saveBtn, async () => {
          const logoInput = row.querySelector('[data-edit="logo"]');
          const file = logoInput && logoInput.files && logoInput.files[0];
          if (file) {
            patch.logo_url = await readFileAsDataURL(file);
          }
          await db.updateTeam(id, patch);
          editingTeamId = null;
          await reloadAll();
          renderAll();
          toast("Cambios guardados.");
        });
        return;
      }

      const deleteBtn = e.target.closest("[data-delete-team]");
      if (deleteBtn) {
        const id = deleteBtn.getAttribute("data-delete-team");
        if (!confirm("¿Eliminar este equipo? También se eliminarán sus contratos y partidos asociados si los tuviera.")) return;
        withBusy(deleteBtn, async () => {
          await db.deleteTeam(id);
          await reloadAll();
          renderAll();
          toast("Equipo eliminado.");
        });
      }
    });
  }

  // =====================================
  // ESTADIOS
  // =====================================

  const stadiumForm = document.getElementById("stadium-form");
  const stadiumsTableBody = document.getElementById("stadiums-table-body");
  const stadiumTeamSelect = document.getElementById("stadium-team");

  function populateStadiumTeamSelect() {
    if (!stadiumTeamSelect) return;
    const current = stadiumTeamSelect.value;
    stadiumTeamSelect.innerHTML = '<option value="">— Sin equipo —</option>' +
      state.teams.map((t) => `<option value="${t.id}">${escapeHTML(t.name)}</option>`).join("");
    stadiumTeamSelect.value = current;
  }

  function renderStadiumsView() {
    if (!stadiumsTableBody) return;
    populateStadiumTeamSelect();

    if (!state.stadiums.length) {
      stadiumsTableBody.innerHTML = '<tr><td colspan="5" class="admin-table-empty">Todavía no hay estadios.</td></tr>';
      return;
    }

    stadiumsTableBody.innerHTML = state.stadiums.map((s) => `
      <tr>
        <td>${s.image_url ? `<img src="${s.image_url}" alt="" class="team-crest" style="width:40px;height:26px;border-radius:4px;object-fit:cover;">` : `<span class="team-crest team-crest--empty" style="width:40px;height:26px;"></span>`}</td>
        <td class="standings__club">${escapeHTML(s.name)}</td>
        <td>${s.team ? escapeHTML(s.team.name) : "—"}</td>
        <td>${escapeHTML(s.city || "—")}</td>
        <td class="is-num">${s.capacity || "—"}</td>
        <td class="admin-table__actions">
          <button type="button" class="btn-admin btn-admin--small btn-admin--danger" data-delete-stadium="${s.id}">Eliminar</button>
        </td>
      </tr>
    `).join("");
  }

  if (stadiumForm) {
    stadiumForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = document.getElementById("stadium-name")?.value.trim();
      const teamId = stadiumTeamSelect?.value || null;
      const city = document.getElementById("stadium-city")?.value.trim() || null;
      const capacity = parseInt(document.getElementById("stadium-capacity")?.value, 10) || null;
      const description = document.getElementById("stadium-description")?.value.trim() || null;
      const submitBtn = stadiumForm.querySelector('button[type="submit"]');

      if (!name) return;

      withBusy(submitBtn, async () => {
        const fileInput = document.getElementById("stadium-image");
        const file = fileInput && fileInput.files && fileInput.files[0];
        const imageUrl = await readFileAsDataURL(file);

        await db.addStadium({ name, team_id: teamId, city, capacity, description, image_url: imageUrl });
        stadiumForm.reset();
        await reloadAll();
        renderAll();
        toast("Estadio añadido.");
      });
    });
  }

  if (stadiumsTableBody) {
    stadiumsTableBody.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-delete-stadium]");
      if (!btn) return;
      if (!confirm("¿Eliminar este estadio?")) return;
      withBusy(btn, async () => {
        await db.deleteStadium(btn.getAttribute("data-delete-stadium"));
        await reloadAll();
        renderAll();
        toast("Estadio eliminado.");
      });
    });
  }

  // =====================================
  // CONTRATOS (con buscador de jugador por Roblox)
  // =====================================

  const contractForm = document.getElementById("contract-form");
  const contractClubSelect = document.getElementById("contract-club");
  const contractsTableBody = document.getElementById("contracts-table-body");
  const advanceSeasonBtn = document.getElementById("advance-season-btn");
  const contractRobloxInput = document.getElementById("contract-roblox");
  const contractDiscordUserInput = document.getElementById("contract-discord");
  const contractDiscordIdInput = document.getElementById("contract-discord-id");

  let selectedPlayer = null; // jugador existente elegido desde el buscador

  function populateContractClubSelect() {
    if (!contractClubSelect) return;
    const current = contractClubSelect.value;
    contractClubSelect.innerHTML = '<option value="" disabled>— Selecciona club —</option>' +
      state.teams.map((t) => `<option value="${t.id}">${escapeHTML(t.name)} (${escapeHTML(t.code)})</option>`).join("");
    if (current && state.teams.some((t) => t.id === current)) contractClubSelect.value = current;
    else contractClubSelect.selectedIndex = 0;
  }

  // Buscador de jugador por Roblox: si ya existe, lo reutilizamos (autocompleta Discord)
  if (contractRobloxInput) {
    let box = null;
    function closeBox() { if (box) box.remove(); box = null; }

    contractRobloxInput.addEventListener("input", async () => {
      selectedPlayer = null;
      const q = contractRobloxInput.value.trim();
      closeBox();
      if (!q) return;

      let results = [];
      try { results = await db.searchPlayers(q); } catch (e) { console.error(e); }
      if (!results.length) return;

      box = document.createElement("div");
      box.className = "admin-search-results";
      results.forEach((p) => {
        const row = document.createElement("div");
        row.className = "admin-row";
        row.style.cursor = "pointer";
        row.innerHTML = `
          <div class="admin-row__body">
            <div class="admin-row__name">${escapeHTML(p.roblox_username)}</div>
            <div class="admin-row__meta">${escapeHTML(p.discord_username)}</div>
          </div>
        `;
        row.addEventListener("click", () => {
          selectedPlayer = p;
          contractRobloxInput.value = p.roblox_username;
          if (contractDiscordUserInput) contractDiscordUserInput.value = p.discord_username;
          if (contractDiscordIdInput) contractDiscordIdInput.value = p.discord_id || "";
          closeBox();
        });
        box.appendChild(row);
      });
      contractRobloxInput.parentElement.appendChild(box);
    });

    document.addEventListener("click", (e) => {
      if (box && !contractRobloxInput.parentElement.contains(e.target)) closeBox();
    });
  }

  function renderContractsView() {
    if (seasonLabelEl) seasonLabelEl.textContent = "Temporada " + state.season;
    if (seasonBadgeEl) seasonBadgeEl.textContent = "Temporada " + state.season;
    populateContractClubSelect();

    if (!contractsTableBody) return;
    if (!state.contracts.length) {
      contractsTableBody.innerHTML = '<tr><td colspan="9" class="admin-table-empty">Todavía no hay contratos.</td></tr>';
      return;
    }

    contractsTableBody.innerHTML = state.contracts.map((c) => {
      const isActive = c.status === "ACTIVO";
      const avatar = c.player?.avatar_url
        ? `<img src="${c.player.avatar_url}" alt="" class="team-crest" style="border-radius:50%;">`
        : `<span class="team-crest team-crest--empty" style="border-radius:50%;"></span>`;
      return `
        <tr>
          <td>
            ${avatar}
            <button type="button" class="btn-admin btn-admin--small" data-upload-avatar="${c.player?.id}" style="margin-left:6px;">Subir foto</button>
          </td>
          <td>${escapeHTML(c.player ? c.player.discord_username : "—")}</td>
          <td>${escapeHTML(c.player ? c.player.roblox_username : "—")}</td>
          <td>${escapeHTML(c.team ? c.team.name : "—")}</td>
          <td class="is-num">${Number(c.price).toFixed(2)}</td>
          <td class="is-muted">T${c.signed_season}</td>
          <td class="is-num">${isActive ? c.seasons_left : "—"}</td>
          <td><span class="badge-state ${isActive ? "badge-state--active" : "badge-state--inactive"}">${isActive ? "ACTIVO" : "INACTIVO"}</span></td>
          <td class="is-muted">${isActive ? "—" : formatDate(c.ended_at)}</td>
          <td class="admin-table__actions">
            <button type="button" class="btn-admin btn-admin--small btn-admin--danger" data-delete-contract="${c.id}">Eliminar</button>
          </td>
        </tr>
      `;
    }).join("");
  }

  if (contractForm) {
    contractForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const robloxUser = contractRobloxInput?.value.trim();
      const discordUser = contractDiscordUserInput?.value.trim();
      const discordId = contractDiscordIdInput?.value.trim() || null;
      const seasonsTotal = parseInt(document.getElementById("contract-seasons")?.value, 10);
      const price = parseFloat(document.getElementById("contract-price")?.value);
      const clubId = contractClubSelect?.value;
      const submitBtn = contractForm.querySelector('button[type="submit"]');

      if (!discordUser || !robloxUser || !clubId || !seasonsTotal || seasonsTotal < 1 || isNaN(price)) {
        alert("Rellena todos los campos del contrato correctamente.");
        return;
      }

      withBusy(submitBtn, async () => {
        const player = selectedPlayer
          ? selectedPlayer
          : await db.findOrCreatePlayer({ discordId, discordUsername: discordUser, robloxUsername: robloxUser });

        await db.addContract({
          playerId: player.id,
          teamId: clubId,
          price,
          seasonsTotal,
          signedSeason: state.season,
        });

        contractForm.reset();
        selectedPlayer = null;
        await reloadAll();
        renderAll();
        toast("Contrato añadido.");
      });
    });
  }

  if (contractsTableBody) {
    contractsTableBody.addEventListener("click", (e) => {
      const avatarBtn = e.target.closest("[data-upload-avatar]");
      if (avatarBtn) {
        const playerId = avatarBtn.getAttribute("data-upload-avatar");
        if (!playerId) return;
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.addEventListener("change", () => {
          const file = input.files && input.files[0];
          if (!file) return;
          withBusy(avatarBtn, async () => {
            const dataUrl = await readFileAsDataURL(file);
            await db.updatePlayerAvatar(playerId, dataUrl);
            await reloadAll();
            renderAll();
            toast("Foto actualizada.");
          });
        });
        input.click();
        return;
      }

      const btn = e.target.closest("[data-delete-contract]");
      if (!btn) return;
      if (!confirm("¿Eliminar este contrato?")) return;
      withBusy(btn, async () => {
        await db.deleteContract(btn.getAttribute("data-delete-contract"));
        await reloadAll();
        renderAll();
        toast("Contrato eliminado.");
      });
    });
  }

  if (advanceSeasonBtn) {
    advanceSeasonBtn.addEventListener("click", () => {
      if (!confirm(`¿Avanzar de la temporada ${state.season} a la ${state.season + 1}? Todos los contratos activos restarán una temporada.`)) return;
      withBusy(advanceSeasonBtn, async () => {
        const next = await db.advanceSeason(state.season);
        await db.setSetting("current_season", next);
        state.season = next;
        await reloadAll();
        renderAll();
        toast("Temporada avanzada.");
      });
    });
  }

  // =====================================
  // PARTIDOS (programar)
  // =====================================

  const matchForm = document.getElementById("match-form");
  const matchHomeSelect = document.getElementById("match-home");
  const matchAwaySelect = document.getElementById("match-away");
  const matchStadiumSelect = document.getElementById("match-stadium");
  const matchesTableBody = document.getElementById("matches-table-body");

  function populateMatchSelects() {
    const teamOptions = '<option value="" disabled selected>— Selecciona —</option>' +
      state.teams.map((t) => `<option value="${t.id}">${escapeHTML(t.name)}</option>`).join("");
    if (matchHomeSelect) matchHomeSelect.innerHTML = teamOptions;
    if (matchAwaySelect) matchAwaySelect.innerHTML = teamOptions;
    if (matchStadiumSelect) {
      matchStadiumSelect.innerHTML = '<option value="">— Sin definir —</option>' +
        state.stadiums.map((s) => `<option value="${s.id}">${escapeHTML(s.name)}</option>`).join("");
    }
  }

  function renderMatchesView() {
    populateMatchSelects();
    if (!matchesTableBody) return;

    if (!state.matches.length) {
      matchesTableBody.innerHTML = '<tr><td colspan="6" class="admin-table-empty">Todavía no hay partidos programados.</td></tr>';
      return;
    }

    matchesTableBody.innerHTML = state.matches.map((m) => `
      <tr>
        <td class="is-muted">J${m.matchday}${m.is_playoff ? ' <span class="badge-state badge-state--neutral">Playoff</span>' : ""}</td>
        <td>${m.home_team ? escapeHTML(m.home_team.name) : "—"} vs ${m.away_team ? escapeHTML(m.away_team.name) : "—"}</td>
        <td>${m.stadium ? escapeHTML(m.stadium.name) : "—"}</td>
        <td class="is-muted">${formatDateTime(m.scheduled_at)}</td>
        <td>${m.status === "jugado" ? `<span class="badge-state badge-state--active">${m.home_goals}-${m.away_goals}</span>` : '<span class="badge-state badge-state--neutral">Programado</span>'}</td>
        <td class="admin-table__actions">
          <button type="button" class="btn-admin btn-admin--small btn-admin--danger" data-delete-match="${m.id}">Eliminar</button>
        </td>
      </tr>
    `).join("");
  }

  if (matchForm) {
    matchForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const homeId = matchHomeSelect?.value;
      const awayId = matchAwaySelect?.value;
      const stadiumId = matchStadiumSelect?.value || null;
      const matchday = parseInt(document.getElementById("match-matchday")?.value, 10) || 1;
      const dateVal = document.getElementById("match-datetime")?.value;
      const isPlayoff = document.getElementById("match-playoff")?.checked || false;
      const submitBtn = matchForm.querySelector('button[type="submit"]');

      if (!homeId || !awayId || homeId === awayId) {
        alert("Selecciona dos equipos distintos.");
        return;
      }

      withBusy(submitBtn, async () => {
        await db.addMatch({
          season: state.season,
          matchday,
          home_team_id: homeId,
          away_team_id: awayId,
          stadium_id: stadiumId,
          scheduled_at: dateVal ? new Date(dateVal).toISOString() : null,
          status: "programado",
          is_playoff: isPlayoff,
        });
        matchForm.reset();
        await reloadAll();
        renderAll();
        toast("Partido programado.");
      });
    });
  }

  if (matchesTableBody) {
    matchesTableBody.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-delete-match]");
      if (!btn) return;
      if (!confirm("¿Eliminar este partido?")) return;
      withBusy(btn, async () => {
        await db.deleteMatch(btn.getAttribute("data-delete-match"));
        await reloadAll();
        renderAll();
        toast("Partido eliminado.");
      });
    });
  }

  // =====================================
  // RESULTADOS
  // =====================================

  const resultsPendingList = document.getElementById("results-pending-list");
  const resultsPlayedList = document.getElementById("results-played-list");
  const resultFormBox = document.getElementById("result-form-box");

  function renderResultsView() {
    if (!resultsPendingList || !resultsPlayedList) return;

    const pending = state.matches.filter((m) => m.status === "programado");
    const played = state.matches.filter((m) => m.status === "jugado");

    resultsPendingList.innerHTML = pending.map((m) => `
      <div class="admin-row">
        <div class="admin-row__body">
          <div class="admin-row__name">${m.home_team ? escapeHTML(m.home_team.name) : "?"} vs ${m.away_team ? escapeHTML(m.away_team.name) : "?"}</div>
          <div class="admin-row__meta">J${m.matchday} · ${formatDateTime(m.scheduled_at)}</div>
        </div>
        <button type="button" class="btn-admin btn-admin--small btn-admin--solid" data-enter-result="${m.id}">Poner resultado</button>
      </div>
    `).join("") || '<div class="admin-panel__empty">No hay partidos pendientes.</div>';

    resultsPlayedList.innerHTML = played.map((m) => `
      <div class="admin-row">
        <div class="admin-row__body">
          <div class="admin-row__name">${m.home_team ? escapeHTML(m.home_team.name) : "?"} ${m.home_goals}-${m.away_goals} ${m.away_team ? escapeHTML(m.away_team.name) : "?"}</div>
          <div class="admin-row__meta">J${m.matchday}</div>
        </div>
        <button type="button" class="btn-admin btn-admin--small" data-enter-result="${m.id}">Editar resultado</button>
      </div>
    `).join("") || '<div class="admin-panel__empty">Todavía no hay partidos jugados.</div>';
  }

  async function openResultForm(matchId) {
    const match = state.matches.find((m) => m.id === matchId);
    if (!match || !resultFormBox) return;

    const [homeRoster, awayRoster, existingEvents] = await Promise.all([
      db.getContractsByTeam(match.home_team_id),
      db.getContractsByTeam(match.away_team_id),
      db.getMatchEvents(matchId),
    ]);

    function playerOptions(roster) {
      return roster.map((c) => `<option value="${c.player.id}">${escapeHTML(c.player.roblox_username)}</option>`).join("");
    }

    resultFormBox.hidden = false;
    resultFormBox.innerHTML = `
      <div class="admin-form__title">Resultado: ${match.home_team ? escapeHTML(match.home_team.name) : "?"} vs ${match.away_team ? escapeHTML(match.away_team.name) : "?"}</div>
      <div class="admin-form" style="grid-template-columns: repeat(2, 1fr);">
        <div class="admin-field">
          <label>Goles ${match.home_team ? escapeHTML(match.home_team.name) : "Local"}</label>
          <input class="admin-input" type="number" min="0" id="result-home-goals" value="${match.home_goals ?? 0}">
        </div>
        <div class="admin-field">
          <label>Goles ${match.away_team ? escapeHTML(match.away_team.name) : "Visitante"}</label>
          <input class="admin-input" type="number" min="0" id="result-away-goals" value="${match.away_goals ?? 0}">
        </div>
      </div>

      <div class="result-events" id="result-events-list"></div>

      <div class="admin-form__actions" style="padding:0 0 20px;">
        <button type="button" class="btn-admin" id="result-add-event">+ Añadir evento (gol / tarjeta / asistencia / MVP)</button>
      </div>

      <div class="admin-form__actions">
        <button type="button" class="btn-admin btn-admin--solid" id="result-save-btn">Guardar resultado</button>
        <button type="button" class="btn-admin" id="result-cancel-btn">Cancelar</button>
      </div>
    `;

    const eventsList = document.getElementById("result-events-list");
    const eventTypeLabels = {
      gol: "Gol", tarjeta_amarilla: "Tarjeta amarilla", tarjeta_roja: "Tarjeta roja",
      asistencia: "Asistencia", mvp: "MVP",
    };

    function addEventRow(prefill) {
      const row = document.createElement("div");
      row.className = "result-event-row";
      row.innerHTML = `
        <select class="admin-select" data-ev="team">
          <option value="home" ${prefill?.side === "home" ? "selected" : ""}>${match.home_team ? escapeHTML(match.home_team.name) : "Local"} (Local)</option>
          <option value="away" ${prefill?.side === "away" ? "selected" : ""}>${match.away_team ? escapeHTML(match.away_team.name) : "Visitante"} (Visitante)</option>
        </select>
        <select class="admin-select" data-ev="player"></select>
        <select class="admin-select" data-ev="type">
          ${Object.keys(eventTypeLabels).map((k) => `<option value="${k}" ${prefill?.type === k ? "selected" : ""}>${eventTypeLabels[k]}</option>`).join("")}
        </select>
        <button type="button" class="btn-admin btn-admin--small btn-admin--danger" data-ev-remove="1">Quitar</button>
      `;

      const teamSelect = row.querySelector('[data-ev="team"]');
      const playerSelect = row.querySelector('[data-ev="player"]');

      function refreshPlayers() {
        playerSelect.innerHTML = teamSelect.value === "home" ? playerOptions(homeRoster) : playerOptions(awayRoster);
        if (prefill?.playerId) playerSelect.value = prefill.playerId;
      }
      teamSelect.addEventListener("change", refreshPlayers);
      refreshPlayers();

      row.querySelector("[data-ev-remove]").addEventListener("click", () => row.remove());
      eventsList.appendChild(row);
    }

    existingEvents.forEach((ev) => {
      addEventRow({
        side: ev.team_id === match.home_team_id ? "home" : "away",
        playerId: ev.player_id,
        type: ev.type,
      });
    });

    document.getElementById("result-add-event").addEventListener("click", () => addEventRow());

    document.getElementById("result-cancel-btn").addEventListener("click", () => {
      resultFormBox.hidden = true;
      resultFormBox.innerHTML = "";
    });

    document.getElementById("result-save-btn").addEventListener("click", (evt) => {
      const homeGoals = parseInt(document.getElementById("result-home-goals").value, 10) || 0;
      const awayGoals = parseInt(document.getElementById("result-away-goals").value, 10) || 0;

      const events = Array.from(eventsList.querySelectorAll(".result-event-row")).map((row) => {
        const side = row.querySelector('[data-ev="team"]').value;
        const playerId = row.querySelector('[data-ev="player"]').value;
        const type = row.querySelector('[data-ev="type"]').value;
        return {
          playerId,
          type,
          teamId: side === "home" ? match.home_team_id : match.away_team_id,
        };
      });

      withBusy(evt.target, async () => {
        await db.setMatchResult(matchId, { homeGoals, awayGoals, events });
        resultFormBox.hidden = true;
        resultFormBox.innerHTML = "";
        await reloadAll();
        renderAll();
        toast("Resultado guardado.");
      });
    });
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-enter-result]");
    if (!btn) return;
    openResultForm(btn.getAttribute("data-enter-result"));
  });

  // =====================================
  // DIVISIONES
  // =====================================

  function renderDivisionsView() {
    const groups = { null: [], primera: [], segunda: [] };
    state.teams.forEach((t) => {
      const key = t.division || "null";
      (groups[key] || groups.null).push(t);
    });

    Object.keys(groups).forEach((key) => {
      const listEl = document.getElementById("division-list-" + key);
      const countEl = document.getElementById("division-count-" + key);
      if (!listEl) return;
      if (countEl) countEl.textContent = groups[key].length;

      if (!groups[key].length) {
        listEl.innerHTML = '<div class="division-column__empty">Vacío.</div>';
        return;
      }

      listEl.innerHTML = groups[key].map((t) => {
        let actions = "";
        if (key !== "primera") actions += `<button type="button" class="btn-admin btn-admin--small" data-assign="${t.id}::primera">→ Primera</button>`;
        if (key !== "segunda") actions += `<button type="button" class="btn-admin btn-admin--small" data-assign="${t.id}::segunda">→ Segunda</button>`;
        if (key !== "null") actions += `<button type="button" class="btn-admin btn-admin--small" data-assign="${t.id}::null">Quitar</button>`;
        return `
          <div class="division-row">
            <span class="division-row__name">${escapeHTML(t.name)}</span>
            <div class="division-row__actions">${actions}</div>
          </div>
        `;
      }).join("");
    });
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-assign]");
    if (!btn) return;
    const [teamId, division] = btn.getAttribute("data-assign").split("::");
    withBusy(btn, async () => {
      await db.updateTeam(teamId, { division: division === "null" ? null : division });
      await reloadAll();
      renderAll();
    });
  });

  // =====================================
  // ADMINS (solo super-admin)
  // =====================================

  const adminsForm = document.getElementById("admins-form");
  const adminsListEl = document.getElementById("admins-list");

  function renderAdminsView() {
    if (!adminsListEl) return;
    if (!state.admins.length) {
      adminsListEl.innerHTML = '<div class="admin-panel__empty">Todavía no has añadido ningún admin.</div>';
      return;
    }
    adminsListEl.innerHTML = state.admins.map((a) => `
      <div class="admin-row">
        <div class="admin-row__body">
          <div class="admin-row__name">${escapeHTML(a.discord_username || "Sin nombre")}</div>
          <div class="admin-row__meta">ID: ${escapeHTML(a.discord_id)} · añadido ${formatDate(a.created_at)}</div>
        </div>
        <button type="button" class="btn-admin btn-admin--small btn-admin--danger" data-remove-admin="${a.id}">Quitar</button>
      </div>
    `).join("");
  }

  if (adminsForm) {
    adminsForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const discordId = document.getElementById("admin-add-discord-id")?.value.trim();
      const discordUsername = document.getElementById("admin-add-discord-username")?.value.trim();
      const submitBtn = adminsForm.querySelector('button[type="submit"]');
      if (!discordId) return;

      withBusy(submitBtn, async () => {
        await db.addAdmin({ discordId, discordUsername, addedByDiscordId: state.currentDiscordId });
        adminsForm.reset();
        state.admins = await db.getAdmins();
        renderAdminsView();
        toast("Admin añadido.");
      });
    });
  }

  if (adminsListEl) {
    adminsListEl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-remove-admin]");
      if (!btn) return;
      if (!confirm("¿Quitar a este admin?")) return;
      withBusy(btn, async () => {
        await db.removeAdmin(btn.getAttribute("data-remove-admin"));
        state.admins = await db.getAdmins();
        renderAdminsView();
        toast("Admin eliminado.");
      });
    });
  }

  // =====================================
  // HISTORIAL (solo super-admin)
  // =====================================

  const historyListEl = document.getElementById("history-list");

  const TABLE_LABELS = {
    teams: "Equipo", contracts: "Contrato", matches: "Partido",
    match_events: "Evento de partido", stadiums: "Estadio", players: "Jugador",
  };
  const ACTION_LABELS = { INSERT: "creó", UPDATE: "editó", DELETE: "eliminó" };

  async function renderHistoryView() {
    if (!historyListEl) return;
    let entries = [];
    try { entries = await db.getAuditLog(150); } catch (e) { console.error(e); }

    if (!entries.length) {
      historyListEl.innerHTML = '<div class="admin-panel__empty">Todavía no hay cambios registrados.</div>';
      return;
    }

    historyListEl.innerHTML = entries.map((entry) => `
      <div class="admin-row">
        <div class="admin-row__body">
          <div class="admin-row__name">${escapeHTML(entry.actor_discord_id || "Desconocido")} ${ACTION_LABELS[entry.action] || entry.action} un ${TABLE_LABELS[entry.table_name] || entry.table_name}</div>
          <div class="admin-row__meta">${formatDateTime(entry.created_at)}</div>
        </div>
        <button type="button" class="btn-admin btn-admin--small" data-revert="${entry.id}">Revertir</button>
      </div>
    `).join("");

    historyListEl.querySelectorAll("[data-revert]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-revert");
        const entry = entries.find((x) => x.id === id);
        if (!entry) return;
        if (!confirm("¿Revertir este cambio?")) return;
        withBusy(btn, async () => {
          await db.revertAuditEntry(entry);
          await reloadAll();
          renderAll();
          await renderHistoryView();
          toast("Cambio revertido.");
        });
      });
    });
  }

  // =====================================
  // NAVEGACIÓN DEL PANEL
  // =====================================

  const CRUMBS = {
    overview: "Overview", teams: "Equipos", contracts: "Contratos", divisions: "Divisiones",
    stadiums: "Estadios", matches: "Partidos", results: "Resultados", admins: "Admins", history: "Historial",
  };

  function showAdminView(name) {
    if ((name === "admins" || name === "history") && !state.isSuperAdmin) {
      name = "overview";
    }
    document.querySelectorAll(".admin-view").forEach((section) => {
      section.hidden = section.dataset.adminView !== name;
    });
    document.querySelectorAll(".admin-nav__link").forEach((link) => {
      link.classList.toggle("is-active", link.dataset.adminView === name);
    });
    const crumb = document.getElementById("admin-crumb");
    if (crumb) crumb.textContent = CRUMBS[name] || "Overview";

    if (name === "results") renderResultsView();
    if (name === "history") renderHistoryView();
  }
  window.IFLAdminShowView = showAdminView;

  const adminNav = document.getElementById("admin-nav");
  if (adminNav) {
    adminNav.addEventListener("click", (e) => {
      const link = e.target.closest(".admin-nav__link");
      if (!link) return;
      showAdminView(link.dataset.adminView);
    });
  }

  const refreshBtn = document.getElementById("admin-refresh");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => withBusy(refreshBtn, async () => { await reloadAll(); renderAll(); toast("Actualizado."); }));
  }

  function applyRoleVisibility() {
    // OJO: esto solo debe tocar los BOTONES del menú, nunca las secciones
    // (.admin-view) — si tocamos las secciones aquí, cada vez que se
    // renderiza el panel (p. ej. al añadir un equipo) se vuelve a mostrar
    // "Admins"/"Historial" encima de la vista que tuvieras abierta.
    document.querySelectorAll('.admin-nav__link[data-admin-view="admins"], .admin-nav__link[data-admin-view="history"]').forEach((el) => {
      el.hidden = !state.isSuperAdmin;
    });

    // Si un no-super-admin estuviera de algún modo en esas vistas, lo mandamos a Overview.
    if (!state.isSuperAdmin) {
      const adminsSection = document.querySelector('.admin-view[data-admin-view="admins"]');
      const historySection = document.querySelector('.admin-view[data-admin-view="history"]');
      const isOnRestricted = (adminsSection && !adminsSection.hidden) || (historySection && !historySection.hidden);
      if (isOnRestricted) showAdminView("overview");
    }
  }

  // =====================================
  // RENDER GENERAL
  // =====================================

  function renderAll() {
    renderSideClubs(activeDivision, activeStatus, (searchInput?.value || "").trim().toLowerCase());
    renderOverview();
    renderTeamsView();
    renderStadiumsView();
    renderContractsView();
    renderMatchesView();
    renderDivisionsView();
    if (state.isSuperAdmin) renderAdminsView();
    applyRoleVisibility();
  }

  // =====================================
  // ACCESO: DISCORD + PUERTA INTERNA + CAPTCHA
  // =====================================

  const deniedEl = document.getElementById("admin-denied");
  const appEl = document.getElementById("admin-app");

  function hideAllScreens() {
    [deniedEl, appEl].forEach((el) => { if (el) { el.hidden = true; el.style.display = "none"; } });
  }
  function showDenied() { hideAllScreens(); if (deniedEl) { deniedEl.hidden = false; deniedEl.style.display = ""; } }

  function showAdminWelcome() {
    if (window.IFLOnboarding) window.IFLOnboarding.openAdminWelcome();
  }

  let idleTimer = null;
  function resetIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      alert("Se ha cerrado tu sesión de administrador por inactividad (30 minutos). Vuelve a entrar con Discord.");
      db.client.auth.signOut().finally(() => { window.location.href = "index.html"; });
    }, IDLE_TIMEOUT_MS);
  }

  function armIdleTimer() {
    ["click", "keydown", "mousemove", "scroll"].forEach((evt) => {
      document.addEventListener(evt, resetIdleTimer, { passive: true });
    });
    resetIdleTimer();
  }

  function showPanel() {
    if (!appEl) return;
    hideAllScreens();
    appEl.hidden = false;
    appEl.style.display = "";
    armIdleTimer();

    (async () => {
      try {
        await reloadAll();
        renderAll();
        showAdminWelcome();
      } catch (err) {
        console.error("[IFL Admin] Error cargando el panel:", err);
        toast("Error cargando los datos del panel.", true);
      }
    })();
  }

  function addCandidate(list, value) {
    if (value === null || value === undefined || value === "") return;
    const n = String(value).trim();
    if (n && !list.includes(n)) list.push(n);
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

  function isAdminUserLocal(user) {
    return getDiscordIdCandidates(user).includes(ADMIN_DISCORD_ID);
  }

  function paintSidebarUser(user) {
    const nameEl = document.getElementById("admin-name");
    const avatarEl = document.getElementById("admin-avatar");
    const fallbackEl = document.getElementById("admin-avatar-fallback");
    if (!nameEl) return;

    const discordName =
      (user.user_metadata && (
        user.user_metadata.full_name || user.user_metadata.name ||
        user.user_metadata.preferred_username || user.user_metadata.user_name ||
        user.user_metadata.custom_claims?.global_name
      )) || "Administrador";

    nameEl.textContent = discordName;
    state.currentDiscordName = discordName;

    const avatarUrl = user.user_metadata && (user.user_metadata.avatar_url || user.user_metadata.picture);
    if (avatarUrl && avatarEl && fallbackEl) {
      avatarEl.src = avatarUrl;
      avatarEl.alt = discordName;
      avatarEl.hidden = false;
      fallbackEl.hidden = true;
      avatarEl.onerror = () => { avatarEl.hidden = true; fallbackEl.hidden = false; fallbackEl.textContent = discordName.charAt(0).toUpperCase(); };
    } else if (fallbackEl) {
      fallbackEl.textContent = discordName.charAt(0).toUpperCase();
      fallbackEl.hidden = false;
      if (avatarEl) avatarEl.hidden = true;
    }
  }

  if (window.supabase && typeof window.supabase.createClient === "function" && db) {
    db.client.auth.getSession().then(async (res) => {
      const session = res.data && res.data.session;
      if (!session) { window.location.href = "index.html"; return; }

      const candidates = getDiscordIdCandidates(session.user);
      state.currentDiscordId = candidates[0] || null;

      if (!isAdminUserLocal(session.user)) { showDenied(); return; }

      paintSidebarUser(session.user);
      state.isSuperAdmin = await db.isSuperAdmin();
      showPanel();
    }).catch((error) => {
      console.error("[IFL Admin] Error obteniendo la sesión:", error);
      showDenied();
    });

    db.client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        window.location.href = "index.html";
      }
    });

    const signoutBtn = document.getElementById("admin-signout");
    if (signoutBtn) {
      signoutBtn.addEventListener("click", () => {
        db.client.auth.signOut().finally(() => { window.location.href = "index.html"; });
      });
    }
  } else {
    console.error("[IFL Admin] Supabase no se ha cargado.");
    showDenied();
  }
})();
