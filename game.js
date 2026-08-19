/* =========================================
   PERRYCITY
   ========================================= */

const SUPABASE_URL =
    "https://nrloacwgehhukzkgtoas.supabase.co";

const SUPABASE_KEY =
    "sb_publishable_EUQuU4qxS8pPHuBCc7R_tg_6RXLtNN6";


const supabaseClient =
    supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY
    );


let currentPlayer = null;
let playerData = null;
let game = null;


/* =========================================
   LOGIN-NAME
   ========================================= */

function normalizeName(name) {

    return name
        .trim()
        .toLowerCase();
}


/*
   Supabase braucht intern eine
   technische E-Mail-Adresse.

   Der Spieler sieht diese niemals.
*/

function internalLogin(name) {

    return (
        normalizeName(name)
        .replace(/[^a-z0-9_-]/g, "")
        + "@perrycity.game"
    );
}


/* =========================================
   REGISTRIEREN
   ========================================= */

async function register() {

    const playerName =
        document
            .getElementById("player-name")
            .value
            .trim();

    const password =
        document
            .getElementById("password")
            .value;

    const message =
        document
            .getElementById("message");


    if (!playerName || !password) {

        message.textContent =
            "Bitte Spielername und Passwort eingeben.";

        return;
    }


    if (playerName.length < 3) {

        message.textContent =
            "Der Spielername muss mindestens 3 Zeichen haben.";

        return;
    }


    if (password.length < 6) {

        message.textContent =
            "Das Passwort muss mindestens 6 Zeichen haben.";

        return;
    }


    if (
        !/^[a-zA-Z0-9_-]+$/.test(playerName)
    ) {

        message.textContent =
            "Nur Buchstaben, Zahlen, _ und - sind erlaubt.";

        return;
    }


    const loginName =
        normalizeName(playerName);


    /*
       Prüfen, ob der Name bereits existiert
    */

    const {
        data: existingPlayer,
        error: existingError
    } = await supabaseClient
        .from("players")
        .select("id")
        .eq("login_name", loginName)
        .maybeSingle();


    if (existingError) {

        console.error(existingError);

        message.textContent =
            "Fehler bei der Prüfung des Spielernamens.";

        return;
    }


    if (existingPlayer) {

        message.textContent =
            "Dieser Spielername ist bereits vergeben.";

        return;
    }


    message.textContent =
        "Spieler wird erstellt...";


    /*
       Interne Auth-ID
    */

    const internalEmail =
        internalLogin(playerName);


    const {
        data,
        error
    } =
        await supabaseClient.auth.signUp({

            email:
                internalEmail,

            password:
                password,

            options: {

                data: {

                    player_name:
                        playerName

                }

            }

        });


    if (error) {

        console.error(error);

        message.textContent =
            error.message;

        return;
    }


    if (!data.user) {

        message.textContent =
            "Spieler konnte nicht erstellt werden.";

        return;
    }


    /*
       Spielerdaten speichern
    */

    const {
        error: playerError
    } =
        await supabaseClient
            .from("players")
            .insert({

                id:
                    data.user.id,

                player_name:
                    playerName,

                login_name:
                    loginName,

                money:
                    10000,

                x:
                    400,

                y:
                    300

            });


    if (playerError) {

        console.error(playerError);

        message.textContent =
            "Spieler wurde erstellt, aber das Profil konnte nicht gespeichert werden.";

        return;
    }


    await loadGame();
}


/* =========================================
   EINLOGGEN
   ========================================= */

async function login() {

    const playerName =
        document
            .getElementById("player-name")
            .value
            .trim();

    const password =
        document
            .getElementById("password")
            .value;

    const message =
        document
            .getElementById("message");


    if (!playerName || !password) {

        message.textContent =
            "Bitte Spielername und Passwort eingeben.";

        return;
    }


    message.textContent =
        "Login...";


    const internalEmail =
        internalLogin(playerName);


    const {
        data,
        error
    } =
        await supabaseClient.auth
            .signInWithPassword({

                email:
                    internalEmail,

                password:
                    password

            });


    if (error) {

        console.error(error);

        message.textContent =
            "Spielername oder Passwort ist falsch.";

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
    } =
        await supabaseClient.auth
            .getUser();


    if (!user) {
        return;
    }


    currentPlayer =
        user;


    const {
        data,
        error
    } =
        await supabaseClient
            .from("players")
            .select("*")
            .eq("id", user.id)
            .single();


    if (error) {

        console.error(error);

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
}


/* =========================================
   GELD
   ========================================= */

function formatMoney(amount) {

    return new Intl.NumberFormat(
        "de-DE"
    ).format(amount);
}


/* =========================================
   LOGOUT
   ========================================= */

async function logout() {

    await supabaseClient.auth
        .signOut();

    location.reload();
}


/* =========================================
   SPIEL
   ========================================= */

function startGame(player) {

    if (game) {

        game.destroy(true);

        game = null;
    }


    const config = {

        type:
            Phaser.AUTO,

        parent:
            "game",

        width:
            window.innerWidth,

        height:
            window.innerHeight - 62,

        backgroundColor:
            "#55c7b9",

        scene: {

            create:
                function () {

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


/* =========================================
   WELT
   ========================================= */

function createWorld(
    scene,
    player
) {

    const graphics =
        scene.add.graphics();


    /*
       Wasser/Aqua-Hintergrund
    */

    graphics.fillStyle(
        0x6dd5c7,
        1
    );

    graphics.fillRect(
        0,
        0,
        window.innerWidth,
        window.innerHeight
    );


    /*
       Stadtfläche
    */

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


    /*
       Straßen
    */

    graphics.fillStyle(
        0x555f63,
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


    /*
       Wasserkanal
    */

    graphics.fillStyle(
        0x3bc7d4,
        1
    );

    graphics.fillRect(
        0,
        600,
        window.innerWidth,
        60
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
       Titel
    */

    scene.add.text(

        20,

        20,

        "Perrycity",

        {

            fontSize:
                "30px",

            color:
                "#ffffff",

            fontStyle:
                "bold",

            stroke:
                "#064c55",

            strokeThickness:
                6

        }

    );
}


/* =========================================
   HAUS
   ========================================= */

function createHouse(
    scene,
    x,
    y
) {

    const graphics =
        scene.add.graphics();


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


    graphics.fillStyle(
        0x0b8f91,
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
       Hauptgebäude
    */

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


    /*
       Aqua-Akzent
    */

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


    /*
       Fenster
    */

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


    /*
       Tür
    */

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


    /*
       Name
    */

    scene.add.text(

        x,

        y - 30,

        ownerName,

        {

            fontSize:
                "18px",

            color:
                "#ffffff",

            backgroundColor:
                "#075d68",

            padding: {

                left: 7,

                right: 7,

                top: 4,

                bottom: 4

            }

        }

    );
}


/* =========================================
   AUTOMATISCHER LOGIN
   ========================================= */

window.addEventListener(
    "load",
    async function () {

        const {
            data: {
                session
            }
        } =
            await supabaseClient
                .auth
                .getSession();


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

                window.innerHeight - 62

            );

        }

    }
);
