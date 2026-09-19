/* =====================================
   IFL — PANEL DE ADMINISTRACIÓN
   - Acceso: solo el Discord "aitor_lorente"
   - Puerta interna: usuario/contraseña "AdminPanel"
   - Equipos, Contratos (con temporadas) y Divisiones
     se guardan en localStorage porque todavía no hay
     tablas para esto en Supabase.
===================================== */

(function () {
  "use strict";

  /* =====================================
     0. CONFIGURACIÓN DE ACCESO
  ===================================== */

  const ADMIN_DISCORD_USERNAME = "aitor_lorente";

  const GATE_USER = "AdminPanel";
  const GATE_PASS = "ifl.oficial.admins";
  const GATE_SESSION_KEY = "ifl-admin-gate-ok";

  /* =====================================
     1. DATOS DE EJEMPLO
  ===================================== */

  const SAMPLE_CLUBS = [
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
    { code: "S8", name: "Club S8", division: "segunda", players: 23, status: "pending", manager: true }
  ];

  /* =====================================
     2. ALMACENAMIENTO LOCAL
  ===================================== */

  const STORAGE = {
    teams: "ifl-admin-teams",
    overrides: "ifl-admin-team-overrides",
    contracts: "ifl-admin-contracts",
    season: "ifl-admin-season"
  };

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn("[IFL Admin] No se pudo guardar:", key, e);
    }
  }

  function loadCustomTeams() {
    return loadJSON(STORAGE.teams, []);
  }

  function saveCustomTeams(list) {
    saveJSON(STORAGE.teams, list);
  }

  function loadOverrides() {
    return loadJSON(STORAGE.overrides, {});
  }

  function saveOverrides(obj) {
    saveJSON(STORAGE.overrides, obj);
  }

  function loadContracts() {
    return loadJSON(STORAGE.contracts, []);
  }

  function saveContracts(list) {
    saveJSON(STORAGE.contracts, list);
  }

  function loadSeason() {
    return loadJSON(STORAGE.season, 13);
  }

  function saveSeason(n) {
    saveJSON(STORAGE.season, n);
  }

  function allTeams() {
    const overrides = loadOverrides();

    const base = SAMPLE_CLUBS.map(function (c) {
      const ov = overrides[c.code];

      return ov
        ? Object.assign({}, c, ov)
        : Object.assign({}, c);
    });

    const custom = loadCustomTeams();

    return base.concat(custom);
  }

  function findTeam(code) {
    return allTeams().filter(function (t) {
      return t.code === code;
    })[0] || null;
  }

  function isCustomTeam(code) {
    return loadCustomTeams().some(function (t) {
      return t.code === code;
    });
  }

  function setTeamDivision(code, division) {
    if (isCustomTeam(code)) {
      const custom = loadCustomTeams();

      custom.forEach(function (t) {
        if (t.code === code) {
          t.division = division;
        }
      });

      saveCustomTeams(custom);
    } else {
      const overrides = loadOverrides();

      overrides[code] = Object.assign(
        {},
        overrides[code],
        { division: division }
      );

      saveOverrides(overrides);
    }
  }

  function deleteCustomTeam(code) {
    saveCustomTeams(
      loadCustomTeams().filter(function (t) {
        return t.code !== code;
      })
    );

    const overrides = loadOverrides();

    delete overrides[code];

    saveOverrides(overrides);
  }

  function divisionLabel(div) {
    if (div === "primera") return "Primera";
    if (div === "segunda") return "Segunda";

    return "Sin asignar";
  }

  function formatDate(iso) {
    if (!iso) return "—";

    try {
      return new Date(iso).toLocaleDateString(
        "es-ES",
        {
          day: "2-digit",
          month: "2-digit",
          year: "numeric"
        }
      );
    } catch (e) {
      return "—";
    }
  }

  function escapeHTML(str) {
    return String(str == null ? "" : str).replace(
      /[&<>"']/g,
      function (c) {
        return {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
        }[c];
      }
    );
  }

  /* =====================================
     3. ELEMENTOS
  ===================================== */

  const clubsEl = document.getElementById("admin-clubs");
  const searchInput = document.getElementById("admin-search");
  const updatedList = document.getElementById("admin-updated-list");
  const attentionList = document.getElementById("admin-attention-list");
  const attentionCount = document.getElementById("admin-attention-count");
  const pendingGrid = document.getElementById("admin-pending-grid");
  const pendingCount = document.getElementById("admin-pending-count");
  const updatedPct = document.getElementById("admin-updated-pct");
  const seasonLabelEl = document.getElementById("admin-season-label");
  const seasonBadgeEl = document.getElementById("contracts-season-badge");

  /* =====================================
     4. CLUBES
  ===================================== */

  function renderSideClubs(filterDivision, filterStatus, query) {
    if (!clubsEl) return;

    clubsEl.innerHTML = "";

    const groups = [
      { key: "primera", label: "Primera división" },
      { key: "segunda", label: "Segunda división" },
      { key: "null", label: "Sin asignar" }
    ];

    const teams = allTeams();

    groups.forEach(function (g) {
      if (
        filterDivision !== "todos" &&
        filterDivision !== g.key
      ) {
        return;
      }

      const items = teams.filter(function (c) {
        const div = c.division || "null";

        if (div !== g.key) return false;

        if (
          filterStatus !== "cualquiera" &&
          c.status !== (
            filterStatus === "actualizado"
              ? "up"
              : "pending"
          )
        ) {
          return false;
        }

        if (
          query &&
          c.name.toLowerCase().indexOf(query) === -1
        ) {
          return false;
        }

        return true;
      });

      if (!items.length) return;

      const group = document.createElement("div");

      group.className = "admin-clubs__group";

      group.innerHTML =
        "<span>" +
        g.label +
        "</span><span>" +
        items.length +
        "</span>";

      clubsEl.appendChild(group);

      items.forEach(function (c) {
        const row = document.createElement("div");

        row.className = "admin-club-row";

        row.innerHTML =
          '<span class="admin-club-row__bar admin-club-row__bar--' +
          (c.status === "up" ? "up" : "pending") +
          '"></span>' +

          '<div style="min-width:0;">' +

          '<div class="admin-club-row__name">' +
          escapeHTML(c.name) +
          "</div>" +

          '<div class="admin-club-row__meta">' +
          escapeHTML(c.code) +
          " · " +
          (c.players || 0) +
          " jugadores</div>" +

          "</div>";

        clubsEl.appendChild(row);
      });
    });

    if (!clubsEl.children.length) {
      clubsEl.innerHTML =
        '<div class="admin-panel__empty">Sin resultados.</div>';
    }
  }

  let activeDivision = "todos";
  let activeStatus = "cualquiera";

  function wireChips(containerId, attr, onChange) {
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
  }

  wireChips(
    "division-chips",
    "division",
    function (value) {
      activeDivision = value;

      renderSideClubs(
        activeDivision,
        activeStatus,
        (searchInput.value || "").trim().toLowerCase()
      );
    }
  );

  wireChips(
    "status-chips",
    "status",
    function (value) {
      activeStatus = value;

      renderSideClubs(
        activeDivision,
        activeStatus,
        (searchInput.value || "").trim().toLowerCase()
      );
    }
  );

  if (searchInput) {
    searchInput.addEventListener("input", function () {
      renderSideClubs(
        activeDivision,
        activeStatus,
        searchInput.value.trim().toLowerCase()
      );
    });
  }

  document.addEventListener("keydown", function (e) {
    if (
      e.key === "/" &&
      document.activeElement !== searchInput
    ) {
      e.preventDefault();

      if (searchInput) {
        searchInput.focus();
      }
    }
  });

  /* =====================================
     5. OVERVIEW
  ===================================== */

  function renderOverview() {
    const teams = allTeams();
    const contracts = loadContracts();

    const updatedTeams = teams.filter(function (c) {
      return c.status === "up";
    });

    const noManagerTeams = teams.filter(function (c) {
      return (
        c.status === "pending" &&
        c.manager === false
      );
    });

    const pendingTeams = teams.filter(function (c) {
      return c.status === "pending";
    });

    const totalPlayers = teams.reduce(
      function (sum, c) {
        return sum + (c.players || 0);
      },
      0
    );

    const activeContracts = contracts.filter(function (c) {
      return c.status === "ACTIVO";
    });

    const subtitle = document.getElementById(
      "admin-overview-subtitle"
    );

    if (subtitle) {
      subtitle.textContent =
        "Temporada " +
        loadSeason() +
        " · " +
        teams.length +
        " clubes · " +
        contracts.length +
        " contratos registrados";
    }

    const teamsCurrent = document.getElementById(
      "stat-teamsheets-current"
    );

    const teamsTotal = document.getElementById(
      "stat-teamsheets-total"
    );

    const teamsBar = document.getElementById(
      "stat-teamsheets-bar"
    );

    const players = document.getElementById(
      "stat-players"
    );

    const playersFoot = document.getElementById(
      "stat-players-foot"
    );

    const squads = document.getElementById(
      "stat-squads"
    );

    const contractsActive = document.getElementById(
      "stat-contracts-active"
    );

    const contractsFoot = document.getElementById(
      "stat-contracts-foot"
    );

    if (teamsCurrent) {
      teamsCurrent.textContent = updatedTeams.length;
    }

    if (teamsTotal) {
      teamsTotal.textContent = "/" + teams.length;
    }

    const pct = teams.length
      ? Math.round(
          (updatedTeams.length / teams.length) * 100
        )
      : 0;

    if (teamsBar) {
      teamsBar.style.width = pct + "%";
    }

    if (updatedPct) {
      updatedPct.textContent = pct + "% done";
    }

    if (players) {
      players.textContent = totalPlayers;
    }

    if (playersFoot) {
      playersFoot.textContent =
        totalPlayers +
        " jugadores registrados";
    }

    if (squads) {
      squads.textContent = teams.length;
    }

    if (contractsActive) {
      contractsActive.textContent =
        activeContracts.length;
    }

    if (contractsFoot) {
      contractsFoot.textContent =
        (contracts.length -
          activeContracts.length) +
        " inactivos";
    }

    if (updatedList) {
      updatedList.innerHTML = "";

      updatedTeams.forEach(function (c) {
        const row = document.createElement("div");

        row.className = "admin-row";

        row.innerHTML =
          '<div class="admin-row__body">' +
          '<div class="admin-row__name">' +
          escapeHTML(c.name) +
          "</div>" +
          '<div class="admin-row__meta">' +
          escapeHTML(c.code) +
          "</div>" +
          "</div>" +

          '<span class="admin-row__time">' +
          (
            c.updated
              ? "hace " + escapeHTML(c.updated)
              : ""
          ) +
          "</span>" +

          '<span class="admin-mini-toggle" aria-hidden="true"></span>';

        updatedList.appendChild(row);
      });

      if (!updatedTeams.length) {
        updatedList.innerHTML =
          '<div class="admin-panel__empty">' +
          "Nada actualizado todavía." +
          "</div>";
      }
    }

    if (attentionList) {
      attentionList.innerHTML = "";

      noManagerTeams.forEach(function (c) {
        const row = document.createElement("div");

        row.className = "admin-row";

        row.innerHTML =
          '<span class="admin-row__dot admin-row__dot--warn"></span>' +

          '<div class="admin-row__body">' +

          '<div class="admin-row__name">' +
          escapeHTML(c.name) +
          "</div>" +

          '<div class="admin-row__meta">' +
          escapeHTML(c.code) +
          "</div>" +

          "</div>" +

          '<span class="admin-tag admin-tag--down">' +
          "Sin entrenador" +
          "</span>";

        attentionList.appendChild(row);
      });

      if (!noManagerTeams.length) {
        attentionList.innerHTML =
          '<div class="admin-panel__empty">' +
          "Todo en orden." +
          "</div>";
      }
    }

    if (attentionCount) {
      attentionCount.textContent =
        noManagerTeams.length;
    }

    if (pendingGrid) {
      pendingGrid.innerHTML = "";

      pendingTeams.forEach(function (c) {
        const card = document.createElement("div");

        card.className = "admin-card";

        card.innerHTML =
          '<span class="admin-card__badge">' +
          escapeHTML(c.code) +
          "</span>" +

          '<div class="admin-card__body">' +

          '<div class="admin-card__name">' +
          escapeHTML(c.name) +
          "</div>" +

          '<div class="admin-card__meta">' +
          escapeHTML(c.code) +
          " · " +
          (c.players || 0) +
          " jugadores</div>" +

          "</div>" +

          '<span class="admin-card__tag">' +
          "Pendiente" +
          "</span>";

        pendingGrid.appendChild(card);
      });
    }

    if (pendingCount) {
      pendingCount.textContent =
        pendingTeams.length;
    }
  }

  /* =====================================
     6. EQUIPOS
  ===================================== */

  const teamForm =
    document.getElementById("team-form");

  const teamsTableBody =
    document.getElementById("teams-table-body");

  function renderTeamsView() {
    if (!teamsTableBody) return;

    const teams = allTeams();

    const subtitle =
      document.getElementById(
        "admin-teams-subtitle"
      );

    if (subtitle) {
      subtitle.textContent =
        teams.length +
        " clubes en total";
    }

    teamsTableBody.innerHTML = "";

    if (!teams.length) {
      teamsTableBody.innerHTML =
        '<tr><td colspan="5" class="admin-table-empty">' +
        "Todavía no hay equipos." +
        "</td></tr>";

      return;
    }

    teams.forEach(function (c) {
      const custom = isCustomTeam(c.code);

      const tr =
        document.createElement("tr");

      tr.innerHTML =
        '<td class="standings__club">' +
        escapeHTML(c.name) +
        "</td>" +

        "<td>" +
        escapeHTML(c.code) +
        "</td>" +

        "<td>" +
        divisionLabel(c.division) +
        "</td>" +

        '<td class="is-num">' +
        (c.players || 0) +
        "</td>" +

        '<td class="admin-table__actions">' +

        (
          custom
            ? '<button type="button" class="btn-admin btn-admin--small btn-admin--danger" data-delete-team="' +
              escapeHTML(c.code) +
              '">Eliminar</button>'
            : '<span class="badge-state badge-state--neutral">Ejemplo</span>'
        ) +

        "</td>";

      teamsTableBody.appendChild(tr);
    });
  }

  if (teamForm) {
    teamForm.addEventListener(
      "submit",
      function (e) {
        e.preventDefault();

        const name =
          document.getElementById(
            "team-name"
          ).value.trim();

        const code =
          document.getElementById(
            "team-code"
          ).value.trim().toUpperCase();

        const division =
          document.getElementById(
            "team-division"
          ).value || null;

        const players =
          parseInt(
            document.getElementById(
              "team-players"
            ).value,
            10
          ) || 0;

        if (!name || !code) return;

        if (findTeam(code)) {
          alert(
            'Ya existe un equipo con el código "' +
            code +
            '". Usa otro código.'
          );

          return;
        }

        const custom =
          loadCustomTeams();

        custom.push({
          code: code,
          name: name,
          division: division,
          players: players,
          status: "pending",
          manager: false,
          custom: true
        });

        saveCustomTeams(custom);

        teamForm.reset();

        const playersInput =
          document.getElementById(
            "team-players"
          );

        if (playersInput) {
          playersInput.value = 0;
        }

        renderAll();
      }
    );
  }

  if (teamsTableBody) {
    teamsTableBody.addEventListener(
      "click",
      function (e) {
        const btn =
          e.target.closest(
            "[data-delete-team]"
          );

        if (!btn) return;

        const code =
          btn.getAttribute(
            "data-delete-team"
          );

        if (
          !confirm(
            '¿Eliminar el equipo "' +
            code +
            '"? Esta acción no se puede deshacer.'
          )
        ) {
          return;
        }

        deleteCustomTeam(code);

        renderAll();
      }
    );
  }

  /* =====================================
     7. CONTRATOS
  ===================================== */

  const contractForm =
    document.getElementById(
      "contract-form"
    );

  const contractClubSelect =
    document.getElementById(
      "contract-club"
    );

  const contractsTableBody =
    document.getElementById(
      "contracts-table-body"
    );

  const advanceSeasonBtn =
    document.getElementById(
      "advance-season-btn"
    );

  function populateContractClubSelect() {
    if (!contractClubSelect) return;

    const current =
      contractClubSelect.value;

    const teams = allTeams();

    contractClubSelect.innerHTML =
      '<option value="" disabled>— Selecciona club —</option>';

    teams.forEach(function (c) {
      const opt =
        document.createElement("option");

      opt.value = c.code;

      opt.textContent =
        c.name +
        " (" +
        c.code +
        ")";

      contractClubSelect.appendChild(opt);
    });

    if (
      current &&
      teams.some(function (t) {
        return t.code === current;
      })
    ) {
      contractClubSelect.value =
        current;
    } else {
      contractClubSelect.selectedIndex = 0;
    }
  }

  function renderContractsView() {
    const season = loadSeason();

    if (seasonLabelEl) {
      seasonLabelEl.textContent =
        "Temporada " + season;
    }

    if (seasonBadgeEl) {
      seasonBadgeEl.textContent =
        "Temporada " + season;
    }

    populateContractClubSelect();

    if (!contractsTableBody) return;

    const contracts =
      loadContracts();

    contractsTableBody.innerHTML = "";

    if (!contracts.length) {
      contractsTableBody.innerHTML =
        '<tr><td colspan="9" class="admin-table-empty">' +
        "Todavía no hay contratos." +
        "</td></tr>";

      return;
    }

    contracts
      .slice()
      .sort(function (a, b) {
        return b.id - a.id;
      })
      .forEach(function (c) {
        const team =
          findTeam(c.clubCode);

        const clubName =
          team
            ? team.name
            : (c.clubName || c.clubCode);

        const isActive =
          c.status === "ACTIVO";

        const tr =
          document.createElement("tr");

        tr.innerHTML =
          "<td>" +
          escapeHTML(c.discordUser) +
          "</td>" +

          "<td>" +
          escapeHTML(c.robloxUser) +
          "</td>" +

          "<td>" +
          escapeHTML(clubName) +
          "</td>" +

          '<td class="is-num">' +
          Number(c.price).toFixed(2) +
          "</td>" +

          '<td class="is-muted">T' +
          c.signedSeason +
          "</td>" +

          '<td class="is-num">' +
          (
            isActive
              ? c.seasonsLeft
              : "—"
          ) +
          "</td>" +

          "<td>" +

          '<span class="badge-state ' +
          (
            isActive
              ? "badge-state--active"
              : "badge-state--inactive"
          ) +
          '">' +

          (
            isActive
              ? "ACTIVO"
              : "INACTIVO"
          ) +

          "</span>" +

          "</td>" +

          '<td class="is-muted">' +
          (
            isActive
              ? "—"
              : formatDate(c.endedAt)
          ) +
          "</td>" +

          '<td class="admin-table__actions">' +

          '<button type="button" class="btn-admin btn-admin--small btn-admin--danger" data-delete-contract="' +
          c.id +
          '">' +

          "Eliminar" +

          "</button>" +

          "</td>";

        contractsTableBody.appendChild(tr);
      });
  }

  if (contractForm) {
    contractForm.addEventListener(
      "submit",
      function (e) {
        e.preventDefault();

        const discordUser =
          document.getElementById(
            "contract-discord"
          ).value.trim();

        const robloxUser =
          document.getElementById(
            "contract-roblox"
          ).value.trim();

        const seasonsTotal =
          parseInt(
            document.getElementById(
              "contract-seasons"
            ).value,
            10
          );

        const price =
          parseFloat(
            document.getElementById(
              "contract-price"
            ).value
          );

        const clubCode =
          contractClubSelect
            ? contractClubSelect.value
            : "";

        if (
          !discordUser ||
          !robloxUser ||
          !clubCode ||
          !seasonsTotal ||
          seasonsTotal < 1 ||
          isNaN(price)
        ) {
          alert(
            "Rellena todos los campos del contrato correctamente."
          );

          return;
        }

        const team =
          findTeam(clubCode);

        const contracts =
          loadContracts();

        const season =
          loadSeason();

        contracts.push({
          id: Date.now(),
          discordUser: discordUser,
          robloxUser: robloxUser,
          clubCode: clubCode,
          clubName:
            team
              ? team.name
              : clubCode,
          price: price,
          seasonsTotal: seasonsTotal,
          seasonsLeft: seasonsTotal,
          signedSeason: season,
          status: "ACTIVO",
          endedAt: null,
          endedSeason: null
        });

        saveContracts(contracts);

        contractForm.reset();

        const seasonInput =
          document.getElementById(
            "contract-seasons"
          );

        if (seasonInput) {
          seasonInput.value = 1;
        }

        renderContractsView();
        renderOverview();
      }
    );
  }

  if (contractsTableBody) {
    contractsTableBody.addEventListener(
      "click",
      function (e) {
        const btn =
          e.target.closest(
            "[data-delete-contract]"
          );

        if (!btn) return;

        const id =
          Number(
            btn.getAttribute(
              "data-delete-contract"
            )
          );

        if (
          !confirm(
            "¿Eliminar este contrato?"
          )
        ) {
          return;
        }

        saveContracts(
          loadContracts().filter(
            function (c) {
              return c.id !== id;
            }
          )
        );

        renderContractsView();
        renderOverview();
      }
    );
  }

  if (advanceSeasonBtn) {
    advanceSeasonBtn.addEventListener(
      "click",
      function () {
        const current =
          loadSeason();

        if (
          !confirm(
            "¿Avanzar de la temporada " +
            current +
            " a la " +
            (current + 1) +
            "? Todos los contratos activos restarán una temporada."
          )
        ) {
          return;
        }

        const nextSeason =
          current + 1;

        const contracts =
          loadContracts();

        contracts.forEach(function (c) {
          if (c.status !== "ACTIVO") return;

          c.seasonsLeft -= 1;

          if (c.seasonsLeft <= 0) {
            c.status = "INACTIVO";
            c.endedAt =
              new Date().toISOString();
            c.endedSeason =
              nextSeason;
          }
        });

        saveContracts(contracts);
        saveSeason(nextSeason);

        renderContractsView();
        renderOverview();
      }
    );
  }

  /* =====================================
     8. DIVISIONES
  ===================================== */

  function renderDivisionsView() {
    const teams = allTeams();

    const groups = {
      null: [],
      primera: [],
      segunda: []
    };

    teams.forEach(function (t) {
      const key =
        t.division || "null";

      (groups[key] || groups.null)
        .push(t);
    });

    Object.keys(groups).forEach(
      function (key) {
        const listEl =
          document.getElementById(
            "division-list-" + key
          );

        const countEl =
          document.getElementById(
            "division-count-" + key
          );

        if (!listEl) return;

        if (countEl) {
          countEl.textContent =
            groups[key].length;
        }

        listEl.innerHTML = "";

        if (!groups[key].length) {
          listEl.innerHTML =
            '<div class="division-column__empty">' +
            "Vacío." +
            "</div>";

          return;
        }

        groups[key].forEach(
          function (t) {
            const row =
              document.createElement(
                "div"
              );

            row.className =
              "division-row";

            let actions = "";

            if (key !== "primera") {
              actions +=
                '<button type="button" class="btn-admin btn-admin--small" data-assign="' +
                t.code +
                '::primera">→ Primera</button>';
            }

            if (key !== "segunda") {
              actions +=
                '<button type="button" class="btn-admin btn-admin--small" data-assign="' +
                t.code +
                '::segunda">→ Segunda</button>';
            }

            if (key !== "null") {
              actions +=
                '<button type="button" class="btn-admin btn-admin--small" data-assign="' +
                t.code +
                '::null">Quitar</button>';
            }

            row.innerHTML =
              '<span class="division-row__name">' +
              escapeHTML(t.name) +
              "</span>" +

              '<div class="division-row__actions">' +
              actions +
              "</div>";

            listEl.appendChild(row);
          }
        );
      }
    );
  }

  /* =====================================
     9. NAVEGACIÓN
  ===================================== */

  const adminApp =
    document.getElementById(
      "admin-app"
    );

  if (adminApp) {
    adminApp.addEventListener(
      "click",
      function (e) {
        const btn =
          e.target.closest(
            "[data-assign]"
          );

        if (!btn) return;

        const parts =
          btn.getAttribute(
            "data-assign"
          ).split("::");

        const code =
          parts[0];

        const division =
          parts[1] === "null"
            ? null
            : parts[1];

        setTeamDivision(
          code,
          division
        );

        renderAll();
      }
    );
  }

  const CRUMBS = {
    overview: "Overview",
    teams: "Equipos",
    contracts: "Contratos",
    divisions: "Divisiones"
  };

  function showAdminView(name) {
    document
      .querySelectorAll(
        ".admin-view"
      )
      .forEach(
        function (section) {
          section.hidden =
            section.dataset.adminView !==
            name;
        }
      );

    document
      .querySelectorAll(
        ".admin-nav__link"
      )
      .forEach(
        function (link) {
          link.classList.toggle(
            "is-active",
            link.dataset.adminView ===
              name
          );
        }
      );

    const crumb =
      document.getElementById(
        "admin-crumb"
      );

    if (crumb) {
      crumb.textContent =
        CRUMBS[name] ||
        "Overview";
    }
  }

  const adminNav =
    document.getElementById(
      "admin-nav"
    );

  if (adminNav) {
    adminNav.addEventListener(
      "click",
      function (e) {
        const link =
          e.target.closest(
            ".admin-nav__link"
          );

        if (!link) return;

        showAdminView(
          link.dataset.adminView
        );
      }
    );
  }

  const refreshBtn =
    document.getElementById(
      "admin-refresh"
    );

  if (refreshBtn) {
    refreshBtn.addEventListener(
      "click",
      renderAll
    );
  }

  /* =====================================
     10. RENDER GENERAL
  ===================================== */

  function renderAll() {
    renderSideClubs(
      activeDivision,
      activeStatus,
      (
        searchInput
          ? searchInput.value
          : ""
      ).trim().toLowerCase()
    );

    renderOverview();
    renderTeamsView();
    renderContractsView();
    renderDivisionsView();
  }

  /* =====================================
     11. SUPABASE / DISCORD
  ===================================== */

  const SUPABASE_URL =
    "https://boazhychmpxeuplyxzsi.supabase.co";

  const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_C_iRhldD-coePRVqcNDCGA_oGIA1u3d";

  const deniedEl =
    document.getElementById(
      "admin-denied"
    );

  const gateEl =
    document.getElementById(
      "admin-gate"
    );

  const appEl =
    document.getElementById(
      "admin-app"
    );

  function hideAllScreens() {
    if (deniedEl) {
      deniedEl.hidden = true;
    }

    if (gateEl) {
      gateEl.hidden = true;
    }

    if (appEl) {
      appEl.hidden = true;
    }
  }

  function showDenied() {
    hideAllScreens();

    if (deniedEl) {
      deniedEl.hidden = false;
    }
  }

  function showGate() {
    hideAllScreens();

    if (gateEl) {
      gateEl.hidden = false;
    }

    const userInput =
      document.getElementById(
        "gate-user"
      );

    if (userInput) {
      userInput.focus();
    }
  }

  /*
     ESTA ES LA FUNCIÓN IMPORTANTE.
     Después de introducir correctamente
     AdminPanel + contraseña, el panel
     se hace visible y se renderiza.
  */

  function showPanel() {
    console.log(
      "[IFL Admin] Mostrando panel de administración."
    );

    hideAllScreens();

    if (!appEl) {
      console.error(
        "[IFL Admin] ERROR: no existe #admin-app en admin.html."
      );

      return;
    }

    appEl.hidden = false;

    console.log(
      "[IFL Admin] #admin-app visible."
    );

    try {
      renderAll();

      console.log(
        "[IFL Admin] Panel renderizado correctamente."
      );
    } catch (error) {
      console.error(
        "[IFL Admin] Error renderizando el panel:",
        error
      );
    }
  }

  function getDiscordUsernameCandidates(user) {
    const m =
      user.user_metadata || {};

    const identities =
      user.identities || [];

    const discordIdentity =
      identities.filter(
        function (i) {
          return i.provider === "discord";
        }
      )[0];

    const idData =
      (
        discordIdentity &&
        discordIdentity.identity_data
      ) || {};

    return [
      m.user_name,
      m.preferred_username,
      m.name,
      m.full_name,
      m.custom_claims &&
        m.custom_claims.global_name,

      idData.user_name,
      idData.username,
      idData.global_name,
      idData.name,
      idData.full_name
    ]
      .filter(Boolean)
      .map(
        function (c) {
          return c
            .toString()
            .trim()
            .toLowerCase();
        }
      );
  }

  function isAdminUser(user) {
    const candidates =
      getDiscordUsernameCandidates(
        user
      );

    console.log(
      "[IFL Admin] Usuarios/candidatos de Discord detectados:",
      candidates
    );

    return (
      candidates.indexOf(
        ADMIN_DISCORD_USERNAME
      ) !== -1
    );
  }

  function paintSidebarUser(user) {
    const nameEl =
      document.getElementById(
        "admin-name"
      );

    const avatarEl =
      document.getElementById(
        "admin-avatar"
      );

    const fallbackEl =
      document.getElementById(
        "admin-avatar-fallback"
      );

    if (!nameEl) return;

    const discordName =
      (
        user.user_metadata &&
        (
          user.user_metadata.full_name ||
          user.user_metadata.name ||
          user.user_metadata.preferred_username
        )
      ) ||
      "Administrador";

    nameEl.textContent =
      discordName;

    const avatarUrl =
      user.user_metadata &&
      (
        user.user_metadata.avatar_url ||
        user.user_metadata.picture
      );

    if (
      avatarUrl &&
      avatarEl &&
      fallbackEl
    ) {
      avatarEl.src =
        avatarUrl;

      avatarEl.alt =
        discordName;

      avatarEl.hidden =
        false;

      fallbackEl.hidden =
        true;

      avatarEl.onerror =
        function () {
          avatarEl.hidden =
            true;

          fallbackEl.hidden =
            false;

          fallbackEl.textContent =
            discordName
              .charAt(0)
              .toUpperCase();
        };
    } else if (
      fallbackEl
    ) {
      fallbackEl.textContent =
        discordName
          .charAt(0)
          .toUpperCase();

      fallbackEl.hidden =
        false;

      if (avatarEl) {
        avatarEl.hidden =
          true;
      }
    }
  }

  /* =====================================
     12. INICIALIZACIÓN SUPABASE
  ===================================== */

  let supabaseClient = null;

  if (
    window.supabase &&
    typeof window.supabase.createClient ===
      "function"
  ) {
    console.log(
      "[IFL Admin] Cliente Supabase inicializado."
    );

    supabaseClient =
      window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
      );

    supabaseClient.auth
      .getSession()
      .then(function (res) {
        const session =
          res.data &&
          res.data.session;

        console.log(
          "[IFL Admin] Sesión de Discord encontrada:",
          session
        );

        if (!session) {
          console.warn(
            "[IFL Admin] No hay sesión de Discord. Redirigiendo."
          );

          window.location.href =
            "index.html";

          return;
        }

        if (
          !isAdminUser(
            session.user
          )
        ) {
          console.warn(
            "[IFL Admin] El usuario de Discord no tiene acceso."
          );

          showDenied();

          return;
        }

        console.log(
          "[IFL Admin] Discord verificado correctamente."
        );

        paintSidebarUser(
          session.user
        );

        let gateOk = false;

        try {
          gateOk =
            sessionStorage.getItem(
              GATE_SESSION_KEY
            ) === "1";
        } catch (e) {
          gateOk = false;
        }

        if (gateOk) {
          console.log(
            "[IFL Admin] Puerta ya validada en esta sesión."
          );

          showPanel();
        } else {
          console.log(
            "[IFL Admin] Esperando usuario y contraseña del panel."
          );

          showGate();
        }
      })
      .catch(function (error) {
        console.error(
          "[IFL Admin] Error obteniendo la sesión:",
          error
        );

        showDenied();
      });

    const signoutBtn =
      document.getElementById(
        "admin-signout"
      );

    if (signoutBtn) {
      signoutBtn.addEventListener(
        "click",
        function () {
          try {
            sessionStorage.removeItem(
              GATE_SESSION_KEY
            );
          } catch (e) {}

          supabaseClient.auth
            .signOut()
            .then(function () {
              window.location.href =
                "index.html";
            });
        }
      );
    }
  } else {
    console.error(
      "[IFL Admin] Supabase no se ha cargado."
    );

    showDenied();
  }

  /* =====================================
     13. PUERTA INTERNA
  ===================================== */

  const gateForm =
    document.getElementById(
      "admin-gate-form"
    );

  const gateError =
    document.getElementById(
      "gate-error"
    );

  if (gateForm) {
    gateForm.addEventListener(
      "submit",
      function (e) {
        e.preventDefault();

        console.log(
          "[IFL Admin] Intento de acceso a la puerta."
        );

        const userInput =
          document.getElementById(
            "gate-user"
          );

        const passInput =
          document.getElementById(
            "gate-pass"
          );

        const user =
          userInput
            ? userInput.value.trim()
            : "";

        const pass =
          passInput
            ? passInput.value
            : "";

        if (
          user === GATE_USER &&
          pass === GATE_PASS
        ) {
          console.log(
            "[IFL Admin] Usuario y contraseña correctos."
          );

          try {
            sessionStorage.setItem(
              GATE_SESSION_KEY,
              "1"
            );
          } catch (err) {
            console.warn(
              "[IFL Admin] No se pudo guardar la sesión de la puerta.",
              err
            );
          }

          if (gateError) {
            gateError.hidden = true;
          }

          /*
             IMPORTANTE:
             No redirigimos.
             Mostramos directamente #admin-app.
          */

          showPanel();

          return;
        }

        console.warn(
          "[IFL Admin] Usuario o contraseña incorrectos."
        );

        if (gateError) {
          gateError.hidden = false;
        }

        if (passInput) {
          passInput.value = "";
          passInput.focus();
        }
      }
    );
  } else {
    console.error(
      "[IFL Admin] No existe #admin-gate-form en admin.html."
    );
  }

})();
