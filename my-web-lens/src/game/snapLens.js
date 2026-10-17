import snapchat from '@snap/web-lens-api';
import { Asset } from 'playcanvas';

/**
 * SnapLens Bridge Manager
 * Encapsulates Snapchat Web Lens API (Leaderboards, Bitmoji, Storage)
 * with robust desktop stub support and offline fallbacks.
 */
class SnapLensManager {
    constructor() {
        this.initialized = false;
        this.isStub = true;
        this.leaderboardsSupported = false;
        this.bitmojiSupported = false;
        this.storageSupported = false;

        // In-memory cache for storage with separate Noon and Night score systems
        this.storageLoaded = false;
        this.saveData = {
            bestScore: 0,
            bestStars: 0,
            bestRank: '',
            runsPlayed: 0,
            bestScoreNoon: 0,
            bestScoreNight: 0,
            bestStarsNoon: 0,
            bestStarsNight: 0,
            runsPlayedNoon: 0,
            runsPlayedNight: 0
        };

        // Load persisted local storage cache immediately
        this.loadLocalStorageCache();

        // Chained write promise to prevent ERR_QUOTA_EXCEEDED
        this.pendingSave = Promise.resolve();

        // Cached 2D Avatar URL
        this.avatarUrl2D = null;
        this.hasBitmoji = false;

        // 3D Avatar Asset
        this.avatar3DAsset = null;
    }

    /**
     * Synchronously seed in-memory cache from localStorage for instant offline access.
     */
    loadLocalStorageCache() {
        try {
            const raw = localStorage.getItem('street_rush_save_data');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    this.saveData = {
                        ...this.saveData,
                        ...parsed
                    };
                }
            }
        } catch (_) {}
    }

    /**
     * Call once at application bootstrap.
     */
    async init() {
        if (this.initialized) return;
        try {
            await snapchat.init();
            this.isStub = !!snapchat.isStub;
            this.leaderboardsSupported = snapchat.isSupported('leaderboards');
            this.bitmojiSupported = snapchat.isSupported('bitmoji');
            this.storageSupported = snapchat.isSupported('storage');
            this.initialized = true;

            console.log('[SnapLens] Initialized. Stub:', this.isStub, {
                leaderboards: this.leaderboardsSupported,
                bitmoji: this.bitmojiSupported,
                storage: this.storageSupported
            });

            // Load persisted save data
            await this.loadSaveData();

            // Set up visibilitychange auto-save
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden') {
                    this.flushSave();
                }
            });
        } catch (e) {
            console.warn('[SnapLens] init failed:', e.message);
            this.initialized = true;
        }
    }

    // =========================================================================
    // STORAGE API
    // =========================================================================

    async loadSaveData() {
        this.loadLocalStorageCache();
        if (!this.storageSupported) {
            this.storageLoaded = true;
            this.migrateSaveData();
            return this.saveData;
        }
        await this.pendingSave;
        try {
            const result = await snapchat.storage.get('bicycle_rush_save');
            this.storageLoaded = true;
            if (result && result.found && typeof result.value === 'object' && result.value !== null) {
                this.saveData = {
                    ...this.saveData,
                    ...result.value
                };
            }
        } catch (e) {
            console.warn('[SnapLens] loadSaveData failed:', e.message);
            this.storageLoaded = true;
        }
        this.migrateSaveData();
        return this.saveData;
    }

    migrateSaveData() {
        // If legacy single score exists but mode scores are unpopulated, seed Noon score with it
        if (this.saveData.bestScore > 0 && !this.saveData.bestScoreNoon && !this.saveData.bestScoreNight) {
            this.saveData.bestScoreNoon = this.saveData.bestScore;
            this.saveData.bestStarsNoon = this.saveData.bestStars || 0;
            this.saveData.runsPlayedNoon = this.saveData.runsPlayed || 0;
        }
        try {
            localStorage.setItem('street_rush_save_data', JSON.stringify(this.saveData));
        } catch (_) {}
    }

    queueSave(newData) {
        this.saveData = {
            ...this.saveData,
            ...newData
        };
        try {
            localStorage.setItem('street_rush_save_data', JSON.stringify(this.saveData));
        } catch (_) {}

        if (!this.storageSupported || !this.storageLoaded) {
            return Promise.resolve(false);
        }

        // Chain saves to avoid concurrent writes & ERR_QUOTA_EXCEEDED
        this.pendingSave = this.pendingSave
            .then(() => snapchat.storage.set('bicycle_rush_save', this.saveData))
            .then(
                () => true,
                (e) => {
                    console.warn('[SnapLens] save failed:', e.message);
                    return false;
                }
            );

        return this.pendingSave;
    }

    flushSave() {
        if (this.storageSupported && this.storageLoaded) {
            this.queueSave(this.saveData);
        }
    }

    // =========================================================================
    // MODE-AWARE SCORE & RECORD GETTERS / RECORDING
    // =========================================================================

    getBestScore(mode = 'noon') {
        const isNight = mode === 'night';
        const val = isNight ? this.saveData.bestScoreNight : this.saveData.bestScoreNoon;
        if (!val && !isNight && this.saveData.bestScore > 0) {
            return this.saveData.bestScore;
        }
        return val || 0;
    }

    getBestStars(mode = 'noon') {
        const isNight = mode === 'night';
        const val = isNight ? this.saveData.bestStarsNight : this.saveData.bestStarsNoon;
        return val || this.saveData.bestStars || 0;
    }

    getRunsPlayed(mode = 'noon') {
        const isNight = mode === 'night';
        return (isNight ? this.saveData.runsPlayedNight : this.saveData.runsPlayedNoon) || 0;
    }

    recordRun(mode = 'noon', score, stars = 1) {
        const isNight = mode === 'night';
        const prevBest = this.getBestScore(mode);
        const newBest = Math.max(prevBest, score);
        const prevStars = this.getBestStars(mode);
        const newStars = Math.max(prevStars, stars);
        const runsKey = isNight ? 'runsPlayedNight' : 'runsPlayedNoon';
        const scoreKey = isNight ? 'bestScoreNight' : 'bestScoreNoon';
        const starsKey = isNight ? 'bestStarsNight' : 'bestStarsNoon';

        const updateData = {
            [scoreKey]: newBest,
            [starsKey]: newStars,
            [runsKey]: (this.saveData[runsKey] || 0) + 1,
            bestScore: Math.max(this.saveData.bestScore || 0, score),
            bestStars: Math.max(this.saveData.bestStars || 0, stars),
            runsPlayed: (this.saveData.runsPlayed || 0) + 1
        };

        this.queueSave(updateData);
        return {
            isNewBest: score > prevBest,
            newBest,
            previousBest: prevBest
        };
    }

    // =========================================================================
    // LEADERBOARDS API (Mode-Aware Arcade Points)
    // =========================================================================

    /**
     * Calculate score using Option B: Arcade Points.
     * Guaranteed to return an integer score.
     */
    calculateArcadeScore({ won, checkpointsReached, timeLeft, starCount, stats, mode = 'noon' }) {
        const cps = Math.max(0, checkpointsReached || 0);
        const time = Math.max(0, timeLeft || 0);
        const stars = Math.max(1, starCount || 1);

        // Base Checkpoint Points: 1,000 points per checkpoint reached
        const cpPoints = cps * 1000;

        // Time Bonus: 80 points per second remaining (if won, rewards speed)
        const timeBonus = won ? Math.round(time * 80) : Math.round(time * 20);

        // Star Rating Bonus: 500 points per star earned
        const starBonus = stars * 500;

        // Flawless Street Mastery Bonus: 1,500 extra points for no crashes or gutter falls
        const cleanBonus = won && stats.gutterFalls === 0 && stats.vehicleHits === 0 ? 1500 : 0;

        // Mode Bonus: Night mode navigating dark streets with headlights
        const isNight = mode === 'night';
        const modeBonus = isNight ? (won ? 350 : 150) : 0;

        // Hazard Deductions
        const potholePenalty = (stats.potholes || 0) * 40;
        const vehiclePenalty = (stats.vehicleHits || 0) * 160;
        const npcPenalty = (stats.npcHits || 0) * 100;
        const gutterPenalty = (stats.gutterFalls || 0) * 200;
        const totalPenalty = potholePenalty + vehiclePenalty + npcPenalty + gutterPenalty;

        const totalScore = Math.max(150, Math.round(cpPoints + timeBonus + starBonus + cleanBonus + modeBonus - totalPenalty));
        return totalScore;
    }

    /**
     * Submit integer score to native Snapchat leaderboard.
     * Follows official documentation: https://developers.snap.com/web-lenses/leaderboards
     * - score must be an integer (Math.round)
     * - ordering: 'descending' (higher scores rank first)
     * - bestScore in the result is the player's best score on the board
     * @param {number} score - The arcade score to submit (rounded to integer).
     * @returns {Promise<number|null>} Server-acknowledged bestScore, or the submitted score, or null on error.
     */
    async submitScore(score) {
        if (!this.leaderboardsSupported) return null;
        const integerScore = Math.round(score);

        try {
            const { bestScore } = await snapchat.leaderboards.submitScore({
                score: integerScore,
                ordering: 'descending'
            });
            return bestScore !== undefined ? bestScore : integerScore;
        } catch (e) {
            console.warn('Leaderboard unavailable:', e.message);
            return null;
        }
    }

    /**
     * Opens Snapchat native leaderboard modal.
     * Follows official documentation: https://developers.snap.com/web-lenses/leaderboards
     * Submits score first if provided so the panel has data to show, then presents the board.
     * Handles ERR_INTERNAL or unavailability gracefully with a console warning.
     * @param {number} [score] - Optional final or best score to submit before presenting the board.
     * @returns {Promise<boolean>}
     */
    async showLeaderboard(score) {
        if (!this.leaderboardsSupported) {
            console.info('[SnapLens] Leaderboards not supported in this host.');
            return false;
        }
        try {
            if (score !== undefined && score !== null && !isNaN(score)) {
                await snapchat.leaderboards.submitScore({
                    score: Math.round(score),
                    ordering: 'descending'
                });
            }
            await snapchat.leaderboards.show();
            return true;
        } catch (e) {
            console.warn('Leaderboard unavailable:', e.message);
            return false;
        }
    }

    // =========================================================================
    // BITMOJI API (2D & 3D Avatar)
    // =========================================================================

    /**
     * Fetch the player's 2D avatar image URL.
     * Returns a string URL or null if player has no Bitmoji or in stub.
     */
    async get2DAvatar() {
        if (!this.bitmojiSupported || this.isStub) return null;
        if (this.avatarUrl2D) return this.avatarUrl2D;

        try {
            const info = await snapchat.bitmoji.getAvatarInfo();
            if (!info || !info.hasAvatar) {
                this.hasBitmoji = false;
                return null;
            }
            this.hasBitmoji = true;
            const res = await snapchat.bitmoji.get2DAvatar({ size: 'large' });
            this.avatarUrl2D = res?.url || null;
            return this.avatarUrl2D;
        } catch (e) {
            console.warn('[SnapLens] get2DAvatar error:', e.message);
            return null;
        }
    }

    /**
     * Load the player's 3D avatar GLB into PlayCanvas.
     * In desktop stub mode (snapchat.isStub = true), the 3D avatar is an empty placeholder GLB,
     * so it returns null to preserve the default stylized low-poly rider.
     */
    async load3DAvatar(app) {
        if (!this.bitmojiSupported || this.isStub) {
            return null;
        }

        try {
            const info = await snapchat.bitmoji.getAvatarInfo();
            if (!info || !info.hasAvatar) {
                return null;
            }

            const { url } = await snapchat.bitmoji.get3DAvatar();
            if (!url) return null;

            return new Promise((resolve, reject) => {
                const asset = new Asset('snapchat-bitmoji-avatar', 'container', { url });
                asset.ready(() => {
                    this.avatar3DAsset = asset;
                    const entity = asset.resource.instantiateRenderEntity();
                    resolve({ asset, entity });
                });
                asset.once('error', (err) => {
                    app.assets.remove(asset);
                    console.warn('[SnapLens] Failed to load 3D Bitmoji asset:', err);
                    resolve(null);
                });
                app.assets.add(asset);
                app.assets.load(asset);
            });
        } catch (e) {
            console.warn('[SnapLens] load3DAvatar error:', e.message);
            return null;
        }
    }
}

export const snapLens = new SnapLensManager();
