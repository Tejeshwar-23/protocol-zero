CREATE TABLE IF NOT EXISTS USERS (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    total_logins INTEGER DEFAULT 0,
    -- Reserved Columns
    avatar_type TEXT DEFAULT 'default',
    tutorial_completed BOOLEAN DEFAULT 0,
    ai_easy_wins INTEGER DEFAULT 0,
    ai_medium_wins INTEGER DEFAULT 0,
    ai_hard_wins INTEGER DEFAULT 0,
    pvp_wins INTEGER DEFAULT 0,
    pvp_losses INTEGER DEFAULT 0,
    last_active_at DATETIME,
    extra_data JSON
);

CREATE TABLE IF NOT EXISTS LOGIN_HISTORY (
    login_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    session_info TEXT,
    FOREIGN KEY (user_id) REFERENCES USERS(user_id)
);
CREATE TABLE IF NOT EXISTS PVP_HISTORY (
    match_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    opponent_username TEXT NOT NULL,
    result TEXT NOT NULL, -- 'WIN' or 'LOSS'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES USERS(user_id)
);
