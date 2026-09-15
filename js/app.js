const SUPABASE_URL = "https://boazhychmpxeuplyxzsi.supabase.co";

document.addEventListener("DOMContentLoaded", () => {
    const discordButton = document.getElementById("discord-login");

    discordButton.addEventListener("click", async () => {
        const redirectTo = window.location.origin + window.location.pathname;

        const loginUrl =
            SUPABASE_URL +
            "/auth/v1/authorize?provider=discord&redirect_to=" +
            encodeURIComponent(redirectTo);

        window.location.href = loginUrl;
    });
});
