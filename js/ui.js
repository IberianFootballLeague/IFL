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

    /* Los ítems con data-view (Mi perfil, Mi carrera, Configuración) ya
       llevan la clase app-header__link, así que app.js los navega solo.
       Aquí solo cerramos el menú tras cualquier clic dentro de él. */
    profileMenu.addEventListener("click", function (e) {
      if (e.target.closest(".profile-menu__item")) closeMenu();
    });

    /* Nombre en la cabecera del menú.
       app.js escribe "Sesión iniciada como X" en #user-info;
       aquí nos quedamos solo con el nombre, y lo reflejamos también
       en la tarjeta de Mi perfil. */
    const userInfo = document.getElementById("user-info");
    const menuName = document.getElementById("profile-menu-name");
    const settingsName = document.getElementById("settings-name");

    if (userInfo) {
      const syncName = function () {
        const raw = (userInfo.textContent || "").trim();
        if (!raw) return;
        const clean = raw.replace(/^Sesión iniciada como\s*/i, "");
        if (menuName) menuName.textContent = clean;
        if (settingsName) settingsName.textContent = clean;
      };
      syncName();
      new MutationObserver(syncName).observe(userInfo, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }

    /* Avatar en Mi perfil, reflejando el de la cabecera. */
    const headerAvatar = document.getElementById("user-avatar");
    const headerFallback = document.getElementById("user-avatar-fallback");
    const settingsAvatar = document.getElementById("settings-avatar");
    const settingsFallback = document.getElementById("settings-avatar-fallback");

    if (headerAvatar && settingsAvatar && headerFallback && settingsFallback) {
      const syncAvatar = function () {
        if (!headerAvatar.hidden) {
          settingsAvatar.src = headerAvatar.src;
          settingsAvatar.alt = headerAvatar.alt;
          settingsAvatar.hidden = false;
          settingsFallback.hidden = true;
        } else {
          settingsFallback.textContent = headerFallback.textContent;
          settingsFallback.hidden = false;
          settingsAvatar.hidden = true;
        }
      };
      syncAvatar();
      const avatarObs = new MutationObserver(syncAvatar);
      avatarObs.observe(headerAvatar, { attributes: true, attributeFilter: ["hidden", "src"] });
      avatarObs.observe(headerFallback, { attributes: true, childList: true, characterData: true, subtree: true });
    }
  }

  /* ---------------------------------
     3. AJUSTES: acento, animaciones,
     notificaciones y privacidad
  --------------------------------- */

  const SETTINGS_KEY = "ifl-settings";
  const ACCENT_KEY = "ifl-accent";

  const loadSettings = function () {
    try {
      return Object.assign(
        { reduceMotion: false, notifPartidos: true, notifClub: true, publicProfile: true },
        JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")
      );
    } catch (e) {
      return { reduceMotion: false, notifPartidos: true, notifClub: true, publicProfile: true };
    }
  };

  const saveSettings = function (settings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      /* almacenamiento no disponible: seguimos sin persistir */
    }
  };

  const settings = loadSettings();

  const bindToggle = function (id, key) {
    const input = document.getElementById(id);
    if (!input) return;
    input.checked = !!settings[key];
    input.addEventListener("change", function () {
      settings[key] = input.checked;
      saveSettings(settings);
      if (key === "reduceMotion") {
        document.documentElement.classList.toggle("reduce-motion", input.checked);
      }
    });
  };

  document.documentElement.classList.toggle("reduce-motion", settings.reduceMotion);
  bindToggle("setting-reduce-motion", "reduceMotion");
  bindToggle("setting-notif-partidos", "notifPartidos");
  bindToggle("setting-notif-club", "notifClub");
  bindToggle("setting-public-profile", "publicProfile");

  const accentRow = document.getElementById("accent-row");

  if (accentRow) {
    const swatches = Array.prototype.slice.call(
      accentRow.querySelectorAll(".accent-swatch")
    );

    const applyAccent = function (value) {
      if (value === "blurple") {
        document.documentElement.removeAttribute("data-accent");
      } else {
        document.documentElement.setAttribute("data-accent", value);
      }
      swatches.forEach(function (sw) {
        sw.setAttribute("aria-pressed", sw.dataset.accent === value ? "true" : "false");
      });
    };

    let savedAccent = "blurple";
    try {
      savedAccent = localStorage.getItem(ACCENT_KEY) || "blurple";
    } catch (e) {
      /* sin almacenamiento: usamos el valor por defecto */
    }
    applyAccent(savedAccent);

    accentRow.addEventListener("click", function (e) {
      const btn = e.target.closest(".accent-swatch");
      if (!btn) return;
      applyAccent(btn.dataset.accent);
      try {
        localStorage.setItem(ACCENT_KEY, btn.dataset.accent);
      } catch (err) {
        /* sin almacenamiento: el cambio dura solo esta visita */
      }
    });
  }

  /* ---------------------------------
     4. ZONAS DE LA CLASIFICACIÓN
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
