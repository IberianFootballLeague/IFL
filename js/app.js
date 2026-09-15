// =====================================
// IFL - SUPABASE + DISCORD
// =====================================

const SUPABASE_URL = "https://boazhychmpxeuplyxzsi.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_C_iRhldD-coePRVqcNDCGA_oGIA1u3d";

const supabaseClient = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);


// =====================================
// IFL APP
// =====================================

document.addEventListener("DOMContentLoaded", async () => {

    const loginPage = document.getElementById("login-page");
    const appPage = document.getElementById("app");

    const discordButton = document.getElementById("discord-login");
    const logoutButton = document.getElementById("logout-button");
    const userInfo = document.getElementById("user-info");


    // =================================
    // MOSTRAR LOGIN
    // =================================

    function showLogin() {
        loginPage.style.display = "flex";
        appPage.style.display = "none";
    }


    // =================================
    // MOSTRAR APP
    // =================================

    function showApp(user) {

        loginPage.style.display = "none";
        appPage.style.display = "block";

        const discordName =
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.user_metadata?.preferred_username ||
            user.user_metadata?.custom_claims?.global_name ||
            "Usuario de Discord";

        userInfo.textContent =
            "Sesión iniciada como " + discordName;
    }


    // =================================
    // COMPROBAR SESIÓN
    // =================================

    const {
        data: { session },
        error: sessionError
    } = await supabaseClient.auth.getSession();


    if (sessionError) {

        console.error(
            "Error comprobando la sesión:",
            sessionError
        );

        showLogin();

    } else if (session) {

        console.log(
            "Sesión encontrada:",
            session.user
        );

        showApp(session.user);

    } else {

        showLogin();
    }


    // =================================
    // LOGIN CON DISCORD
    // =================================

    discordButton.addEventListener("click", async () => {

        discordButton.disabled = true;
        discordButton.textContent = "Conectando...";


        const { error } =
            await supabaseClient.auth.signInWithOAuth({

                provider: "discord",

                options: {
                    redirectTo:
                        "https://iberianfootballleague.github.io/IFL/"
                }

            });


        if (error) {

            console.error(
                "Error iniciando sesión:",
                error
            );

            alert(
                "No se pudo iniciar sesión con Discord.\n\n" +
                error.message
            );

            discordButton.disabled = false;
            discordButton.textContent =
                "Iniciar sesión con Discord";
        }

    });


    // =================================
    // CAMBIOS DE SESIÓN
    // =================================

    supabaseClient.auth.onAuthStateChange(
        (event, session) => {

            console.log(
                "Cambio de sesión:",
                event
            );

            if (session) {
                showApp(session.user);
            } else {
                showLogin();
            }

        }
    );


    // =================================
    // CERRAR SESIÓN
    // =================================

    logoutButton.addEventListener(
        "click",
        async () => {

            const { error } =
                await supabaseClient.auth.signOut();


            if (error) {

                console.error(
                    "Error cerrando sesión:",
                    error
                );

                return;
            }

            showLogin();
        }
    );

});
