require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { createClient } = require('@libsql/client');
const bcrypt = require('bcrypt');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(cors());

// Database Adapter to switch between Local SQLite and Turso
class DbAdapter {
    constructor() {
        this.type = 'local';
        this.db = null;
        this.client = null;
    }

    async init() {
        if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
            console.log("Initializing Turso Database...");
            this.type = 'turso';
            this.client = createClient({
                url: process.env.TURSO_DATABASE_URL,
                authToken: process.env.TURSO_AUTH_TOKEN
            });
        } else {
            console.log("Initializing Local SQLite Database...");
            this.type = 'local';
            const DB_DIR = process.env.DATA_DIR || __dirname;
            const DB_PATH = path.join(DB_DIR, 'db.sqlite');
            this.db = await open({
                filename: DB_PATH,
                driver: sqlite3.Database
            });
        }

        // Initialize Schema
        const SCHEMA_PATH = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');

        // Split schema into statements for proper execution
        const statements = schema.split(';').filter(stmt => stmt.trim().length > 0);

        for (const stmt of statements) {
            await this.exec(stmt);
        }
        console.log('Database Schema Initialized');
    }

    async get(sql, params = []) {
        if (this.type === 'turso') {
            const result = await this.client.execute({ sql, args: params });
            return result.rows[0]; // Turso returns rows as array of objects (if configured) or arrays
        } else {
            return await this.db.get(sql, params);
        }
    }

    async all(sql, params = []) {
        if (this.type === 'turso') {
            const result = await this.client.execute({ sql, args: params });
            return result.rows;
        } else {
            return await this.db.all(sql, params);
        }
    }

    async run(sql, params = []) {
        if (this.type === 'turso') {
            const result = await this.client.execute({ sql, args: params });
            // Turso returns lastInsertRowid as valid ID
            return { lastID: Number(result.lastInsertRowid), changes: result.rowsAffected };
        } else {
            return await this.db.run(sql, params);
        }
    }

    async exec(sql) {
        if (this.type === 'turso') {
            return await this.client.execute(sql);
        } else {
            return await this.db.exec(sql);
        }
    }
}

const db = new DbAdapter();

// Signup Logic
app.post('/api/signup', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'INVALID INPUT' });
    }

    try {
        const existingUser = await db.get('SELECT user_id FROM USERS WHERE username = ?', [username]);
        if (existingUser) {
            return res.status(400).json({ error: 'USERNAME TAKEN' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const result = await db.run(
            'INSERT INTO USERS (username, password_hash) VALUES (?, ?)',
            [username, passwordHash]
        );

        res.json({ success: true, userId: result.lastID });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'INTERNAL SERVER ERROR' });
    }
});

// Login Logic
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'INVALID INPUT' });
    }

    try {
        const user = await db.get('SELECT * FROM USERS WHERE username = ?', [username]);
        if (!user) {
            return res.status(401).json({ error: 'AUTHENTICATION FAILED' });
        }

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(401).json({ error: 'AUTHENTICATION FAILED' });
        }

        // Increment login count
        // Note: SQLite CURRENT_TIMESTAMP is compatible with Turso (libSQL)
        await db.run('UPDATE USERS SET total_logins = total_logins + 1, last_active_at = CURRENT_TIMESTAMP WHERE user_id = ?', [user.user_id]);

        // Log history
        await db.run('INSERT INTO LOGIN_HISTORY (user_id) VALUES (?)', [user.user_id]);

        res.json({ success: true, username: user.username, userId: user.user_id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'INTERNAL SERVER ERROR' });
    }
});

// Leaderboard Logic
app.get('/api/leaderboard', async (req, res) => {
    const { difficulty, userId } = req.query;
    const column = `ai_${difficulty}_wins`;
    try {
        const top15 = await db.all(`SELECT user_id, username, ${column} as wins FROM USERS WHERE ${column} > 0 ORDER BY ${column} DESC LIMIT 15`);

        let personalEntry = null;
        if (userId) {
            const userRecord = await db.get(`SELECT user_id, username, ${column} as wins FROM USERS WHERE user_id = ?`, [userId]);
            if (userRecord && userRecord.wins > 0) {
                const isInTop15 = top15.some(u => u.user_id === parseInt(userId));
                if (!isInTop15) {
                    const rankData = await db.get(`SELECT COUNT(*) + 1 as rank FROM USERS WHERE ${column} > ?`, [userRecord.wins]);
                    personalEntry = {
                        username: userRecord.username,
                        wins: userRecord.wins,
                        rank: rankData.rank
                    };
                }
            }
        }

        res.json({ success: true, leaderboard: top15, personalEntry });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'INTERNAL SERVER ERROR' });
    }
});

// PvP Match Storage (Now Database Backed)
// No more in-memory activeMatches object

// Helper to generate 6-letter alphanumeric code
function generateMatchCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// PvP Create
app.post('/api/pvp/create', async (req, res) => {
    const { userId, username } = req.body;
    const code = generateMatchCode();
    const hostData = { userId, username, ready: false };
    const guestData = null;
    const gameState = {
        board: null, // Initialized on sync/start
        turn: 'host',
        units: [], // { type, x, y, owner }
        health: { host: 100, guest: 100 },
        status: 'WAITING'
    };

    try {
        await db.run(
            'INSERT INTO ACTIVE_MATCHES (match_code, host_data, guest_data, state) VALUES (?, ?, ?, ?)',
            [code, JSON.stringify(hostData), JSON.stringify(guestData), JSON.stringify(gameState)]
        );
        console.log(`PvP Match Created: ${code}`);
        res.json({ success: true, code });
    } catch (err) {
        console.error("PvP Create Error:", err);
        res.status(500).json({ success: false, error: 'DATABASE ERROR' });
    }
});

// PvP Join
app.post('/api/pvp/join', async (req, res) => {
    const { code, userId, username } = req.body;
    try {
        const match = await db.get('SELECT * FROM ACTIVE_MATCHES WHERE match_code = ?', [code]);
        if (!match) return res.status(404).json({ error: 'MATCH NOT FOUND' });

        const rawGuestData = match.guest_data || match.GUEST_DATA;
        const guestData = rawGuestData ? (typeof rawGuestData === 'string' ? JSON.parse(rawGuestData) : rawGuestData) : null;
        if (guestData) return res.status(400).json({ error: 'MATCH FULL' });

        const updatedGuestData = { userId, username, ready: false };
        const rawState = match.state || match.STATE;
        const updatedState = typeof rawState === 'string' ? JSON.parse(rawState) : rawState;
        updatedState.status = 'SYNCING';

        await db.run(
            'UPDATE ACTIVE_MATCHES SET guest_data = ?, state = ? WHERE match_code = ?',
            [JSON.stringify(updatedGuestData), JSON.stringify(updatedState), code]
        );
        res.json({ success: true, matchCode: code });
    } catch (err) {
        console.error("PvP Join Error:", err);
        res.status(500).json({ error: 'DATABASE ERROR' });
    }
});

// PvP Sync (Polling)
app.get('/api/pvp/sync', async (req, res) => {
    const { code } = req.query;
    try {
        const matchRow = await db.get('SELECT * FROM ACTIVE_MATCHES WHERE match_code = ?', [code]);
        if (!matchRow) return res.status(404).json({ error: 'MATCH NOT FOUND' });

        const hostRaw = matchRow.host_data || matchRow.HOST_DATA;
        const guestRaw = matchRow.guest_data || matchRow.GUEST_DATA;
        const stateRaw = matchRow.state || matchRow.STATE;

        const match = {
            host: typeof hostRaw === 'string' ? JSON.parse(hostRaw) : hostRaw,
            guest: guestRaw ? (typeof guestRaw === 'string' ? JSON.parse(guestRaw) : guestRaw) : null,
            state: typeof stateRaw === 'string' ? JSON.parse(stateRaw) : stateRaw
        };
        res.json({ success: true, match });
    } catch (err) {
        console.error("PvP Sync Error:", err);
        res.status(500).json({ error: 'DATABASE ERROR' });
    }
});

// PvP Update State
app.post('/api/pvp/update', async (req, res) => {
    const { code, state } = req.body;
    try {
        const matchRow = await db.get('SELECT * FROM ACTIVE_MATCHES WHERE match_code = ?', [code]);
        if (!matchRow) return res.status(404).json({ error: 'MATCH NOT FOUND' });

        // Robust column access mapping (handles different drivers)
        const currentRawState = matchRow.state || matchRow.STATE;
        if (!currentRawState) return res.status(500).json({ error: 'MATCH STATE MISSING' });

        const currentState = typeof currentRawState === 'string' ? JSON.parse(currentRawState) : currentRawState;

        // Merge state carefully
        const newState = { ...currentState, ...state };

        await db.run(
            'UPDATE ACTIVE_MATCHES SET state = ? WHERE match_code = ?',
            [JSON.stringify(newState), code]
        );

        console.log(`PvP State Updated for ${code}: Turn is now ${newState.turn}`);
        res.json({ success: true });
    } catch (err) {
        console.error("PvP Update Error:", err);
        res.status(500).json({ error: 'DATABASE ERROR' });
    }
});

// Game Completion
app.post('/api/game/complete', async (req, res) => {
    const { userId, type, difficulty, result, opponentUsername } = req.body;

    try {
        if (type === 'AI' && result === 'WIN') {
            const column = `ai_${difficulty}_wins`;
            await db.run(`UPDATE USERS SET ${column} = ${column} + 1 WHERE user_id = ?`, [userId]);
        } else if (type === 'PVP') {
            await db.run(
                'INSERT INTO PVP_HISTORY (user_id, opponent_username, result) VALUES (?, ?, ?)',
                [userId, opponentUsername, result]
            );
            if (result === 'WIN') {
                await db.run('UPDATE USERS SET pvp_wins = pvp_wins + 1 WHERE user_id = ?', [userId]);
            } else {
                await db.run('UPDATE USERS SET pvp_losses = pvp_losses + 1 WHERE user_id = ?', [userId]);
            }
        }
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'INTERNAL SERVER ERROR' });
    }
});

// Cleanup old matches every hour
setInterval(async () => {
    try {
        await db.run("DELETE FROM ACTIVE_MATCHES WHERE created_at < datetime('now', '-1 hour')");
        console.log("Cleaned up old matches from database.");
    } catch (err) {
        console.error("Cleanup failed:", err);
    }
}, 1000 * 60 * 60);

// PvP History Fetching
app.get('/api/pvp-history', async (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    try {
        const history = await db.all('SELECT opponent_username, result, created_at FROM PVP_HISTORY WHERE user_id = ? ORDER BY created_at DESC LIMIT 15', [userId]);
        res.json({ success: true, history });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'INTERNAL SERVER ERROR' });
    }
});


// Serve frontend
app.use(express.static(path.join(__dirname, '../public')));

const PORT = process.env.PORT || 3000;
db.init().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
    });
});
