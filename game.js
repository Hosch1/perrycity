/* =========================================================
   PERRYCITY
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


/* ---------- SPIELVARIABLEN ---------- */

let currentPlayer = null;
let playerData = null;
let game = null;


/* =========================================================
   HILFSFUNKTIONEN
   ========================================================= */

function normalizeName(name) {

    return name
        .trim()
        .toLowerCase();
}


/*
    Wir benutzen intern eine technische Adresse,
    damit Supabase weiterhin seine normale
    Passwort-Authentifizierung verwenden kann.

    Der Spieler sieht diese Adresse niemals.
*/
function internalLogin(name) {

    return (
        normalizeName(name)
            .replace(/[^a-z0-9_-]/g, "")
        + "@perrycity.game"
    );
}


function formatMoney(amount) {

    return new Intl.NumberFormat("de-DE")
        .format(amount);
}


/* =========================================================
   REGISTRIEREN
   ========================================================= */

async function register() {

    const playerNameElement =
        document.getElementById("player-name");

    const passwordElement =
        document.getElementById("password");

    const messageElement =
        document.getElementById("message");


    if (!playerNameElement || !passwordElement) {

        console.error(
            "Spielername oder Passwortfeld nicht gefunden."
        );

        return;
    }


    const playerName =
        playerNameElement.value.trim();

    const password =
        passwordElement.value;


    /* ---------- EINGABEN PRÜFEN ---------- */

    if (!playerName || !password) {

        messageElement.textContent =
            "Bitte Spielername und Passwort eingeben.";

        return;
    }


    if (playerName.length < 3) {

        messageElement.textContent =
            "Der Spielername muss mindestens 3 Zeichen haben.";

        return;
    }


    if (playerName.length > 20) {

        messageElement.textContent =
            "Der Spielername darf höchstens 20 Zeichen haben.";

        return;
    }


    if (password.length < 6) {

        messageElement.textContent =
            "Das Passwort muss mindestens 6 Zeichen haben.";

        return;
    }


    if (!/^[a-zA-Z0-9_-]+$/.test(playerName)) {

        messageElement.textContent =
            "Erlaubt sind nur Buchstaben, Zahlen, _ und -.";

        return;
    }


    const loginName =
        normalizeName(playerName);


    messageElement.textContent =
        "Spieler wird erstellt...";


    try {

        /* ---------- NAMEN PRÜFEN ---------- */

        const {
            data: existingPlayer,
            error: existingError
        } = await client
            .from("players")
            .select("id")
            .eq("login_name", loginName)
            .maybeSingle();


        if (existingError) {

            console.error(
                "Fehler bei der Namensprüfung:",
                existingError
            );

            messageElement.textContent =
                "Fehler bei der Namensprüfung.";

            return;
        }


        if (existingPlayer) {

            messageElement.textContent =
                "Dieser Spielername ist bereits vergeben.";

            return;
        }


        /* ---------- SUPABASE ACCOUNT ---------- */

        const internalEmail =
            internalLogin(playerName);


        const {
            data: authData,
            error: authError
        } = await client.auth.signUp({

            email: internalEmail,

            password: password,

            options: {

                data: {

                    player_name: playerName

                }

            }

        });


        if (authError) {

            console.error(
                "Auth-Fehler:",
                authError
            );

            messageElement.textContent =
                authError.message;

            return;
        }


        if (!authData.user) {

            messageElement.textContent =
                "Spieler konnte nicht erstellt werden.";

            return;
        }


        /*
            Falls Supabase noch eine
            E-Mail-Bestätigung verlangt.
        */

        if (!authData.session) {

            messageElement.textContent =
                "Der Account wurde erstellt. Prüfe bitte deine Supabase-Einstellungen: 'Confirm email' muss ausgeschaltet sein.";

            return;
        }


        /* ---------- SPIELERPROFIL ---------- */

        const {
            error: playerError
        } = await client
            .from("players")
            .insert({

                id: authData.user.id,

                player_name: playerName,

                login_name: loginName,

                money: 10000,

                x: 400,

                y: 300

            });


        if (playerError) {

            console.error(
                "Spielerprofil-Fehler:",
                playerError
            );

            messageElement.textContent =
                "Account wurde erstellt, aber das Spielerprofil konnte nicht gespeichert werden.";

            return;
        }


        messageElement.textContent =
            "Willkommen in Perrycity!";


        await loadGame();

    } catch (error) {

        console.error(
            "Registrierungsfehler:",
            error
        );

        messageElement.textContent =
            "Ein unerwarteter Fehler ist aufgetreten.";

    }
}


/* =========================================================
   LOGIN
   ========================================================= */

async function login() {

    const playerNameElement =
        document.getElementById("player-name");

    const passwordElement =
        document.getElementById("password");

    const messageElement =
        document.getElementById("message");


    const playerName =
        playerNameElement.value.trim();

    const password =
        passwordElement.value;


    if (!playerName || !password) {

        messageElement.textContent =
            "Bitte Spielername und Passwort eingeben.";

        return;
    }


    messageElement.textContent =
        "Login...";


    try {

        const internalEmail =
            internalLogin(playerName);


        const {
            data,
            error
        } = await client.auth.signInWithPassword({

            email: internalEmail,

            password: password

        });


        if (error) {

            console.error(
                "Login-Fehler:",
                error
            );

            messageElement.textContent =
                "Spielername oder Passwort ist falsch.";

            return;
        }


        if (!data.user) {

            messageElement.textContent =
                "Login fehlgeschlagen.";

            return;
        }


        await loadGame();

    } catch (error) {

        console.error(
            "Unerwarteter Login-Fehler:",
            error
        );

        messageElement.textContent =
            "Ein unerwarteter Fehler ist aufgetreten.";

    }
}


/* =========================================================
   SPIEL LADEN
   ========================================================= */

async function loadGame() {

    try {

        const {
            data: {
                user
            }
        } = await client.auth.getUser();


        if (!user) {

            return;
        }


        currentPlayer =
            user;


        const {
            data,
            error
        } = await client
            .from("players")
            .select("*")
            .eq("id", user.id)
            .single();


        if (error) {

            console.error(
                "Spieler konnte nicht geladen werden:",
                error
            );

            document
                .getElementById("message")
                .textContent =
                "Spielerprofil konnte nicht geladen werden.";

            return;
        }


        playerData =
            data;


        document
            .getElementById("display-name")
            .textContent =
            data.player_name;


        document
            .getElementById("money")
            .textContent =
            formatMoney(data.money);


        document
            .getElementById("login-screen")
            .style.display =
            "none";


        document
            .getElementById("game-screen")
            .style.display =
            "block";


        startGame(data);

    } catch (error) {

        console.error(
            "Fehler beim Laden des Spiels:",
            error
        );

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

        width: window.innerWidth,

        height: window.innerHeight - 62,

        backgroundColor: "#73cbbf",

        scene: {

            create: function () {

                createWorld(
                    this,
                    player
                );

            }

        }

    };


    game =
        new Phaser.Game(config);
}


/* =========================================================
   WELT ERSTELLEN
   ========================================================= */

function createWorld(scene, player) {

    const graphics =
        scene.add.graphics();


    /* ---------- GRÜNFLÄCHE ---------- */

    graphics.fillStyle(
        0x82c96c,
        1
    );

    graphics.fillRect(
        0,
        0,
        window.innerWidth,
        window.innerHeight
    );


    /* ---------- STRASSEN ---------- */

    graphics.fillStyle(
        0x596368,
        1
    );

    graphics.fillRect(
        0,
        350,
        window.innerWidth,
        75
    );


    graphics.fillRect(
        450,
        0,
        80,
        window.innerHeight
    );


    /* ---------- WASSER ---------- */

    graphics.fillStyle(
        0x38c8d4,
        1
    );

    graphics.fillRect(
        0,
        600,
        window.innerWidth,
        65
    );


    /* ---------- HÄUSER ---------- */

    createHouse(scene, 120, 100);
    createHouse(scene, 250, 180);
    createHouse(scene, 680, 120);
    createHouse(scene, 820, 200);
    createHouse(scene, 200, 500);
    createHouse(scene, 650, 480);


    /* ---------- FIRMENGEBÄUDE ---------- */

    createCompany(
        scene,

        player.x || 400,

        player.y || 300,

        player.player_name
    );


    /* ---------- TITEL ---------- */

    scene.add.text(

        20,

        20,

        "Perrycity",

        {

            fontSize: "30px",

            color: "#ffffff",

            fontStyle: "bold",

            stroke: "#064c55",

            strokeThickness: 6

        }

    );
}


/* =========================================================
   HAUS
   ========================================================= */

function createHouse(
    scene,
    x,
    y
) {

    const graphics =
        scene.add.graphics();


    /* Haus */

    graphics.fillStyle(
        0xf5d76e,
        1
    );

    graphics.fillRect(
        x,
        y + 20,
        70,
        55
    );


    /* Dach */

    graphics.fillStyle(
        0x078f91,
        1
    );


    graphics.beginPath();

    graphics.moveTo(
        x - 5,
        y + 22
    );

    graphics.lineTo(
        x + 35,
        y - 10
    );

    graphics.lineTo(
        x + 75,
        y + 22
    );

    graphics.closePath();

    graphics.fillPath();


    /* Tür */

    graphics.fillStyle(
        0x8e5a2c,
        1
    );

    graphics.fillRect(
        x + 28,
        y + 45,
        15,
        30
    );


    /* Fenster */

    graphics.fillStyle(
        0x9debf3,
        1
    );

    graphics.fillRect(
        x + 10,
        y + 35,
        12,
        12
    );

    graphics.fillRect(
        x + 48,
        y + 35,
        12,
        12
    );
}


/* =========================================================
   UNTERNEHMEN
   ========================================================= */

function createCompany(
    scene,
    x,
    y,
    ownerName
) {

    const graphics =
        scene.add.graphics();


    /* Gebäude */

    graphics.fillStyle(
        0x075d68,
        1
    );

    graphics.fillRect(
        x,
        y,
        130,
        100
    );


    /* Aqua-Dach */

    graphics.fillStyle(
        0x55fff0,
        1
    );

    graphics.fillRect(
        x,
        y,
        130,
        12
    );


    /* Fenster */

    graphics.fillStyle(
        0xb8fff8,
        1
    );

    graphics.fillRect(
        x + 15,
        y + 30,
        25,
        25
    );

    graphics.fillRect(
        x + 55,
        y + 30,
        25,
        25
    );

    graphics.fillRect(
        x + 95,
        y + 30,
        20,
        25
    );


    /* Tür */

    graphics.fillStyle(
        0x143b42,
        1
    );

    graphics.fillRect(
        x + 55,
        y + 70,
        30,
        30
    );


    /* Spielername */

    scene.add.text(

        x,

        y - 30,

        ownerName,

        {

            fontSize: "18px",

            color: "#ffffff",

            backgroundColor: "#075d68",

            padding: {

                left: 7,

                right: 7,

                top: 4,

                bottom: 4

            }

        }

    );
}


/* =========================================================
   AUTOMATISCHE SITZUNG
   ========================================================= */

window.addEventListener(
    "load",
    async function () {

        try {

            const {
                data: {
                    session
                }
            } = await client.auth.getSession();


            if (session) {

                await loadGame();

            }

        } catch (error) {

            console.error(
                "Session-Fehler:",
                error
            );

        }

    }
);


/* =========================================================
   FENSTERGRÖSSE
   ========================================================= */

window.addEventListener(
    "resize",
    function () {

        if (game) {

            game.scale.resize(
                window.innerWidth,
                window.innerHeight - 62
            );

        }

    }
);
