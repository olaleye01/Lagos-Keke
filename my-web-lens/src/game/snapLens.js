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

        // In-memory cache for storage
        this.storageLoaded = false;
        this.saveData = {
            bestScore: 0,
            bestStars: 0,
            bestRank: '',
            runsPlayed: 0
        };

        // Chained write promise to prevent ERR_QUOTA_EXCEEDED
        this.pendingSave = Promise.resolve();

        // Cached 2D Avatar URL
        this.avatarUrl2D = null;
        this.hasBitmoji = false;

        // 3D Avatar Asset
        this.avatar3DAsset = null;
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
        if (!this.storageSupported) {
            this.storageLoaded = true;
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
        return this.saveData;
    }

    queueSave(newData) {
        this.saveData = {
            ...this.saveData,
            ...newData
        };
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
    // LEADERBOARDS API (Option B: Arcade Points)
    // =========================================================================

    /**
     * Calculate score using Option B: Arcade Points.
     * Guaranteed to return an integer score.
     */
    calculateArcadeScore({ won, checkpointsReached, timeLeft, starCount, stats }) {
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

        // Hazard Deductions
        const potholePenalty = (stats.potholes || 0) * 40;
        const vehiclePenalty = (stats.vehicleHits || 0) * 160;
        const npcPenalty = (stats.npcHits || 0) * 100;
        const gutterPenalty = (stats.gutterFalls || 0) * 200;
        const totalPenalty = potholePenalty + vehiclePenalty + npcPenalty + gutterPenalty;

        const totalScore = Math.max(150, Math.round(cpPoints + timeBonus + starBonus + cleanBonus - totalPenalty));
        return totalScore;
    }

    /**
     * Submit integer score to native Snapchat leaderboard.
     * Returns bestScore if available.
     */
    async submitScore(score) {
        if (!this.leaderboardsSupported) return null;
        try {
            const integerScore = Math.round(score);
            const res = await snapchat.leaderboards.submitScore({
                score: integerScore,
                ordering: 'descending'
            });
            return res?.bestScore ?? integerScore;
        } catch (e) {
            console.warn('[SnapLens] submitScore error:', e.message);
            return null;
        }
    }

    /**
     * Opens Snapchat native leaderboard modal.
     */
    async showLeaderboard() {
        if (!this.leaderboardsSupported) {
            console.info('[SnapLens] Leaderboards not supported in this host.');
            return false;
        }
        try {
            await snapchat.leaderboards.show();
            return true;
        } catch (e) {
            console.warn('[SnapLens] showLeaderboard error:', e.message);
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
