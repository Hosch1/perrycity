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

const WORLD_W = 3200;
const WORLD_H = 3200;
const TILE    = 64;

const COLS = WORLD_W / TILE;
const ROWS = WORLD_H / TILE;


/* ---------- STRASSEN-POSITIONEN ---------- */

const MAIN_ROAD_X = 24 * TILE;
const MAIN_ROAD_Y = 24 * TILE;
const RIVER_Y     = 28 * TILE;

const SIDE_ROADS_X = [4, 10, 16, 20, 30, 36, 42];

function isOnRoad(gx, gy) {

    if (gy * TILE === MAIN_ROAD_Y) return true;

    if (gx * TILE === MAIN_ROAD_X) return true;

    for (var i = 0; i < SIDE_ROADS_X.length; i++) {

        if (gx === SIDE_ROADS_X[i]) return true;
    }

    if (gy * TILE === RIVER_Y || gy * TILE === RIVER_Y + TILE) {
        return true;
    }

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
        const spawnY = Math.floor(ROWS / 2) - 4;

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

    /* --- Gras --- */
    g.fillStyle(0x6db56d, 1);
    g.fillRect(0, 0, WORLD_W, WORLD_H);

    /* --- Fluss --- */
    g.fillStyle(0x3daee0, 1);
    g.fillRect(0, RIVER_Y, WORLD_W, TILE * 2);

    g.fillStyle(0x5bc4eb, 0.5);
    g.fillRect(0, RIVER_Y + 10, WORLD_W, 4);

    /* --- Hauptstrasse horizontal --- */
    g.fillStyle(0x555b5e, 1);
    g.fillRect(0, MAIN_ROAD_Y, WORLD_W, TILE);
    drawRoadLines(g, 0, MAIN_ROAD_Y, WORLD_W, TILE);

    /* --- Hauptstrasse vertikal --- */
    g.fillStyle(0x555b5e, 1);
    g.fillRect(MAIN_ROAD_X, 0, TILE, WORLD_H);
    drawRoadLinesV(g, MAIN_ROAD_X, 0, TILE, WORLD_H);

    /* --- Seitenstrassen --- */
    SIDE_ROADS_X.forEach(function (col) {

        g.fillStyle(0x6b7175, 1);
        g.fillRect(col * TILE, 0, TILE, RIVER_Y);
        g.fillRect(col * TILE, RIVER_Y + TILE * 2, TILE, WORLD_H - RIVER_Y - TILE * 2);

        drawRoadLinesV(g, col * TILE, 0, TILE, RIVER_Y);
        drawRoadLinesV(g, col * TILE, RIVER_Y + TILE * 2, TILE, WORLD_H - RIVER_Y - TILE * 2);
    });

    /* --- Querstrassen (horizontal, oberhalb Fluss) --- */
    var crossY1 = 6 * TILE;
    var crossY2 = 14 * TILE;
    var crossY3 = 20 * TILE;

    g.fillStyle(0x6b7175, 1);

    g.fillRect(0, crossY1, MAIN_ROAD_X - TILE, TILE);
    g.fillRect(MAIN_ROAD_X + TILE * 2, crossY1, WORLD_W - MAIN_ROAD_X - TILE * 2, TILE);

    g.fillRect(0, crossY2, MAIN_ROAD_X - TILE, TILE);
    g.fillRect(MAIN_ROAD_X + TILE * 2, crossY2, WORLD_W - MAIN_ROAD_X - TILE * 2, TILE);

    g.fillRect(0, crossY3, MAIN_ROAD_X - TILE, TILE);
    g.fillRect(MAIN_ROAD_X + TILE * 2, crossY3, WORLD_W - MAIN_ROAD_X - TILE * 2, TILE);

    /* --- Querstrassen (horizontal, unterhalb Fluss) --- */
    var crossY4 = 32 * TILE;
    var crossY5 = 38 * TILE;
    var crossY6 = 44 * TILE;

    g.fillRect(0, crossY4, MAIN_ROAD_X - TILE, TILE);
    g.fillRect(MAIN_ROAD_X + TILE * 2, crossY4, WORLD_W - MAIN_ROAD_X - TILE * 2, TILE);

    g.fillRect(0, crossY5, MAIN_ROAD_X - TILE, TILE);
    g.fillRect(MAIN_ROAD_X + TILE * 2, crossY5, WORLD_W - MAIN_ROAD_X - TILE * 2, TILE);

    g.fillRect(0, crossY6, MAIN_ROAD_X - TILE, TILE);
    g.fillRect(MAIN_ROAD_X + TILE * 2, crossY6, WORLD_W - MAIN_ROAD_X - TILE * 2, TILE);

    /* --- Wohnhaeuser (oben) --- */
    var housesTop = [
        [2,2],[2,4],[2,8],[2,10],[2,12],
        [6,2],[6,4],[6,8],[6,10],
        [12,2],[12,4],[12,8],[12,12],
        [18,2],[18,4],[18,8],[18,10],
        [22,2],[22,4],[22,8],[22,10],
        [28,2],[28,4],[28,8],[28,10],[28,12],
        [32,2],[32,4],[32,8],[32,10],
        [38,2],[38,4],[38,8],[38,10],
        [44,2],[44,4],[44,8],[44,10],
    ];

    housesTop.forEach(function (pos) {
        var hx = pos[0] * TILE;
        var hy = pos[1] * TILE;
        if (isOnRoad(pos[0], pos[1])) return;
        drawHouse(g, hx, hy);
    });

    /* --- Wohnhaeuser (unten) --- */
    var housesBot = [
        [2,30],[2,33],[2,36],[2,40],[2,42],
        [6,30],[6,33],[6,36],[6,40],
        [12,30],[12,33],[12,36],[12,40],
        [18,30],[18,33],[18,36],[18,40],
        [22,30],[22,33],[22,36],[22,40],
        [28,30],[28,33],[28,36],[28,40],[28,42],
        [32,30],[32,33],[32,36],[32,40],
        [38,30],[38,33],[38,36],[38,40],
        [44,30],[44,33],[44,36],[44,40],
    ];

    housesBot.forEach(function (pos) {
        var hx = pos[0] * TILE;
        var hy = pos[1] * TILE;
        if (isOnRoad(pos[0], pos[1])) return;
        drawHouse(g, hx, hy);
    });

    /* --- Park (oben links) --- */
    g.fillStyle(0x4a9e5c, 1);
    g.fillRect(1 * TILE, 16 * TILE, TILE * 3, TILE * 3);

    drawTree(g, 1.5 * TILE, 16.5 * TILE);
    drawTree(g, 2.5 * TILE, 17 * TILE);
    drawTree(g, 3 * TILE, 18 * TILE);
    drawTree(g, 1.8 * TILE, 18.3 * TILE);

    /* --- See (unten rechts) --- */
    g.fillStyle(0x3daee0, 0.7);
    g.fillCircle(40 * TILE, 42 * TILE, TILE * 2.5);
    g.fillStyle(0x5bc4eb, 0.3);
    g.fillCircle(40 * TILE, 42 * TILE, TILE * 1.5);
}


function drawRoadLines(g, x, y, w, h) {
    g.fillStyle(0xffffff, 0.35);
    var cy = y + h / 2 - 2;
    var cx = x + 10;
    while (cx < x + w - 10) {
        g.fillRect(cx, cy, 18, 3);
        cx += 32;
    }
}

function drawRoadLinesV(g, x, y, w, h) {
    g.fillStyle(0xffffff, 0.35);
    var cx = x + w / 2 - 2;
    var cy = y + 10;
    while (cy < y + h - 10) {
        g.fillRect(cx, cy, 3, 18);
        cy += 32;
    }
}


function drawHouse(g, x, y) {

    var wallColors = [0xf5d76e, 0xf0c070, 0xe8b86d, 0xddc080, 0xf7e6b0];
    var wall = wallColors[Math.floor(Math.random() * wallColors.length)];

    g.fillStyle(wall, 1);
    g.fillRect(x + 10, y + 24, 44, 36);

    var roofColors = [0xc0392b, 0xe74c3c, 0x8e44ad, 0x2980b9, 0x27ae60];
    var roof = roofColors[Math.floor(Math.random() * roofColors.length)];

    g.fillStyle(roof, 1);
    g.beginPath();
    g.moveTo(x + 6, y + 26);
    g.lineTo(x + 32, y + 6);
    g.lineTo(x + 58, y + 26);
    g.closePath();
    g.fillPath();

    g.fillStyle(0x8e5a2c, 1);
    g.fillRect(x + 26, y + 42, 12, 18);

    g.fillStyle(0x9debf3, 1);
    g.fillRect(x + 14, y + 32, 9, 9);
    g.fillRect(x + 41, y + 32, 9, 9);
}


function drawTree(g, x, y) {
    g.fillStyle(0x2d6a2e, 1);
    g.fillCircle(x, y, 14);
    g.fillStyle(0x1e4d20, 1);
    g.fillCircle(x - 5, y + 3, 10);
    g.fillCircle(x + 5, y + 3, 10);
}


/* =========================================================
   GRID-LINIEN
   ========================================================= */

function drawGridLines(scene) {
    var g = scene.add.graphics();
    g.lineStyle(1, 0x000000, 0.05);

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
   GEBÄUDE
   ========================================================= */

function placeBuildings(scene, player) {

    buildingSprites = [];

    /* --- Spieler-Unternehmen --- */
    var px = player.grid_x || Math.floor(COLS / 2);
    var py = player.grid_y || Math.floor(ROWS / 2) - 4;

    var playerBldg = createClickableBuilding(
        scene, px * TILE, py * TILE,
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


    /* --- NPC-Gebaeude --- */
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

        while (tries < 300) {

            var gx = Math.floor(Math.random() * (COLS - 4)) + 2;
            var gy = Math.floor(Math.random() * (ROWS - 8)) + 2;

            if (occupied[gx + "," + gy]) { tries++; continue; }
            if (isOnRoad(gx, gy)) { tries++; continue; }
            if (Math.abs(gx * TILE - MAIN_ROAD_X) < TILE * 2) { tries++; continue; }

            var sy = gy * TILE;
            if (sy >= RIVER_Y - TILE && sy <= RIVER_Y + TILE * 3) { tries++; continue; }

            occupied[gx + "," + gy] = true;

            var level = Math.floor(Math.random() * 5) + 1;

            createClickableBuilding(
                scene, gx * TILE, gy * TILE,
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

    var baseColor = data.isPlayer ? 0x075d68 : 0x3a6b5e;

    /* Gebaeude */
    g.fillStyle(baseColor, 1);
    g.fillRect(x + 4, y + 18, 56, 42);

    /* Dach */
    g.fillStyle(0x55fff0, 1);
    g.fillRect(x + 4, y + 18, 56, 6);

    /* Fenster */
    g.fillStyle(0xb8fff8, 0.8);
    g.fillRect(x + 10, y + 30, 12, 10);
    g.fillRect(x + 26, y + 30, 12, 10);
    g.fillRect(x + 42, y + 30, 12, 10);

    /* Tuer */
    g.fillStyle(0x143b42, 1);
    g.fillRect(x + 26, y + 46, 12, 14);

    /* Schild-Hintergrund fuer bessere Lesbarkeit */
    var labelColor = data.isPlayer ? "#075d68" : "#3a6b5e";

    var bg = scene.add.graphics();
    var labelText = data.icon + " " + data.name;
    var labelW = labelText.length * 8 + 16;

    bg.fillStyle(
        data.isPlayer ? 0x075d68 : 0x3a6b5e,
        0.92
    );
    bg.fillRoundedRect(
        x + 32 - labelW / 2,
        y - 8,
        labelW,
        22,
        4
    );

    /* Name + Icon */
    scene.add.text(
        x + 32,
        y + 3,
        labelText,
        {
            fontSize:   "14px",
            fontStyle:  "bold",
            color:      "#ffffff",
            align:      "center"
        }
    ).setOrigin(0.5, 0.5);

    /* Interaktive Zone */
    var hitZone = scene.add.zone(x + 32, y + 32, 64, 64);
    hitZone.setInteractive(
        new Phaser.Geom.Rectangle(0, 0, 64, 64),
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
        var py = (playerData.grid_y || Math.floor(ROWS / 2) - 4) * TILE;
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
