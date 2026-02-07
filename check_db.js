const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function checkDb() {
    const db = await open({
        filename: path.join(__dirname, 'server/db.sqlite'),
        driver: sqlite3.Database
    });

    const users = await db.all('SELECT * FROM USERS');
    console.log(JSON.stringify(users, null, 2));

    const history = await db.all('SELECT * FROM LOGIN_HISTORY');
    console.log("LOGIN HISTORY:", JSON.stringify(history, null, 2));

    const pvpHistory = await db.all('SELECT * FROM PVP_HISTORY');
    console.log("PVP HISTORY:", JSON.stringify(pvpHistory, null, 2));
}

checkDb();
