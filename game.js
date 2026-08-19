/* =========================================================
   PERRYCITY — PHASE 1
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
    zoomMin:   0.35,
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

        statsHTML += `
            <div class="info-stat-row">
                <span class="info-stat-label">Einkommen</span>
                <span class="info-stat-value">
                    ${formatMoney(data.income)} €/min
                </span>
            </div>
        `;
    }

    if (data.level !== undefined) {

        statsHTML += `
            <div class="info-stat-row">
                <span class="info-stat-label">Stufe</span>
                <span class="info-stat-value">
                    ${data.level} / ${data.maxLevel || 5}
                </span>
            </div>
        `;
    }

    if (data.population !== undefined) {

        statsHTML += `
            <div class="info-stat-row">
                <span class="info-stat-label">Einwohner</span>
                <span class="info-stat-value">
                    ${data.population}
                </span>
            </div>
        `;
    }

    stats.innerHTML = statsHTML;

    panel.classList.remove("hidden");
}

function closeInfoPanel() {

    document
        .getElementById("info-panel")
        .classList.add("hidden");
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
        msgEl.textContent =
            "Bitte Spielername und Passwort eingeben.";
        return;
    }

    if (playerName.length < 3) {
        msgEl.textContent =
            "Der Spielername muss mindestens 3 Zeichen haben.";
        return;
    }

    if (playerName.length > 20) {
        msgEl.textContent =
            "Der Spielername darf höchstens 20 Zeichen haben.";
        return;
    }

    if (password.length < 6) {
        msgEl.textContent =
            "Das Passwort muss mindestens 6 Zeichen haben.";
        return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(playerName)) {
        msgEl.textContent =
            "Erlaubt sind nur Buchstaben, Zahlen, _ und -.";
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
            msgEl.textContent =
                "Dieser Spielername ist bereits vergeben.";
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
            msgEl.textContent =
                "Spieler konnte nicht erstellt werden.";
            return;
        }

        if (!authData.session) {
            msgEl.textContent =
                "Account erstellt. 'Confirm email' muss in Supabase aus sein.";
            return;
        }

        const spawnX = Math.floor(COLS / 2);
        const spawnY = Math.floor(ROWS / 2);

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
            msgEl.textContent =
                "Profil konnte nicht gespeichert werden.";
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
        msgEl.textContent =
            "Bitte Spielername und Passwort eingeben.";
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
            msgEl.textContent =
                "Spielername oder Passwort ist falsch.";
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

        document.getElementById("login-screen").style.display =
            "none";

        document.getElementById("game-screen").style.display =
            "block";


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

        backgroundColor: "#4a9e5c",

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
        if (hint) {
            hint.classList.add("fade-out");
        }
    }, 6000);
}


/* =========================================================
   KAMERA: WASD / Pfeiltasten + Maus-Ziehen + Zoom
   ========================================================= */

function updateCamera(scene) {

    var c = scene.cameras.main;


    /* --- WASD / Pfeile --- */

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


    /* --- Maus-Ziehen (linke Taste) --- */

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

    mapGraphics = scene.add.graphics();

    drawBaseMap(scene);

    drawGridLines(scene);

    placeBuildings(scene, player);

    setupCamera(scene);

    setupInput(scene);
}


/* =========================================================
   GRUNDKARTE ZEICHNEN
   ========================================================= */

function drawBaseMap(scene) {

    var g = scene.add.graphics();


    /* --- Gras (gesamte Welt) --- */

    g.fillStyle(0x6db56d, 1);
    g.fillRect(0, 0, WORLD_W, WORLD_H);


    /* --- Wasser: Fluss mittig horizontal --- */

    var riverY = Math.floor(ROWS / 2) * TILE - TILE;

    g.fillStyle(0x3daee0, 1);
    g.fillRect(0, riverY, WORLD_W, TILE * 2);

    g.fillStyle(0x5bc4eb, 0.4);
    g.fillRect(0, riverY + 8, WORLD_W, 6);


    /* --- Hauptstrasse horizontal --- */

    var mainRoadY = Math.floor(ROWS / 2) * TILE - TILE * 3;

    g.fillStyle(0x555b5e, 1);
    g.fillRect(0, mainRoadY, WORLD_W, TILE);

    drawRoadLines(g, 0, mainRoadY, WORLD_W, TILE);


    /* --- Hauptstrasse vertikal --- */

    var mainRoadX = Math.floor(COLS / 2) * TILE - TILE;

    g.fillStyle(0x555b5e, 1);
    g.fillRect(mainRoadX, 0, TILE, WORLD_H);

    drawRoadLinesV(g, mainRoadX, 0, TILE, WORLD_H);


    /* --- Seitliche Strassen --- */

    var sideRoads = [8, 16, 24, 32, 40];

    sideRoads.forEach(function (col) {

        if (Math.abs(col * TILE - mainRoadX) < TILE * 2) return;

        g.fillStyle(0x6b7175, 1);
        g.fillRect(col * TILE, 0, TILE, riverY);
        g.fillRect(col * TILE, riverY + TILE * 2, TILE, WORLD_H - riverY - TILE * 2);
    });


    /* --- Wohnhaeuser (obere Haelfte) --- */

    var housePositions = [
        [3, 5],  [3, 8],  [3, 12],
        [6, 5],  [6, 9],  [6, 13],
        [10, 4], [10, 7], [10, 11],
        [14, 6], [14, 10], [14, 14],
        [18, 5], [18, 9],
        [22, 6], [22, 11],
        [26, 4], [26, 8], [26, 13],
        [30, 5], [30, 10],
        [35, 6], [35, 12],
        [38, 4], [38, 9],
        [42, 7], [42, 11],
        [45, 5], [45, 10],
    ];

    housePositions.forEach(function (pos) {

        var hx = pos[0] * TILE;
        var hy = pos[1] * TILE;

        if (Math.abs(hx - mainRoadX) < TILE * 2) return;
        if (hy >= riverY - TILE && hy <= riverY + TILE * 2) return;

        drawHouse(g, scene, hx, hy, "🏠");
    });


    /* --- Wohnhaeuser (untere Haelfte) --- */

    var housePositionsLower = [
        [3, 22],  [3, 26],  [3, 30],
        [6, 23],  [6, 28],
        [10, 22], [10, 27], [10, 31],
        [14, 24], [14, 29],
        [18, 22], [18, 27], [18, 32],
        [22, 23], [22, 28],
        [26, 22], [26, 26], [26, 31],
        [30, 24], [30, 29],
        [35, 23], [35, 28],
        [38, 22], [38, 27],
        [42, 25], [42, 30],
        [45, 23], [45, 28],
    ];

    housePositionsLower.forEach(function (pos) {

        var hx = pos[0] * TILE;
        var hy = pos[1] * TILE;

        if (Math.abs(hx - mainRoadX) < TILE * 2) return;
        if (hy >= riverY - TILE && hy <= riverY + TILE * 2) return;

        drawHouse(g, scene, hx, hy, "🏠");
    });


    /* --- Park (oben-links) --- */

    g.fillStyle(0x4a9e5c, 1);
    g.fillRect(1 * TILE, 2 * TILE, TILE * 4, TILE * 2);

    g.fillStyle(0x3d8a4e, 1);

    drawTree(g, 1.5 * TILE, 2.3 * TILE);
    drawTree(g, 3 * TILE, 2.8 * TILE);
    drawTree(g, 4 * TILE, 2.1 * TILE);
    drawTree(g, 2.2 * TILE, 3.3 * TILE);
    drawTree(g, 3.8 * TILE, 3.5 * TILE);


    /* --- See (unten-rechts) --- */

    g.fillStyle(0x3daee0, 0.7);
    g.fillCircle(38 * TILE, 35 * TILE, TILE * 3);

    g.fillStyle(0x5bc4eb, 0.3);
    g.fillCircle(38 * TILE, 35 * TILE, TILE * 2);
}


function drawRoadLines(g, x, y, w, h) {

    g.fillStyle(0xffffff, 0.3);

    var dashLen = 20;
    var gapLen  = 15;
    var cy      = y + h / 2 - 2;

    var cx = x + 10;

    while (cx < x + w - 10) {

        g.fillRect(cx, cy, dashLen, 3);
        cx += dashLen + gapLen;
    }
}


function drawRoadLinesV(g, x, y, w, h) {

    g.fillStyle(0xffffff, 0.3);

    var dashLen = 20;
    var gapLen  = 15;
    var cx      = x + w / 2 - 2;

    var cy = y + 10;

    while (cy < y + h - 10) {

        g.fillRect(cx, cy, 3, dashLen);
        cy += dashLen + gapLen;
    }
}


function drawHouse(g, scene, x, y, icon) {

    var colors = [0xf5d76e, 0xf0c070, 0xe8b86d, 0xddc080];

    var color = colors[
        Math.floor(Math.random() * colors.length)
    ];

    g.fillStyle(color, 1);
    g.fillRect(x + 8, y + 22, 48, 38);

    var roofColors = [0xc0392b, 0xe74c3c, 0x8e44ad, 0x2980b9];

    var roofColor = roofColors[
        Math.floor(Math.random() * roofColors.length)
    ];

    g.fillStyle(roofColor, 1);

    g.beginPath();
    g.moveTo(x + 4, y + 24);
    g.lineTo(x + 32, y + 4);
    g.lineTo(x + 60, y + 24);
    g.closePath();
    g.fillPath();

    g.fillStyle(0x8e5a2c, 1);
    g.fillRect(x + 26, y + 42, 12, 18);

    g.fillStyle(0x9debf3, 1);
    g.fillRect(x + 12, y + 30, 10, 10);
    g.fillRect(x + 42, y + 30, 10, 10);
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

    g.lineStyle(1, 0x000000, 0.06);

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
   GEBÄUDE PLATZIEREN
   ========================================================= */

function placeBuildings(scene, player) {

    buildingSprites = [];


    /* --- Spieler-Unternehmen (Mitte) --- */

    var px = player.grid_x || Math.floor(COLS / 2);
    var py = player.grid_y || Math.floor(ROWS / 2) - 4;

    var playerBldg = createClickableBuilding(
        scene,
        px * TILE,
        py * TILE,

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


    /* --- NPC-Gebaeude verstreut platzieren --- */

    var npcBuildings = [

        { icon: "🍕",  name: "Pizzeria Mario",      cat: "Restaurant",   income: 50,  owner: "NPC" },
        { icon: "🛒",  name: "Supermarkt Fresh",    cat: "Laden",        income: 30,  owner: "NPC" },
        { icon: "🔧",  name: "Werkstatt Braun",     cat: "Werkstatt",    income: 80,  owner: "NPC" },
        { icon: "💼",  name: "Agentur Schmidt",     cat: "Agentur",      income: 120, owner: "NPC" },
        { icon: "💻",  name: "TechStart GmbH",      cat: "Tech-Startup", income: 200, owner: "NPC" },
        { icon: "🏨",  name: "Hotel Panorama",      cat: "Hotel",        income: 150, owner: "NPC" },
        { icon: "🍕",  name: "Bella Napoli",        cat: "Restaurant",   income: 55,  owner: "NPC" },
        { icon: "🛒",  name: "MarketKlein",         cat: "Laden",        income: 35,  owner: "NPC" },
        { icon: "🔧",  name: "AutoService Max",     cat: "Werkstatt",    income: 85,  owner: "NPC" },
        { icon: "💼",  name: "Beratung Plus",       cat: "Agentur",      income: 130, owner: "NPC" },
        { icon: "💻",  name: "CodeFactory",         cat: "Tech-Startup", income: 210, owner: "NPC" },
        { icon: "🏨",  name: "Grand Stay",          cat: "Hotel",        income: 160, owner: "NPC" },
    ];

    var occupiedGrid = {};

    occupiedGrid[px + "," + py] = true;

    var mainRoadX = Math.floor(COLS / 2) * TILE;
    var riverY    = Math.floor(ROWS / 2) * TILE;

    npcBuildings.forEach(function (b) {

        var tries = 0;

        while (tries < 200) {

            var gx = Math.floor(Math.random() * (COLS - 4)) + 2;
            var gy = Math.floor(Math.random() * (ROWS - 6)) + 2;

            var sx = gx * TILE;
            var sy = gy * TILE;

            if (occupiedGrid[gx + "," + gy]) {
                tries++;
                continue;
            }

            if (Math.abs(sx - mainRoadX) < TILE * 3) {
                tries++;
                continue;
            }

            if (sy > riverY - TILE && sy < riverY + TILE * 3) {
                tries++;
                continue;
            }

            occupiedGrid[gx + "," + gy] = true;

            var level = Math.floor(Math.random() * 5) + 1;

            createClickableBuilding(
                scene,
                sx,
                sy,

                {
                    icon:      b.icon,
                    name:      b.name,
                    category:  b.cat,
                    ownerName: b.owner,
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

    var baseColor;

    if (data.isPlayer) {

        baseColor = 0x075d68;

    } else {

        baseColor = 0x3a6b5e;
    }


    /* --- Gebaeude-Koerper --- */

    g.fillStyle(baseColor, 1);
    g.fillRect(x + 4, y + 18, 56, 42);


    /* --- Dach --- */

    g.fillStyle(0x55fff0, 1);
    g.fillRect(x + 4, y + 18, 56, 6);


    /* --- Fenster --- */

    g.fillStyle(0xb8fff8, 0.8);

    g.fillRect(x + 10, y + 30, 12, 10);
    g.fillRect(x + 26, y + 30, 12, 10);
    g.fillRect(x + 42, y + 30, 12, 10);


    /* --- Tuer --- */

    g.fillStyle(0x143b42, 1);
    g.fillRect(x + 26, y + 46, 12, 14);


    /* --- Name & Icon (Text) --- */

    scene.add.text(
        x - 4,
        y - 10,
        data.icon + " " + data.name,

        {
            fontSize:      "12px",
            color:         "#ffffff",
            backgroundColor: data.isPlayer
                ? "#075d68"
                : "#3a6b5e",
            padding: {
                left:   5,
                right:  5,
                top:    3,
                bottom: 3
            }
        }
    );


    /* --- Interaktive Zone --- */

    var hitZone = scene.add.zone(
        x + 32,
        y + 32,
        64,
        64
    );

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


    /* --- Start-Position: Spieler in der Mitte --- */

    if (playerData) {

        var px = (playerData.grid_x || Math.floor(COLS / 2)) * TILE;
        var py = (playerData.grid_y || Math.floor(ROWS / 2)) * TILE;

        c.centerOn(
            px + 32,
            py + 32
        );
    }


    /* --- Mausrad-Zoom --- */

    scene.input.on("wheel", function (
        pointer,
        gameObjects,
        deltaX,
        deltaY
    ) {

        var newZoom = c.zoom - deltaY * cam.zoomSpeed;

        newZoom = Math.max(cam.zoomMin,
                   Math.min(cam.zoomMax, newZoom));

        c.zoom = newZoom;
    });


    /* --- Maus-Ziehen (linke Taste) --- */

    scene.input.on("pointerdown", function (pointer) {

        if (pointer.leftButtonDown()) {

            cam.dragging = true;
            cam.lastX    = pointer.x;
            cam.lastY    = pointer.y;
        }
    });

    scene.input.on("pointerup", function (pointer) {

        if (pointer.leftButtonReleased()) {

            cam.dragging = false;
        }
    });
}


function setupInput(scene) {

    var canvas = scene.game.canvas;

    canvas.addEventListener("keydown", function (e) {
        keys[e.code] = true;
    });

    canvas.addEventListener("keyup", function (e) {
        keys[e.code] = false;
    });

    window.addEventListener("keydown", function (e) {
        keys[e.code] = true;
    });

    window.addEventListener("keyup", function (e) {
        keys[e.code] = false;
    });

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

        if (session) {
            await loadGame();
        }

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
