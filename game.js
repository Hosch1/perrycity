/* =========================================================
   PERRYCITY — PHASE 1 (final)
   Kamera, Grid, Karte, Gebäude, Sounds, Multiplayer
   ========================================================= */

/* ---------- SUPABASE ---------- */

const SUPABASE_URL =
    "https://nrloacwgehhukzkgtoas.supabase.co";

const SUPABASE_KEY =
    "sb_publishable_EUQuU4qxS8pPHuBCc7R_tg_6RXLtNN6";

const client = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);


/* ---------- WELT ---------- */

const WORLD_W = 3600;
const WORLD_H = 3600;
const TILE    = 64;
const COLS    = WORLD_W / TILE;
const ROWS    = WORLD_H / TILE;

const MAIN_RD_COL = 24;
const MAIN_RD_ROW = 24;
const RIVER_ROW   = 29;
const SIDE_COLS       = [4, 10, 16, 20, 30, 36, 42];
const CROSS_ROWS_TOP  = [7, 14, 20];
const CROSS_ROWS_BOT  = [34, 40, 46];

function isOnRoad(gx, gy) {
    if (gy === MAIN_RD_ROW) return true;
    if (gx === MAIN_RD_COL) return true;
    for (var i = 0; i < SIDE_COLS.length; i++) {
        if (gx === SIDE_COLS[i]) return true;
    }
    for (var j = 0; j < CROSS_ROWS_TOP.length; j++) {
        if (gy === CROSS_ROWS_TOP[j]) return true;
    }
    for (var j = 0; j < CROSS_ROWS_BOT.length; j++) {
        if (gy === CROSS_ROWS_BOT[j]) return true;
    }
    if (gy === RIVER_ROW || gy === RIVER_ROW + 1) return true;
    return false;
}


/* ---------- STATE ---------- */

let currentPlayer = null;
let playerData    = null;
let game          = null;
let sceneRef      = null;

const cam = {
    speed:     6,
    zoomMin:   0.5,
    zoomMax:   2.0,
    zoomSpeed: 0.0012,
    dragging:  false,
    lastX:     0,
    lastY:     0
};

const keys = {};

let buildingContainers = [];
let selectedBuilding   = null;
let refreshInterval    = null;


/* =========================================================
   SOUND (Web Audio API – keine externen Dateien)
   ========================================================= */

var audioCtx = null;

function ensureAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playClickSound() {
    ensureAudio();
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.1);
}

function playSelectSound() {
    ensureAudio();
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = "triangle";
    osc.frequency.setValueAtTime(500, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(900, audioCtx.currentTime + 0.06);
    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.12);
}


/* =========================================================
   HILFSFUNKTIONEN
   ========================================================= */

function normalizeName(name) {
    return name.trim().toLowerCase();
}

function internalLogin(name) {
    return normalizeName(name).replace(/[^a-z0-9_-]/g, "") + "@perrycity.auth";
}

function formatMoney(amount) {
    return new Intl.NumberFormat("de-DE").format(amount);
}


/* =========================================================
   INFO-PANEL
   ========================================================= */

function showInfoPanel(data) {

    document.getElementById("info-icon").textContent  = data.icon  || "🏢";
    document.getElementById("info-name").textContent  = data.name  || "Gebäude";
    document.getElementById("info-type").textContent  = data.category || "";
    document.getElementById("info-owner").textContent = data.ownerName || "-";

    var html = "";
    if (data.income !== undefined) {
        html += '<div class="info-stat-row"><span class="info-stat-label">Einkommen</span><span class="info-stat-value">' + formatMoney(data.income) + ' €/min</span></div>';
    }
    if (data.level !== undefined) {
        html += '<div class="info-stat-row"><span class="info-stat-label">Stufe</span><span class="info-stat-value">' + data.level + ' / ' + (data.maxLevel || 5) + '</span></div>';
    }
    document.getElementById("info-stats").innerHTML = html;

    document.getElementById("info-panel").classList.remove("hidden");
}

function closeInfoPanel() {
    document.getElementById("info-panel").classList.add("hidden");
}


/* =========================================================
   REGISTRIEREN
   ========================================================= */

async function register() {

    var nameEl = document.getElementById("player-name");
    var passEl = document.getElementById("password");
    var msgEl  = document.getElementById("message");
    var playerName = nameEl.value.trim();
    var password   = passEl.value;

    if (!playerName || !password) { msgEl.textContent = "Bitte Spielername und Passwort eingeben."; return; }
    if (playerName.length < 3) { msgEl.textContent = "Mind. 3 Zeichen."; return; }
    if (playerName.length > 20) { msgEl.textContent = "Max. 20 Zeichen."; return; }
    if (password.length < 6) { msgEl.textContent = "Passwort mind. 6 Zeichen."; return; }
    if (!/^[a-zA-Z0-9_-]+$/.test(playerName)) { msgEl.textContent = "Nur Buchstaben, Zahlen, _ und -."; return; }

    var loginName = normalizeName(playerName);
    msgEl.textContent = "Spieler wird erstellt...";

    try {
        var { data: existing } = await client.from("players").select("id").eq("login_name", loginName).maybeSingle();
        if (existing) { msgEl.textContent = "Name bereits vergeben."; return; }

        var { data: authData, error: authErr } = await client.auth.signUp({
            email: internalLogin(playerName),
            password: password,
            options: { data: { player_name: playerName } }
        });

        if (authErr) { msgEl.textContent = authErr.message; return; }
        if (!authData.user) { msgEl.textContent = "Account konnte nicht erstellt werden."; return; }
        if (!authData.session) { msgEl.textContent = "Account erstellt. Confirm email muss aus sein."; return; }

        var spawnX = Math.floor(COLS / 2);
        var spawnY = Math.floor(ROWS / 2) - 5;

        var { error: pErr } = await client.from("players").insert({
            id: authData.user.id, player_name: playerName, login_name: loginName,
            money: 10000, grid_x: spawnX, grid_y: spawnY
        });

        if (pErr) { msgEl.textContent = "Profil-Fehler."; return; }

        msgEl.textContent = "Willkommen in Perrycity!";
        await loadGame();

    } catch (err) {
        console.error(err);
        msgEl.textContent = "Unerwarteter Fehler.";
    }
}


/* =========================================================
   LOGIN
   ========================================================= */

async function login() {

    var nameEl = document.getElementById("player-name");
    var passEl = document.getElementById("password");
    var msgEl  = document.getElementById("message");
    var playerName = nameEl.value.trim();
    var password   = passEl.value;

    if (!playerName || !password) { msgEl.textContent = "Bitte Spielername und Passwort eingeben."; return; }

    msgEl.textContent = "Login...";

    try {
        var { data, error } = await client.auth.signInWithPassword({
            email: internalLogin(playerName), password: password
        });

        if (error) { msgEl.textContent = "Name oder Passwort falsch."; return; }
        if (!data.user) { msgEl.textContent = "Login fehlgeschlagen."; return; }

        await loadGame();
    } catch (err) {
        console.error(err);
        msgEl.textContent = "Unerwarteter Fehler.";
    }
}


/* =========================================================
   SPIEL LADEN
   ========================================================= */

async function loadGame() {
    try {
        var { data: { user } } = await client.auth.getUser();
        if (!user) return;
        currentPlayer = user;

        var { data, error } = await client.from("players").select("*").eq("id", user.id).single();
        if (error) { console.error(error); return; }

        playerData = data;
        document.getElementById("display-name").textContent = data.player_name;
        document.getElementById("money").textContent = formatMoney(data.money);
        document.getElementById("login-screen").style.display = "none";
        document.getElementById("game-screen").style.display  = "block";

        startGame(data);
    } catch (err) { console.error(err); }
}

async function logout() {
    if (refreshInterval) clearInterval(refreshInterval);
    await client.auth.signOut();
    location.reload();
}


/* =========================================================
   SPIEL STARTEN
   ========================================================= */

function startGame(player) {
    if (game) { game.destroy(true); game = null; }

    game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: "game",
        width: window.innerWidth,
        height: window.innerHeight - 62,
        backgroundColor: "#6db56d",
        scene: {
            create: function () {
                sceneRef = this;
                createWorld(this, player);
            },
            update: function () {
                updateCamera(this);
            }
        }
    });

    setTimeout(function () {
        var h = document.getElementById("controls-hint");
        if (h) h.classList.add("fade-out");
    }, 6000);

    /* Auto-Refresh alle 10 Sekunden */
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(function () {
        if (sceneRef) refreshBuildings(sceneRef, player);
    }, 10000);
}


/* =========================================================
   KAMERA
   ========================================================= */

function updateCamera(scene) {
    var c = scene.cameras.main;
    var dx = 0, dy = 0;

    if (keys["KeyA"] || keys["ArrowLeft"])  dx -= 1;
    if (keys["KeyD"] || keys["ArrowRight"]) dx += 1;
    if (keys["KeyW"] || keys["ArrowUp"])    dy -= 1;
    if (keys["KeyS"] || keys["ArrowDown"])  dy += 1;

    if (dx !== 0 || dy !== 0) {
        var len = Math.sqrt(dx * dx + dy * dy);
        c.scrollX += (dx / len) * cam.speed / c.zoom;
        c.scrollY += (dy / len) * cam.speed / c.zoom;
    }

    var p = scene.input.activePointer;
    if (cam.dragging) {
        c.scrollX += (cam.lastX - p.x) / c.zoom;
        c.scrollY += (cam.lastY - p.y) / c.zoom;
        cam.lastX = p.x;
        cam.lastY = p.y;
    }
}


/* =========================================================
   WELT
   ========================================================= */

function createWorld(scene, player) {
    drawBaseMap(scene);
    drawGridLines(scene);
    setupCamera(scene);
    setupInput(scene);
    placeBuildings(scene, player);
}


/* =========================================================
   GRUNDKARTE + STRASSEN
   ========================================================= */

function drawBaseMap(scene) {
    var g = scene.add.graphics();
    var M = TILE;

    g.fillStyle(0x6db56d, 1);
    g.fillRect(0, 0, WORLD_W, WORLD_H);

    g.fillStyle(0x3daee0, 1);
    g.fillRect(0, RIVER_ROW * M, WORLD_W, M * 2);
    g.fillStyle(0x6dd5ea, 0.35);
    g.fillRect(0, RIVER_ROW * M + 6, WORLD_W, 3);

    g.fillStyle(0x555b5e, 1);
    SIDE_COLS.forEach(function (col) { g.fillRect(col * M, RIVER_ROW * M, M, M * 2); });
    g.fillRect(MAIN_RD_COL * M, RIVER_ROW * M, M, M * 2);

    drawRoads(g, M);
}

function drawRoads(g, M) {
    var rc = 0x555b5e;

    CROSS_ROWS_TOP.concat(CROSS_ROWS_BOT).forEach(function (row) {
        g.fillStyle(rc, 1);
        g.fillRect(0, row * M, WORLD_W, M);
        drawHLines(g, 0, row * M, WORLD_W, M);
    });

    g.fillStyle(rc, 1);
    g.fillRect(0, MAIN_RD_ROW * M, WORLD_W, M);
    drawHLines(g, 0, MAIN_RD_ROW * M, WORLD_W, M);

    g.fillStyle(rc, 1);
    g.fillRect(MAIN_RD_COL * M, 0, M, WORLD_H);
    drawVLines(g, MAIN_RD_COL * M, 0, M, WORLD_H);

    SIDE_COLS.forEach(function (col) {
        g.fillStyle(rc, 1);
        g.fillRect(col * M, 0, M, WORLD_H);
        drawVLines(g, col * M, 0, M, WORLD_H);
    });
}

function drawHLines(g, x, y, w, h) {
    g.fillStyle(0xffffff, 0.3);
    var cy = y + h / 2 - 1, cx = x + 10;
    while (cx < x + w - 10) { g.fillRect(cx, cy, 18, 3); cx += 32; }
}

function drawVLines(g, x, y, w, h) {
    g.fillStyle(0xffffff, 0.3);
    var cx = x + w / 2 - 1, cy = y + 10;
    while (cy < y + h - 10) { g.fillRect(cx, cy, 3, 18); cy += 32; }
}

function drawGridLines(scene) {
    var g = scene.add.graphics();
    g.lineStyle(1, 0x000000, 0.04);
    for (var x = 0; x <= WORLD_W; x += TILE) { g.moveTo(x, 0); g.lineTo(x, WORLD_H); }
    for (var y = 0; y <= WORLD_H; y += TILE) { g.moveTo(0, y); g.lineTo(WORLD_W, y); }
    g.strokePath();
}


/* =========================================================
   GEBÄUDE – AUS SUPABASE LADEN
   ========================================================= */

async function placeBuildings(scene, player) {

    buildingContainers = [];

    var { data: dbBuildings, error } = await client.from("buildings").select("*");
    if (error) console.error("Gebaeude-Lade-Fehler:", error);

    var all = dbBuildings || [];
    var occupied = {};

    all.forEach(function (b) {
        occupied[b.grid_x + "," + b.grid_y] = true;

        createBuilding(
            scene,
            b.grid_x * TILE,
            b.grid_y * TILE,
            {
                icon:      b.icon,
                name:      b.name,
                category:  b.category,
                ownerName: b.owner_name || "Unbekannt",
                income:    b.income,
                level:     b.level,
                maxLevel:  b.max_level,
                isOwn:     b.owner_id === player.id
            }
        );
    });

    /* Eigenes Gebäude anlegen falls keins vorhanden */
    var hasOwn = all.some(function (b) { return b.owner_id === player.id; });

    if (!hasOwn) {
        var px = player.grid_x || Math.floor(COLS / 2);
        var py = player.grid_y || Math.floor(ROWS / 2) - 5;

        var tries = 0;
        while (occupied[px + "," + py] && tries < 200) {
            px = 3 + Math.floor(Math.random() * (COLS - 6));
            py = 3 + Math.floor(Math.random() * (ROWS - 10));
            if (isOnRoad(px, py)) { tries++; continue; }
            break;
        }

        await client.from("buildings").insert({
            owner_id:   player.id,
            owner_name: player.player_name,
            name:       player.player_name + "s Firma",
            icon:       "🏢",
            category:   "Unternehmen",
            grid_x:     px,
            grid_y:     py,
            level:      1,
            max_level:  5,
            income:     0
        });

        createBuilding(scene, px * TILE, py * TILE, {
            icon: "🏢", name: player.player_name + "s Firma",
            category: "Unternehmen", ownerName: player.player_name,
            income: 0, level: 1, maxLevel: 5, isOwn: true
        });
    }
}


/* =========================================================
   GEBÄUDE – REFRESH (alle 10s)
   ========================================================= */

async function refreshBuildings(scene, player) {

    var { data: dbBuildings } = await client.from("buildings").select("*");
    if (!dbBuildings) return;

    /* Alte Container entfernen */
    buildingContainers.forEach(function (c) { c.destroy(); });
    buildingContainers = [];

    dbBuildings.forEach(function (b) {
        createBuilding(scene, b.grid_x * TILE, b.grid_y * TILE, {
            icon:      b.icon,
            name:      b.name,
            category:  b.category,
            ownerName: b.owner_name || "Unbekannt",
            income:    b.income,
            level:     b.level,
            maxLevel:  b.max_level,
            isOwn:     b.owner_id === player.id
        });
    });
}


/* =========================================================
   GEBÄUDE – ERSTELLEN (Container mit Animation)
   ========================================================= */

function createBuilding(scene, x, y, data) {

    var M  = TILE;
    var cx = x + M / 2;
    var cy = y + M / 2;

    var container = scene.add.container(cx, cy);

    /* --- Grafik --- */
    var g = scene.add.graphics();

    var isOwn = data.isOwn;

    /* Schatten */
    g.fillStyle(0x000000, 0.2);
    g.fillRoundedRect(-M/2 + 6, -M/2 + 30, M - 12, 8, 3);

    /* Gebaeude-Body */
    var bodyColor = isOwn ? 0x0a6b75 : 0x2c5f6e;
    g.fillStyle(bodyColor, 1);
    g.fillRoundedRect(-M/2 + 2, -M/2 + 16, M - 4, M - 20, 4);

    /* Dach-Leiste */
    var roofColor = isOwn ? 0x55fff0 : 0x40b8a8;
    g.fillStyle(roofColor, 1);
    g.fillRoundedRect(-M/2 + 2, -M/2 + 16, M - 4, 8, { tl: 4, tr: 4, bl: 0, br: 0 });

    /* Glow-Ring (nur eigenes Gebaeude) */
    if (isOwn) {
        g.lineStyle(2, 0x55fff0, 0.4);
        g.strokeRoundedRect(-M/2 - 1, -M/2 + 14, M + 2, M - 16, 6);
    }

    /* Fenster */
    g.fillStyle(0xc8f0f8, 0.85);
    g.fillRect(-M/2 + 10, -M/2 + 30, 12, 10);
    g.fillRect(-4, -M/2 + 30, 12, 10);
    g.fillRect(M/2 - 22, -M/2 + 30, 12, 10);

    /* Fenster-Details */
    g.lineStyle(1, 0x000000, 0.1);
    g.strokeRect(-M/2 + 10, -M/2 + 30, 12, 10);
    g.strokeRect(-4, -M/2 + 30, 12, 10);
    g.strokeRect(M/2 - 22, -M/2 + 30, 12, 10);

    /* Tuer */
    g.fillStyle(0x143b42, 1);
    g.fillRoundedRect(-6, -M/2 + 44, 12, 16, { tl: 6, tr: 6, bl: 0, br: 0 });
    g.fillStyle(0xd4a54a, 1);
    g.fillCircle(2, -M/2 + 52, 1.5);

    container.add(g);


    /* --- Schild --- */
    var labelText = data.icon + " " + data.name;
    var labelW = labelText.length * 7 + 24;

    var schildBg = scene.add.graphics();
    schildBg.fillStyle(isOwn ? 0x0a6b75 : 0x2c5f6e, 0.95);
    schildBg.fillRoundedRect(-labelW / 2, -M/2 - 14, labelW, 22, 5);
    container.add(schildBg);

    var label = scene.add.text(0, -M/2 - 3, labelText, {
        fontSize: "13px", fontStyle: "bold", color: "#ffffff", align: "center"
    }).setOrigin(0.5, 0.5);
    container.add(label);

    /* Besitzer-Name */
    var ownerLabel = scene.add.text(0, M/2 - 6, data.ownerName, {
        fontSize: "10px", color: isOwn ? "#55fff0" : "#a0d0c8"
    }).setOrigin(0.5, 0.5);
    container.add(ownerLabel);


    /* --- Interaktive Zone --- */
    var hitZone = scene.add.zone(0, 0, M + 20, M + 30);
    hitZone.setInteractive(
        new Phaser.Geom.Rectangle(-M/2 - 10, -M/2 - 15, M + 20, M + 30),
        Phaser.Geom.Rectangle.Contains
    );
    container.add(hitZone);


    /* --- Hover-Effekt --- */
    hitZone.on("pointerover", function () {
        scene.tweens.add({
            targets: container,
            scaleX: 1.12,
            scaleY: 1.12,
            duration: 120,
            ease: "Back.easeOut"
        });
    });

    hitZone.on("pointerout", function () {
        if (selectedBuilding !== container) {
            scene.tweens.add({
                targets: container,
                scaleX: 1,
                scaleY: 1,
                duration: 100,
                ease: "Sine.easeOut"
            });
        }
    });


    /* --- Klick-Effekt --- */
    hitZone.on("pointerdown", function () {

        playSelectSound();

        /* Vorheriges Aufheben */
        if (selectedBuilding && selectedBuilding !== container) {
            scene.tweens.add({
                targets: selectedBuilding,
                scaleX: 1, scaleY: 1, duration: 150
            });
        }

        selectedBuilding = container;

        /* Pop-Up Animation */
        scene.tweens.add({
            targets: container,
            scaleX: 1.25,
            scaleY: 1.25,
            duration: 150,
            ease: "Back.easeOut",
            yoyo: true,
            hold: 200,
            onComplete: function () {
                if (selectedBuilding === container) {
                    scene.tweens.add({
                        targets: container,
                        scaleX: 1.12,
                        scaleY: 1.12,
                        duration: 100
                    });
                }
            }
        });

        showInfoPanel(data);
    });


    /* Zuerst unten, Gebäude nach oben */
    container.setDepth(y);

    buildingContainers.push(container);

    return container;
}


/* =========================================================
   CAMERA SETUP
   ========================================================= */

function setupCamera(scene) {
    var c = scene.cameras.main;
    c.setBounds(0, 0, WORLD_W, WORLD_H);

    if (playerData) {
        var px = (playerData.grid_x || Math.floor(COLS / 2)) * TILE;
        var py = (playerData.grid_y || Math.floor(ROWS / 2) - 5) * TILE;
        c.centerOn(px + TILE / 2, py + TILE / 2);
    }

    scene.input.on("wheel", function (ptr, go, dx, dy) {
        var z = c.zoom - dy * cam.zoomSpeed;
        c.zoom = Math.max(cam.zoomMin, Math.min(cam.zoomMax, z));
    });

    scene.input.on("pointerdown", function (ptr) {
        if (ptr.leftButtonDown()) {
            cam.dragging = true;
            cam.lastX = ptr.x;
            cam.lastY = ptr.y;
        }
    });

    scene.input.on("pointerup", function (ptr) {
        if (ptr.leftButtonReleased()) cam.dragging = false;
    });
}

function setupInput(scene) {
    document.addEventListener("keydown", function (e) { keys[e.code] = true; });
    document.addEventListener("keyup", function (e) { keys[e.code] = false; });
}


/* =========================================================
   SESSION + RESIZE
   ========================================================= */

window.addEventListener("load", async function () {
    try {
        var { data: { session } } = await client.auth.getSession();
        if (session) await loadGame();
    } catch (err) { console.error(err); }
});

window.addEventListener("resize", function () {
    if (game) game.scale.resize(window.innerWidth, window.innerHeight - 62);
});
