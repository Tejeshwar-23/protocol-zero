const express = require('express');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const bcrypt = require('bcrypt');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(cors());

const DB_PATH = path.join(__dirname, 'db.sqlite');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let db;

async function initDb() {
    db = await open({
        filename: DB_PATH,
        driver: sqlite3.Database
    });

    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    await db.exec(schema);
    console.log('Database initialized');
}

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

// PvP Match Storage (In-Memory for Polling Sync)
const activeMatches = {};

// Helper to generate 6-letter alphanumeric code
function generateMatchCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// PvP Create
app.post('/api/pvp/create', (req, res) => {
    const { userId, username } = req.body;
    const code = generateMatchCode();
    activeMatches[code] = {
        host: { userId, username, ready: false },
        guest: null,
        state: {
            board: null, // Initialized on sync/start
            turn: 'host',
            units: [], // { type, x, y, owner }
            health: { host: 100, guest: 100 },
            status: 'WAITING'
        },
        createdAt: Date.now()
    };
    res.json({ success: true, code });
});

// PvP Join
app.post('/api/pvp/join', (req, res) => {
    const { code, userId, username } = req.body;
    const match = activeMatches[code];

    if (!match) return res.status(404).json({ error: 'MATCH NOT FOUND' });
    if (match.guest) return res.status(400).json({ error: 'MATCH FULL' });

    match.guest = { userId, username, ready: false };
    match.state.status = 'SYNCING';
    res.json({ success: true, matchCode: code });
});

// PvP Sync (Polling)
app.get('/api/pvp/sync', (req, res) => {
    const { code } = req.query;
    const match = activeMatches[code];

    if (!match) return res.status(404).json({ error: 'MATCH NOT FOUND' });

    res.json({ success: true, match });
});

// PvP Update State
app.post('/api/pvp/update', (req, res) => {
    const { code, state } = req.body;
    const match = activeMatches[code];

    if (!match) return res.status(404).json({ error: 'MATCH NOT FOUND' });

    match.state = { ...match.state, ...state };
    res.json({ success: true });
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
setInterval(() => {
    const now = Date.now();
    for (const code in activeMatches) {
        if (now - activeMatches[code].createdAt > 1000 * 60 * 60) {
            delete activeMatches[code];
        }
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

const PORT = 3000;
initDb().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
    });
});
