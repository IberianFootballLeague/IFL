const SUPABASE_URL = "https://boazhychmpxeuplyxzsi.supabase.co";

document.addEventListener("DOMContentLoaded", async () => {
    const discordButton = document.getElementById("discord-login");

    // Comprobar si existe una sesión de Supabase
    const response = await fetch(
        SUPABASE_URL + "/auth/v1/user",
        {
            headers: {
                "apikey": SUPABASE_ANON_KEY,
                "Authorization": "Bearer " + accessToken
            }
        }
    );

    if (response.ok) {
        const user = await response.json();
        console.log("Usuario conectado:", user);
    }

    discordButton.addEventListener("click", () => {
        const redirectTo =
            window.location.origin + window.location.pathname;

        const loginUrl =
            SUPABASE_URL +
            "/auth/v1/authorize?provider=discord&redirect_to=" +
            encodeURIComponent(redirectTo);

        window.location.href = loginUrl;
    });
});
