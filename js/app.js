// =====================================
// IFL - APP PRINCIPAL (datos reales vía Supabase)
// Requiere que js/ifl-db.js se haya cargado antes.
// =====================================

const ADMIN_DISCORD_ID = "1149380955316957266";
let CURRENT_SEASON = 1; // se sobreescribe con el valor real de la base de datos al cargar

function playerDisplayName(p) {
  return (p && (p.roblox_username || p.discord_username)) || "Jugador";
}

// Escapa cualquier texto que venga de la base de datos antes de meterlo en innerHTML.
// TODO lo que provenga de db.* (nombres, descripciones, etc.) debe pasar por aquí.
function escapeHTML(str) {
  return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// Intenta traer el avatar (headshot) real de Roblox a partir del nombre de
// usuario. Usa las APIs públicas de Roblox directamente desde el navegador:
// si en algún momento Roblox bloquea estas llamadas por CORS desde este
// dominio, esto simplemente falla en silencio y se sigue usando la foto
// subida a mano o la inicial de color como respaldo.
async function fetchRobloxAvatarUrl(username) {
  if (!username) return null;
  try {
    const idRes = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: true }),
    });
    if (!idRes.ok) return null;
    const idData = await idRes.json();
    const userId = idData && idData.data && idData.data[0] && idData.data[0].id;
    if (!userId) return null;

    const thumbRes = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`
    );
    if (!thumbRes.ok) return null;
    const thumbData = await thumbRes.json();
    return (thumbData && thumbData.data && thumbData.data[0] && thumbData.data[0].imageUrl) || null;
  } catch (e) {
    console.warn("[IFL] No se pudo obtener el avatar de Roblox automáticamente:", e);
    return null;
  }
}

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
    renderUpcomingMatches();
    checkClubOwnership();
    loadMyRanks();
    startAccessPolling();
  }

  // Si un admin te quita el club o un rango mientras estás navegando la web,
  // esto lo detecta en un margen de hasta 45s y te actualiza el menú (oculta
  // "Mi club", te saca de esa vista si la tenías abierta, refresca el
  // mercado) sin que tengas que recargar la página a mano.
  let accessPollingStarted = false;
  function startAccessPolling() {
    if (accessPollingStarted) return;
    accessPollingStarted = true;
    setInterval(async () => {
      if (!currentDiscordId) return;
      const hadClub = !!myOwnedTeamCache;
      await checkClubOwnership();
      await loadMyRanks();
      const hasClub = !!myOwnedTeamCache;

      if (hadClub && !hasClub) {
        const activeLink = document.querySelector(".app-header__link.is-active");
        const activeView = activeLink && activeLink.dataset.view;
        if (activeView === "club") {
          showView("inicio");
          navLinks.forEach((l) => l.classList.toggle("is-active", l.dataset.view === "inicio"));
        }
        if (activeView === "mercado") renderMercado();
      }
    }, 45000);
  }

  let myOwnedTeamCache = null;
  let myRanksCache = [];

  async function loadMyRanks() {
    try { myRanksCache = await db.getPlayerRankNames(currentDiscordId); } catch (e) { myRanksCache = []; }
  }

  // =================================
  // MERCADO DE FICHAJES
  // =================================

  function robloxAvatarHTML(p, sizeClass) {
    sizeClass = sizeClass || "market-player-row__avatar";
    if (p && p.avatar_url) {
      return `<img src="${escapeHTML(p.avatar_url)}" class="${sizeClass}" alt="">`;
    }
    const initial = escapeHTML(playerDisplayName(p).charAt(0).toUpperCase());
    return `<span class="${sizeClass} ${sizeClass}--fallback">${initial}</span>`;
  }

  async function renderMercado() {
    const staffTool = document.getElementById("market-staff-tool");
    const myOffersBox = document.getElementById("market-my-offers");
    const negotiationsBox = document.getElementById("market-negotiations-box");
    if (staffTool) staffTool.hidden = !myRanksCache.includes("Staff");
    if (myOffersBox) myOffersBox.hidden = !myOwnedTeamCache;
    if (negotiationsBox) negotiationsBox.hidden = !myOwnedTeamCache;

    const tasks = [renderFreeAgents(), renderMarketFeed(), renderFreeAgentCard(), renderMarketListings()];
    if (myOwnedTeamCache) {
      tasks.push(renderMyOffers());
      tasks.push(renderNegotiations());
    }
    await Promise.all(tasks);
  }

  // Da una pista de lo razonable que es un precio comparado con el precio
  // pedido originalmente por el club vendedor.
  function priceHint(askingPrice, proposedPrice) {
    if (!askingPrice || !proposedPrice) return "";
    const ratio = proposedPrice / askingPrice;
    if (ratio < 0.6) return "No creo que el club acepte eso.";
    if (ratio > 1.5) return "Creo que te estás pasando con la oferta.";
    return "Un precio aceptable.";
  }

  async function renderMarketListings() {
    const list = document.getElementById("market-listings-list");
    if (!list) return;
    list.innerHTML = `<div class="market-empty">Cargando…</div>`;

    let listings = [];
    try { listings = await db.getMarketListings(); } catch (e) { console.error("[IFL] Error cargando el mercado de traspasos:", e); }

    if (!listings.length) {
      list.innerHTML = '<div class="market-empty">Ningún club ha puesto jugadores a la venta ahora mismo.</div>';
      return;
    }

    const myTeamId = myOwnedTeamCache ? myOwnedTeamCache.team.id : null;

    list.innerHTML = listings.map((l) => `
      <div class="market-player-row" data-player-profile="${l.player.id}" style="cursor:pointer;">
        ${robloxAvatarHTML(l.player)}
        <div class="market-player-row__body">
          <div class="market-player-row__name">${escapeHTML(playerDisplayName(l.player))}</div>
          <div class="market-player-row__meta">
            <span class="market-player-row__tag">${escapeHTML(l.team.name)}</span>
            ${l.player.position ? `<span class="market-player-row__tag">${escapeHTML(l.player.position)}</span>` : ""}
          </div>
        </div>
        <span class="transfer-row__price" style="margin-left:0;">€${Number(l.asking_price).toLocaleString("es-ES")}</span>
        ${myTeamId && myTeamId !== l.team_id ? `<button type="button" class="btn-market btn-market--small" data-negotiate="${l.id}">Negociar precio</button>` : ""}
        ${myTeamId && myTeamId === l.team_id ? `<button type="button" class="btn-market btn-market--small btn-market--ghost" data-retire-listing="${l.id}">Quitar de la venta</button>` : ""}
      </div>
      ${myTeamId && myTeamId !== l.team_id ? `
        <div class="market-offer-box" id="negotiate-form-${l.id}" hidden>
          <input type="number" min="0" step="0.01" class="market-input" id="negotiate-price-${l.id}" placeholder="Tu oferta (€)" style="max-width:200px;">
          <button type="button" class="btn-market btn-market--small" data-send-offer="${l.id}">Enviar oferta</button>
          <span class="market-code-box__hint" id="negotiate-hint-${l.id}"></span>
        </div>
      ` : ""}
    `).join("");

    list.querySelectorAll("[data-player-profile]").forEach((row) => {
      row.addEventListener("click", (e) => {
        if (e.target.closest("button") || e.target.closest(".market-offer-box")) return;
        openPlayerStatsModal(row.getAttribute("data-player-profile"));
      });
    });

    list.querySelectorAll("[data-negotiate]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const box = document.getElementById("negotiate-form-" + btn.getAttribute("data-negotiate"));
        if (box) box.hidden = !box.hidden;
      });
    });

    list.querySelectorAll("[id^='negotiate-price-']").forEach((input) => {
      const listingId = input.id.replace("negotiate-price-", "");
      const listing = listings.find((l) => l.id === listingId);
      input.addEventListener("input", () => {
        const hintEl = document.getElementById("negotiate-hint-" + listingId);
        const val = parseFloat(input.value);
        if (hintEl) hintEl.textContent = val > 0 ? priceHint(listing.asking_price, val) : "";
      });
    });

    list.querySelectorAll("[data-send-offer]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const listingId = btn.getAttribute("data-send-offer");
        const listing = listings.find((l) => l.id === listingId);
        const priceInput = document.getElementById("negotiate-price-" + listingId);
        const price = parseFloat(priceInput?.value);
        if (!price || price <= 0) { alert("Introduce un precio válido."); return; }
        if (!myOwnedTeamCache || !listing) return;

        btn.disabled = true;
        try {
          await db.startNegotiation({
            listingId: listing.id,
            playerId: listing.player.id,
            sellerTeamId: listing.team_id,
            buyerTeamId: myOwnedTeamCache.team.id,
            askingPrice: listing.asking_price,
            offerPrice: price,
          });
          alert("Oferta enviada al club. Te avisará este panel en cuanto responda.");
          await renderNegotiations();
        } catch (err) {
          console.error("[IFL] Error enviando la oferta de traspaso:", err);
          alert("No se pudo enviar la oferta.");
          btn.disabled = false;
        }
      });
    });

    list.querySelectorAll("[data-retire-listing]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        btn.disabled = true;
        try {
          await db.retireListing(btn.getAttribute("data-retire-listing"));
          await renderMarketListings();
        } catch (err) {
          console.error(err);
          alert("No se pudo quitar de la venta.");
          btn.disabled = false;
        }
      });
    });
  }

  const NEGOTIATION_STATUS_LABEL = {
    pendiente: "Pendiente",
    aceptada_pendiente_admin: "Aceptada · esperando a la administración",
    aceptada: "✅ Traspaso completado",
    rechazada: "❌ Rechazada",
  };

  async function renderNegotiations() {
    const list = document.getElementById("market-negotiations-list");
    if (!list || !myOwnedTeamCache) return;
    const myTeamId = myOwnedTeamCache.team.id;

    let negs = [];
    try { negs = await db.getMyNegotiations(myTeamId); } catch (e) { console.error("[IFL] Error cargando negociaciones:", e); }

    if (!negs.length) {
      list.innerHTML = '<div class="market-empty">No tienes negociaciones abiertas.</div>';
      return;
    }

    list.innerHTML = negs.map((n) => {
      const isSeller = n.seller_team_id === myTeamId;
      const myRole = isSeller ? "seller" : "buyer";
      const otherTeam = isSeller ? n.buyer_team : n.seller_team;
      const myTurn = n.status === "pendiente" && n.turn === myRole;
      const roleLabel = isSeller ? "Venden a" : "Quieren comprar a";

      let actionsHTML = "";
      if (myTurn) {
        actionsHTML = `
          <div class="market-offer-box" style="padding-left:0;">
            <button type="button" class="btn-market btn-market--small" data-neg-accept="${n.id}">Aceptar</button>
            <button type="button" class="btn-market btn-market--small btn-market--danger" data-neg-reject="${n.id}">Rechazar</button>
            <button type="button" class="btn-market btn-market--small btn-market--ghost" data-neg-counter-toggle="${n.id}">Contraoferta</button>
          </div>
          <div class="market-offer-box" id="neg-counter-form-${n.id}" hidden style="padding-left:0;">
            <input type="number" min="0" step="0.01" class="market-input" id="neg-counter-price-${n.id}" placeholder="Tu contraoferta (€)" style="max-width:200px;">
            <button type="button" class="btn-market btn-market--small" data-neg-counter-send="${n.id}">Enviar contraoferta</button>
            <span class="market-code-box__hint" id="neg-counter-hint-${n.id}"></span>
          </div>
        `;
      } else if (n.status === "pendiente") {
        actionsHTML = `<p class="market-code-box__hint" style="margin:6px 0 0;">Esperando respuesta de ${escapeHTML(otherTeam ? otherTeam.name : "el otro club")}.</p>`;
      }

      return `
        <div class="market-player-row" style="align-items:flex-start;">
          ${robloxAvatarHTML(n.player)}
          <div class="market-player-row__body">
            <div class="market-player-row__name">${roleLabel} ${escapeHTML(playerDisplayName(n.player))}</div>
            <div class="market-player-row__meta">
              ${otherTeam ? escapeHTML(otherTeam.name) : ""} · Precio actual: €${Number(n.current_price).toLocaleString("es-ES")}
              (pedido: €${Number(n.asking_price).toLocaleString("es-ES")})
            </div>
            <span class="badge-pill ${n.status === "aceptada" ? "badge-pill--accepted" : n.status === "rechazada" ? "badge-pill--rejected" : "badge-pill--pending"}" style="margin-top:6px;display:inline-block;">
              ${NEGOTIATION_STATUS_LABEL[n.status] || n.status}
            </span>
            ${actionsHTML}
            ${n.status === "aceptada" && n.code ? `
              <div class="market-code-box">
                <p class="market-code-box__hint" style="margin:0;">Código de registro</p>
                <p class="market-code-box__value">${escapeHTML(n.code)}</p>
                <p class="market-code-box__hint">Pasa este código y su contrato para poder registrarlo.</p>
              </div>
            ` : ""}
          </div>
        </div>
      `;
    }).join("");

    list.querySelectorAll("[data-neg-accept]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        btn.disabled = true;
        try {
          await db.respondNegotiation(btn.getAttribute("data-neg-accept"), "accept");
          await renderNegotiations();
        } catch (err) { console.error(err); alert("No se pudo aceptar."); btn.disabled = false; }
      });
    });

    list.querySelectorAll("[data-neg-reject]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        if (!confirm("¿Rechazar esta negociación?")) return;
        btn.disabled = true;
        try {
          await db.respondNegotiation(btn.getAttribute("data-neg-reject"), "reject");
          await renderNegotiations();
        } catch (err) { console.error(err); alert("No se pudo rechazar."); btn.disabled = false; }
      });
    });

    list.querySelectorAll("[data-neg-counter-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const box = document.getElementById("neg-counter-form-" + btn.getAttribute("data-neg-counter-toggle"));
        if (box) box.hidden = !box.hidden;
      });
    });

    list.querySelectorAll("[id^='neg-counter-price-']").forEach((input) => {
      const negId = input.id.replace("neg-counter-price-", "");
      const neg = negs.find((n) => n.id === negId);
      input.addEventListener("input", () => {
        const hintEl = document.getElementById("neg-counter-hint-" + negId);
        const val = parseFloat(input.value);
        if (hintEl && neg) hintEl.textContent = val > 0 ? priceHint(neg.asking_price, val) : "";
      });
    });

    list.querySelectorAll("[data-neg-counter-send]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const negId = btn.getAttribute("data-neg-counter-send");
        const priceInput = document.getElementById("neg-counter-price-" + negId);
        const price = parseFloat(priceInput?.value);
        if (!price || price <= 0) { alert("Introduce un precio válido."); return; }

        btn.disabled = true;
        try {
          await db.respondNegotiation(negId, "counter", price);
          await renderNegotiations();
        } catch (err) { console.error(err); alert("No se pudo enviar la contraoferta."); btn.disabled = false; }
      });
    });
  }

  // Panel "Free Agent": solo para quien no tiene equipo (ni es Team Owner
  // ni tiene un contrato activo en ningún club). Hay que declararse antes
  // de poder rellenar la trayectoria/posición.
  let freeAgentCardWired = false;

  async function renderFreeAgentCard() {
    const card = document.getElementById("market-free-agent-card");
    if (!card) return;

    if (myOwnedTeamCache) { card.hidden = true; return; }

    let alreadySigned = false;
    try { alreadySigned = await db.hasActiveContract(currentDiscordId); } catch (e) { console.error(e); }
    if (alreadySigned) { card.hidden = true; return; }

    let me = null;
    try { me = await db.getPlayerByDiscordId(currentDiscordId); } catch (e) { console.error(e); }
    card.hidden = false;

    const displayName = me ? playerDisplayName(me) : (userInfo?.textContent || "").replace("Sesión iniciada como ", "");

    if (!me || !me.is_free_agent) {
      card.innerHTML = `
        <div class="market-card__title">🆓 Free Agent</div>
        <p class="market-code-box__hint" style="position:relative;z-index:1;margin:0 0 14px;">
          No tienes equipo ahora mismo. Declárate como agente libre para aparecer en "Jugadores disponibles"
          y que cualquier Team Owner pueda ofertar por ti.
        </p>
        <button type="button" class="btn-market" id="free-agent-declare" style="position:relative;z-index:1;">Declararse como Agente Libre</button>
      `;
      document.getElementById("free-agent-declare")?.addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          await db.declareFreeAgent(currentDiscordId);
          await renderFreeAgentCard();
          await renderFreeAgents();
        } catch (err) {
          console.error("[IFL] Error al declararse agente libre:", err);
          alert("No se pudo completar la declaración.");
          btn.disabled = false;
        }
      });
      return;
    }

    card.innerHTML = `
      <div class="market-card__title">🆓 Eres Free Agent</div>
      <div style="display:grid;gap:14px;position:relative;z-index:1;">
        <div>
          <span class="market-label">Nombre</span>
          <p style="margin:4px 0 0;color:var(--white);font-weight:700;font-family:var(--font-hub);">${escapeHTML(displayName)}</p>
        </div>
        <div>
          <span class="market-label">Trayectoria en esta liga o en otras</span>
          <textarea id="free-agent-career" class="market-textarea" placeholder="Cuenta en qué clubes has jugado, tu experiencia…" style="margin-top:6px;">${escapeHTML(me.career_summary || "")}</textarea>
        </div>
        <div>
          <span class="market-label">Posición</span>
          <select id="free-agent-position" class="market-select" style="margin-top:6px;max-width:240px;">
            <option value="">Sin especificar</option>
            <option value="Portero">Portero</option>
            <option value="Defensa">Defensa</option>
            <option value="Centrocampista">Centrocampista</option>
            <option value="Delantero">Delantero</option>
          </select>
        </div>
        <div>
          <button type="button" class="btn-market" id="free-agent-save">Guardar mi perfil</button>
          <span id="free-agent-status" style="margin-left:10px;font-size:12px;color:var(--gray-3, #56585f);" hidden></span>
        </div>
      </div>
    `;
    const positionSelect = document.getElementById("free-agent-position");
    if (positionSelect) positionSelect.value = me.position || "";

    document.getElementById("free-agent-save")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      const careerInput = document.getElementById("free-agent-career");
      const statusEl = document.getElementById("free-agent-status");
      btn.disabled = true;
      try {
        await db.updateMyFreeAgentProfile(currentDiscordId, {
          position: positionSelect?.value || "",
          careerSummary: careerInput?.value.trim() || "",
        });
        if (statusEl) { statusEl.hidden = false; statusEl.textContent = "Guardado ✅"; setTimeout(() => (statusEl.hidden = true), 2200); }
        await renderFreeAgents();
      } catch (err) {
        console.error("[IFL] Error guardando el perfil de Free Agent:", err);
        if (statusEl) { statusEl.hidden = false; statusEl.textContent = "❌ No se pudo guardar."; }
      } finally {
        btn.disabled = false;
      }
    });
  }

  // Modal de estadísticas al hacer clic en un jugador del mercado
  // (sin asistencias, tal como en el resto de la web).
  async function openPlayerStatsModal(playerId) {
    let modal = document.getElementById("player-stats-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "player-stats-modal";
      modal.className = "ifl-modal";
      modal.innerHTML = '<div class="ifl-modal__overlay"></div><div class="ifl-modal__box" id="player-stats-modal-box"></div>';
      document.body.appendChild(modal);
      modal.querySelector(".ifl-modal__overlay").addEventListener("click", () => (modal.hidden = true));
    }

    const box = document.getElementById("player-stats-modal-box");
    box.innerHTML = `<button type="button" class="ifl-modal__close" id="player-stats-modal-close">&times;</button><div class="market-empty">Cargando…</div>`;
    modal.hidden = false;
    document.getElementById("player-stats-modal-close").addEventListener("click", () => (modal.hidden = true));

    let profile = null;
    try { profile = await db.getPlayerPublicProfile(playerId); } catch (e) { console.error(e); }
    if (!profile) { box.innerHTML = `<button type="button" class="ifl-modal__close" id="player-stats-modal-close2">&times;</button><p class="market-empty">No se encontró ese jugador.</p>`; document.getElementById("player-stats-modal-close2")?.addEventListener("click", () => (modal.hidden = true)); return; }

    const { player, isPublic, stats } = profile;
    const avatarHTML = player.avatar_url
      ? `<img src="${escapeHTML(player.avatar_url)}" class="career-avatar" alt="" style="margin:0 auto 14px;">`
      : `<div class="career-avatar" style="margin:0 auto 14px;display:flex;align-items:center;justify-content:center;background:var(--accent);font-family:var(--font-display);font-weight:700;font-size:32px;">${escapeHTML(playerDisplayName(player).charAt(0).toUpperCase())}</div>`;

    box.innerHTML = `
      <button type="button" class="ifl-modal__close" id="player-stats-modal-close3">&times;</button>
      <div style="text-align:center;">
        ${avatarHTML}
        <h2 class="ifl-modal__title" style="justify-content:center;">${escapeHTML(playerDisplayName(player))}</h2>
        ${player.position ? `<span class="market-player-row__tag">${escapeHTML(player.position)}</span>` : ""}
      </div>
      ${player.career_summary ? `<p class="view-lead" style="margin-top:14px;">${escapeHTML(player.career_summary)}</p>` : ""}
      ${isPublic ? `
        <div class="stat-grid" style="margin-top:20px;">
          <div class="stat-tile"><span class="stat-tile__value">${stats.goles}</span><span class="stat-tile__label">Goles</span></div>
          <div class="stat-tile"><span class="stat-tile__value">${stats.partidos_jugados}</span><span class="stat-tile__label">Partidos jugados</span></div>
          <div class="stat-tile"><span class="stat-tile__value">${stats.tarjetas_amarillas}</span><span class="stat-tile__label">Tarjetas amarillas</span></div>
          <div class="stat-tile"><span class="stat-tile__value">${stats.tarjetas_rojas}</span><span class="stat-tile__label">Tarjetas rojas</span></div>
          <div class="stat-tile"><span class="stat-tile__value">${stats.mvps}</span><span class="stat-tile__label">MVPs</span></div>
        </div>
      ` : `<p class="ifl-modal__meta" style="margin-top:14px;">Este jugador tiene el perfil privado.</p>`}
    `;
    document.getElementById("player-stats-modal-close3")?.addEventListener("click", () => (modal.hidden = true));
  }

  async function renderFreeAgents() {
    const list = document.getElementById("market-free-agents-list");
    if (!list) return;
    list.innerHTML = `<div class="market-empty">Cargando…</div>`;

    let agents = [];
    try { agents = await db.getFreeAgents(); } catch (e) { console.error("[IFL] Error cargando agentes libres:", e); }

    if (!agents.length) {
      list.innerHTML = '<div class="market-empty">No hay jugadores libres ahora mismo.</div>';
      return;
    }

    list.innerHTML = agents.map((p) => `
      <div class="market-player-row" data-player-profile="${p.id}" style="cursor:pointer;">
        ${robloxAvatarHTML(p)}
        <div class="market-player-row__body">
          <div class="market-player-row__name">${escapeHTML(playerDisplayName(p))}</div>
          <div class="market-player-row__meta">
            <span class="market-player-row__tag">Agente libre · Gratis</span>
            ${p.position ? `<span class="market-player-row__tag">${escapeHTML(p.position)}</span>` : ""}
            ${p.career_summary ? `<div style="margin-top:5px;">${escapeHTML(p.career_summary)}</div>` : ""}
          </div>
        </div>
        ${myOwnedTeamCache ? `<button type="button" class="btn-market btn-market--small" data-sign-free="${p.id}">Fichar gratis</button>` : ""}
      </div>
    `).join("");

    list.querySelectorAll("[data-player-profile]").forEach((row) => {
      row.addEventListener("click", (e) => {
        if (e.target.closest("[data-sign-free]")) return;
        openPlayerStatsModal(row.getAttribute("data-player-profile"));
      });
    });

    list.querySelectorAll("[data-sign-free]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!myOwnedTeamCache) return;
        if (!confirm("¿Fichar a este jugador gratis para tu club? Quedará pendiente de aprobación por la administración.")) return;

        btn.disabled = true;
        try {
          await db.createMarketOffer({
            playerId: btn.getAttribute("data-sign-free"),
            teamId: myOwnedTeamCache.team.id,
            price: 0,
            buyerDiscordId: currentDiscordId,
            buyerDiscordUsername: (userInfo?.textContent || "").replace("Sesión iniciada como ", ""),
          });
          alert("Fichaje enviado. La administración tiene que aceptarlo para que se haga efectivo.");
          await renderFreeAgents();
          await renderMyOffers();
        } catch (e) {
          console.error("[IFL] Error enviando el fichaje:", e);
          alert("No se pudo enviar el fichaje.");
          btn.disabled = false;
        }
      });
    });
  }

  async function renderMarketFeed() {
    const list = document.getElementById("market-feed-list");
    if (!list) return;
    list.innerHTML = `<div class="market-empty">Cargando…</div>`;

    let feed = [];
    try { feed = await db.getMarketFeed(20); } catch (e) { console.error("[IFL] Error cargando el mercado:", e); }

    if (!feed.length) {
      list.innerHTML = '<div class="market-empty">Todavía no se ha cerrado ningún fichaje.</div>';
      return;
    }

    list.innerHTML = feed.map((o) => `
      <div class="transfer-row">
        <div class="transfer-row__club">
          ${o.from_team
            ? (o.from_team.logo_url ? `<img src="${escapeHTML(o.from_team.logo_url)}" class="team-crest team-crest--small">` : "") + escapeHTML(o.from_team.name)
            : `<span class="is-muted">Agente libre</span>`}
        </div>
        <span class="transfer-row__arrow">→</span>
        <div class="transfer-row__club">
          ${o.team.logo_url ? `<img src="${escapeHTML(o.team.logo_url)}" class="team-crest team-crest--small">` : ""}${escapeHTML(o.team.name)}
        </div>
        <div class="transfer-row__player">
          ${robloxAvatarHTML(o.player, "team-crest")}${escapeHTML(playerDisplayName(o.player))}
        </div>
        <span class="transfer-row__price">€${Number(o.price).toLocaleString("es-ES")}</span>
        <span class="transfer-row__date">${o.resolved_at ? new Date(o.resolved_at).toLocaleDateString("es-ES") : ""}</span>
      </div>
    `).join("");
  }

  async function renderMyOffers() {
    const list = document.getElementById("market-my-offers-list");
    if (!list) return;

    let offers = [];
    try { offers = await db.getMyMarketOffers(currentDiscordId); } catch (e) { console.error("[IFL] Error cargando tus fichajes:", e); }

    if (!offers.length) {
      list.innerHTML = '<div class="market-empty">Todavía no has hecho ninguna oferta.</div>';
      return;
    }

    const statusLabel = { pendiente: "Pendiente", aceptado: "Aceptada", rechazado: "Rechazada" };
    const statusClass = { pendiente: "badge-pill--pending", aceptado: "badge-pill--accepted", rechazado: "badge-pill--rejected" };

    list.innerHTML = offers.map((o) => `
      <div class="market-player-row" style="align-items:flex-start;">
        ${robloxAvatarHTML(o.player)}
        <div class="market-player-row__body">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span class="market-player-row__name">${escapeHTML(playerDisplayName(o.player))}</span>
            <span class="badge-pill ${statusClass[o.status] || ""}">${statusLabel[o.status] || o.status}</span>
          </div>
          <div class="market-player-row__meta">€${Number(o.price).toLocaleString("es-ES")} · ${new Date(o.created_at).toLocaleDateString("es-ES")}</div>
          ${o.status === "aceptado" && o.code ? `
            <div class="market-code-box">
              <p class="market-code-box__hint" style="margin:0;">Código de registro</p>
              <p class="market-code-box__value">${escapeHTML(o.code)}</p>
              <p class="market-code-box__hint">Pasa este código y su contrato para poder registrarlo.</p>
            </div>
          ` : ""}
        </div>
      </div>
    `).join("");
  }

  const marketCodeSearchBtn = document.getElementById("market-code-search");
  if (marketCodeSearchBtn) {
    marketCodeSearchBtn.addEventListener("click", async () => {
      const input = document.getElementById("market-code-input");
      const resultBox = document.getElementById("market-code-result");
      const code = input?.value.trim();
      if (!code || !resultBox) return;

      resultBox.innerHTML = '<p class="market-empty" style="padding:8px 0;">Buscando…</p>';
      let offer = null;
      try { offer = await db.getMarketOfferByCode(code); } catch (e) { console.error("[IFL] Error buscando el código:", e); }

      if (!offer) {
        resultBox.innerHTML = '<p class="market-code-box__hint" style="margin:0;">No se encontró ningún fichaje aceptado con ese código.</p>';
        return;
      }

      resultBox.innerHTML = `
        <div class="market-code-box" style="border-style:solid;">
          <p style="color:var(--white);font-weight:700;margin:0 0 6px;font-family:var(--font-hub);">${escapeHTML(playerDisplayName(offer.player))}</p>
          <p class="market-code-box__hint">Club: ${escapeHTML(offer.team.name)} · Precio: €${Number(offer.price).toLocaleString("es-ES")}</p>
          <p class="market-code-box__hint">Fecha: ${offer.resolved_at ? new Date(offer.resolved_at).toLocaleDateString("es-ES") : ""}</p>
          <p class="market-code-box__hint" style="margin-top:8px;">Pasa este código y su contrato para poder registrarlo.</p>
        </div>
      `;
    });
  }

  async function checkClubOwnership() {
    const link = document.getElementById("my-club-menu-link");
    if (!link || !currentDiscordId) return;
    try {
      myOwnedTeamCache = await db.getMyOwnedTeam(currentDiscordId);
    } catch (e) {
      console.error("[IFL] Error comprobando propiedad de club:", e);
      myOwnedTeamCache = null;
    }
    link.hidden = !myOwnedTeamCache;
  }

  // Rellena la columna "Venta" de la tabla de Mi Club: si el jugador ya
  // está en venta, muestra el precio + botón de quitarlo; si no, un botón
  // para ponerlo a la venta con un precio.
  async function renderClubSaleCells(teamId, contracts) {
    let listings = [];
    try { listings = await db.getMarketListings(); } catch (e) { console.error(e); }
    const byPlayer = {};
    listings.filter((l) => l.team_id === teamId).forEach((l) => { byPlayer[l.player.id] = l; });

    contracts.forEach((c) => {
      const cell = document.querySelector(`[data-sale-cell="${c.player.id}"]`);
      if (!cell) return;
      const listing = byPlayer[c.player.id];

      if (listing) {
        cell.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span class="market-player-row__tag">En venta · €${Number(listing.asking_price).toLocaleString("es-ES")}</span>
            <button type="button" class="btn-market btn-market--small btn-market--ghost" data-retire-my-listing="${listing.id}">Quitar</button>
          </div>
        `;
        cell.querySelector("[data-retire-my-listing]")?.addEventListener("click", async (e) => {
          e.target.disabled = true;
          try { await db.retireListing(listing.id); await renderMyClub(); } catch (err) { console.error(err); alert("No se pudo quitar de la venta."); }
        });
      } else {
        cell.innerHTML = `
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <input type="number" min="0" step="0.01" class="market-input" id="sale-price-${c.player.id}" placeholder="Precio €" style="max-width:110px;">
            <button type="button" class="btn-market btn-market--small" data-list-player="${c.player.id}">Poner en venta</button>
          </div>
        `;
        cell.querySelector("[data-list-player]")?.addEventListener("click", async (e) => {
          const priceInput = document.getElementById("sale-price-" + c.player.id);
          const price = parseFloat(priceInput?.value);
          if (!price || price <= 0) { alert("Introduce un precio válido."); return; }
          e.target.disabled = true;
          try {
            await db.createListing({ playerId: c.player.id, teamId, askingPrice: price });
            await renderMyClub();
          } catch (err) {
            console.error(err);
            alert("No se pudo poner en venta.");
            e.target.disabled = false;
          }
        });
      }
    });
  }

  async function renderMyClub() {
    const box = document.getElementById("club-card-box");
    if (!box) return;

    if (!myOwnedTeamCache) {
      try { myOwnedTeamCache = await db.getMyOwnedTeam(currentDiscordId); } catch (e) { console.error(e); }
    }

    if (!myOwnedTeamCache) {
      box.innerHTML = `
        <h2 class="dashboard__title">Mi club</h2>
        <div class="locked-card">
          <span class="locked-card__icon" aria-hidden="true">🔒</span>
          <p class="locked-card__text">Esta sección es solo para el propietario (Team Owner) de un club.</p>
        </div>
      `;
      return;
    }

    const { team, stadium } = myOwnedTeamCache;
    let contracts = [];
    try { contracts = await db.getContractsByTeam(team.id); } catch (e) { console.error(e); }

    const founded = new Date(team.created_at).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" });

    box.innerHTML = `
      <div class="club-hero" ${stadium?.image_url ? `style="background-image:url('${escapeHTML(stadium.image_url)}')"` : ""}>
        ${stadium?.image_url ? `<div class="club-hero__overlay"></div>` : ""}
        <div class="club-hero__content">
          ${team.logo_url ? `<img src="${escapeHTML(team.logo_url)}" class="club-hero__logo" alt="">` : ""}
          <h2 class="club-hero__name">${escapeHTML(team.name)}</h2>
          <p class="club-hero__meta">Fundado el ${founded}${stadium ? " · Juega en " + escapeHTML(stadium.name) : ""}</p>
        </div>
        <div class="club-hero__budget">
          <small>Presupuesto</small>
          <span>€${Number(team.budget).toLocaleString("es-ES")}</span>
        </div>
      </div>

      <div class="market-card" style="margin-top:20px;">
        <p class="market-card__title" style="margin-bottom:10px;">Descripción del club</p>
        <textarea id="club-description-input" class="market-textarea" rows="3" placeholder="Escribe algo sobre tu club…">${escapeHTML(team.description || "")}</textarea>
        <div style="margin-top:12px;display:flex;align-items:center;gap:10px;">
          <button type="button" class="btn-market" id="club-description-save">Guardar descripción</button>
          <span id="club-description-status" style="font-size:12.5px;color:var(--gray-3, #56585f);" hidden></span>
        </div>
      </div>

      <h3 class="table-heading">Contratos del club</h3>
      <div class="table-wrap">
        <table class="standings">
          <thead><tr><th>Jugador</th><th>Precio</th><th>Firmado</th><th>Estado</th><th>Venta</th></tr></thead>
          <tbody>
            ${contracts.map((c) => `
              <tr class="club-contract-row" data-player-id="${c.player.id}">
                <td class="standings__club" style="cursor:pointer;">${escapeHTML(playerDisplayName(c.player))}</td>
                <td class="is-num">€${Number(c.price).toLocaleString("es-ES")}</td>
                <td class="is-muted">T${c.signed_season}</td>
                <td><span class="badge-state badge-state--active">${escapeHTML(c.status)}</span></td>
                <td data-sale-cell="${c.player.id}">—</td>
              </tr>
            `).join("") || '<tr><td colspan="5" class="admin-table-empty">Todavía no hay contratos en tu club.</td></tr>'}
          </tbody>
        </table>
      </div>
      <p class="admin-form__note" style="margin-top:14px;">
        Como Team Owner puedes ver tu plantilla y su coste, pero solo la administración puede añadir o quitar contratos.
        Puedes poner a tus jugadores a la venta para que otros clubs negocien por ellos en el Mercado.
      </p>
    `;

    document.getElementById("club-description-save")?.addEventListener("click", async () => {
      const val = document.getElementById("club-description-input").value.trim();
      const status = document.getElementById("club-description-status");
      try {
        await db.updateTeamDescription(team.id, val);
        team.description = val;
        if (status) { status.hidden = false; status.textContent = "Guardado ✅"; setTimeout(() => (status.hidden = true), 2000); }
      } catch (err) {
        console.error(err);
        if (status) { status.hidden = false; status.textContent = "❌ No se pudo guardar."; }
      }
    });

    box.querySelectorAll(".club-contract-row .standings__club").forEach((cell) => {
      cell.addEventListener("click", () => {
        const row = cell.closest("[data-player-id]");
        showView("buscar");
        navLinks.forEach((l) => l.classList.toggle("is-active", l.dataset.view === "buscar"));
        setTimeout(() => showPlayerProfile(row.getAttribute("data-player-id")), 150);
      });
    });

    renderClubSaleCells(team.id, contracts);
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
    if (name === "clasificacion") renderStandings("season");
    if (name === "inicio") renderUpcomingMatches();
    if (name === "estadios") renderStadiums();
    if (name === "carrera") renderCareer();
    if (name === "premios") renderPremios();
    if (name === "club") renderMyClub();
    if (name === "mercado") renderMercado();
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
          const homeCrest = m.home_team && m.home_team.logo_url ? `<img src="${escapeHTML(m.home_team.logo_url)}" alt="" class="match-chip__crest">` : "";
          const awayCrest = m.away_team && m.away_team.logo_url ? `<img src="${escapeHTML(m.away_team.logo_url)}" alt="" class="match-chip__crest">` : "";
          const scoreText =
            m.status === "jugado" ? `${m.home_goals}-${m.away_goals}` : "vs";
          chip.innerHTML = `${homeCrest}<span>${escapeHTML(homeCode)} ${scoreText} ${escapeHTML(awayCode)}</span>${awayCrest}`;
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
    const home = match.home_team ? escapeHTML(match.home_team.name) : "Por confirmar";
    const away = match.away_team ? escapeHTML(match.away_team.name) : "Por confirmar";
    const homeCrest = match.home_team && match.home_team.logo_url ? `<img src="${escapeHTML(match.home_team.logo_url)}" alt="" class="ifl-modal__crest">` : "";
    const awayCrest = match.away_team && match.away_team.logo_url ? `<img src="${escapeHTML(match.away_team.logo_url)}" alt="" class="ifl-modal__crest">` : "";
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
          ? `<button type="button" class="btn-ghost" id="match-modal-stadium-btn">Ver estadio: ${escapeHTML(stadium.name)}</button>`
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
  // CLASIFICACIÓN (calculada de verdad, con pestañas Temporada / Total)
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
      const crest = r.team.logo_url ? `<img src="${escapeHTML(r.team.logo_url)}" alt="" class="team-crest team-crest--small">` : "";
      const diff = r.gf - r.gc;
      body += `
        <tr>
          <td class="standings__pos">${i + 1}</td>
          <td class="standings__club">${crest}${escapeHTML(r.team.name)}</td>
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

  async function renderStandings(scope) {
    scope = scope || "season";

    const seasonEl = document.getElementById("clasificacion-season");
    if (seasonEl) seasonEl.textContent = CURRENT_SEASON;
    const tabSeasonLabel = document.getElementById("clasif-tab-season");
    if (tabSeasonLabel) tabSeasonLabel.textContent = CURRENT_SEASON;

    const seasonArg = scope === "total" ? null : CURRENT_SEASON;

    try {
      const [primera, segunda] = await Promise.all([
        db.computeStandings(seasonArg, "primera"),
        db.computeStandings(seasonArg, "segunda"),
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

  const clasifTabsEl = document.querySelector("[data-clasif-tabs]");
  if (clasifTabsEl) {
    clasifTabsEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".premio-tab");
      if (!btn) return;
      clasifTabsEl.querySelectorAll(".premio-tab").forEach((b) => b.classList.toggle("is-active", b === btn));
      renderStandings(btn.dataset.tab);
    });
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
      card.className = "stadium-card2" + (s.image_url ? "" : " stadium-card2--noimg");
      if (s.image_url) card.style.backgroundImage = `url('${s.image_url}')`;
      card.innerHTML = `
        ${s.image_url ? `<div class="stadium-card2__overlay"></div>` : ""}
        <div class="stadium-card2__body">
          ${s.team && s.team.logo_url ? `<img src="${escapeHTML(s.team.logo_url)}" class="stadium-card2__crest" alt="">` : ""}
          <div class="stadium-card2__name">${escapeHTML(s.name)}</div>
          <div class="stadium-card2__meta">${s.team ? escapeHTML(s.team.name) : "Sin equipo asignado"}</div>
          <div class="stadium-card2__foot">
            ${s.city ? `<span>📍 ${escapeHTML(s.city)}</span>` : ""}
            ${s.capacity ? `<span>👥 ${s.capacity.toLocaleString("es-ES")}</span>` : ""}
          </div>
        </div>
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
      modal.innerHTML = '<div class="ifl-modal__overlay"></div><div class="ifl-modal__box ifl-modal__box--stadium" id="stadium-modal-box"></div>';
      document.body.appendChild(modal);
      modal.querySelector(".ifl-modal__overlay").addEventListener("click", () => (modal.hidden = true));
    }

    const box = document.getElementById("stadium-modal-box");
    const bannerStyle = stadium.image_url ? ` style="background-image:url('${escapeHTML(stadium.image_url)}')"` : "";
    box.innerHTML = `
      <button type="button" class="ifl-modal__close" id="stadium-modal-close">&times;</button>
      <div class="ifl-modal__stadium-banner"${bannerStyle}></div>
      <div class="ifl-modal__stadium-body">
        <h2 class="ifl-modal__title" style="justify-content:flex-start;">${escapeHTML(stadium.name)}</h2>
        <p class="ifl-modal__meta">${stadium.team ? "Estadio de " + escapeHTML(stadium.team.name) : "Sin equipo asignado"}</p>
        <p class="ifl-modal__meta">${escapeHTML(stadium.city || "")}${stadium.capacity ? " · " + stadium.capacity.toLocaleString("es-ES") + " asientos" : ""}</p>
        ${stadium.description ? `<p class="view-lead" style="margin-top:10px;">${escapeHTML(stadium.description)}</p>` : ""}
        ${stadium.roblox_game_url ? `<a href="${escapeHTML(stadium.roblox_game_url)}" target="_blank" rel="noopener" class="btn-market" style="margin-top:14px;text-decoration:none;">Abrir en Roblox</a>` : ""}
      </div>
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

    if (!career.player.avatar_url && career.player.roblox_username) {
      const robloxAvatar = await fetchRobloxAvatarUrl(career.player.roblox_username);
      if (robloxAvatar) {
        career.player.avatar_url = robloxAvatar;
        db.updateMyAvatar(currentDiscordId, robloxAvatar).catch((e) => console.warn("[IFL] No se pudo guardar el avatar automático:", e));
      }
    }

    const contractsHTML = contracts
      .map(
        (c) => `
        <div class="admin-row">
          <div class="admin-row__body">
            <div class="admin-row__name">${c.team ? escapeHTML(c.team.name) : "Club desconocido"}</div>
            <div class="admin-row__meta">Temporada ${c.signed_season} · ${escapeHTML(c.status)}</div>
          </div>
        </div>`
      )
      .join("");

    section.innerHTML = `
      <h2 class="dashboard__title">Mi carrera</h2>
      ${career.player.avatar_url ? `<img src="${escapeHTML(career.player.avatar_url)}" alt="" class="career-avatar">` : ""}
      <div class="stat-grid" style="margin-bottom:28px;">
        <div class="stat-tile"><span class="stat-tile__value">${stats.goles}</span><span class="stat-tile__label">Goles</span></div>
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

  const DIVISION_LABEL = { primera: "Primera División", segunda: "Segunda División" };

  function timeUntil(iso) {
    const diffMs = new Date(iso).getTime() - Date.now();
    if (diffMs <= 0) return "Muy pronto";
    const mins = Math.round(diffMs / 60000);
    if (mins < 60) return `Dentro de ${mins} min`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `Dentro de ${hours} h`;
    const days = Math.round(hours / 24);
    return `Dentro de ${days} día${days === 1 ? "" : "s"}`;
  }

  async function renderUpcomingMatches() {
    const list = document.getElementById("upcoming-matches-list");
    if (!list) return;
    list.innerHTML = `<div class="market-empty">Cargando…</div>`;

    let matches = [];
    try { matches = await db.getMatches(CURRENT_SEASON); } catch (e) { console.error("[IFL] Error cargando próximos partidos:", e); }

    const now = Date.now();
    const upcoming = matches
      .filter((m) => m.status === "programado" && m.scheduled_at && new Date(m.scheduled_at).getTime() > now)
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
      .slice(0, 6);

    if (!upcoming.length) {
      list.innerHTML = '<div class="market-empty">No hay partidos programados por ahora.</div>';
      return;
    }

    list.innerHTML = upcoming.map((m) => `
      <div class="upcoming-match-card">
        <div class="upcoming-match-card__crests">
          ${m.home_team && m.home_team.logo_url ? `<img src="${escapeHTML(m.home_team.logo_url)}" alt="">` : `<span class="upcoming-match-card__crest-empty"></span>`}
          <span class="upcoming-match-card__vs">VS</span>
          ${m.away_team && m.away_team.logo_url ? `<img src="${escapeHTML(m.away_team.logo_url)}" alt="">` : `<span class="upcoming-match-card__crest-empty"></span>`}
        </div>
        <div class="upcoming-match-card__meta">
          <span class="upcoming-match-card__countdown">${timeUntil(m.scheduled_at)}</span>
          <span>${new Date(m.scheduled_at).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" })}</span>
          ${m.stadium ? `<span>🏟️ ${escapeHTML(m.stadium.name)}</span>` : ""}
          ${m.home_team && m.home_team.division ? `<span>${escapeHTML(DIVISION_LABEL[m.home_team.division] || m.home_team.division)}</span>` : ""}
        </div>
      </div>
    `).join("");
  }

  // =================================
  // PREMIOS (goleadores, apariciones, dinero, victorias, trofeos)
  // =================================

  function leaderboardRows(entries, label, nameFn) {
    if (!entries.length) return `<div class="admin-panel__empty">Todavía no hay datos.</div>`;
    return entries.map((e, i) => `
      <div class="lb-row">
        <span class="lb-row__rank">${i + 1}</span>
        <div class="lb-row__body">
          <div class="lb-row__name">${escapeHTML(nameFn(e))}</div>
          ${e.team ? `<div class="lb-row__meta">${escapeHTML(e.team.name)}</div>` : ""}
        </div>
        <span class="lb-row__value">${e.count}${label ? " " + label : ""}</span>
      </div>
    `).join("");
  }

  function teamLeaderboardRows(entries, formatFn) {
    if (!entries.length) return `<div class="admin-panel__empty">Todavía no hay datos.</div>`;
    return entries.map((e, i) => `
      <div class="lb-row">
        <span class="lb-row__rank">${i + 1}</span>
        <div class="lb-row__body">
          <div class="lb-row__name">
            ${e.team.logo_url ? `<img src="${escapeHTML(e.team.logo_url)}" class="lb-row__crest" alt="">` : ""}
            ${escapeHTML(e.team.name)}
          </div>
        </div>
        <span class="lb-row__value">${formatFn(e)}</span>
      </div>
    `).join("");
  }

  function premioCard({ id, colorVar, icon, title, tabs }) {
    const tabsHTML = tabs
      ? `<div class="premio-tabs" data-premio="${id}">${tabs.map((t, i) => `<button type="button" class="premio-tab ${i === 0 ? "is-active" : ""}" data-tab="${t.key}">${t.label}</button>`).join("")}</div>`
      : "";
    return `
      <div class="division-card" style="--div-color:${colorVar};">
        <div class="division-card__glow"></div>
        <div class="division-card__head">
          <span class="division-card__badge">${icon}</span>
          <div>
            <h3 class="division-card__title">${title}</h3>
          </div>
        </div>
        ${tabsHTML}
        <div style="position:relative;z-index:1;" id="premio-body-${id}"></div>
      </div>
    `;
  }

  async function renderPremios() {
    const section = document.getElementById("view-premios");
    if (!section) return;

    section.innerHTML = `
      <div class="league-page-head">
        <img class="league-page-head__logo" src="images/IFL_Logo.png" alt="" onerror="this.style.display='none'">
        <div>
          <h2 class="league-page-head__title">Premios</h2>
          <p class="league-page-head__subtitle">Clasificaciones y trofeos, actualizados solos con cada resultado.</p>
        </div>
      </div>
    `;

    const board = document.createElement("div");
    board.className = "division-board-grid";
    board.style.marginTop = "24px";
    board.innerHTML =
      premioCard({ id: "scorers", colorVar: "#5865f2", icon: "⚽", title: "Máximos goleadores", tabs: [{ key: "season", label: "Temporada " + CURRENT_SEASON }, { key: "total", label: "Total" }] }) +
      premioCard({ id: "appearances", colorVar: "#3bd6ff", icon: "🎽", title: "Jugadores que más han jugado", tabs: [{ key: "season", label: "Temporada " + CURRENT_SEASON }, { key: "total", label: "Total" }] }) +
      premioCard({ id: "money", colorVar: "#22c55e", icon: "💰", title: "Clubs con más dinero", tabs: null }) +
      premioCard({ id: "wins", colorVar: "#eab308", icon: "🏆", title: "Clubs con más victorias", tabs: [{ key: "season", label: "Temporada " + CURRENT_SEASON }, { key: "total", label: "Total" }] });
    section.appendChild(board);

    async function loadScorers(scope) {
      const season = scope === "total" ? null : CURRENT_SEASON;
      const data = await db.getLeaderboard(season, "gol", 10);
      document.getElementById("premio-body-scorers").innerHTML = leaderboardRows(data, "goles", (e) => playerDisplayName(e.player));
    }
    async function loadAppearances(scope) {
      const season = scope === "total" ? null : CURRENT_SEASON;
      const data = await db.getLeaderboard(season, "presencia", 10);
      document.getElementById("premio-body-appearances").innerHTML = leaderboardRows(data, "partidos", (e) => playerDisplayName(e.player));
    }
    async function loadMoney() {
      const data = await db.getTeamsByBudget(10);
      const rows = data.map((t) => ({ team: t, budget: t.budget }));
      document.getElementById("premio-body-money").innerHTML = teamLeaderboardRows(rows, (e) => "€" + Number(e.budget).toLocaleString("es-ES"));
    }
    async function loadWins(scope) {
      const season = scope === "total" ? null : CURRENT_SEASON;
      const data = await db.computeTeamWins(season, 10);
      document.getElementById("premio-body-wins").innerHTML = teamLeaderboardRows(data, (e) => e.count + (e.count === 1 ? " victoria" : " victorias"));
    }

    try {
      await Promise.all([loadScorers("season"), loadAppearances("season"), loadMoney(), loadWins("season")]);
    } catch (e) {
      console.error("[IFL] Error cargando premios:", e);
    }

    board.querySelectorAll(".premio-tabs").forEach((tabsEl) => {
      const id = tabsEl.dataset.premio;
      tabsEl.addEventListener("click", (e) => {
        const btn = e.target.closest(".premio-tab");
        if (!btn) return;
        tabsEl.querySelectorAll(".premio-tab").forEach((b) => b.classList.toggle("is-active", b === btn));
        const scope = btn.dataset.tab;
        if (id === "scorers") loadScorers(scope);
        if (id === "appearances") loadAppearances(scope);
        if (id === "wins") loadWins(scope);
      });
    });

    // Trofeos personalizados (añadidos desde el panel de admin)
    let trophies = [];
    try { trophies = await db.getTrophies(); } catch (e) { console.error("[IFL] Error cargando trofeos:", e); }

    if (trophies.length) {
      const trophyHead = document.createElement("h3");
      trophyHead.className = "table-heading";
      trophyHead.style.marginTop = "28px";
      trophyHead.textContent = "Trofeos";
      section.appendChild(trophyHead);

      const trophyGrid = document.createElement("div");
      trophyGrid.className = "stat-grid";
      trophyGrid.innerHTML = trophies.map((t) => `
        <div class="stat-tile">
          <span class="stat-tile__value">${t.icon ? escapeHTML(t.icon) : "🏆"}</span>
          <span class="stat-tile__label">${escapeHTML(t.title)}${t.team ? " · " + escapeHTML(t.team.name) : ""}</span>
        </div>
      `).join("");
      section.appendChild(trophyGrid);
    }

    let playoffMatch = null;
    try { playoffMatch = await db.getPlayoffMatch(CURRENT_SEASON); } catch (e) { console.error(e); }

    if (playoffMatch) {
      const home = playoffMatch.home_team;
      const away = playoffMatch.away_team;
      const bracket = document.createElement("div");
      bracket.className = "division-card";
      bracket.style.cssText = "margin-top:22px;--div-color:#a855f7;text-align:center;padding:28px 22px;";
      bracket.innerHTML = `
        <div class="division-card__glow"></div>
        <h3 class="table-heading" style="margin-top:0;position:relative;z-index:1;">Playoff de ascenso (Segunda División)</h3>
        <div style="position:relative;z-index:1;display:flex;align-items:center;justify-content:center;gap:24px;flex-wrap:wrap;margin-top:10px;">
          <div style="text-align:center;">
            ${home?.logo_url ? `<img src="${escapeHTML(home.logo_url)}" class="ifl-modal__crest" style="width:52px;height:52px;">` : ""}
            <div style="font-family:var(--font-hub);font-weight:800;margin-top:8px;color:var(--white);">${home ? escapeHTML(home.name) : "?"}</div>
          </div>
          <div style="font-family:var(--font-hub);font-weight:800;font-size:30px;color:var(--white);">
            ${playoffMatch.status === "jugado" ? `${playoffMatch.home_goals} - ${playoffMatch.away_goals}` : "VS"}
          </div>
          <div style="text-align:center;">
            ${away?.logo_url ? `<img src="${escapeHTML(away.logo_url)}" class="ifl-modal__crest" style="width:52px;height:52px;">` : ""}
            <div style="font-family:var(--font-hub);font-weight:800;margin-top:8px;color:var(--white);">${away ? escapeHTML(away.name) : "?"}</div>
          </div>
        </div>
        <p class="ifl-modal__meta" style="margin-top:14px;position:relative;z-index:1;">${playoffMatch.status === "jugado" ? "Playoff finalizado" : "Partido único · pendiente de jugarse"}</p>
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
          <div class="notif-item__title">${escapeHTML(n.title)}</div>
          <div class="notif-item__meta">${escapeHTML(n.body || "")} · ${timeAgo(n.created_at)}</div>
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
    const visibilityToggle = document.getElementById("setting-public-profile");
    const visibilityNote = document.getElementById("profile-visibility-note");

    // showApp() puede llamarse más de una vez (onAuthStateChange también
    // dispara en refresh de token) — evitamos añadir listeners duplicados.
    if (visibilityToggle && visibilityToggle.dataset.wired === "1") return;

    let myPlayer = null;
    try {
      myPlayer = await db.getPlayerByDiscordId(currentDiscordId);
      if (!myPlayer) {
        // Cualquiera que inicie sesión tiene una ficha mínima, aunque
        // todavía no tenga contrato ni nombre de Roblox vinculado.
        const discordName = document.getElementById("settings-name")?.textContent || "Usuario";
        myPlayer = await db.findOrCreatePlayer({
          discordId: currentDiscordId,
          discordUsername: discordName,
          robloxUsername: null,
        });
      }
    } catch (e) {
      console.error("[IFL] Error preparando el perfil:", e);
    }

    if (!myPlayer) {
      if (visibilityNote) {
        visibilityNote.hidden = false;
        visibilityNote.textContent = "No se pudo cargar tu ficha de jugador. Prueba a recargar la página.";
      }
      if (visibilityToggle) visibilityToggle.disabled = true;
      return;
    }

    // La foto de perfil es siempre el avatar de Roblox del usuario vinculado
    // en su contrato — no hay subida manual. Si todavía no la tiene guardada,
    // se la ponemos ahora.
    if (!myPlayer.avatar_url && myPlayer.roblox_username) {
      const robloxAvatar = await fetchRobloxAvatarUrl(myPlayer.roblox_username);
      if (robloxAvatar) {
        try {
          await db.updateMyAvatar(currentDiscordId, robloxAvatar);
          myPlayer.avatar_url = robloxAvatar;
          const headerAvatar = document.getElementById("user-avatar");
          const headerFallback = document.getElementById("user-avatar-fallback");
          if (headerAvatar) { headerAvatar.src = robloxAvatar; headerAvatar.hidden = false; }
          if (headerFallback) headerFallback.hidden = true;
        } catch (e) {
          console.warn("[IFL] No se pudo guardar el avatar automático de Roblox:", e);
        }
      }
    }

    if (visibilityToggle) {
      visibilityToggle.disabled = false;
      visibilityToggle.dataset.wired = "1";
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
          <div class="player-result-row" data-player-id="${p.id}">
            ${p.avatar_url
              ? `<img src="${escapeHTML(p.avatar_url)}" class="player-result-row__avatar" alt="">`
              : `<span class="player-result-row__avatar player-result-row__avatar--fallback">${escapeHTML(playerDisplayName(p).charAt(0).toUpperCase())}</span>`}
            <div class="player-result-row__body">
              <div class="player-result-row__name">${escapeHTML(playerDisplayName(p))}</div>
              <div class="player-result-row__meta">${escapeHTML(p.discord_username)}</div>
            </div>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
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

    if (!player.avatar_url && player.roblox_username) {
      const robloxAvatar = await fetchRobloxAvatarUrl(player.roblox_username);
      if (robloxAvatar) player.avatar_url = robloxAvatar; // solo para mostrarlo aquí; no es "mi" jugador, no se puede guardar
    }

    const avatarHTML = player.avatar_url
      ? `<img src="${escapeHTML(player.avatar_url)}" class="career-avatar" alt="">`
      : `<div class="career-avatar" style="display:flex;align-items:center;justify-content:center;background:var(--accent);font-family:var(--font-display);font-weight:700;font-size:32px;">${escapeHTML(playerDisplayName(player).charAt(0).toUpperCase())}</div>`;

    if (!isPublic) {
      playerProfileBox.innerHTML = `
        <div class="locked-card">
          ${avatarHTML}
          <h3 style="margin:6px 0 0;color:var(--white);">${escapeHTML(playerDisplayName(player))}</h3>
          <p class="locked-card__text">Este usuario tiene desactivada la visualización del perfil.</p>
        </div>
      `;
      return;
    }

    const currentClub = contracts.find((c) => c.status === "ACTIVO");

    playerProfileBox.innerHTML = `
      <div class="locked-card" style="align-items:center;">
        ${avatarHTML}
        <h3 style="margin:6px 0 0;color:var(--white);">${escapeHTML(playerDisplayName(player))}</h3>
        <p class="ifl-modal__meta">${currentClub ? "Actualmente en " + escapeHTML(currentClub.team.name) : "Sin club actualmente"}</p>
      </div>
      <div class="stat-grid" style="margin-top:20px;">
        <div class="stat-tile"><span class="stat-tile__value">${stats.goles}</span><span class="stat-tile__label">Goles</span></div>
        <div class="stat-tile"><span class="stat-tile__value">${stats.partidos_jugados}</span><span class="stat-tile__label">Partidos jugados</span></div>
        <div class="stat-tile"><span class="stat-tile__value">${stats.tarjetas_amarillas}</span><span class="stat-tile__label">Tarjetas amarillas</span></div>
        <div class="stat-tile"><span class="stat-tile__value">${stats.tarjetas_rojas}</span><span class="stat-tile__label">Tarjetas rojas</span></div>
        <div class="stat-tile"><span class="stat-tile__value">${stats.mvps}</span><span class="stat-tile__label">MVPs</span></div>
      </div>
    `;
  }
});
