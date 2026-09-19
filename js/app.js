// =====================================
// IFL - SUPABASE + DISCORD
// =====================================

const SUPABASE_URL =
    "https://boazhychmpxeuplyxzsi.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_C_iRhldD-coePRVqcNDCGA_oGIA1u3d";

const supabaseClient =
    supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    );


// =====================================
// ADMIN
// =====================================

// El mismo Discord ID que utiliza admin.js.
// Este archivo solo controla si aparece el enlace.
// admin.html hace la comprobación real de acceso.
const ADMIN_DISCORD_ID = "1149380955316957266";


// =====================================
// IFL APP
// =====================================

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        const loginPage =
            document.getElementById("login-page");

        const appPage =
            document.getElementById("app");

        const discordButton =
            document.getElementById("discord-login");

        if (!loginPage || !appPage || !discordButton) {
            console.error(
                "[IFL] No se encontraron los elementos principales de la aplicación."
            );
            return;
        }

        // Solo el texto: así el icono de Discord no se borra
        // al cambiar el botón a "Conectando...".
        const discordLabel =
            discordButton.querySelector(".btn-discord__label");

        const logoutButton =
            document.getElementById("logout-button");

        const userInfo =
            document.getElementById("user-info");

        function setDiscordLabel(text) {

            if (discordLabel) {
                discordLabel.textContent = text;
            } else {
                discordButton.textContent = text;
            }

        }


        // =================================
        // MOSTRAR LOGIN
        // =================================

        function showLogin() {

            loginPage.style.display = "flex";
            appPage.style.display = "none";

        }


        const userAvatar =
            document.getElementById("user-avatar");

        const userAvatarFallback =
            document.getElementById("user-avatar-fallback");


        // =================================
        // DISCORD ID
        // =================================

        function addCandidate(list, value) {

            if (
                value === undefined ||
                value === null
            ) {
                return;
            }

            const valueString =
                String(value).trim();

            if (!valueString) {
                return;
            }

            if (!list.includes(valueString)) {
                list.push(valueString);
            }

        }


        function getDiscordIdCandidates(user) {

            const candidates = [];

            if (!user) {
                return candidates;
            }

            const metadata =
                user.user_metadata || {};

            const appMetadata =
                user.app_metadata || {};

            const identities =
                Array.isArray(user.identities)
                    ? user.identities
                    : [];


            // Campos directos de Supabase
            addCandidate(
                candidates,
                user.discord_id
            );

            addCandidate(
                candidates,
                user.discord_user_id
            );

            addCandidate(
                candidates,
                user.provider_id
            );


            // user_metadata
            addCandidate(
                candidates,
                metadata.discord_id
            );

            addCandidate(
                candidates,
                metadata.discord_user_id
            );

            addCandidate(
                candidates,
                metadata.provider_id
            );

            addCandidate(
                candidates,
                metadata.sub
            );


            // app_metadata
            addCandidate(
                candidates,
                appMetadata.discord_id
            );

            addCandidate(
                candidates,
                appMetadata.discord_user_id
            );

            addCandidate(
                candidates,
                appMetadata.provider_id
            );


            // Identidades OAuth
            identities.forEach(
                (identity) => {

                    if (!identity) {
                        return;
                    }

                    addCandidate(
                        candidates,
                        identity.provider_id
                    );

                    const identityData =
                        identity.identity_data || {};

                    addCandidate(
                        candidates,
                        identityData.id
                    );

                    addCandidate(
                        candidates,
                        identityData.user_id
                    );

                    addCandidate(
                        candidates,
                        identityData.discord_id
                    );

                    addCandidate(
                        candidates,
                        identityData.discord_user_id
                    );

                    addCandidate(
                        candidates,
                        identityData.provider_id
                    );

                    addCandidate(
                        candidates,
                        identityData.sub
                    );

                }
            );


            return candidates;

        }


        function isAdminUser(user) {

            const candidates =
                getDiscordIdCandidates(user);

            console.log(
                "[IFL] Discord IDs detectados:",
                candidates
            );

            console.log(
                "[IFL] Discord ID autorizado:",
                ADMIN_DISCORD_ID
            );

            return candidates.includes(
                ADMIN_DISCORD_ID
            );

        }


        // =================================
        // ENLACE ADMIN PANEL
        // =================================

        function ensureAdminPanelLink(user) {

            const profileMenu =
                document.getElementById("profile-menu");

            if (!profileMenu) {
                return;
            }


            const existing =
                document.getElementById(
                    "admin-panel-menu-link"
                );


            const isAdmin =
                isAdminUser(user);


            if (!isAdmin) {

                if (existing) {
                    existing.remove();
                }

                return;

            }


            if (existing) {
                return;
            }


            const link =
                document.createElement("a");

            link.id =
                "admin-panel-menu-link";

            link.href =
                "admin.html";

            link.className =
                "profile-menu__item";

            link.textContent =
                "Admin Panel";


            // Se coloca justo antes del botón
            // de cerrar sesión si existe.
            const logoutItem =
                profileMenu.querySelector(
                    ".profile-menu__item--danger"
                );


            if (logoutItem) {

                profileMenu.insertBefore(
                    link,
                    logoutItem
                );

            } else {

                profileMenu.appendChild(
                    link
                );

            }

        }


        // =================================
        // MOSTRAR APP
        // =================================

        function showApp(user) {

            loginPage.style.display =
                "none";

            appPage.style.display =
                "block";


            const discordName =
                user.user_metadata?.full_name ||
                user.user_metadata?.name ||
                user.user_metadata?.preferred_username ||
                user.user_metadata?.custom_claims?.global_name ||
                "Usuario de Discord";


            if (userInfo) {

                userInfo.textContent =
                    "Sesión iniciada como " +
                    discordName;

            }


            const avatarUrl =
                user.user_metadata?.avatar_url ||
                user.user_metadata?.picture;


            if (
                avatarUrl &&
                userAvatar
            ) {

                userAvatar.src =
                    avatarUrl;

                userAvatar.alt =
                    discordName;

                userAvatar.hidden =
                    false;


                if (userAvatarFallback) {

                    userAvatarFallback.hidden =
                        true;

                }


                userAvatar.onerror =
                    () => {

                        userAvatar.hidden =
                            true;

                        if (userAvatarFallback) {

                            userAvatarFallback.textContent =
                                discordName
                                    .charAt(0)
                                    .toUpperCase();

                            userAvatarFallback.hidden =
                                false;

                        }

                    };


            } else if (
                userAvatarFallback
            ) {

                userAvatarFallback.textContent =
                    discordName
                        .charAt(0)
                        .toUpperCase();

                userAvatarFallback.hidden =
                    false;


                if (userAvatar) {

                    userAvatar.hidden =
                        true;

                }

            }


            ensureAdminPanelLink(user);

        }


        // =================================
        // COMPROBAR SESIÓN
        // =================================

        const {
            data: { session },
            error: sessionError
        } =
            await supabaseClient.auth.getSession();


        if (sessionError) {

            console.error(
                "[IFL] Error comprobando la sesión:",
                sessionError
            );

            showLogin();

        }

        else if (session) {

            console.log(
                "[IFL] Sesión encontrada:",
                session.user
            );

            showApp(
                session.user
            );

        }

        else {

            showLogin();

        }


        // =================================
        // LOGIN DISCORD
        // =================================

        discordButton.addEventListener(
            "click",
            async () => {

                discordButton.disabled =
                    true;

                setDiscordLabel(
                    "Conectando..."
                );


                const { error } =
                    await supabaseClient
                        .auth
                        .signInWithOAuth({

                            provider:
                                "discord",

                            options: {

                                redirectTo:
                                    "https://iberianfootballleague.github.io/IFL/"

                            }

                        });


                if (error) {

                    console.error(
                        "[IFL] Error iniciando sesión con Discord:",
                        error
                    );


                    alert(
                        "No se pudo iniciar sesión con Discord.\n\n" +
                        error.message
                    );


                    discordButton.disabled =
                        false;

                    setDiscordLabel(
                        "Iniciar sesión con Discord"
                    );

                }

            }
        );


        // =================================
        // CAMBIO DE SESIÓN
        // =================================

        supabaseClient.auth.onAuthStateChange(
            (
                event,
                session
            ) => {

                console.log(
                    "[IFL] Cambio de sesión:",
                    event
                );


                if (session) {

                    showApp(
                        session.user
                    );

                } else {

                    showLogin();

                }

            }
        );


        // =================================
        // LOGOUT
        // =================================

        if (logoutButton) {

            logoutButton.addEventListener(
                "click",
                async () => {

                    const { error } =
                        await supabaseClient
                            .auth
                            .signOut();


                    if (error) {

                        console.error(
                            "[IFL] Error cerrando sesión:",
                            error
                        );

                        return;

                    }


                    showLogin();

                }
            );

        }


        // =================================
        // NAVEGACIÓN ENTRE SECCIONES
        // =================================

        const navLinks =
            document.querySelectorAll(
                ".app-header__link"
            );

        const views =
            document.querySelectorAll(
                ".view"
            );


        function showView(name) {

            views.forEach(
                (section) => {

                    section.hidden =
                        section.dataset.viewPanel !==
                        name;

                }
            );


            navLinks.forEach(
                (link) => {

                    link.classList.toggle(
                        "is-active",
                        link.dataset.view ===
                        name
                    );

                }
            );


            if (
                name ===
                "calendario"
            ) {

                renderCalendar();

            }


            if (
                name ===
                "clasificacion"
            ) {

                renderStandings();

            }

        }


        navLinks.forEach(
            (link) => {

                link.addEventListener(
                    "click",
                    (event) => {

                        event.preventDefault();

                        showView(
                            link.dataset.view
                        );

                    }
                );

            }
        );


        // =================================
        // CALENDARIO
        // =================================

        const calGrid =
            document.getElementById(
                "calendar-grid"
            );

        const calLabel =
            document.getElementById(
                "cal-label"
            );

        const calPrev =
            document.getElementById(
                "cal-prev"
            );

        const calNext =
            document.getElementById(
                "cal-next"
            );


        const monthNames = [
            "Enero",
            "Febrero",
            "Marzo",
            "Abril",
            "Mayo",
            "Junio",
            "Julio",
            "Agosto",
            "Septiembre",
            "Octubre",
            "Noviembre",
            "Diciembre"
        ];


        let calDate =
            new Date();

        calDate.setDate(1);


        function renderCalendar() {

            if (!calGrid) {
                return;
            }


            calGrid.innerHTML =
                "";


            const year =
                calDate.getFullYear();

            const month =
                calDate.getMonth();


            if (calLabel) {

                calLabel.textContent =
                    monthNames[month] +
                    " " +
                    year;

            }


            const firstDay =
                new Date(
                    year,
                    month,
                    1
                );


            const daysInMonth =
                new Date(
                    year,
                    month + 1,
                    0
                ).getDate();


            // Lunes = 0 ... Domingo = 6
            let startWeekday =
                firstDay.getDay() - 1;


            if (startWeekday < 0) {
                startWeekday = 6;
            }


            const totalCells =
                Math.ceil(
                    (
                        startWeekday +
                        daysInMonth
                    ) / 7
                ) * 7;


            const today =
                new Date();


            const isCurrentMonth =
                today.getFullYear() ===
                    year &&
                today.getMonth() ===
                    month;


            for (
                let i = 0;
                i < totalCells;
                i++
            ) {

                const dayNumber =
                    i -
                    startWeekday +
                    1;


                const cell =
                    document.createElement(
                        "div"
                    );

                cell.className =
                    "calendar-cell";


                if (
                    dayNumber < 1 ||
                    dayNumber >
                        daysInMonth
                ) {

                    cell.classList.add(
                        "calendar-cell--empty"
                    );

                }

                else {

                    if (
                        isCurrentMonth &&
                        dayNumber ===
                            today.getDate()
                    ) {

                        cell.classList.add(
                            "calendar-cell--today"
                        );

                    }


                    const num =
                        document.createElement(
                            "span"
                        );

                    num.className =
                        "calendar-cell__num";

                    num.textContent =
                        dayNumber;


                    const slot =
                        document.createElement(
                            "div"
                        );

                    slot.className =
                        "calendar-cell__slot";


                    cell.appendChild(num);
                    cell.appendChild(slot);

                }


                calGrid.appendChild(
                    cell
                );

            }

        }


        if (calPrev) {

            calPrev.addEventListener(
                "click",
                () => {

                    calDate.setMonth(
                        calDate.getMonth() - 1
                    );

                    renderCalendar();

                }
            );

        }


        if (calNext) {

            calNext.addEventListener(
                "click",
                () => {

                    calDate.setMonth(
                        calDate.getMonth() + 1
                    );

                    renderCalendar();

                }
            );

        }


        // =================================
        // CLASIFICACIÓN
        // =================================

        function buildStandingsTable(
            tableEl,
            teamCount
        ) {

            if (!tableEl) {
                return;
            }


            let rows = "";


            for (
                let i = 1;
                i <= teamCount;
                i++
            ) {

                rows += `
                    <tr>
                        <td class="standings__pos">${i}</td>
                        <td class="standings__club">Equipo ${i}</td>
                        <td>0</td>
                        <td>0</td>
                        <td>0</td>
                        <td>0</td>
                        <td>0</td>
                        <td>0</td>
                    </tr>
                `;

            }


            tableEl.innerHTML = `
                <thead>
                    <tr>
                        <th>Pos</th>
                        <th>Club</th>
                        <th>Pts</th>
                        <th>G</th>
                        <th>P</th>
                        <th>E</th>
                        <th>GF</th>
                        <th>GC</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            `;

        }


        function renderStandings() {

            buildStandingsTable(
                document.getElementById(
                    "standings-primera"
                ),
                8
            );


            buildStandingsTable(
                document.getElementById(
                    "standings-segunda"
                ),
                8
            );

        }


    }
);
