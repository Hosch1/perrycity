/* =========================================
   PERRYCITY
   ========================================= */

/*
   HIER DEINE SUPABASE DATEN EINTRAGEN
*/

const SUPABASE_URL = "https://nrloacwgehhukzkgtoas.supabase.co";
const SUPABASE_KEY = "sb_publishable_EUQuU4qxS8pPHuBCc7R_tg_6RXLtNN6";


/*
   SUPABASE VERBINDUNG
*/

const supabaseClient = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);


/*
   SPIELER
*/

let currentPlayer = null;

let playerData = null;


/*
   PHASER
*/

let game = null;


/* =========================================
   REGISTRIEREN
   ========================================= */

async function register() {

    const playerName =
        document.getElementById("player-name").value.trim();

    const email =
        document.getElementById("email").value.trim();

    const password =
        document.getElementById("password").value;

    const message =
        document.getElementById("message");


    if (!playerName || !email || !password) {

        message.textContent =
            "Bitte alle Felder ausfüllen.";

        return;
    }


    if (password.length < 6) {

        message.textContent =
            "Das Passwort muss mindestens 6 Zeichen haben.";

        return;
    }


    message.textContent =
        "Account wird erstellt...";


    const {
        data,
        error
    } = await supabaseClient.auth.signUp({

        email: email,
        password: password

    });


    if (error) {

        console.error(error);

        message.textContent =
            error.message;

        return;
    }


    if (!data.user) {

        message.textContent =
            "Registrierung konnte nicht abgeschlossen werden.";

        return;
    }


    /*
       Wenn E-Mail-Bestätigung aktiviert ist,
       muss der Benutzer erst seine E-Mail bestätigen.
    */

    if (!data.session) {

        message.textContent =
            "Account erstellt! Bitte bestätige deine E-Mail und logge dich danach ein.";

        return;
    }


    /*
       Spielerprofil speichern
    */

    const {
        error: playerError
    } = await supabaseClient
        .from("players")
        .insert({

            id: data.user.id,

            player_name: playerName,

            money: 10000,

            x: 400,

            y: 300

        });


    if (playerError) {

        console.error(playerError);

        message.textContent =
            "Account erstellt, aber Spielerprofil konnte nicht gespeichert werden.";

        return;
    }


    await loadGame();
}


/* =========================================
   LOGIN
   ========================================= */

async function login() {

    const email =
        document.getElementById("email").value.trim();

    const password =
        document.getElementById("password").value;

    const message =
        document.getElementById("message");


    if (!email || !password) {

        message.textContent =
            "Bitte E-Mail und Passwort eingeben.";

        return;
    }


    message.textContent =
        "Login...";


    const {
        data,
        error
    } = await supabaseClient.auth.signInWithPassword({

        email: email,

        password: password

    });


    if (error) {

        console.error(error);

        message.textContent =
            error.message;

        return;
    }


    if (!data.user) {

        message.textContent =
            "Login fehlgeschlagen.";

        return;
    }


    await loadGame();
}


/* =========================================
   SPIEL LADEN
   ========================================= */

async function loadGame() {

    const {
        data: {
            user
        }
    } = await supabaseClient.auth.getUser();


    if (!user) {
        return;
    }


    currentPlayer = user;


    const {
        data,
        error
    } = await supabaseClient
        .from("players")
        .select("*")
        .eq("id", user.id)
        .single();


    if (error) {

        console.error(error);

        document.getElementById("message").textContent =
            "Spielerprofil konnte nicht geladen werden.";

        return;
    }


    playerData = data;


    document.getElementById("display-name")
        .textContent = data.player_name;


    document.getElementById("money")
        .textContent = formatMoney(data.money);


    document.getElementById("login-screen")
        .style.display = "none";


    document.getElementById("game-screen")
        .style.display = "block";


    startGame(data);
}


/* =========================================
   GELD FORMATIEREN
   ========================================= */

function formatMoney(amount) {

    return new Intl.NumberFormat("de-DE")
        .format(amount);
}


/* =========================================
   ABMELDEN
   ========================================= */

async function logout() {

    await supabaseClient.auth.signOut();

    location.reload();
}


/* =========================================
   SPIEL STARTEN
   ========================================= */

function startGame(player) {

    if (game) {

        game.destroy(true);

        game = null;
    }


    const config = {

        type: Phaser.AUTO,

        parent: "game",

        width: window.innerWidth,

        height: window.innerHeight - 60,

        backgroundColor: "#79b95b",

        scene: {

            create: function () {

                createWorld(this, player);

            }

        }

    };


    game = new Phaser.Game(config);
}


/* =========================================
   WELT
   ========================================= */

function createWorld(scene, player) {

    /*
       Hintergrund
    */

    const graphics =
        scene.add.graphics();


    /*
       Gras
    */

    graphics.fillStyle(
        0x79b95b,
        1
    );

    graphics.fillRect(
        0,
        0,
        window.innerWidth,
        window.innerHeight
    );


    /*
       Straßen
    */

    graphics.fillStyle(
        0x555555,
        1
    );

    graphics.fillRect(
        0,
        350,
        window.innerWidth,
        80
    );

    graphics.fillRect(
        450,
        0,
        80,
        window.innerHeight
    );


    /*
       Häuser
    */

    createHouse(scene, 120, 100);
    createHouse(scene, 250, 180);
    createHouse(scene, 680, 120);
    createHouse(scene, 820, 200);
    createHouse(scene, 200, 500);
    createHouse(scene, 650, 480);


    /*
       Unternehmen
    */

    createCompany(
        scene,
        player.x || 400,
        player.y || 300,
        player.player_name
    );


    /*
       Überschrift
    */

    scene.add.text(

        20,
        20,

        "Perrycity",

        {
            fontSize: "30px",

            color: "#ffffff",

            fontStyle: "bold",

            stroke: "#000000",

            strokeThickness: 5

        }

    );
}


/* =========================================
   HAUS
   ========================================= */

function createHouse(scene, x, y) {

    const graphics =
        scene.add.graphics();


    /*
       Haus
    */

    graphics.fillStyle(
        0xf1c40f,
        1
    );

    graphics.fillRect(
        x,
        y + 20,
        70,
        55
    );


    /*
       Dach
    */

    graphics.fillStyle(
        0xc0392b,
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


    /*
       Tür
    */

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


    /*
       Fenster
    */

    graphics.fillStyle(
        0x8fd3ff,
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


/* =========================================
   UNTERNEHMEN
   ========================================= */

function createCompany(
    scene,
    x,
    y,
    ownerName
) {

    const graphics =
        scene.add.graphics();


    /*
       Gebäude
    */

    graphics.fillStyle(
        0x3498db,
        1
    );

    graphics.fillRect(
        x,
        y,
        130,
        100
    );


    /*
       Dach
    */

    graphics.fillStyle(
        0x1f5f8b,
        1
    );

    graphics.fillRect(
        x,
        y,
        130,
        15
    );


    /*
       Fenster
    */

    graphics.fillStyle(
        0xbfe8ff,
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


    /*
       Tür
    */

    graphics.fillStyle(
        0x6b3e26,
        1
    );

    graphics.fillRect(
        x + 55,
        y + 70,
        30,
        30
    );


    /*
       Firmenname
    */

    scene.add.text(

        x,
        y - 30,

        ownerName,

        {
            fontSize: "18px",

            color: "#ffffff",

            backgroundColor: "#222222",

            padding: {
                left: 5,
                right: 5,
                top: 3,
                bottom: 3
            }
        }

    );
}


/* =========================================
   AUTOMATISCHER LOGIN-CHECK
   ========================================= */

window.addEventListener(
    "load",
    async function () {

        const {
            data: {
                session
            }
        } = await supabaseClient.auth.getSession();


        if (session) {

            await loadGame();
        }

    }
);


/* =========================================
   FENSTERGRÖSSE
   ========================================= */

window.addEventListener(
    "resize",
    function () {

        if (game) {

            game.scale.resize(
                window.innerWidth,
                window.innerHeight - 60
            );

        }

    }
);
