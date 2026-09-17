/* =====================================
   IFL — UI (carga, menú de perfil, zonas)
   Capa visual. No toca Supabase ni app.js.
   Debe cargarse DESPUÉS de js/app.js.
===================================== */

(function () {
  "use strict";

  /* ---------------------------------
     1. PANTALLA DE CARGA
  --------------------------------- */

  const TIPS = [
    "La IFL se juega 4 contra 4. Con menos de 3 jugadores en campo, el partido no puede disputarse.",
    "Cada división disputa 7 jornadas a una sola vuelta: un partido contra cada rival.",
    "Los tres últimos de Primera División descienden al final de la temporada.",
    "En Segunda ascienden directamente los dos primeros. El 3.º y el 4.º se juegan la plaza en un playoff a partido único.",
    "Los partidos duran 20 minutos: 10 de primera parte, 2 de descanso y 10 de segunda.",
    "Cada equipo dispone de 3 sustituciones por encuentro.",
    "Los fichajes se gestionan en las ventanas oficiales de mercado: verano e invierno.",
    "El campeón de Primera se corona al terminar la liga regular. No hay final.",
  ];

  const MIN_LOADER_MS = 2000;
  const TIP_EVERY_MS = 3400;

  const loader = document.getElementById("loader");

  if (loader) {
    const tipText = loader.querySelector(".loader__tip-text");
    const start = Date.now();
    let tipIndex = Math.floor(Math.random() * TIPS.length);
    let tipTimer = null;
    let dismissed = false;

    const paintTip = function () {
      if (tipText) tipText.textContent = TIPS[tipIndex % TIPS.length];
    };

    paintTip();

    tipTimer = setInterval(function () {
      if (!tipText) return;
      tipText.classList.add("is-fading");
      setTimeout(function () {
        tipIndex += 1;
        paintTip();
        tipText.classList.remove("is-fading");
      }, 350);
    }, TIP_EVERY_MS);

    const hideNow = function () {
      if (dismissed) return;
      dismissed = true;
      loader.classList.add("is-done");
      clearInterval(tipTimer);
      setTimeout(function () {
        loader.setAttribute("aria-hidden", "true");
      }, 650);
    };

    const dismiss = function () {
      const remaining = Math.max(0, MIN_LOADER_MS - (Date.now() - start));
      setTimeout(hideNow, remaining);
    };

    // Preferimos esperar a que app.js haya decidido qué mostrar:
    // en cuanto login o app dejan de estar ocultos, cerramos.
    const loginPage = document.getElementById("login-page");
    const appPage = document.getElementById("app");

    const isVisible = function (el) {
      return el && el.style.display !== "none" && el.offsetParent !== null;
    };

    const checkReady = function () {
      if (isVisible(loginPage) || isVisible(appPage)) dismiss();
    };

    if (loginPage || appPage) {
      const obs = new MutationObserver(checkReady);
      if (loginPage) obs.observe(loginPage, { attributes: true, attributeFilter: ["style"] });
      if (appPage) obs.observe(appPage, { attributes: true, attributeFilter: ["style"] });
      checkReady();
    }

    if (document.readyState === "complete") dismiss();
    else window.addEventListener("load", dismiss);

    // Red de seguridad: nunca dejamos al usuario encerrado en la carga.
    setTimeout(hideNow, 9000);
  }

  /* ---------------------------------
     2. MENÚ DESPLEGABLE DEL PERFIL
  --------------------------------- */

  const profileBtn = document.getElementById("profile-button");
  const profileMenu = document.getElementById("profile-menu");

  if (profileBtn && profileMenu) {
    const openMenu = function () {
      profileMenu.hidden = false;
      profileBtn.setAttribute("aria-expanded", "true");
    };

    const closeMenu = function () {
      profileMenu.hidden = true;
      profileBtn.setAttribute("aria-expanded", "false");
    };

    closeMenu();

    profileBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (profileMenu.hidden) openMenu();
      else closeMenu();
    });

    document.addEventListener("click", function (e) {
      if (profileMenu.hidden) return;
      if (profileMenu.contains(e.target) || profileBtn.contains(e.target)) return;
      closeMenu();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !profileMenu.hidden) {
        closeMenu();
        profileBtn.focus();
      }
    });

    /* Puente de navegación
       app.js engancha los clics con ".app-header__link", así que
       reenviamos el clic del desplegable al enlace del nav que toca.
       Así no hay que duplicar showView() ni tocar app.js. */
    profileMenu.addEventListener("click", function (e) {
      const item = e.target.closest(".profile-menu__item");
      if (!item) return;

      const view = item.dataset.view;

      if (view) {
        e.preventDefault();
        const navLink = document.querySelector(
          '.app-header__link[data-view="' + view + '"]'
        );
        if (navLink) navLink.click();
      }

      closeMenu();
    });

    /* Nombre en la cabecera del menú.
       app.js escribe "Sesión iniciada como X" en #user-info;
       aquí nos quedamos solo con el nombre. */
    const userInfo = document.getElementById("user-info");
    const menuName = document.getElementById("profile-menu-name");

    if (userInfo && menuName) {
      const syncName = function () {
        const raw = (userInfo.textContent || "").trim();
        if (!raw) return;
        menuName.textContent = raw.replace(/^Sesión iniciada como\s*/i, "");
      };
      syncName();
      new MutationObserver(syncName).observe(userInfo, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
  }

  /* ---------------------------------
     3. ZONAS DE LA CLASIFICACIÓN
     Primera: 3 últimos -> descenso (rojo)
     Segunda: 1-2 ascenso (verde), 3-4 playoff (amarillo)
  --------------------------------- */

  const ZONES = {
    "standings-primera": function (rows) {
      rows.forEach(function (row, i) {
        if (i >= rows.length - 3) row.classList.add("zone-down");
      });
    },
    "standings-segunda": function (rows) {
      rows.forEach(function (row, i) {
        if (i < 2) row.classList.add("zone-up");
        else if (i < 4) row.classList.add("zone-playoff");
      });
    },
  };

  const paintZones = function (table, apply) {
    const rows = Array.prototype.filter.call(
      table.querySelectorAll("tr"),
      function (tr) {
        // Solo filas de datos: las de cabecera llevan <th>.
        return tr.querySelector("td") && !tr.querySelector("th");
      }
    );

    rows.forEach(function (tr) {
      tr.classList.remove("zone-up", "zone-playoff", "zone-down");
    });

    if (rows.length) apply(rows);
  };

  Object.keys(ZONES).forEach(function (id) {
    const table = document.getElementById(id);
    if (!table) return;

    const apply = ZONES[id];
    let queued = false;

    const run = function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        paintZones(table, apply);
      });
    };

    run();
    new MutationObserver(run).observe(table, { childList: true, subtree: true });
  });
})();
