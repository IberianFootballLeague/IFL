/* =====================================
   IFL — TUTORIAL / ONBOARDING (carrusel)
   Se puede reabrir en cualquier momento y
   se usa tanto en index.html como en admin.html.
===================================== */

window.IFLOnboarding = (function () {
  "use strict";

  const SITE_SEEN_KEY = "ifl-tutorial-seen";
  const ADMIN_SEEN_KEY = "ifl-admin-welcome-seen";

  const SITE_PAGES = [
    {
      title: "Bienvenido a la IFL",
      icon: "⚽",
      body: "Esta es la plataforma oficial de la Iberian Football League: aquí puedes seguir la competición, ver el calendario, la clasificación y —si tienes contrato— tu propia carrera.",
    },
    {
      title: "Calendario y partidos",
      icon: "📅",
      body: "En Calendario verás todos los partidos programados. Toca cualquier partido para ver la hora, el resultado (si ya se ha jugado) y el estadio donde se disputa.",
    },
    {
      title: "Clasificación",
      icon: "🏆",
      body: "La clasificación de Primera y Segunda división se actualiza sola según se van registrando resultados. Los colores marcan las zonas de ascenso, playoff y descenso.",
    },
    {
      title: "Estadios",
      icon: "🏟️",
      body: "Consulta todos los estadios de la liga, a qué equipo pertenecen y su capacidad. Puedes llegar aquí también tocando el estadio desde un partido del calendario.",
    },
    {
      title: "Mi carrera",
      icon: "🧑‍💼",
      body: "Si tienes un contrato activo (o lo has tenido), aquí verás tus goles, asistencias, tarjetas, MVPs y partidos jugados, actualizados automáticamente tras cada resultado.",
    },
  ];

  const ADMIN_PAGES = [
    {
      title: "Bienvenido al panel de administración",
      icon: "🛡️",
      body: "Desde aquí gestionas toda la IFL: equipos, contratos, partidos, resultados y estadios. Todos los cambios se guardan en la base de datos real, visibles para todo el mundo al instante.",
    },
    {
      title: "Equipos y Estadios",
      icon: "🏟️",
      body: "Añade, edita y elimina equipos y estadios. Cada estadio puede vincularse a un club, y aparecerá automáticamente en los partidos que se jueguen ahí.",
    },
    {
      title: "Contratos",
      icon: "📋",
      body: "Al firmar un contrato, busca primero por nombre de Roblox: si el jugador ya existe se reutiliza su ficha, si no se crea una nueva vinculada a su Discord.",
    },
    {
      title: "Partidos y Resultados",
      icon: "⚽",
      body: "Programa partidos con fecha, jornada y estadio. Cuando se jueguen, entra en Resultados para poner el marcador y registrar goleadores, tarjetas, asistencias y MVP — filtrados automáticamente por el club de cada jugador.",
    },
    {
      title: "Admins e Historial",
      icon: "👑",
      body: "Solo tú puedes añadir otros administradores (por su Discord ID) y consultar el historial de cambios, con opción de revertir cualquier acción.",
    },
  ];

  let currentPages = [];
  let currentIndex = 0;
  let onFinish = null;

  function ensureModal() {
    let modal = document.getElementById("ifl-tutorial");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "ifl-tutorial";
    modal.className = "ifl-tutorial";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="ifl-tutorial__overlay"></div>
      <div class="ifl-tutorial__box">
        <button type="button" class="ifl-tutorial__close" id="ifl-tutorial-close">&times;</button>
        <div class="ifl-tutorial__icon" id="ifl-tutorial-icon"></div>
        <h2 class="ifl-tutorial__title" id="ifl-tutorial-title"></h2>
        <p class="ifl-tutorial__body" id="ifl-tutorial-body"></p>
        <div class="ifl-tutorial__dots" id="ifl-tutorial-dots"></div>
        <div class="ifl-tutorial__nav">
          <button type="button" class="btn-admin" id="ifl-tutorial-prev">Anterior</button>
          <button type="button" class="btn-admin btn-admin--solid" id="ifl-tutorial-next">Siguiente</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector(".ifl-tutorial__overlay").addEventListener("click", close);
    document.getElementById("ifl-tutorial-close").addEventListener("click", close);
    document.getElementById("ifl-tutorial-prev").addEventListener("click", () => go(currentIndex - 1));
    document.getElementById("ifl-tutorial-next").addEventListener("click", () => {
      if (currentIndex >= currentPages.length - 1) {
        close();
        if (onFinish) onFinish();
      } else {
        go(currentIndex + 1);
      }
    });

    return modal;
  }

  function go(index) {
    currentIndex = Math.max(0, Math.min(index, currentPages.length - 1));
    const page = currentPages[currentIndex];

    document.getElementById("ifl-tutorial-icon").textContent = page.icon || "✨";
    document.getElementById("ifl-tutorial-title").textContent = page.title;
    document.getElementById("ifl-tutorial-body").textContent = page.body;

    const dots = document.getElementById("ifl-tutorial-dots");
    dots.innerHTML = currentPages
      .map((_, i) => `<span class="ifl-tutorial__dot ${i === currentIndex ? "is-active" : ""}"></span>`)
      .join("");

    const prevBtn = document.getElementById("ifl-tutorial-prev");
    const nextBtn = document.getElementById("ifl-tutorial-next");
    prevBtn.hidden = currentIndex === 0;
    nextBtn.textContent = currentIndex === currentPages.length - 1 ? "Entendido" : "Siguiente";
  }

  function open(pages, finishCallback) {
    const modal = ensureModal();
    currentPages = pages;
    currentIndex = 0;
    onFinish = finishCallback || null;
    modal.hidden = false;
    go(0);
  }

  function close() {
    const modal = document.getElementById("ifl-tutorial");
    if (modal) modal.hidden = true;
  }

  function openSiteTutorial() {
    open(SITE_PAGES, () => {
      try { localStorage.setItem(SITE_SEEN_KEY, "1"); } catch (e) {}
    });
  }

  function maybeAutoOpen() {
    let seen = false;
    try { seen = localStorage.getItem(SITE_SEEN_KEY) === "1"; } catch (e) {}
    if (!seen) openSiteTutorial();
  }

  function openAdminWelcome() {
    let seen = false;
    try { seen = localStorage.getItem(ADMIN_SEEN_KEY) === "1"; } catch (e) {}
    if (seen) return;
    open(ADMIN_PAGES, () => {
      try { localStorage.setItem(ADMIN_SEEN_KEY, "1"); } catch (e) {}
    });
  }

  function openAdminWelcomeForced() {
    open(ADMIN_PAGES, () => {
      try { localStorage.setItem(ADMIN_SEEN_KEY, "1"); } catch (e) {}
    });
  }

  return {
    open: openSiteTutorial,
    maybeAutoOpen,
    openAdminWelcome,
    openAdminWelcomeForced,
  };
})();

// Comportamiento compartido de los botones "Subir archivo" bonitos:
// muestra el nombre del archivo elegido junto al botón.
document.addEventListener("change", (e) => {
  if (!e.target.matches(".file-upload__input")) return;
  const wrap = e.target.closest(".file-upload");
  const nameEl = wrap && wrap.querySelector(".file-upload__name");
  if (!nameEl) return;
  const file = e.target.files && e.target.files[0];
  nameEl.textContent = file ? file.name : "Ningún archivo";
});
