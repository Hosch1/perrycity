/* =========================================================
   PERRYCITY — PHASE 1 (gefixt)
   Kamera, Grid, Karte, Klick-System, Info-Panel
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


/* ---------- WELT-KONSTANTEN ---------- */

const WORLD_W = 3600;
const WORLD_H = 3600;
const TILE    = 64;

const COLS = WORLD_W / TILE;
const ROWS = WORLD_H / TILE;


/* ---------- STRASSEN-POSITIONEN (in Tiles) ---------- */

const MAIN_RD_COL = 24;
const MAIN_RD_ROW = 24;
const RIVER_ROW   = 29;

const SIDE_COLS   = [4, 10, 16, 20, 30, 36, 42];
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


/* ---------- SPIELVARIABLEN ---------- */

let currentPlayer = null;
let playerData    = null;
let game          = null;

let sceneRef      = null;
let mapGraphics   = null;
let buildingSprites = [];


/* ---------- KAMERA-STATE ---------- */

const cam = {
    speed:     6,
    zoomMin:   0.5,
    zoomMax:   2.0,
    zoomSpeed: 0.0012,
    dragging:  false,
    lastX:     0,
    lastY:     0
};


/* ---------- STEUERUNG ---------- */

const keys = {};


/* =========================================================
   HILFSFUNKTIONEN
   ========================================================= */

function normalizeName(name) {
    return name.trim().toLowerCase();
}

function internalLogin(name) {
    return (
        normalizeName(name)
            .replace(/[^a-z0-9_-]/g, "")
        + "@perrycity.auth"
    );
}

function formatMoney(amount) {
    return new Intl.NumberFormat("de-DE")
        .format(amount);
}


/* =========================================================
   INFO-PANEL
   ========================================================= */

function showInfoPanel(data) {

    const panel  = document.getElementById("info-panel");
    const icon   = document.getElementById("info-icon");
    const name   = document.getElementById("info-name");
    const type   = document.getElementById("info-type");
    const stats  = document.getElementById("info-stats");
    const owner  = document.getElementById("info-owner");

    icon.textContent  = data.icon  || "🏢";
    name.textContent  = data.name  || "Unbekanntes Gebäude";
    type.textContent  = data.category || "";
    owner.textContent = data.ownerName || "-";

    let statsHTML = "";

    if (data.income !== undefined) {
        statsHTML += '<div class="info-stat-row">' +
            '<span class="info-stat-label">Einkommen</span>' +
            '<span class="info-stat-value">' + formatMoney(data.income) + ' €/min</span>' +
            '</div>';
    }

    if (data.level !== undefined) {
        statsHTML += '<div class="info-stat-row">' +
            '<span class="info-stat-label">Stufe</span>' +
            '<span class="info-stat-value">' + data.level + ' / ' + (data.maxLevel || 5) + '</span>' +
            '</div>';
    }

    if (data.population !== undefined) {
        statsHTML += '<div class="info-stat-row">' +
            '<span class="info-stat-label">Einwohner</span>' +
            '<span class="info-stat-value">' + data.population + '</span>' +
            '</div>';
    }

    stats.innerHTML = statsHTML;

    panel.classList.remove("hidden");
}

function closeInfoPanel() {
    document.getElementById("info-panel").classList.add("hidden");
}


/* =========================================================
   REGISTRIEREN
   ========================================================= */

async function register() {

    const nameEl = document.getElementById("player-name");
    const passEl = document.getElementById("password");
    const msgEl  = document.getElementById("message");

    if (!nameEl || !passEl) return;

    const playerName = nameEl.value.trim();
    const password   = passEl.value;

    if (!playerName || !password) {
        msgEl.textContent = "Bitte Spielername und Passwort eingeben.";
        return;
    }

    if (playerName.length < 3) {
        msgEl.textContent = "Der Spielername muss mindestens 3 Zeichen haben.";
        return;
    }

    if (playerName.length > 20) {
        msgEl.textContent = "Der Spielername darf höchstens 20 Zeichen haben.";
        return;
    }

    if (password.length < 6) {
        msgEl.textContent = "Das Passwort muss mindestens 6 Zeichen haben.";
        return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(playerName)) {
        msgEl.textContent = "Erlaubt sind nur Buchstaben, Zahlen, _ und -.";
        return;
    }

    const loginName = normalizeName(playerName);

    msgEl.textContent = "Spieler wird erstellt...";

    try {

        const { data: existing, error: exErr } = await client
            .from("players")
            .select("id")
            .eq("login_name", loginName)
            .maybeSingle();

        if (exErr) {
            msgEl.textContent = "Fehler bei der Namensprüfung.";
            return;
        }

        if (existing) {
            msgEl.textContent = "Dieser Spielername ist bereits vergeben.";
            return;
        }

        const internalEmail = internalLogin(playerName);

        const { data: authData, error: authErr } =
            await client.auth.signUp({
                email:    internalEmail,
                password: password,
                options: {
                    data: { player_name: playerName }
                }
            });

        if (authErr) {
            msgEl.textContent = authErr.message;
            return;
        }

        if (!authData.user) {
            msgEl.textContent = "Spieler konnte nicht erstellt werden.";
            return;
        }

        if (!authData.session) {
            msgEl.textContent = "Account erstellt. 'Confirm email' muss in Supabase aus sein.";
            return;
        }

        const spawnX = Math.floor(COLS / 2);
        const spawnY = Math.floor(ROWS / 2) - 5;

        const { error: pErr } = await client
            .from("players")
            .insert({
                id:          authData.user.id,
                player_name: playerName,
                login_name:  loginName,
                money:       10000,
                grid_x:      spawnX,
                grid_y:      spawnY
            });

        if (pErr) {
            msgEl.textContent = "Profil konnte nicht gespeichert werden.";
            return;
        }

        msgEl.textContent = "Willkommen in Perrycity!";

        await loadGame();

    } catch (err) {
        console.error("Registrierungsfehler:", err);
        msgEl.textContent = "Ein unerwarteter Fehler ist aufgetreten.";
    }
}


/* =========================================================
   LOGIN
   ========================================================= */

async function login() {

    const nameEl = document.getElementById("player-name");
    const passEl = document.getElementById("password");
    const msgEl  = document.getElementById("message");

    const playerName = nameEl.value.trim();
    const password   = passEl.value;

    if (!playerName || !password) {
        msgEl.textContent = "Bitte Spielername und Passwort eingeben.";
        return;
    }

    msgEl.textContent = "Login...";

    try {

        const internalEmail = internalLogin(playerName);

        const { data, error } =
            await client.auth.signInWithPassword({
                email:    internalEmail,
                password: password
            });

        if (error) {
            msgEl.textContent = "Spielername oder Passwort ist falsch.";
            return;
        }

        if (!data.user) {
            msgEl.textContent = "Login fehlgeschlagen.";
            return;
        }

        await loadGame();

    } catch (err) {
        console.error("Login-Fehler:", err);
        msgEl.textContent = "Ein unerwarteter Fehler ist aufgetreten.";
    }
}


/* =========================================================
   SPIEL LADEN
   ========================================================= */

async function loadGame() {

    try {

        const { data: { user } } =
            await client.auth.getUser();

        if (!user) return;

        currentPlayer = user;

        const { data, error } = await client
            .from("players")
            .select("*")
            .eq("id", user.id)
            .single();

        if (error) {
            console.error("Lade-Fehler:", error);
            document.getElementById("message").textContent =
                "Profil konnte nicht geladen werden.";
            return;
        }

        playerData = data;

        document.getElementById("display-name").textContent =
            data.player_name;

        document.getElementById("money").textContent =
            formatMoney(data.money);

        document.getElementById("login-screen").style.display = "none";
        document.getElementById("game-screen").style.display  = "block";

        startGame(data);

    } catch (err) {
        console.error("Fehler beim Laden:", err);
    }
}


/* =========================================================
   LOGOUT
   ========================================================= */

async function logout() {
    await client.auth.signOut();
    location.reload();
}


/* =========================================================
   SPIEL STARTEN
   ========================================================= */

function startGame(player) {

    if (game) {
        game.destroy(true);
        game = null;
    }

    const config = {

        type: Phaser.AUTO,

        parent: "game",

        width:  window.innerWidth,
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
    };

    game = new Phaser.Game(config);

    setTimeout(function () {
        var hint = document.getElementById("controls-hint");
        if (hint) hint.classList.add("fade-out");
    }, 6000);
}


/* =========================================================
   KAMERA
   ========================================================= */

function updateCamera(scene) {

    var c = scene.cameras.main;

    var dx = 0;
    var dy = 0;

    if (keys["KeyA"] || keys["ArrowLeft"])  dx -= 1;
    if (keys["KeyD"] || keys["ArrowRight"]) dx += 1;
    if (keys["KeyW"] || keys["ArrowUp"])    dy -= 1;
    if (keys["KeyS"] || keys["ArrowDown"])  dy += 1;

    if (dx !== 0 || dy !== 0) {
        var len = Math.sqrt(dx * dx + dy * dy);
        c.scrollX += (dx / len) * cam.speed / c.zoom;
        c.scrollY += (dy / len) * cam.speed / c.zoom;
    }

    var pointer = scene.input.activePointer;

    if (cam.dragging) {
        var diffX = cam.lastX - pointer.x;
        var diffY = cam.lastY - pointer.y;
        c.scrollX += diffX / c.zoom;
        c.scrollY += diffY / c.zoom;
        cam.lastX = pointer.x;
        cam.lastY = pointer.y;
    }
}


/* =========================================================
   WELT ERSTELLEN
   ========================================================= */

function createWorld(scene, player) {

    drawBaseMap(scene);
    drawGridLines(scene);
    placeBuildings(scene, player);
    setupCamera(scene);
    setupInput(scene);
}


/* =========================================================
   GRUNDKARTE
   ========================================================= */

function drawBaseMap(scene) {

    var g = scene.add.graphics();
    var M = TILE;

    /* --- Gras (gesamte Welt) --- */
    g.fillStyle(0x6db56d, 1);
    g.fillRect(0, 0, WORLD_W, WORLD_H);

    /* --- Fluss --- */
    g.fillStyle(0x3daee0, 1);
    g.fillRect(0, RIVER_ROW * M, WORLD_W, M * 2);

    g.fillStyle(0x6dd5ea, 0.35);
    g.fillRect(0, RIVER_ROW * M + 6, WORLD_W, 3);
    g.fillRect(0, RIVER_ROW * M + M - 4, WORLD_W, 2);

    /* --- Bruecken ueber dem Fluss --- */
    g.fillStyle(0x555b5e, 1);

    SIDE_COLS.forEach(function (col) {
        g.fillRect(col * M, RIVER_ROW * M, M, M * 2);
    });

    g.fillStyle(0x555b5e, 1);
    g.fillRect(MAIN_RD_COL * M, RIVER_ROW * M, M, M * 2);

    /* --- Strassen zeichnen --- */

    drawRoads(g, M);
}


function drawRoads(g, M) {

    var roadColor = 0x555b5e;
    var lineColor = 0xffffff;

    /* === HORIZONTAL (quer) === */

    var allCrossRows = CROSS_ROWS_TOP.concat(CROSS_ROWS_BOT);

    allCrossRows.forEach(function (row) {
        g.fillStyle(roadColor, 1);
        g.fillRect(0, row * M, WORLD_W, M);
        drawRoadLines(g, 0, row * M, WORLD_W, M);
    });

    /* Hauptstrasse horizontal */
    g.fillStyle(roadColor, 1);
    g.fillRect(0, MAIN_RD_ROW * M, WORLD_W, M);
    drawRoadLines(g, 0, MAIN_RD_ROW * M, WORLD_W, M);


    /* === VERTIKAL (laengs) === */

    /* Hauptstrasse vertikal */
    g.fillStyle(roadColor, 1);
    g.fillRect(MAIN_RD_COL * M, 0, M, WORLD_H);
    drawRoadLinesV(g, MAIN_RD_COL * M, 0, M, WORLD_H);

    /* Seitenstrassen */
    SIDE_COLS.forEach(function (col) {
        g.fillStyle(roadColor, 1);
        g.fillRect(col * M, 0, M, WORLD_H);
        drawRoadLinesV(g, col * M, 0, M, WORLD_H);
    });
}


function drawRoadLines(g, x, y, w, h) {
    g.fillStyle(0xffffff, 0.3);
    var cy = y + h / 2 - 1;
    var cx = x + 10;
    while (cx < x + w - 10) {
        g.fillRect(cx, cy, 18, 3);
        cx += 32;
    }
}

function drawRoadLinesV(g, x, y, w, h) {
    g.fillStyle(0xffffff, 0.3);
    var cx = x + w / 2 - 1;
    var cy = y + 10;
    while (cy < y + h - 10) {
        g.fillRect(cx, cy, 3, 18);
        cy += 32;
    }
}


/* =========================================================
   HÄUSER
   ========================================================= */

function drawHouse(g, x, y) {

    var wallPalette = [
        0xf5e6c8, 0xe8d5b0, 0xd4c4a0,
        0xf0dcc0, 0xfaf0e0, 0xe0d0b8
    ];
    var wall = wallPalette[Math.floor(Math.random() * wallPalette.length)];

    var roofPalette = [
        0xa03030, 0xb84040, 0x8b2020,
        0x993333, 0xc05050, 0x7a2828
    ];
    var roof = roofPalette[Math.floor(Math.random() * roofPalette.length)];

    /* Schatten */
    g.fillStyle(0x000000, 0.12);
    g.fillRect(x + 12, y + 58, 44, 6);

    /* Wand */
    g.fillStyle(wall, 1);
    g.fillRect(x + 8, y + 26, 48, 36);

    /* Dach */
    g.fillStyle(roof, 1);
    g.beginPath();
    g.moveTo(x + 4, y + 28);
    g.lineTo(x + 32, y + 8);
    g.lineTo(x + 60, y + 28);
    g.closePath();
    g.fillPath();

    /* Dach-Outline */
    g.lineStyle(1, 0x000000, 0.15);
    g.beginPath();
    g.moveTo(x + 4, y + 28);
    g.lineTo(x + 32, y + 8);
    g.lineTo(x + 60, y + 28);
    g.strokePath();

    /* Tuer */
    g.fillStyle(0x6b3a1f, 1);
    g.fillRect(x + 26, y + 44, 12, 18);
    g.fillStyle(0xd4a54a, 1);
    g.fillCircle(x + 35, y + 53, 1.5);

    /* Fenster */
    g.fillStyle(0x8ec8e8, 1);
    g.fillRect(x + 12, y + 32, 10, 10);
    g.fillRect(x + 42, y + 32, 10, 10);

    g.lineStyle(1, 0x000000, 0.1);
    g.strokeRect(x + 12, y + 32, 10, 10);
    g.strokeRect(x + 42, y + 32, 10, 10);
}


/* =========================================================
   GRID-LINIEN
   ========================================================= */

function drawGridLines(scene) {
    var g = scene.add.graphics();
    g.lineStyle(1, 0x000000, 0.04);

    for (var x = 0; x <= WORLD_W; x += TILE) {
        g.moveTo(x, 0);
        g.lineTo(x, WORLD_H);
    }
    for (var y = 0; y <= WORLD_H; y += TILE) {
        g.moveTo(0, y);
        g.lineTo(WORLD_W, y);
    }
    g.strokePath();
}


/* =========================================================
   GEBÄUDE + HÄUSER
   ========================================================= */

function placeBuildings(scene, player) {

    buildingSprites = [];

    var M = TILE;

    /* === WOHNHÄUSER PLATZIEREN === */

    var houseGrid = [];

    for (var gx = 1; gx < COLS - 1; gx++) {
        for (var gy = 1; gy < ROWS - 1; gy++) {
            if (isOnRoad(gx, gy)) continue;
            if (gx === MAIN_RD_COL || gx === MAIN_RD_COL + 1) continue;
            if (gy >= RIVER_ROW && gy <= RIVER_ROW + 1) continue;

            var nearMainX = Math.abs(gx - MAIN_RD_COL) <= 1;
            var nearMainY = Math.abs(gy - MAIN_RD_ROW) <= 1;
            if (nearMainX && nearMainY) continue;

            if ((gx + gy) % 3 === 0 && Math.random() < 0.45) {
                houseGrid.push([gx, gy]);
            }
        }
    }

    houseGrid.forEach(function (pos) {
        drawHouse(scene.add.graphics(), pos[0] * M, pos[1] * M);
    });


    /* === SPIELER-UNTERNEHMEN === */

    var px = player.grid_x || Math.floor(COLS / 2);
    var py = player.grid_y || Math.floor(ROWS / 2) - 5;

    var playerBldg = createClickableBuilding(
        scene, px * M, py * M,
        {
            icon:       "🏢",
            name:       player.player_name + "s Firma",
            category:   "Unternehmen",
            ownerName:  player.player_name,
            income:     0,
            level:      1,
            maxLevel:   5,
            isPlayer:   true
        }
    );
    buildingSprites.push(playerBldg);


    /* === NPC-GEBÄUDE === */

    var npcData = [
        { icon: "🍕", name: "Pizzeria Mario",    cat: "Restaurant",   income: 50  },
        { icon: "🛒", name: "Supermarkt Fresh",  cat: "Laden",        income: 30  },
        { icon: "🔧", name: "Werkstatt Braun",   cat: "Werkstatt",    income: 80  },
        { icon: "💼", name: "Agentur Schmidt",   cat: "Agentur",      income: 120 },
        { icon: "💻", name: "TechStart GmbH",    cat: "Tech-Startup", income: 200 },
        { icon: "🏨", name: "Hotel Panorama",    cat: "Hotel",        income: 150 },
        { icon: "🍕", name: "Bella Napoli",      cat: "Restaurant",   income: 55  },
        { icon: "🛒", name: "MarketKlein",       cat: "Laden",        income: 35  },
        { icon: "🔧", name: "AutoService Max",   cat: "Werkstatt",    income: 85  },
        { icon: "💼", name: "Beratung Plus",     cat: "Agentur",      income: 130 },
        { icon: "💻", name: "CodeFactory",       cat: "Tech-Startup", income: 210 },
        { icon: "🏨", name: "Grand Stay",        cat: "Hotel",        income: 160 },
    ];

    var occupied = {};
    occupied[px + "," + py] = true;

    npcData.forEach(function (b) {

        var tries = 0;

        while (tries < 500) {

            var gx = Math.floor(Math.random() * (COLS - 6)) + 3;
            var gy = Math.floor(Math.random() * (ROWS - 10)) + 3;

            if (occupied[gx + "," + gy])  { tries++; continue; }
            if (isOnRoad(gx, gy))         { tries++; continue; }
            if (gx === MAIN_RD_COL || gx === MAIN_RD_COL + 1) { tries++; continue; }
            if (gy >= RIVER_ROW && gy <= RIVER_ROW + 2) { tries++; continue; }

            occupied[gx + "," + gy] = true;

            var level = Math.floor(Math.random() * 5) + 1;

            createClickableBuilding(
                scene, gx * M, gy * M,
                {
                    icon:      b.icon,
                    name:      b.name,
                    category:  b.cat,
                    ownerName: "Stadt",
                    income:    b.income * level,
                    level:     level,
                    maxLevel:  5,
                    isPlayer:  false
                }
            );

            break;
        }
    });
}


function createClickableBuilding(scene, x, y, data) {

    var g = scene.add.graphics();
    var M = TILE;

    var isPlayer = data.isPlayer;

    /* Schatten */
    g.fillStyle(0x000000, 0.18);
    g.fillRect(x + 8, y + 58, M - 8, 6);

    /* Gebaeude-Body */
    var bodyColor = isPlayer ? 0x0a6b75 : 0x2c5f6e;
    g.fillStyle(bodyColor, 1);
    g.fillRect(x + 4, y + 20, M - 8, M - 26);

    /* Dach-Leiste */
    var roofColor = isPlayer ? 0x55fff0 : 0x40b8a8;
    g.fillStyle(roofColor, 1);
    g.fillRect(x + 4, y + 20, M - 8, 6);

    /* Fenster */
    g.fillStyle(0xc8f0f8, 0.85);
    g.fillRect(x + 10, y + 32, 10, 10);
    g.fillRect(x + 26, y + 32, 10, 10);
    g.fillRect(x + 42, y + 32, 10, 10);

    g.lineStyle(1, 0x000000, 0.08);
    g.strokeRect(x + 10, y + 32, 10, 10);
    g.strokeRect(x + 26, y + 32, 10, 10);
    g.strokeRect(x + 42, y + 32, 10, 10);

    /* Tuer */
    g.fillStyle(0x143b42, 1);
    g.fillRect(x + 26, y + 46, 12, 14);

    /* Schild */
    var labelText = data.icon + " " + data.name;
    var labelW = labelText.length * 7.5 + 20;

    var bg = scene.add.graphics();
    var bgColor = isPlayer ? 0x0a6b75 : 0x2c5f6e;
    bg.fillStyle(bgColor, 0.95);
    bg.fillRoundedRect(
        x + M / 2 - labelW / 2,
        y - 6,
        labelW,
        20,
        4
    );

    scene.add.text(
        x + M / 2,
        y + 4,
        labelText,
        {
            fontSize:   "13px",
            fontStyle:  "bold",
            color:      "#ffffff",
            align:      "center"
        }
    ).setOrigin(0.5, 0.5);

    /* Interaktive Zone */
    var hitZone = scene.add.zone(x + M / 2, y + M / 2, M, M);
    hitZone.setInteractive(
        new Phaser.Geom.Rectangle(0, 0, M, M),
        Phaser.Geom.Rectangle.Contains
    );
    hitZone.buildingData = data;
    hitZone.on("pointerdown", function () {
        showInfoPanel(data);
    });

    return hitZone;
}


/* =========================================================
   CAMERA SETUP + INPUT
   ========================================================= */

function setupCamera(scene) {

    var c = scene.cameras.main;
    c.setBounds(0, 0, WORLD_W, WORLD_H);

    if (playerData) {
        var px = (playerData.grid_x || Math.floor(COLS / 2)) * TILE;
        var py = (playerData.grid_y || Math.floor(ROWS / 2) - 5) * TILE;
        c.centerOn(px + 32, py + 32);
    }

    scene.input.on("wheel", function (pointer, gameObjects, deltaX, deltaY) {
        var newZoom = c.zoom - deltaY * cam.zoomSpeed;
        newZoom = Math.max(cam.zoomMin, Math.min(cam.zoomMax, newZoom));
        c.zoom = newZoom;
    });

    scene.input.on("pointerdown", function (pointer) {
        if (pointer.leftButtonDown()) {
            cam.dragging = true;
            cam.lastX = pointer.x;
            cam.lastY = pointer.y;
        }
    });

    scene.input.on("pointerup", function (pointer) {
        if (pointer.leftButtonReleased()) {
            cam.dragging = false;
        }
    });
}


function setupInput(scene) {

    document.addEventListener("keydown", function (e) {
        keys[e.code] = true;
    });

    document.addEventListener("keyup", function (e) {
        keys[e.code] = false;
    });
}


/* =========================================================
   AUTOMATISCHE SITZUNG
   ========================================================= */

window.addEventListener("load", async function () {
    try {
        const { data: { session } } =
            await client.auth.getSession();
        if (session) await loadGame();
    } catch (err) {
        console.error("Session-Fehler:", err);
    }
});


/* =========================================================
   FENSTERGROESSE
   ========================================================= */

window.addEventListener("resize", function () {
    if (game) {
        game.scale.resize(
            window.innerWidth,
            window.innerHeight - 62
        );
    }
});
