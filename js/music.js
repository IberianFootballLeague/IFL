/* =====================================
   IFL — MÚSICA (playlist de Spotify)
   Reproductor flotante abajo a la derecha. Usa el embed oficial de Spotify
   y su iFrame API.

   Cosas que conviene saber (límites de Spotify, no de la web):
   - El embed NO permite controlar el volumen, así que "Silenciar" pausa y
     reanuda la música (el efecto es el mismo: deja de sonar).
   - Quien tenga sesión de Spotify Premium iniciada en el navegador oirá las
     canciones completas; el resto oye fragmentos de 30 segundos.
   - Los navegadores no dejan sonar música sin que el usuario haga clic antes,
     así que arranca con el primer clic/toque que haces en la web.
===================================== */

(function () {
  "use strict";

  const PLAYLIST_ID = "5JyREYHdEmoSMqAUXJ75EZ";
  const MUTED_KEY = "ifl-music-muted";

  let controller = null;
  let isPlaying = false;
  let userMuted = false;
  let started = false;

  try { userMuted = localStorage.getItem(MUTED_KEY) === "1"; } catch (e) {}

  function buildWidget() {
    if (document.getElementById("ifl-music")) return;

    const wrap = document.createElement("div");
    wrap.id = "ifl-music";
    wrap.className = "ifl-music";
    wrap.hidden = true;
    wrap.innerHTML = `
      <div class="ifl-music__bar">
        <span class="ifl-music__bars" id="ifl-music-bars" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="ifl-music__label">IFL Radio</span>
        <button type="button" class="ifl-music__btn" id="ifl-music-mute" aria-label="Silenciar"></button>
        <button type="button" class="ifl-music__btn ifl-music__btn--ghost" id="ifl-music-toggle-list" aria-label="Ver playlist">☰</button>
      </div>
      <div class="ifl-music__panel" id="ifl-music-panel">
        <div id="ifl-music-embed"></div>
      </div>
    `;
    document.body.appendChild(wrap);

    document.getElementById("ifl-music-mute").addEventListener("click", onMuteClick);
    document.getElementById("ifl-music-toggle-list").addEventListener("click", () => {
      wrap.classList.toggle("is-open");
    });

    paintMuteButton();
  }

  function paintMuteButton() {
    const btn = document.getElementById("ifl-music-mute");
    const bars = document.getElementById("ifl-music-bars");
    if (!btn) return;
    const silent = userMuted || !isPlaying;
    btn.textContent = silent ? "🔇" : "🔊";
    btn.setAttribute("aria-label", silent ? "Activar sonido" : "Silenciar");
    btn.title = silent ? "Activar sonido" : "Silenciar";
    if (bars) bars.classList.toggle("is-playing", !silent);
  }

  function onMuteClick() {
    if (!controller) return;
    if (userMuted || !isPlaying) {
      userMuted = false;
      try { localStorage.setItem(MUTED_KEY, "0"); } catch (e) {}
      started = true;
      controller.resume ? controller.resume() : controller.togglePlay();
    } else {
      userMuted = true;
      try { localStorage.setItem(MUTED_KEY, "1"); } catch (e) {}
      controller.pause();
    }
  }

  // Primer clic/toque en la web: si el usuario no la había silenciado, empieza a sonar.
  let autoStartArmed = false;
  function armAutoStart() {
    if (autoStartArmed) return;
    autoStartArmed = true;
    const start = () => {
      document.removeEventListener("pointerdown", start, true);
      document.removeEventListener("keydown", start, true);
      if (!controller || userMuted || started) return;
      started = true;
      try { controller.play ? controller.play() : controller.togglePlay(); } catch (e) { console.warn("[IFL Música]", e); }
    };
    document.addEventListener("pointerdown", start, true);
    document.addEventListener("keydown", start, true);
  }

  function initController(IFrameAPI) {
    const element = document.getElementById("ifl-music-embed");
    if (!element) return;

    IFrameAPI.createController(
      element,
      { uri: "spotify:playlist:" + PLAYLIST_ID, width: "100%", height: 352, theme: "0" },
      (EmbedController) => {
        controller = EmbedController;
        EmbedController.addListener("playback_update", (e) => {
          const data = e && e.data ? e.data : {};
          if (!data.isBuffering) isPlaying = !data.isPaused;
          paintMuteButton();
        });
        EmbedController.addListener("ready", () => armAutoStart());
        armAutoStart();
      }
    );
  }

  // API pública: la web llama a IFLMusic.init() cuando el usuario ya ha iniciado sesión.
  function init() {
    if (document.getElementById("ifl-music")) {
      document.getElementById("ifl-music").hidden = false;
      return;
    }
    buildWidget();
    document.getElementById("ifl-music").hidden = false;

    window.onSpotifyIframeApiReady = initController;
    const s = document.createElement("script");
    s.src = "https://open.spotify.com/embed/iframe-api/v1";
    s.async = true;
    s.onerror = () => console.warn("[IFL Música] No se pudo cargar la API de Spotify.");
    document.body.appendChild(s);
  }

  function hide() {
    const el = document.getElementById("ifl-music");
    if (el) el.hidden = true;
    if (controller) { try { controller.pause(); } catch (e) {} }
  }

  window.IFLMusic = { init, hide };
})();
