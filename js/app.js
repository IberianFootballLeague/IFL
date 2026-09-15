// =====================================
// IFL - SUPABASE + DISCORD
// =====================================

const SUPABASE_URL = "sb_publishable_C_iRhldD-coePRVqcNDCGA_oGIA1u3d";

const SUPABASE_ANON_KEY = "boazhychmpxeuplyxzsi";

const supabaseClient = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);


// =====================================
// INICIO
// =====================================

document.addEventListener("DOMContentLoaded", async () => {

    const loginPage = document.getElementById("login-page");
    const appPage = document.getElementById("app");

    const discordButton = document.getElementById("discord-login");
    const logoutButton = document.getElementById("logout-button");
    const userInfo = document.getElementById("user-info");


    // =================================
    // COMPROBAR SESIÓN
    // =================================

    const {
        data: { session }
    } = await supabaseClient.auth.getSession();


    if (session) {

        mostrarApp(session.user);

    } else {

        mostrarLogin();

    }


    // =================================
    // BOTÓN DISCORD
    // =================================

    discordButton.addEventListener("click", async () => {

        discordButton.disabled = true;
        discordButton.textContent = "Conectando...";


        const { error } = await supabaseClient.auth.signInWithOAuth({

            provider: "discord",

            options: {
                redirectTo:
                    "https://iberianfootballleague.github.io/IFL/"
            }

        });


        if (error) {

            console.error(error);

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
    // CERRAR SESIÓN
    // =================================

    logoutButton.addEventListener("click", async () => {

        await supabaseClient.auth.signOut();

        mostrarLogin();

    });


    // =================================
    // ESCUCHAR CAMBIOS DE SESIÓN
    // =================================

    supabaseClient.auth.onAuthStateChange(
        (event, session) => {

            if (session) {

                mostrarApp(session.user);

            } else {

                mostrarLogin();

            }

        }
    );


    // =================================
    // MOSTRAR LOGIN
    // =================================

    function mostrarLogin() {

        loginPage.style.display = "flex";
        appPage.style.display = "none";

    }


    // =================================
    // MOSTRAR APP
    // =================================

    function mostrarApp(user) {

        loginPage.style.display = "none";
        appPage.style.display = "block";


        const discordName =
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.user_metadata?.preferred_username ||
            user.email ||
            "Usuario de Discord";


        userInfo.textContent =
            "Sesión iniciada como " + discordName;

    }

});
