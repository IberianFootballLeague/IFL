/* =====================================
   IFL — CAPA DE DATOS (Supabase)
   Compartida entre js/app.js y js/admin.js.
   Debe cargarse DESPUÉS del script de Supabase
   y ANTES de app.js / admin.js.
===================================== */

const SUPABASE_URL = "https://boazhychmpxeuplyxzsi.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_C_iRhldD-coePRVqcNDCGA_oGIA1u3d";

window.IFLDB = (function () {
  "use strict";

  const client = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

  // =====================================
  // AUTORIZACIÓN
  // =====================================

  async function isAdmin() {
    const { data, error } = await client.rpc("is_admin");
    if (error) {
      console.warn("[IFLDB] Error comprobando is_admin:", error);
      return false;
    }
    return !!data;
  }

  async function isSuperAdmin() {
    const { data, error } = await client.rpc("is_super_admin");
    if (error) {
      console.warn("[IFLDB] Error comprobando is_super_admin:", error);
      return false;
    }
    return !!data;
  }

  // =====================================
  // EQUIPOS
  // =====================================

  async function getTeams() {
    const { data, error } = await client
      .from("teams")
      .select("*")
      .order("division", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function addTeam(team) {
    const { data, error } = await client.from("teams").insert(team).select().single();
    if (error) throw error;
    return data;
  }

  async function updateTeam(id, patch) {
    const { data, error } = await client
      .from("teams")
      .update(Object.assign({}, patch, { updated_at: new Date().toISOString() }))
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function deleteTeam(id) {
    const { error } = await client.from("teams").delete().eq("id", id);
    if (error) throw error;
  }

  // =====================================
  // ESTADIOS
  // =====================================

  async function getStadiums() {
    const { data, error } = await client
      .from("stadiums")
      .select("*, team:teams!stadiums_team_id_fkey(*)")
      .order("name", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function addStadium(stadium) {
    const { data, error } = await client.from("stadiums").insert(stadium).select().single();
    if (error) throw error;
    return data;
  }

  async function updateStadium(id, patch) {
    const { data, error } = await client.from("stadiums").update(patch).eq("id", id).select().single();
    if (error) throw error;
    return data;
  }

  async function deleteStadium(id) {
    const { error } = await client.from("stadiums").delete().eq("id", id);
    if (error) throw error;
  }

  // =====================================
  // JUGADORES
  // =====================================

  async function searchPlayers(query) {
    if (!query || !query.trim()) return [];
    const q = query.trim();
    const { data, error } = await client
      .from("players")
      .select("*")
      .or(`roblox_username.ilike.%${q}%,discord_username.ilike.%${q}%`)
      .limit(8);
    if (error) throw error;
    return data || [];
  }

  async function findOrCreatePlayer({ discordId, discordUsername, robloxUsername }) {
    // Si ya existe un jugador con ese Discord ID, lo reutilizamos.
    if (discordId) {
      const { data: existing, error: findError } = await client
        .from("players")
        .select("*")
        .eq("discord_id", discordId)
        .maybeSingle();
      if (findError) throw findError;
      if (existing) return existing;
    }

    const { data, error } = await client
      .from("players")
      .insert({
        discord_id: discordId || null,
        discord_username: discordUsername,
        roblox_username: robloxUsername,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function getPlayerCareer(discordId) {
    const { data: player, error: playerError } = await client
      .from("players")
      .select("*")
      .eq("discord_id", discordId)
      .maybeSingle();
    if (playerError) throw playerError;
    if (!player) return null;

    const { data: contracts, error: contractsError } = await client
      .from("contracts")
      .select("*, team:teams!contracts_team_id_fkey(*)")
      .eq("player_id", player.id)
      .order("signed_season", { ascending: false });
    if (contractsError) throw contractsError;

    const { data: events, error: eventsError } = await client
      .from("match_events")
      .select("*, match:matches!match_events_match_id_fkey(*)")
      .eq("player_id", player.id);
    if (eventsError) throw eventsError;

    const stats = {
      goles: 0,
      asistencias: 0,
      tarjetas_amarillas: 0,
      tarjetas_rojas: 0,
      mvps: 0,
      partidos_jugados: 0,
    };

    const matchesPlayed = new Set();

    (events || []).forEach((ev) => {
      if (ev.type === "gol") stats.goles++;
      if (ev.type === "asistencia") stats.asistencias++;
      if (ev.type === "tarjeta_amarilla") stats.tarjetas_amarillas++;
      if (ev.type === "tarjeta_roja") stats.tarjetas_rojas++;
      if (ev.type === "mvp") stats.mvps++;
      if (ev.match_id) matchesPlayed.add(ev.match_id);
    });

    stats.partidos_jugados = matchesPlayed.size;

    return { player, contracts: contracts || [], stats };
  }

  // =====================================
  // CONTRATOS
  // =====================================

  async function getContracts() {
    const { data, error } = await client
      .from("contracts")
      .select("*, player:players!contracts_player_id_fkey(*), team:teams!contracts_team_id_fkey(*)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function getContractsByTeam(teamId) {
    const { data, error } = await client
      .from("contracts")
      .select("*, player:players!contracts_player_id_fkey(*)")
      .eq("team_id", teamId)
      .eq("status", "ACTIVO");
    if (error) throw error;
    return data || [];
  }

  async function addContract({ playerId, teamId, price, seasonsTotal, signedSeason }) {
    const { data, error } = await client
      .from("contracts")
      .insert({
        player_id: playerId,
        team_id: teamId,
        price: price,
        seasons_total: seasonsTotal,
        seasons_left: seasonsTotal,
        signed_season: signedSeason,
        status: "ACTIVO",
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function deleteContract(id) {
    const { error } = await client.from("contracts").delete().eq("id", id);
    if (error) throw error;
  }

  async function advanceSeason(currentSeason) {
    const nextSeason = currentSeason + 1;
    const { data: activeContracts, error: fetchError } = await client
      .from("contracts")
      .select("*")
      .eq("status", "ACTIVO");
    if (fetchError) throw fetchError;

    for (const c of activeContracts || []) {
      const seasonsLeft = c.seasons_left - 1;
      const patch =
        seasonsLeft <= 0
          ? {
              seasons_left: 0,
              status: "INACTIVO",
              ended_at: new Date().toISOString(),
              ended_season: nextSeason,
            }
          : { seasons_left: seasonsLeft };
      const { error: updateError } = await client.from("contracts").update(patch).eq("id", c.id);
      if (updateError) throw updateError;
    }

    return nextSeason;
  }

  // =====================================
  // PARTIDOS
  // =====================================

  async function getMatches(season) {
    let query = client
      .from("matches")
      .select(
        "*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*), stadium:stadiums!matches_stadium_id_fkey(*)"
      )
      .order("scheduled_at", { ascending: true });
    if (season) query = query.eq("season", season);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async function addMatch(match) {
    const { data, error } = await client.from("matches").insert(match).select().single();
    if (error) throw error;
    return data;
  }

  async function deleteMatch(id) {
    const { error } = await client.from("matches").delete().eq("id", id);
    if (error) throw error;
  }

  async function setMatchResult(matchId, { homeGoals, awayGoals, events }) {
    const { error: updateError } = await client
      .from("matches")
      .update({ home_goals: homeGoals, away_goals: awayGoals, status: "jugado" })
      .eq("id", matchId);
    if (updateError) throw updateError;

    // Limpiamos eventos anteriores del partido (por si se está editando un resultado ya puesto)
    const { error: deleteError } = await client.from("match_events").delete().eq("match_id", matchId);
    if (deleteError) throw deleteError;

    if (events && events.length) {
      const rows = events.map((ev) => ({
        match_id: matchId,
        player_id: ev.playerId,
        team_id: ev.teamId,
        type: ev.type,
        minute: ev.minute || null,
      }));
      const { error: insertError } = await client.from("match_events").insert(rows);
      if (insertError) throw insertError;
    }
  }

  async function getMatchEvents(matchId) {
    const { data, error } = await client
      .from("match_events")
      .select("*, player:players!match_events_player_id_fkey(*)")
      .eq("match_id", matchId);
    if (error) throw error;
    return data || [];
  }

  // =====================================
  // CLASIFICACIÓN (calculada a partir de partidos jugados)
  // season = null  →  agrega TODAS las temporadas (modo "Total")
  // =====================================

  async function computeStandings(season, division) {
    const teams = (await getTeams()).filter((t) => t.division === division);
    const matches = (await getMatches(season)).filter(
      (m) => m.status === "jugado" && m.home_team && m.away_team
    );

    // Orden cronológico para poder sacar la racha de forma (últimos resultados)
    matches.sort((a, b) => new Date(a.scheduled_at || 0) - new Date(b.scheduled_at || 0));

    const table = {};
    teams.forEach((t) => {
      table[t.id] = { team: t, pts: 0, pj: 0, pg: 0, pp: 0, pe: 0, gf: 0, gc: 0, form: [] };
    });

    matches.forEach((m) => {
      const home = table[m.home_team.id];
      const away = table[m.away_team.id];
      if (!home || !away) return;

      home.pj++;
      away.pj++;
      home.gf += m.home_goals;
      home.gc += m.away_goals;
      away.gf += m.away_goals;
      away.gc += m.home_goals;

      if (m.home_goals > m.away_goals) {
        home.pg++; home.pts += 3; away.pp++;
        home.form.push("W"); away.form.push("L");
      } else if (m.home_goals < m.away_goals) {
        away.pg++; away.pts += 3; home.pp++;
        home.form.push("L"); away.form.push("W");
      } else {
        home.pe++; away.pe++; home.pts++; away.pts++;
        home.form.push("D"); away.form.push("D");
      }
    });

    Object.values(table).forEach((row) => {
      row.form = row.form.slice(-5);
    });

    return Object.values(table).sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      return b.gf - b.gc - (a.gf - a.gc);
    });
  }

  // =====================================
  // ADMINS
  // =====================================

  async function getAdmins() {
    const { data, error } = await client.from("admins").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function addAdmin({ discordId, discordUsername, addedByDiscordId }) {
    const { data, error } = await client
      .from("admins")
      .insert({
        discord_id: discordId,
        discord_username: discordUsername || null,
        added_by_discord_id: addedByDiscordId,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function removeAdmin(id) {
    const { error } = await client.from("admins").delete().eq("id", id);
    if (error) throw error;
  }

  // =====================================
  // HISTORIAL / AUDITORÍA
  // =====================================

  async function getAuditLog(limit) {
    const { data, error } = await client
      .from("audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit || 100);
    if (error) throw error;
    return data || [];
  }

  async function revertAuditEntry(entry) {
    const table = entry.table_name;

    if (entry.action === "INSERT") {
      // Deshacer una creación: borrar el registro creado.
      const { error } = await client.from(table).delete().eq("id", entry.record_id);
      if (error) throw error;
      return;
    }

    if (entry.action === "DELETE") {
      // Deshacer un borrado: volver a insertar el estado anterior.
      const restore = Object.assign({}, entry.before_data);
      const { error } = await client.from(table).insert(restore);
      if (error) throw error;
      return;
    }

    if (entry.action === "UPDATE") {
      // Deshacer una edición: volver a poner el estado anterior.
      const restore = Object.assign({}, entry.before_data);
      delete restore.id;
      const { error } = await client.from(table).update(restore).eq("id", entry.record_id);
      if (error) throw error;
      return;
    }
  }

  // =====================================
  // SETTINGS (temporada editable, etc.)
  // =====================================

  async function getSetting(key, fallback) {
    const { data, error } = await client.from("settings").select("value").eq("key", key).maybeSingle();
    if (error) throw error;
    return data ? data.value : fallback;
  }

  async function setSetting(key, value) {
    const { error } = await client
      .from("settings")
      .upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) throw error;
  }

  // =====================================
  // NOTIFICACIONES
  // =====================================

  async function getNotifications(limit) {
    const { data, error } = await client
      .from("notifications")
      .select("*, home_team:teams!notifications_home_team_id_fkey(*), away_team:teams!notifications_away_team_id_fkey(*)")
      .order("created_at", { ascending: false })
      .limit(limit || 30);
    if (error) throw error;
    return data || [];
  }

  // =====================================
  // FOTO DE JUGADOR
  // =====================================

  async function updatePlayerAvatar(playerId, avatarUrl) {
    const { error } = await client.from("players").update({ avatar_url: avatarUrl }).eq("id", playerId);
    if (error) throw error;
  }

  // =====================================
  // TABLA DE GOLEADORES / ASISTENTES
  // =====================================

  async function getLeaderboard(season, type, limit) {
    // type: "gol" | "asistencia" | "mvp" | "tarjeta_amarilla" | "tarjeta_roja"
    const matches = await getMatches(season);
    const matchIds = matches.filter((m) => m.status === "jugado").map((m) => m.id);
    if (!matchIds.length) return [];

    const { data, error } = await client
      .from("match_events")
      .select("*, player:players!match_events_player_id_fkey(*), team:teams!match_events_team_id_fkey(*)")
      .eq("type", type)
      .in("match_id", matchIds);
    if (error) throw error;

    const counts = {};
    (data || []).forEach((ev) => {
      if (!ev.player) return;
      const key = ev.player.id;
      if (!counts[key]) counts[key] = { player: ev.player, team: ev.team, count: 0 };
      counts[key].count++;
    });

    return Object.values(counts)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit || 10);
  }

  // =====================================
  // PLAYOFF
  // =====================================

  async function getPlayoffMatch(season) {
    const { data, error } = await client
      .from("matches")
      .select(
        "*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*), stadium:stadiums!matches_stadium_id_fkey(*)"
      )
      .eq("season", season)
      .eq("is_playoff", true)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function getPlayerByDiscordId(discordId) {
    const { data, error } = await client.from("players").select("*").eq("discord_id", discordId).maybeSingle();
    if (error) throw error;
    return data;
  }

  async function updatePlayerVisibility(playerId, isPublic) {
    const { error } = await client.from("players").update({ is_public: isPublic }).eq("id", playerId);
    if (error) throw error;
  }

  async function updateMyAvatar(discordId, avatarUrl) {
    // El propio jugador solo puede editar su fila si discord_id coincide con su sesión (RLS lo exige).
    const { error } = await client.from("players").update({ avatar_url: avatarUrl }).eq("discord_id", discordId);
    if (error) throw error;
  }

  async function computeCareerStats(playerId) {
    const { data: events, error } = await client
      .from("match_events")
      .select("*, match:matches!match_events_match_id_fkey(*)")
      .eq("player_id", playerId);
    if (error) throw error;

    const stats = { goles: 0, asistencias: 0, tarjetas_amarillas: 0, tarjetas_rojas: 0, mvps: 0, partidos_jugados: 0 };
    const matchesPlayed = new Set();
    (events || []).forEach((ev) => {
      if (ev.type === "gol") stats.goles++;
      if (ev.type === "asistencia") stats.asistencias++;
      if (ev.type === "tarjeta_amarilla") stats.tarjetas_amarillas++;
      if (ev.type === "tarjeta_roja") stats.tarjetas_rojas++;
      if (ev.type === "mvp") stats.mvps++;
      if (ev.match_id) matchesPlayed.add(ev.match_id);
    });
    stats.partidos_jugados = matchesPlayed.size;
    return stats;
  }

  async function getPlayerPublicProfile(playerId) {
    const { data: player, error: playerError } = await client.from("players").select("*").eq("id", playerId).maybeSingle();
    if (playerError) throw playerError;
    if (!player) return null;

    if (player.is_public === false) {
      return { player, isPublic: false, stats: null, contracts: [] };
    }

    const stats = await computeCareerStats(player.id);
    const { data: contracts, error: contractsError } = await client
      .from("contracts")
      .select("*, team:teams!contracts_team_id_fkey(*)")
      .eq("player_id", player.id)
      .order("signed_season", { ascending: false });
    if (contractsError) throw contractsError;

    return { player, isPublic: true, stats, contracts: contracts || [] };
  }

  // =====================================
  // PRESENCIA (usuarios conectados ahora mismo)
  // =====================================

  function trackOnlinePresence(key, onCountChange) {
    const channel = client.channel("ifl-online", { config: { presence: { key } } });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      onCountChange(Object.keys(state).length);
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ online_at: new Date().toISOString() });
      }
    });

    return channel;
  }

  // =====================================
  // RANGOS
  // =====================================

  async function getRanks() {
    const { data, error } = await client.from("ranks").select("*").order("name", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function addRank(name) {
    const { data, error } = await client.from("ranks").insert({ name }).select().single();
    if (error) throw error;
    return data;
  }

  // Un jugador puede tener varios rangos a la vez: cada llamada AÑADE el
  // rango indicado (no sustituye los que ya tenía). Si ya lo tenía, no falla.
  async function assignPlayerRank(playerId, rankId) {
    const { error } = await client
      .from("player_ranks")
      .upsert({ player_id: playerId, rank_id: rankId }, { onConflict: "player_id,rank_id" });
    if (error) throw error;
  }

  async function removePlayerRank(playerId, rankId) {
    const { error } = await client
      .from("player_ranks")
      .delete()
      .eq("player_id", playerId)
      .eq("rank_id", rankId);
    if (error) throw error;
  }

  async function getPlayersWithRanks() {
    const { data, error } = await client
      .from("player_ranks")
      .select("player:players!player_ranks_player_id_fkey(*), rank:ranks!player_ranks_rank_id_fkey(*)");
    if (error) throw error;

    // Agrupamos por jugador: cada jugador sale una vez con la lista de sus rangos.
    const byPlayer = {};
    (data || []).forEach((row) => {
      if (!row.player) return;
      if (!byPlayer[row.player.id]) byPlayer[row.player.id] = Object.assign({}, row.player, { ranks: [] });
      if (row.rank) byPlayer[row.player.id].ranks.push(row.rank);
    });
    return Object.values(byPlayer);
  }

  async function setTeamOwner(teamId, playerId) {
    const { error } = await client.from("teams").update({ owner_player_id: playerId }).eq("id", teamId);
    if (error) throw error;
  }

  // =====================================
  // MI CLUB (Team Owner)
  // =====================================

  async function getMyOwnedTeam(discordId) {
    if (!discordId) return null;
    const { data: player, error: playerError } = await client
      .from("players")
      .select("*")
      .eq("discord_id", discordId)
      .maybeSingle();
    if (playerError) throw playerError;
    if (!player) return null;

    const { data: team, error: teamError } = await client
      .from("teams")
      .select("*")
      .eq("owner_player_id", player.id)
      .maybeSingle();
    if (teamError) throw teamError;
    if (!team) return null;

    const { data: stadium, error: stadiumError } = await client
      .from("stadiums")
      .select("*")
      .eq("team_id", team.id)
      .maybeSingle();
    if (stadiumError) throw stadiumError;

    return { team, stadium: stadium || null };
  }

  async function updateTeamDescription(teamId, description) {
    const { error } = await client.from("teams").update({ description }).eq("id", teamId);
    if (error) throw error;
  }

  // =====================================
  // PREMIOS: dinero, victorias, trofeos
  // =====================================

  async function getTeamsByBudget(limit) {
    const { data, error } = await client
      .from("teams")
      .select("*")
      .order("budget", { ascending: false })
      .limit(limit || 10);
    if (error) throw error;
    return data || [];
  }

  async function computeTeamWins(season, limit) {
    const matches = (await getMatches(season)).filter((m) => m.status === "jugado" && m.home_team && m.away_team);
    const counts = {};
    matches.forEach((m) => {
      let winner = null;
      if (m.home_goals > m.away_goals) winner = m.home_team;
      else if (m.away_goals > m.home_goals) winner = m.away_team;
      if (!winner) return;
      if (!counts[winner.id]) counts[winner.id] = { team: winner, count: 0 };
      counts[winner.id].count++;
    });
    return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, limit || 10);
  }

  async function getTrophies() {
    const { data, error } = await client
      .from("trophies")
      .select("*, team:teams!trophies_team_id_fkey(*)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function addTrophy({ title, icon, teamId, description, season }) {
    const { data, error } = await client
      .from("trophies")
      .insert({
        title,
        icon: icon || null,
        team_id: teamId || null,
        description: description || null,
        season: season || null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function deleteTrophy(id) {
    const { error } = await client.from("trophies").delete().eq("id", id);
    if (error) throw error;
  }

  return {
    client,
    isAdmin,
    isSuperAdmin,
    getTeams,
    addTeam,
    updateTeam,
    deleteTeam,
    getStadiums,
    addStadium,
    updateStadium,
    deleteStadium,
    searchPlayers,
    findOrCreatePlayer,
    getPlayerCareer,
    getPlayerByDiscordId,
    updatePlayerAvatar,
    updatePlayerVisibility,
    updateMyAvatar,
    getPlayerPublicProfile,
    trackOnlinePresence,
    getContracts,
    getContractsByTeam,
    addContract,
    deleteContract,
    advanceSeason,
    getMatches,
    addMatch,
    deleteMatch,
    setMatchResult,
    getMatchEvents,
    computeStandings,
    getAdmins,
    addAdmin,
    removeAdmin,
    getAuditLog,
    revertAuditEntry,
    getSetting,
    setSetting,
    getNotifications,
    getLeaderboard,
    getPlayoffMatch,
    getRanks,
    addRank,
    assignPlayerRank,
    removePlayerRank,
    getPlayersWithRanks,
    setTeamOwner,
    getMyOwnedTeam,
    updateTeamDescription,
    getTeamsByBudget,
    computeTeamWins,
    getTrophies,
    addTrophy,
    deleteTrophy,
  };
})();
