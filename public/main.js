const app = document.getElementById('app');
const authContainer = document.getElementById('auth-container');
const lobbyContainer = document.getElementById('lobby-container');
const initialScreen = document.getElementById('initial-screen');
const startBtn = document.getElementById('start-btn');
const introVideo = document.getElementById('intro-video');
const introContainer = document.getElementById('intro-container');
const messageDiv = document.getElementById('message');
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const accessUsername = document.getElementById('access-username');

// Tutorial Elements
const tutorialContainer = document.getElementById('tutorial-container');
const tutorialGridContainer = document.getElementById('tutorial-grid-container');
const tutorialGrid = document.getElementById('tutorial-grid');
const tutorialText = document.getElementById('tutorial-text');
const tutorialAvatars = document.getElementById('tutorial-avatars');
const avatarF = document.getElementById('avatar-f');
const avatarM = document.getElementById('avatar-m');
const tutorialIndicatorOverlay = document.getElementById('tutorial-indicator-overlay');
const tutorialHealthFill = document.getElementById('tutorial-health-fill');
const tutorialHealthContainer = document.getElementById('tutorial-health-container');
const tutorialMediaSlot = document.getElementById('tutorial-media-slot');
const systemOverlay = document.getElementById('system-overlay');
const typewriterText = document.getElementById('typewriter-text');
const tutorialOptions = document.getElementById('tutorial-options');
const tutorialYes = document.getElementById('tutorial-yes');
const tutorialNo = document.getElementById('tutorial-no');
const finalOptions = document.getElementById('tutorial-final-options');
const replayYes = document.getElementById('tutorial-replay-yes');
const replayNo = document.getElementById('tutorial-replay-no');

// Sounds
const sndTyping = document.getElementById('snd-typing');
const sndTab = document.getElementById('snd-tab');
const sndAlert = document.getElementById('snd-alert');
const sndTutorialBg = document.getElementById('snd-tutorial-bg');
const sndLobbyBg = document.getElementById('snd-lobby-bg');
const sndGameBg = document.getElementById('snd-game-bg');

let currentUser = null;
let currentUserId = null;
let selectedGender = 'female';
let leaderboardInterval = null;
let currentDiffIndex = 0;
const difficulties = ['easy', 'medium', 'hard'];

// Lobby Manager
const LobbyManager = {
    async show() {
        console.log("Entering Lobby...");
        authContainer.style.display = 'none';
        systemOverlay.style.display = 'none';
        tutorialContainer.style.display = 'none';

        // Cinematic Transition
        lobbyContainer.style.opacity = '0';
        lobbyContainer.style.display = 'block';
        setTimeout(() => {
            lobbyContainer.style.transition = 'opacity 1.5s ease-in-out';
            lobbyContainer.style.opacity = '1';
        }, 10);

        accessUsername.innerText = (currentUser || "SYSTEM_USER").toUpperCase();

        // Authority Ref: EASY mode active by default
        this.switchLeaderboard('easy');
        this.updatePVPHistory();

        // Ensure music plays
        if (sndLobbyBg) {
            sndLobbyBg.currentTime = 0;
            this.playMusic();
        }
    },

    playMusic() {
        if (!sndLobbyBg) {
            console.error("Lobby audio element not found!");
            return;
        }

        const forcePlay = () => {
            console.log("Attempting to play lobby music...");
            sndLobbyBg.volume = 0.6;
            sndLobbyBg.currentTime = 0; // RESTART FROM BEGINNING
            sndLobbyBg.play()
                .then(() => {
                    console.log("Lobby music playing.");
                    window.removeEventListener('click', forcePlay);
                    window.removeEventListener('keydown', forcePlay);
                })
                .catch(err => {
                    console.warn("Lobby music play blocked or failed:", err.message);
                    window.addEventListener('click', forcePlay, { once: true });
                    window.addEventListener('keydown', forcePlay, { once: true });
                });
        };

        if (sndLobbyBg.paused) {
            if (sndLobbyBg.readyState >= 3) {
                forcePlay();
            } else {
                console.log("Lobby music not ready, waiting for 'canplay'...");
                sndLobbyBg.addEventListener('canplay', forcePlay, { once: true });
                sndLobbyBg.load(); // Ensure it starts loading
            }
        }
    },

    stopMusic() {
        if (!sndLobbyBg) return;
        sndLobbyBg.pause();
        sndLobbyBg.currentTime = 0;
    },

    switchTab(tab) {
        sndTab.currentTime = 0;
        sndTab.play().catch(() => { });

        if (tab === 'vs-ai') {
            document.getElementById('difficulty-overlay').style.display = 'flex';
        } else if (tab === 'pvp') {
            document.getElementById('pvp-overlay').style.display = 'flex';
            this.showPVPInitial();
        }
    },

    hideDifficultyOverlay() {
        document.getElementById('difficulty-overlay').style.display = 'none';
    },

    hidePVPOverlay() {
        document.getElementById('pvp-overlay').style.display = 'none';
    },

    handleOverlayClick(event, overlayId) {
        // If the target is the overlay itself (the backdrop), hide it
        if (event.target.id === overlayId) {
            if (overlayId === 'difficulty-overlay') this.hideDifficultyOverlay();
            else if (overlayId === 'pvp-overlay') this.hidePVPOverlay();
        }
    },

    signOut() {
        this.stopMusic();
        currentUser = null;
        currentUserId = null;
        location.reload();
    },

    startAIGame(diff) {
        console.log(`Starting AI Game: ${diff}`);
        sndAlert.currentTime = 0;
        sndAlert.play().catch(() => { });
        this.hideDifficultyOverlay();
        // Authority Ref: Pass difficulty to MatchManager
        MatchManager.start('AI', { difficulty: diff });
    },

    // PVP Modal Logic
    showPVPInitial() {
        document.getElementById('pvp-initial').style.display = 'flex';
        document.getElementById('pvp-create-view').style.display = 'none';
        document.getElementById('pvp-join-view').style.display = 'none';
    },

    async createPVPGame() {
        try {
            const res = await fetch('/api/pvp/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: currentUserId, username: currentUser })
            });
            const data = await res.json();
            if (data.success) {
                document.getElementById('generated-code').innerText = data.code;
                document.getElementById('pvp-initial').style.display = 'none';
                document.getElementById('pvp-create-view').style.display = 'block';

                // Start polling for guest
                const pollGuest = setInterval(async () => {
                    const syncRes = await fetch(`/api/pvp/sync?code=${data.code}`);
                    const syncData = await syncRes.json();
                    if (syncData.success && syncData.match.guest) {
                        clearInterval(pollGuest);
                        this.hidePVPOverlay();
                        MatchManager.start('PVP', {
                            pvpCode: data.code,
                            role: 'host',
                            opponentName: syncData.match.guest.username // Pass Guest Name
                        });
                    }
                }, 800);
            }
        } catch (e) {
            console.error("Failed to create PvP game:", e);
        }
    },

    joinPVPGamePrompt() {
        document.getElementById('pvp-initial').style.display = 'none';
        document.getElementById('pvp-create-view').style.display = 'none';
        document.getElementById('pvp-join-view').style.display = 'block';
        this.setupPVPFilters();
    },

    async submitJoinCode() {
        const code = document.getElementById('join-code-input').value.toUpperCase();
        if (code.length !== 6) {
            this.showStatus("INVALID CODE: MUST BE 6 CHARACTERS");
            return;
        }

        try {
            const res = await fetch('/api/pvp/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, userId: currentUserId, username: currentUser })
            });
            const data = await res.json();
            if (data.success) {
                // Fetch Host Name before starting
                let hostName = 'OPPONENT';
                try {
                    const syncRes = await fetch(`/api/pvp/sync?code=${code}`);
                    const syncData = await syncRes.json();
                    if (syncData.success) {
                        hostName = syncData.match.host.username;
                    }
                } catch (err) {
                    console.error("Failed to fetch host name:", err);
                }

                this.hidePVPOverlay();
                MatchManager.start('PVP', {
                    pvpCode: code,
                    role: 'guest',
                    opponentName: hostName // Pass Host Name
                });
            } else {
                this.showStatus(data.error);
            }
        } catch (e) {
            this.showStatus("CONNECTION FAILURE");
        }
    },

    showStatus(msg) {
        // Controlled, system-like alert replacement
        console.log(`Lobby Status: ${msg}`);
        alert(msg);
    },

    // A-Z Input Filter for Join Codes
    setupPVPFilters() {
        const input = document.getElementById('join-code-input');
        if (!input) return;
        input.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        });
    },

    // Manual Leaderboard Switching
    async switchLeaderboard(diff) {
        // UI State Update
        document.querySelectorAll('.lb-tab').forEach(t => {
            t.classList.toggle('active', t.getAttribute('data-diff') === diff);
        });

        // Authority Ref: Render skeleton immediately to prevent black screen
        this.renderLeaderboard([]);
        await this.fetchLeaderboard(diff);
    },

    async fetchLeaderboard(diff) {
        try {
            const res = await fetch(`/api/leaderboard?difficulty=${diff}&userId=${currentUserId}`);
            const data = await res.json();
            if (data.success) {
                this.renderLeaderboard(data.leaderboard, data.personalEntry);
            }
        } catch (e) {
            console.error("Leaderboard fetch error:", e);
        }
    },

    renderLeaderboard(entries, personalEntry) {
        const body = document.getElementById('lb-body-main');
        if (!body) return;

        const top15 = entries || [];

        let html = '';
        if (top15.length > 0) {
            html = top15.map((e, i) => `
                <tr>
                    <td class="rank-col col-center">${i + 1}</td>
                    <td class="col-left">${e.username}</td>
                    <td class="wins-col col-center">${e.wins}</td>
                </tr>
            `).join('');

            if (personalEntry) {
                html += `
                    <tr class="personal-rank-row">
                        <td class="rank-col col-center">${personalEntry.rank}</td>
                        <td class="col-left">${personalEntry.username} <span style="font-size: 0.7rem; color: var(--accent-color); opacity: 0.8;">[YOU]</span></td>
                        <td class="wins-col col-center">${personalEntry.wins}</td>
                    </tr>
                `;
            }
        } else {
            html = `<tr><td colspan="3" class="col-center" style="opacity:0.3; padding: 40px;">NO DATA COMMITTED</td></tr>`;
        }
        body.innerHTML = html;
    },

    async updatePVPHistory() {
        const body = document.getElementById('pvp-body-main');
        if (!body) return;

        if (!currentUserId) {
            body.innerHTML = `<tr><td colspan="2" class="col-center" style="opacity:0.3; padding: 40px;">GUEST SESSION</td></tr>`;
            return;
        }

        try {
            const res = await fetch(`/api/pvp-history?userId=${currentUserId}`);
            const data = await res.json();

            if (data.success && data.history.length > 0) {
                body.innerHTML = data.history.map(h => `
                    <tr>
                        <td class="col-left">${h.opponent_username}</td>
                        <td class="result-col col-center ${h.result === 'WIN' ? 'history-win' : 'history-loss'}">${h.result}</td>
                    </tr>
                `).join('');
            } else {
                body.innerHTML = `<tr><td colspan="2" class="col-center" style="opacity:0.3; padding: 40px;">NO MATCHES RECORDED</td></tr>`;
            }
        } catch (e) {
            console.error("PVP History fetch error:", e);
            body.innerHTML = `<tr><td colspan="2" class="col-center" style="opacity:0.3; padding: 40px;">TERMINAL ERROR</td></tr>`;
        }
    }
};

// Utility: Typewriter effect for any element
async function typeWriter(text, element) {
    element.innerHTML = "";
    sndTyping.currentTime = 0;
    sndTyping.play().catch(() => { });
    for (let char of text) {
        element.innerHTML += char;
        await new Promise(r => setTimeout(r, 60)); // Increased speed (from 150ms)
    }
    sndTyping.pause();
    sndTyping.currentTime = 0;
}

// Utility: Erase text effect
async function eraseText(element) {
    const text = element.innerHTML;
    for (let i = text.length; i >= 0; i--) {
        element.innerHTML = text.substring(0, i);
        await new Promise(r => setTimeout(r, 15));
    }
}

// State Manager for Tutorial
const TutorialManager = {
    tutorialContainer: tutorialContainer,
    currentStep: 0,
    traps: [],

    async showMessage(text, duration = 2000, img = null) {
        if (img) {
            // High-fidelity bobbing wrapper
            tutorialMediaSlot.innerHTML = `<div class="bob-media"><img src="images/${img}" class="media-highlight"></div>`;
            tutorialMediaSlot.style.display = 'flex';
        } else {
            tutorialMediaSlot.style.display = 'none';
            tutorialMediaSlot.innerHTML = '';
        }
        await typeWriter(text, tutorialText);
        await new Promise(r => setTimeout(r, duration));
        await eraseText(tutorialText);
        tutorialMediaSlot.style.display = 'none';
        tutorialMediaSlot.innerHTML = '';
    },

    // Refinement: Indicator permanently removed from grid tiles to prevent clutter
    showIndicator(tile, img) {
        console.log("Abstract indicator only (Guidance Slot):", img);
    },

    async start() {
        console.log("Starting Tutorial...");
        this.currentStep = 1;
        tutorialContainer.style.display = 'block';

        // Ensure everything is hidden for a sequential reveal
        tutorialGridContainer.style.display = 'none';
        tutorialHealthContainer.style.display = 'none';
        tutorialAvatars.style.display = 'none';
        if (avatarF && avatarM) {
            avatarF.style.opacity = '1';
            avatarM.style.opacity = '1';
        }
        tutorialHealthFill.style.height = '100%';

        // AUDIO: Stop all other themes, start Tutorial dramatic theme
        if (sndLobbyBg) sndLobbyBg.pause();
        if (sndGameBg) {
            console.log("Ensuring Game (Crickets) background is paused for Tutorial");
            sndGameBg.pause();
            sndGameBg.currentTime = 0;
        }

        if (sndTutorialBg) {
            console.log("Starting Tutorial Background Music:", sndTutorialBg.src);
            sndTutorialBg.volume = 0.5;
            sndTutorialBg.currentTime = 0;
            sndTutorialBg.play().catch(e => console.warn("Tutorial Audio blocked:", e));
        }
        await this.step1();
    },

    async step1() {
        await this.showMessage("INITIALIZING TRAINING SIMULATION...", 1500);
        await this.showMessage("ACCESSING TACTICAL GRID DATA...", 1500);
        await this.step2();
    },

    async step2() {
        tutorialAvatars.style.display = 'flex';

        return new Promise(resolve => {
            const select = async (id) => {
                // Clear handlers immediately to prevent double-click
                avatarF.onclick = avatarM.onclick = null;

                selectedGender = id === 'f' ? 'female' : 'male';
                sndAlert.currentTime = 0;
                sndAlert.play().catch(() => { });

                const other = id === 'f' ? avatarM : avatarF;
                other.style.opacity = '0';

                setTimeout(async () => {
                    tutorialAvatars.style.display = 'none';
                    await eraseText(tutorialText);
                    await this.showMessage("AVATAR CONFIRMED", 1200);
                    await this.step3();
                    resolve();
                }, 600);
            };

            // Set handlers BEFORE typewriter so user can skip/select early
            console.log("Assigning selection handlers to:", avatarF, avatarM);

            const handleF = () => { console.log("Female Avatar Selected"); select('f'); };
            const handleM = () => { console.log("Male Avatar Selected"); select('m'); };

            avatarF.onclick = handleF;
            avatarM.onclick = handleM;

            [avatarF, avatarM].forEach(a => {
                a.onmouseenter = () => { sndTab.currentTime = 0; sndTab.play().catch(() => { }); };
            });

            // Start typewriter (non-blocking for selection)
            typeWriter("SELECT YOUR AVATAR", tutorialText);
        });
    },

    async step3() {
        tutorialGridContainer.style.display = 'flex';
        this.createGrid();

        // Randomize Trap Placements (3 traps in top 5 rows)
        this.traps = [];
        const availableIndices = Array.from({ length: 30 }, (_, i) => i);
        for (let i = 0; i < 3; i++) {
            const randIdx = Math.floor(Math.random() * availableIndices.length);
            this.traps.push(availableIndices.splice(randIdx, 1)[0]);
        }

        await this.showMessage("THIS IS A 6 BY 6 GRID", 1500);
        await this.showMessage("ALL GAMEPLAY OCCURS ON THIS GRID", 2000);
        await this.step4();
    },

    createGrid() {
        tutorialGrid.innerHTML = '';
        for (let i = 0; i < 36; i++) {
            const tile = document.createElement('div');
            tile.className = 'grid-tile';
            tutorialGrid.appendChild(tile);
        }
    },

    async step4() {
        const tiles = tutorialGrid.children;
        const unitImg = selectedGender === 'female' ? 'female_avatar.png' : 'male_avatar.png';

        const bottomRowIndices = [30, 31, 32, 33, 34, 35];
        const shuffled = bottomRowIndices.sort(() => 0.5 - Math.random());
        const coreIdx = shuffled[0];
        const unit1Idx = shuffled[1];
        const unit2Idx = shuffled[2];

        tiles[coreIdx].innerHTML = '<img src="images/unknown_entity.png" class="core-icon">';
        tiles[unit1Idx].innerHTML = `<img src="images/${unitImg}" class="unit-icon selectable-unit" style="cursor:pointer;" data-id="unit1">`;
        tiles[unit2Idx].innerHTML = `<img src="images/${unitImg}" class="unit-icon selectable-unit" style="cursor:pointer;" data-id="unit2">`;

        await this.showMessage(`YOU CONTROL TWO ${selectedGender.toUpperCase()} UNITS AND ONE CORE`, 2500);
        await this.showMessage("IF YOUR CORE IS DESTROYED\nTHE SIMULATION ENDS", 2500);
        await this.step5();
    },

    async step5() {
        await this.showMessage("UNITS MOVE ONE TILE PER TURN", 2000);
        await typeWriter("SELECT THE AVATAR YOU WANT TO MOVE", tutorialText);

        const units = tutorialGrid.querySelectorAll('.selectable-unit');
        units.forEach(u => u.parentElement.classList.add('tile-valid'));

        return new Promise(resolve => {
            const onUnitClick = async (e) => {
                // Robust check: get the unit image even if clicking the tile background
                let unitImg = e.target.classList.contains('selectable-unit') ? e.target : e.target.querySelector('.selectable-unit');
                if (!unitImg) return;

                const parentTile = unitImg.parentElement;
                const tiles = Array.from(tutorialGrid.children);
                const index = tiles.indexOf(parentTile);

                console.log("Tutorial Unit Selected:", { index, id: unitImg.getAttribute('data-id') });

                units.forEach(u => {
                    u.parentElement.classList.remove('tile-valid');
                    u.onclick = null;
                    u.parentElement.onclick = null; // Clear tile handlers too
                });

                sndAlert.currentTime = 0;
                sndAlert.play().catch(() => { });
                await eraseText(tutorialText);
                await typeWriter("NOW SELECT AN ADJACENT EMPTY TILE", tutorialText);

                const row = Math.floor(index / 6);
                const col = index % 6;
                const possibleTargets = [];
                if (row > 0) possibleTargets.push(index - 6);
                if (row < 5) possibleTargets.push(index + 6);
                if (col > 0) possibleTargets.push(index - 1);
                if (col < 5) possibleTargets.push(index + 1);

                let hasValidTargets = false;
                possibleTargets.forEach(targetIdx => {
                    const targetTile = tiles[targetIdx];
                    if (!targetTile.innerHTML.trim()) {
                        targetTile.classList.add('tile-valid');
                        hasValidTargets = true;
                        targetTile.onclick = async () => {
                            console.log("Tutorial Target Tile Clicked:", targetIdx);
                            tiles.forEach(t => { t.classList.remove('tile-valid'); t.onclick = null; });
                            sndAlert.currentTime = 0;
                            sndAlert.play().catch(() => { });
                            const iconData = parentTile.innerHTML;
                            parentTile.innerHTML = '';
                            targetTile.innerHTML = iconData;
                            await eraseText(tutorialText);
                            await this.step6();
                            resolve();
                        };
                    }
                });

                if (!hasValidTargets) {
                    console.warn("No valid targets for tutorial movement at index:", index);
                    await this.showMessage("MOVEMENT BLOCKED. RE-SELECT UNIT.", 1500);
                    this.step5().then(resolve);
                }
            };

            // Assign to both unit and parent tile for maximum reliability
            units.forEach(u => {
                u.onclick = onUnitClick;
                u.parentElement.onclick = onUnitClick;
            });
        });
    },

    async step6() {
        await this.showMessage("THIS IS A TURN BASED SYSTEM", 2000);
        await this.showMessage("EVENTS MAY OCCUR BETWEEN TURNS", 2000);
        await this.step7();
    },

    async step7() {
        // High-Fidelity Individual Asset Breakdown
        await this.showMessage("THE GRID CONTAINS VARIOUS SYSTEM HAZARDS", 2000);
        await this.showMessage("SPIKE TRAPS CAUSE IMMEDIATE PHYSICAL DAMAGE", 2500, "trap_spike.png");
        await this.showMessage("SYSTEM CORRUPTIONS REPRESENT DATA INSTABILITY", 2500, "danger_symbol.png");
        await this.showMessage("HAZARDS ARE OFTEN HIDDEN UNTIL TRIGGERED", 2500);

        await this.step8();
    },

    async step8() {
        // Refinement: REMOVED grid teleportation and trap icons on grid.
        // Demonstration is now abstractly contained in the media slot.
        await this.showMessage("A UNIT STEPPING ON A TRAP TAKES DAMAGE", 2500);

        // Reveal Health Bar as a pure readout, no grid interaction.
        tutorialHealthContainer.style.display = 'flex';
        tutorialHealthFill.style.height = '100%';

        // Simulating damage feedback in the readout only
        setTimeout(() => { tutorialHealthFill.style.height = '60%'; }, 200);

        await this.showMessage("SYSTEM INTEGRITY REDUCED", 2000);
        await this.step8b();
    },

    async step8b() {
        const unitImg = selectedGender === 'female' ? 'female_avatar.png' : 'male_avatar.png';
        await this.showMessage("PLAYER UNIT VS OPPONENT UNIT", 2500, unitImg);
        await this.showMessage("WHEN BOTH UNITS ENTER THE SAME TILE\nCOMBAT TRIGGERS IMMEDIATELY", 3500);

        // Abstract combat demonstration in media slot
        await this.showMessage("RESOLUTION IS TURN-BASED", 2000);

        // Update health readout only
        tutorialHealthFill.style.height = '40%';
        await this.showMessage("HEALTH UPDATES LIVE DURING BATTLE", 2000);
        await this.showMessage("THE LOSER'S HEALTH IS REDUCED", 2500); // Image removed to prevent "random" appearance
        await this.showMessage("THE DEFEATED UNIT IS TELEPORTED BACK TO BASE", 3000);
        await this.showMessage("OUTCOMES ARE UNPREDICTABLE - 50/50 CHANCE", 3000);

        await this.step9();
    },

    async step9() {
        // Grid remains clean; Healing guidance only in media slot
        await this.showMessage("REPAIR PROTOCOLS CAN RESTORE INTEGRITY", 2500, "heal_indicator_+10.png");
        tutorialHealthFill.style.height = '100%';
        await this.showMessage("SYSTEM INTEGRITY RESTORED", 2000);
        await this.step10();
    },

    async step10() {
        await this.showMessage("FOG OF WAR HIDES THE ENTIRE GRID", 2500);
        Array.from(tutorialGrid.children).forEach((t, i) => {
            if (i < 24 || i > 35) t.classList.add('fog-tile');
        });
        await this.showMessage("ONLY THE AREA AROUND YOUR CORE IS CLEAR", 2500);
        await this.step11();
    },

    async step11() {
        await this.showMessage("SENSORS ALLOW YOU TO SCAN THE GRID", 2500);
        await this.showMessage("SCANS REVEAL HIDDEN TRAPS AND RESOURCE TYPES", 3000);
        await this.showMessage("SCANS MAY BE INACCURATE", 2000);
        await this.showMessage("INFORMATION CAN BE DELAYED OR FALSE", 2500);
        await this.step12();
    },

    async step12() {
        await this.showMessage("AN UNKNOWN ENTITY LURKS IN THE FOG", 2500);
        await this.showMessage("THE 'CORRUPTED REAPER' STALKS THE GRID", 2500, "unknown_entity.png");
        await this.step13();
    },

    async step13() {
        await this.showMessage("YOUR OBJECTIVE: DESTROY THE OPPONENT CORE", 3000);
        await this.showMessage("PENETRATE THEIR DEFENSES AND STRIKE", 2500);
        await this.step14();
    },

    async step14() {
        await this.showMessage("PLAYER VS PLAYER MODE IS NOT RANKED", 3000);
        await this.showMessage("THIS MODE IS FOR PRIVATE MATCHES ONLY", 2500);
        await this.showMessage("MATCHES ARE CREATED USING TEMPORARY LOBBIES", 2500);
        await this.showMessage("ONE PLAYER CREATES A LOBBY\nGENERATING A UNIQUE SIX-CHARACTER CODE", 3500);
        await this.showMessage("THE SECOND PLAYER MUST ENTER THIS CODE TO ACCESS", 3500);
        await this.step15();
    },

    async step15() {
        await this.showMessage("AI MODES ARE DETERMINISTIC", 2500);
        await this.showMessage("THEY FOLLOW PREDICTABLE LOGIC PATHS", 2500);
        await this.showMessage("USE THEM TO PRACTICE TACTICAL MANEUVERS", 2500);
        await this.step16();
    },

    async step16() {
        await this.showMessage("TRAINING SIMULATION COMPLETE", 3000);
        await eraseText(tutorialText);
        finalOptions.style.display = 'flex';
        replayYes.onclick = () => {
            sndAlert.currentTime = 0;
            sndAlert.play().catch(() => { });
            finalOptions.style.display = 'none';
            this.start();
        };
        replayNo.onclick = () => {
            sndAlert.currentTime = 0;
            sndAlert.play().catch(() => { });
            finalOptions.style.display = 'none';
            this.end();
        };
    },

    end() {
        let vol = 0.5;
        const interval = setInterval(() => {
            vol -= 0.05;
            if (vol <= 0) {
                sndTutorialBg.pause();
                sndTutorialBg.currentTime = 0;
                clearInterval(interval);
            } else {
                sndTutorialBg.volume = Math.max(0, vol);
            }
        }, 150);
        tutorialContainer.style.display = 'none';
        LobbyManager.show();
    }
};

// Auth Logic
async function handleLogin() {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    if (!username || !password) {
        messageDiv.innerText = "ENTER CREDENTIALS";
        return;
    }

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (data.success) {
            currentUser = username;
            currentUserId = data.userId;
            authContainer.style.display = 'none';
            app.style.background = 'black';
            await runTransition();
        } else {
            messageDiv.innerText = data.error.toUpperCase();
        }
    } catch (e) {
        messageDiv.innerText = "CONNECTION FAILURE";
    }
}

async function handleSignup() {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    if (!username || !password) {
        messageDiv.innerText = "INVALID INPUT";
        return;
    }

    try {
        const res = await fetch('/api/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (data.success) {
            messageDiv.innerText = "ACCOUNT CREATED";
        } else {
            if (data.error === 'USERNAME TAKEN') {
                messageDiv.innerText = "USERNAME ALREADY TAKEN. TRY AGAIN.";
            } else {
                messageDiv.innerText = data.error.toUpperCase();
            }
        }
    } catch (e) {
        messageDiv.innerText = "CONNECTION FAILURE";
    }
}

async function runTransition() {
    systemOverlay.style.display = 'flex';
    await typeWriter("LOGGING SUCCESSFUL", typewriterText);
    await new Promise(r => setTimeout(r, 1000));
    await eraseText(typewriterText);

    await typeWriter("START TRAINING SIMULATION?", typewriterText);
    tutorialOptions.style.display = 'flex';

    return new Promise(resolve => {
        tutorialYes.onclick = async () => {
            sndAlert.currentTime = 0;
            sndAlert.play().catch(() => { });
            tutorialOptions.style.display = 'none';
            await eraseText(typewriterText);
            systemOverlay.style.display = 'none';
            TutorialManager.start();
            resolve();
        };
        tutorialNo.onclick = () => {
            sndAlert.currentTime = 0;
            sndAlert.play().catch(() => { });
            tutorialOptions.style.display = 'none';
            systemOverlay.style.display = 'none';
            LobbyManager.show();
            resolve();
        };
    });
}

startBtn.onclick = () => {
    sndAlert.currentTime = 0;
    sndAlert.play().catch(() => { });
    initialScreen.style.display = 'none';
    introContainer.style.display = 'flex';
    introVideo.play();

    // Play FULL video and transition with fade-out
    introVideo.onended = () => {
        introContainer.classList.add('fade-out');
        setTimeout(() => {
            introContainer.style.display = 'none';
            introContainer.classList.remove('fade-out');
            authContainer.style.display = 'flex';
        }, 1000); // Wait for CSS transition
    };
};

loginBtn.onclick = handleLogin;
signupBtn.onclick = handleSignup;

const MatchManager = {
    type: 'AI', // 'AI' or 'PVP'
    difficulty: 'easy',
    playerHealth: 100,
    opponentHealth: 100,
    turn: 'player', // 'player', 'opponent', 'ai'
    board: [], // 36 tiles { type: 'empty'|'core'|'trap', revealed: false }
    units: [], // { id, type, x, y, owner: 'player'|'opponent', initialX, initialY }
    pvpCode: null,
    opponentName: null, // Track real opponent name
    syncInterval: null,
    role: 'host', // 'host' or 'guest' for PVP
    battleEvent: null, // { attackerId, defenderId, win }
    endReason: null, // Sync the reason for win/loss

    async start(type, config) {
        this.type = type;
        this.playerHealth = 100;
        this.opponentHealth = 100;
        this.difficulty = config.difficulty || 'easy';
        this.pvpCode = config.pvpCode || null;
        this.opponentName = config.opponentName || null; // Capture name from lobby
        this.role = config.role || 'host'; // 'host' or 'guest'
        this.isGameOver = false; // CRITICAL RESET

        // In PvP, Host goes first, Guest waits
        this.turn = (this.type === 'PVP' && this.role === 'guest') ? 'opponent' : 'player';

        // 1. INSTANT UI SWAP
        lobbyContainer.style.display = 'none';
        const gameContainer = document.getElementById('game-container');
        gameContainer.style.display = 'flex';

        // 2. INITIALIZE ENGINE
        this.initBoard();
        this.renderBoard();
        this.updateStats();
        this.updateTurnIndicator();

        // AUDIO: Stop Lobby, Start Crickets
        const lobbySnd = document.getElementById('snd-lobby-bg');
        if (lobbySnd) lobbySnd.pause();
        const gameSnd = document.getElementById('snd-game-bg');
        if (gameSnd) {
            gameSnd.currentTime = 0;
            gameSnd.play().catch(e => console.log("Audio play blocked:", e));
        }

        // 3. CINEMATIC GRID ENTRANCE
        await this.playStartAnimation();

        if (this.type === 'PVP') {
            // Host MUST send initial board state immediately
            if (this.role === 'host') {
                console.log("Host initializing match state...");
                await this.syncMatchState();
            }
            this.startPVPSync();
        } else if (this.type === 'AI' && this.turn === 'ai') {
            // Should not happen as player starts, but for safety:
            this.aiTurn();
        }
    },

    initBoard() {
        this.board = Array(36).fill(null).map(() => ({ type: 'empty', revealed: false, used: false }));

        // RANDOMIZED Starting Positions per row
        const shuffle = (arr) => arr.sort(() => Math.random() - 0.5);
        const playerXSlots = shuffle([0, 1, 2, 3, 4, 5]);
        const opponentXSlots = shuffle([0, 1, 2, 3, 4, 5]);

        // Place Cores at random X in their row
        const playerCorePos = { x: playerXSlots.pop(), y: 5 };
        const opponentCorePos = { x: opponentXSlots.pop(), y: 0 };
        this.board[playerCorePos.y * 6 + playerCorePos.x] = { type: 'core', revealed: false, used: false, side: 'host' };
        this.board[opponentCorePos.y * 6 + opponentCorePos.x] = { type: 'core', revealed: false, used: false, side: 'guest' };

        // Units at random X in their row
        this.units = [
            { id: 'p1', type: 'unit', x: playerXSlots.pop(), y: 5, owner: 'player', initialX: 0, initialY: 5 },
            { id: 'p2', type: 'unit', x: playerXSlots.pop(), y: 5, owner: 'player', initialX: 0, initialY: 5 },
            { id: 'o1', type: 'unit', x: opponentXSlots.pop(), y: 0, owner: 'opponent', initialX: 0, initialY: 0 },
            { id: 'o2', type: 'unit', x: opponentXSlots.pop(), y: 0, owner: 'opponent', initialX: 0, initialY: 0 }
        ];

        // Ensure initialX/Y match the randomized start
        this.units.forEach(u => {
            u.initialX = u.x;
            u.initialY = u.y;
        });

        const startPositions = this.units.map(u => u.y * 6 + u.x);
        startPositions.push(playerCorePos.y * 6 + playerCorePos.x);
        startPositions.push(opponentCorePos.y * 6 + opponentCorePos.x);

        // Place exactly 12 Traps
        let trapsPlaced = 0;
        const trapIcons = ['trap_spike.png', 'danger_symbol.png'];
        while (trapsPlaced < 12) {
            let idx = Math.floor(Math.random() * 36);
            if (this.board[idx].type === 'empty' && !startPositions.includes(idx)) {
                this.board[idx].type = 'trap';
                this.board[idx].trapIcon = trapIcons[Math.floor(Math.random() * trapIcons.length)];
                trapsPlaced++;
            }
        }

        // Place exactly 1 Health Restoration Tile
        let healthPlaced = 0;
        while (healthPlaced < 1) {
            let idx = Math.floor(Math.random() * 36);
            if (this.board[idx].type === 'empty' && !startPositions.includes(idx)) {
                this.board[idx].type = 'health';
                healthPlaced++;
            }
        }
    },

    renderBoard() {
        const grid = document.getElementById('game-grid-main');
        grid.innerHTML = '';
        for (let y = 0; y < 6; y++) {
            for (let x = 0; x < 6; x++) {
                const cell = this.board[y * 6 + x];
                const tile = document.createElement('div');
                tile.className = 'grid-tile';
                tile.dataset.x = x;
                tile.dataset.y = y;

                const isMyCore = (cell.type === 'core' && cell.side === this.role);

                if (!cell.revealed && cell.type !== 'empty' && !isMyCore) {
                    tile.classList.add('fog-tile');
                }

                if (cell.revealed || isMyCore) {
                    if (cell.type === 'core') {
                        tile.classList.add('revealed-core');
                        tile.innerHTML = `<img src="images/unknown_entity.png" class="core-icon">`;
                    } else if (cell.type === 'trap') {
                        tile.classList.add('revealed-trap');
                        const icon = cell.trapIcon || 'trap_spike.png';
                        tile.innerHTML = `<img src="images/${icon}" class="unit-icon">`;
                    } else if (cell.type === 'health') {
                        tile.classList.add('revealed-health');
                        // Tactical CSS Health Icon
                        tile.innerHTML = `
                            <div class="health-tile-icon ${cell.used ? 'used-health' : ''}">
                                <div class="med-cross"></div>
                            </div>
                        `;
                    }
                }

                // Units
                const allUnitsOnTile = this.units.filter(u => u.x === x && u.y === y);
                if (allUnitsOnTile.length > 0) {
                    allUnitsOnTile.forEach((u, index) => {
                        const isMine = (this.role === 'host' && u.owner === 'player') || (this.role === 'guest' && u.owner === 'opponent');

                        // Avatar assignment: player units use selected gender, opponent units use the other
                        const imgName = u.owner === 'player' ?
                            (selectedGender === 'female' ? 'female_avatar.png' : 'male_avatar.png') :
                            (selectedGender === 'female' ? 'male_avatar.png' : 'female_avatar.png');

                        const unitImg = document.createElement('img');
                        unitImg.src = `images/${imgName}`;
                        unitImg.className = `unit-icon ${isMine ? 'selectable-unit' : ''}`;
                        if (isMine) unitImg.classList.add('my-unit-glow');
                        unitImg.dataset.id = u.id;

                        if (allUnitsOnTile.length > 1) {
                            unitImg.classList.add('clash-unit');
                            unitImg.style.position = 'absolute';
                            unitImg.style.zIndex = 100 + index;
                            if (index === 0) unitImg.style.transform = 'translate(-10px, -10px)';
                            else unitImg.style.transform = 'translate(10px, 10px)';
                        }

                        if (u.selected) {
                            tile.style.background = 'rgba(0, 255, 102, 0.1)';
                            tile.style.boxShadow = 'inset 0 0 15px rgba(0, 255, 102, 0.2)';
                        }
                        tile.appendChild(unitImg);
                    });
                }

                tile.onclick = () => this.handleTileClick(x, y);
                grid.appendChild(tile);
            }
        }
    },

    async handleTileClick(x, y) {
        if (this.isGameOver || this.turn !== 'player') return;

        const isMine = (u) => (this.role === 'host' && u.owner === 'player') || (this.role === 'guest' && u.owner === 'opponent');

        const selectedUnit = this.units.find(u => u.selected);
        const clickedUnit = this.units.find(u => u.x === x && u.y === y && isMine(u));

        if (clickedUnit) {
            this.units.forEach(u => u.selected = false);
            clickedUnit.selected = true;
            this.highlightValidMoves(clickedUnit);
            return;
        }

        if (selectedUnit) {
            if (this.isValidMove(selectedUnit, x, y)) {
                await this.moveUnit(selectedUnit, x, y);
            }
        }
    },

    highlightValidMoves(unit) {
        this.renderBoard();
        const grid = document.getElementById('game-grid-main');
        const tiles = grid.children;
        for (let i = 0; i < 36; i++) {
            const tx = i % 6;
            const ty = Math.floor(i / 6);
            if (this.isValidMove(unit, tx, ty)) {
                tiles[i].classList.add('tile-valid');
            }
        }
    },

    isValidMove(unit, x, y) {
        if (x < 0 || x > 5 || y < 0 || y > 5) return false;
        const dist = Math.abs(unit.x - x) + Math.abs(unit.y - y);
        if (dist !== 1) return false;

        // Can't move onto own units
        if (this.units.find(u => u.x === x && u.y === y && u.owner === unit.owner)) return false;

        // Can't move onto own CORE
        const targetTile = this.board[y * 6 + x];
        if (targetTile && targetTile.type === 'core') {
            if (unit.owner === 'player' && y === 5) return false;
            if (unit.owner === 'opponent' && y === 0) return false;
        }

        return true;
    },

    async moveUnit(unit, x, y) {
        if (this.isGameOver) return;
        console.log("moveUnit execution attempt:", { unitOwner: unit.owner, currentTurn: this.turn, target: { x, y } });
        // Allow move if it's the current turn's owner moving
        if (this.turn !== 'player' && this.turn !== 'ai') return;

        const opponentUnit = this.units.find(u => u.x === x && u.y === y && u.owner !== unit.owner);

        if (opponentUnit) {
            let forcedWin = null;
            if (this.type === 'PVP') {
                forcedWin = Math.random() > 0.5;
                this.battleEvent = { attackerId: unit.id, defenderId: opponentUnit.id, win: forcedWin };
                console.log("PvP Combat Triggered: Sending immediate sync signal.");
                await this.syncMatchState(); // Send signal immediately so opponent sees "BATTLE COMMENCE"
            }
            await this.resolveCombat(unit, opponentUnit, forcedWin);
        } else {
            unit.x = x;
            unit.y = y;
            await this.checkTileEffect(unit, x, y);
        }

        unit.selected = false;
        this.renderBoard();

        // STRICT TURN HANDOVER
        if (this.turn === 'player') {
            this.turn = (this.type === 'PVP') ? 'opponent' : 'ai';
            this.updateTurnIndicator();
            if (this.type === 'AI') {
                setTimeout(() => this.aiTurn(), 1000);
            } else {
                this.syncMatchState();
            }
        } else if (this.turn === 'ai') {
            this.turn = 'player';
            this.updateTurnIndicator();
        } else if (this.turn === 'opponent') {
            // PvP opponent moved, handled by sync syncInterval
            this.turn = 'player';
            this.updateTurnIndicator();
        }
    },

    async resolveCombat(attacker, defender, forcedWin = null) {
        // 1. CLASH PHASE: Move attacker to defender's tile
        attacker.x = defender.x;
        attacker.y = defender.y;
        this.renderBoard();

        const overlay = document.getElementById('combat-overlay');
        const winnerText = document.getElementById('combat-winner');
        const resultText = document.getElementById('combat-result');

        overlay.style.display = 'block';
        resultText.innerText = 'BATTLE COMMENCE';
        winnerText.innerText = '';

        await new Promise(r => setTimeout(r, 1000));

        // Determistic check: if forcedWin is provided, use it. otherwise roll.
        const win = forcedWin !== null ? forcedWin : (Math.random() > 0.5);
        const winner = win ? attacker : defender;
        const loser = win ? defender : attacker;

        // APPLY 10% HEALTH PENALTY TO LOSER
        const isLoserMine = (this.role === 'host' && loser.owner === 'player') || (this.role === 'guest' && loser.owner === 'opponent');
        if (isLoserMine) this.playerHealth = Math.max(0, this.playerHealth - 10);
        else this.opponentHealth = Math.max(0, this.opponentHealth - 10);
        this.updateStats();

        // Reveal victory
        resultText.innerHTML = `VICTOR: <span id="combat-winner" style="color: ${winner.owner === 'player' ? '#00ff66' : '#ff3333'}; text-shadow: 0 0 10px ${winner.owner === 'player' ? '#00ff66' : '#ff3333'}">${winner.owner.toUpperCase()}</span>`;

        await new Promise(r => setTimeout(r, 1500));
        overlay.style.display = 'none';

        // Find the loser's specific img element in the grid
        const loserImg = document.querySelector(`[data-id="${loser.id}"]`);

        if (loserImg) {
            loserImg.classList.add('teleport-out');
            await new Promise(r => setTimeout(r, 600));
        }

        if (win) {
            // Attacker stays, defender returns
            defender.x = defender.initialX;
            defender.y = defender.initialY;
            // Reveal if needed
            this.board[attacker.y * 6 + attacker.x].revealed = true;
        } else {
            // Attacker loses, returns to start
            attacker.x = attacker.initialX;
            attacker.y = attacker.initialY;
        }

        this.renderBoard();

        if (this.playerHealth <= 0) this.endGame('LOSS', 'SYSTEM INTEGRITY COMPROMISED');
        else if (this.opponentHealth <= 0) this.endGame('WIN', 'OPPONENT NEUTRALIZED');
    },

    async checkTileEffect(unit, x, y) {
        const cell = this.board[y * 6 + x];
        if (cell.type === 'trap') {
            cell.revealed = true;
            const isMyUnit = (this.role === 'host' && unit.owner === 'player') || (this.role === 'guest' && unit.owner === 'opponent');

            if (isMyUnit) {
                this.playerHealth -= 10;
                this.showGameMessage("YOU STEPPED ON TRAP -10 HEALTH POINTS");
            } else {
                this.opponentHealth -= 10;
                this.showGameMessage("OPPONENT STEPPED ON TRAP -10 HEALTH POINTS");
            }
            this.updateStats();

            if (this.playerHealth <= 0) this.endGame('LOSS', 'FATAL TRAP ENGAGEMENT');
            else if (this.opponentHealth <= 0) this.endGame('WIN', 'OPPONENT TRAPPED');
        } else if (cell.type === 'health') {
            cell.revealed = true;
            if (!cell.used) {
                const isMyUnit = (this.role === 'host' && unit.owner === 'player') || (this.role === 'guest' && unit.owner === 'opponent');
                if (isMyUnit) this.playerHealth = 100;
                else this.opponentHealth = 100;
                cell.used = true;
                this.updateStats();
            }
        } else if (cell.type === 'core') {
            const isMyUnit = (this.role === 'host' && unit.owner === 'player') || (this.role === 'guest' && unit.owner === 'opponent');
            const enemyRow = (this.role === 'host') ? 0 : 5;

            if (isMyUnit && y === enemyRow) {
                cell.revealed = true;
                this.opponentHealth = 0;
                this.endGame('WIN', 'HOSTILE CORE COMPROMISED');
            } else if (!isMyUnit && y === (5 - enemyRow)) {
                cell.revealed = true;
                this.playerHealth = 0;
                this.endGame('LOSS', 'SYSTEM CORE BREACHED');
            }
            this.updateStats();
        }
    },

    updateStats() {
        document.getElementById('player-health-fill').style.width = this.playerHealth + '%';
        document.getElementById('opponent-health-fill').style.width = this.opponentHealth + '%';
    },

    updateTurnIndicator() {
        const indicator = document.getElementById('turn-indicator');
        if (this.turn === 'player') {
            indicator.innerText = 'YOUR TURN';
            indicator.className = 'green-glow';
        } else if (this.turn === 'ai') {
            indicator.innerText = 'AI THINKING...';
            indicator.className = 'red-glow';
        } else {
            indicator.innerText = 'OPPONENT TURN';
            indicator.className = 'red-glow';
        }
    },

    checkGameOver() {
        if (this.playerHealth <= 0) this.endGame('LOSS');
        else if (this.opponentHealth <= 0) this.endGame('WIN');
    },

    async endGame(result, reason = '') {
        if (this.isGameOver) return;
        this.isGameOver = true;
        this.endReason = reason;

        console.log("Ending Game. Result:", result, "OpponentName:", this.opponentName);

        if (this.type === 'PVP') {
            // Last chance sync if name is missing
            if (!this.opponentName || this.opponentName === 'OPPONENT') {
                try {
                    console.log("Opponent Name missing at EndGame. Attempting final fetch...");
                    const res = await fetch(`/api/pvp/sync?code=${this.pvpCode}`);
                    const data = await res.json();
                    if (data.success) {
                        const opponentData = (this.role === 'host') ? data.match.guest : data.match.host;
                        if (opponentData && opponentData.username) {
                            this.opponentName = opponentData.username;
                            console.log("Final Fetch Successful. Opponent Name:", this.opponentName);
                        }
                    }
                } catch (e) {
                    console.error("Final sync failed:", e);
                }
            }
            this.syncMatchState();
        }

        // STOP Crickets
        const gameSnd = document.getElementById('snd-game-bg');
        if (gameSnd) gameSnd.pause();

        const overlay = document.getElementById('game-over-overlay');
        const title = document.getElementById('game-over-title');
        const statsDisplay = document.getElementById('game-over-stats');

        title.innerText = result === 'WIN' ? 'MISSION SUCCESS' : 'MISSION FAILURE';
        statsDisplay.innerHTML = `<div class="loss-reason">${reason.toUpperCase()}</div>`;

        overlay.style.backgroundImage = `url('images/${result === 'WIN' ? 'win_bg' : 'loss_bg'}.png')`;
        overlay.className = result === 'WIN' ? 'win-screen' : 'loss-screen';
        overlay.style.display = 'flex';

        const snd = new Audio(`sounds/PVP_${result.toLowerCase()}.wav`);
        snd.play().catch(() => { });

        // Save progress (No await to prevent UI lock)
        fetch('/api/game/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUserId,
                type: this.type,
                difficulty: this.difficulty,
                result: result,
                opponentUsername: this.type === 'PVP' ? (this.opponentName || 'OPPONENT') : 'AI_UNIT'
            })
        }).catch(err => console.error("Could not save game result:", err));
    },

    returnToLobby() {
        if (this.syncInterval) clearInterval(this.syncInterval);

        // Stop crickets
        const gameSnd = document.getElementById('snd-game-bg');
        if (gameSnd) {
            gameSnd.pause();
            gameSnd.currentTime = 0;
        }

        document.getElementById('game-container').style.display = 'none';
        document.getElementById('game-over-overlay').style.display = 'none';
        document.getElementById('game-over-overlay').className = '';

        LobbyManager.show();
    },

    // AI Logic
    aiTurn() {
        console.log("AI Turn Start", { turn: this.turn, type: this.type });

        if (this.isGameOver || this.turn !== 'ai') return;

        const aiUnits = this.units.filter(u => u.owner === 'opponent');
        if (aiUnits.length === 0) {
            this.turn = 'player';
            this.updateTurnIndicator();
            return;
        }

        const playerUnits = this.units.filter(u => u.owner === 'player');
        const playerCoreIdx = this.board.findIndex((b, idx) => b.type === 'core' && Math.floor(idx / 6) === 5);
        const playerCore = { x: playerCoreIdx % 6, y: 5 };

        // 1. SMART TARGETING
        let target;
        if (this.difficulty === 'easy') {
            const randomUnit = aiUnits[Math.floor(Math.random() * aiUnits.length)];
            const moves = [[0, 1], [0, -1], [1, 0], [-1, 0]];
            const valid = moves.filter(m => this.isValidMove(randomUnit, randomUnit.x + m[0], randomUnit.y + m[1]));
            if (valid.length > 0) {
                const m = valid[Math.floor(Math.random() * valid.length)];
                this.moveUnit(randomUnit, randomUnit.x + m[0], randomUnit.y + m[1]);
            } else {
                this.turn = 'player';
                this.updateTurnIndicator();
            }
            return;
        }

        // MEDIUM & HARD: Determine Global Strategic Target
        const revealedCoreIdx = this.board.findIndex((b, idx) => b.type === 'core' && b.revealed && Math.floor(idx / 6) === 5);
        if (this.difficulty === 'hard' && revealedCoreIdx !== -1) {
            target = { x: revealedCoreIdx % 6, y: 5 };
        } else {
            // Find closest player unit to ANY AI unit
            let closestPlayerUnit = null;
            let minDistance = Infinity;
            aiUnits.forEach(au => {
                playerUnits.forEach(pu => {
                    const d = Math.abs(au.x - pu.x) + Math.abs(au.y - pu.y);
                    if (d < minDistance) {
                        minDistance = d;
                        closestPlayerUnit = pu;
                    }
                });
            });
            target = closestPlayerUnit || playerCore;
        }

        // 2. PICK BEST AI UNIT (Closest to target)
        let bestUnit = null;
        let bestDistance = Infinity;

        // HARD MODE SPECIAL: Check for immediate attack opportunity
        if (this.difficulty === 'hard') {
            for (let au of aiUnits) {
                for (let pu of playerUnits) {
                    if (Math.abs(au.x - pu.x) + Math.abs(au.y - pu.y) === 1) {
                        console.log("HARD AI: Immediate attack opportunity detected!");
                        this.moveUnit(au, pu.x, pu.y);
                        return;
                    }
                }
            }
        }

        aiUnits.forEach(u => {
            const d = Math.abs(u.x - target.x) + Math.abs(u.y - target.y);
            if (d < bestDistance) {
                bestDistance = d;
                bestUnit = u;
            }
        });

        const unit = bestUnit || aiUnits[0];

        // 3. AGGRESSIVE PATHFINDING
        const dx = target.x - unit.x;
        const dy = target.y - unit.y;

        const possibleMoves = [
            { x: unit.x + Math.sign(dx), y: unit.y, dist: Math.abs(target.x - (unit.x + Math.sign(dx))) + Math.abs(target.y - unit.y) },
            { x: unit.x, y: unit.y + Math.sign(dy), dist: Math.abs(target.x - unit.x) + Math.abs(target.y - (unit.y + Math.sign(dy))) }
        ];

        // Sort by distance to target
        possibleMoves.sort((a, b) => a.dist - b.dist);

        for (let move of possibleMoves) {
            if ((move.x !== unit.x || move.y !== unit.y) && this.isValidMove(unit, move.x, move.y)) {
                this.moveUnit(unit, move.x, move.y);
                return;
            }
        }

        // Fallback: Pick any move that reduces distance
        const allMoves = [[0, 1], [0, -1], [1, 0], [-1, 0]]
            .map(m => ({ x: unit.x + m[0], y: unit.y + m[1] }))
            .filter(m => this.isValidMove(unit, m.x, m.y))
            .map(m => ({ ...m, dist: Math.abs(target.x - m.x) + Math.abs(target.y - m.y) }))
            .sort((a, b) => a.dist - b.dist);

        if (allMoves.length > 0) {
            this.moveUnit(unit, allMoves[0].x, allMoves[0].y);
        } else {
            // No valid moves for best unit, try a different unit
            this.turn = 'player';
            this.updateTurnIndicator();
        }
    },

    // PvP Sync
    async startPVPSync() {
        const sync = async () => {
            try {
                const res = await fetch(`/api/pvp/sync?code=${this.pvpCode}`);
                const data = await res.json();

                if (data.success) {
                    const opponentData = (this.role === 'host') ? data.match.guest : data.match.host;
                    if (opponentData && opponentData.username) {
                        if (this.opponentName !== opponentData.username) {
                            console.log("Opponent Name Updated via Sync:", opponentData.username);
                            this.opponentName = opponentData.username;
                        }
                    }

                    const newState = data.match.state;
                    console.log(`Sync Polled State: Turn=${newState.turn}, Status=${newState.status}`);

                    if (newState.status === 'COMPLETE') {
                        console.log("Match COMPLETE signal received via sync.");
                        this.endGame(newState.winner === currentUserId ? 'WIN' : 'LOSS', newState.reason || '');
                        if (this.syncInterval) clearInterval(this.syncInterval);
                    }
                    // BATTLE EVENT HANDLING
                    else if (newState.battleEvent && newState.status === 'BATTLE' && this.turn === 'opponent') {
                        console.log("Sync detected INBOUND BATTLE EVENT:", newState.battleEvent);
                        const attacker = this.units.find(u => u.id === newState.battleEvent.attackerId);
                        const defender = this.units.find(u => u.id === newState.battleEvent.defenderId);

                        if (attacker && defender) {
                            // Trigger local animation with deterministic winner
                            await this.resolveCombat(attacker, defender, newState.battleEvent.win);

                            // Clear battle state locally so it doesn't re-trigger
                            this.battleEvent = null;
                        }
                    }
                    else if (this.turn === 'opponent') {
                        if (newState.board) {
                            console.log("Sync Updating State: Turn handover detected.");
                            this.board = newState.board;
                            this.units = newState.units;

                            if (this.role === 'host') {
                                this.playerHealth = newState.health.host;
                                this.opponentHealth = newState.health.guest;
                                this.turn = (newState.turn === 'host') ? 'player' : 'opponent';
                            } else {
                                this.playerHealth = newState.health.guest;
                                this.opponentHealth = newState.health.host;
                                this.turn = (newState.turn === 'guest') ? 'player' : 'opponent';
                            }

                            this.updateStats();
                            this.renderBoard();
                            this.updateTurnIndicator();
                        }
                    }
                }
            } catch (err) {
                console.error("PvP Sync Error:", err);
            }
        };

        await sync();
        this.syncInterval = setInterval(sync, 600);
    },

    async syncMatchState() {
        try {
            const health = this.role === 'host' ?
                { host: this.playerHealth, guest: this.opponentHealth } :
                { host: this.opponentHealth, guest: this.playerHealth };

            const payload = {
                units: this.units,
                board: this.board,
                health: health,
                turn: this.role === 'host' ? 'guest' : 'host',
                status: this.isGameOver ? 'COMPLETE' : (this.battleEvent ? 'BATTLE' : 'SYNCING'),
                winner: this.isGameOver ? currentUserId : null,
                reason: this.endReason,
                battleEvent: this.battleEvent
            };

            console.log(`Sending State Update: Status=${payload.status}, Turn Handover to ${payload.turn}`);

            const res = await fetch('/api/pvp/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: this.pvpCode,
                    state: payload
                })
            });
            const data = await res.json();

            // Clear battleEvent after successful send
            if (data.success) {
                this.battleEvent = null;
            } else {
                console.error("Match state update failed on server:", data.error);
            }
        } catch (err) {
            console.error("Failed to sync match state:", err);
        }
    },

    async playStartAnimation() {
        const grid = document.getElementById('game-grid-main');
        const header = document.getElementById('game-header');

        // Initial hidden state for cinematic feel
        grid.style.transition = 'none';
        grid.style.opacity = '0';
        grid.style.transform = 'scale(1.1) rotateX(10deg)';
        header.style.transition = 'none';
        header.style.opacity = '0';
        header.style.transform = 'translateY(-20px)';

        await new Promise(r => setTimeout(r, 50));

        // Trigger smooth entrance
        grid.style.transition = 'opacity 1s ease-out, transform 1s cubic-bezier(0.2, 0.8, 0.2, 1)';
        header.style.transition = 'opacity 1s ease-out, transform 1s cubic-bezier(0.2, 0.8, 0.2, 1)';

        grid.style.opacity = '1';
        grid.style.transform = 'scale(1) rotateX(0deg)';
        header.style.opacity = '1';
        header.style.transform = 'translateY(0)';

        // Ensure interaction starts after animation
        await new Promise(r => setTimeout(r, 800));
    },

    showGameMessage(text) {
        const msgBox = document.getElementById('game-message');
        if (!msgBox) return;

        msgBox.innerText = text;
        msgBox.style.display = 'block';

        setTimeout(() => {
            msgBox.style.display = 'none';
        }, 2500);
    },

    updateTurnIndicator() {
        const indicator = document.getElementById('turn-indicator');
        if (!indicator) return;

        if (this.turn === 'player') {
            indicator.innerText = 'YOUR TURN';
            indicator.className = 'green-glow';
        } else if (this.turn === 'ai') {
            indicator.innerText = 'AI THINKING...';
            indicator.className = 'red-glow';
        } else {
            indicator.innerText = 'OPPONENT TURN';
            indicator.className = 'red-glow';
        }
    }
};
