/**
 * ui-assets.js — Engrama Sound & Icon Utility
 * 
 * Sound system powered by Howler.js (lazy-loaded on first interaction).
 * Provides: playSuccess, playError, playCoin, playStreak
 * 
 * Fallback: If Howler is not loaded or audio files are missing,
 * sounds degrade gracefully to silence (no errors).
 * 
 * Audio files expected in ./assets/sounds/:
 *   success.mp3  — Soft chime (UI confirmation)
 *   error.mp3    — Low thud (error feedback)
 *   coin.mp3     — Ceramic clink (coin earned)
 *   streak.mp3   — Ascending whoosh (streak milestone)
 * 
 * Free sources for premium UI sounds:
 *   - Sonniss GDC Bundle (search "UI" / "Interface")
 *   - Freesound.org (tags: "Minimalist UI", "Soft Notification")
 *   - Mixkit UI Sounds (section: "Smartphone")
 */

(function (root) {
    'use strict';

    // ── CONFIG ──
    var SOUND_BASE = './assets/sounds/';
    var SOUNDS = {
        success: { src: SOUND_BASE + 'success.mp3', volume: 0.5 },
        error:   { src: SOUND_BASE + 'error.mp3',   volume: 0.4 },
        coin:    { src: SOUND_BASE + 'coin.mp3',     volume: 0.6 },
        streak:  { src: SOUND_BASE + 'streak.mp3',   volume: 0.55 }
    };

    var _howls = {};
    var _initialized = false;
    var _muted = false;

    // ── LAZY INIT ──
    // Sounds are only loaded on first user interaction (click/touch/key)
    // to avoid blocking the initial page render.
    function _initSounds() {
        if (_initialized) return;
        if (typeof Howl === 'undefined') {
            console.warn('[ui-assets] Howler.js not loaded — sound disabled');
            _initialized = true;
            return;
        }
        _initialized = true;

        Object.keys(SOUNDS).forEach(function (key) {
            var cfg = SOUNDS[key];
            try {
                _howls[key] = new Howl({
                    src: [cfg.src],
                    volume: cfg.volume || 0.5,
                    html5: true,       // lazy decode, no blocking
                    preload: false     // only load when play() is called
                });
            } catch (e) {
                console.warn('[ui-assets] Could not init sound "' + key + '":', e.message);
            }
        });
    }

    // Set up lazy init on first user interaction
    var _gateOnce = false;
    function _soundGate() {
        if (_gateOnce) return;
        _gateOnce = true;
        _initSounds();
        window.removeEventListener('pointerdown', _soundGate, true);
        window.removeEventListener('keydown', _soundGate, true);
        window.removeEventListener('touchstart', _soundGate, true);
    }
    if (typeof window !== 'undefined') {
        window.addEventListener('pointerdown', _soundGate, true);
        window.addEventListener('keydown', _soundGate, true);
        window.addEventListener('touchstart', _soundGate, true);
    }

    // ── PLAY FUNCTIONS ──
    function _play(key) {
        if (_muted) return;
        if (!_initialized) _initSounds();
        var h = _howls[key];
        if (h) {
            try { h.play(); } catch (_) { /* graceful silence */ }
        }
    }

    function playSuccess() { _play('success'); }
    function playError()   { _play('error'); }
    function playCoin()    { _play('coin'); }
    function playStreak()  { _play('streak'); }

    // ── MUTE CONTROL ──
    function setMuted(val) {
        _muted = !!val;
        if (typeof Howler !== 'undefined') {
            Howler.mute(_muted);
        }
    }
    function isMuted() { return _muted; }

    // ── PUBLIC API ──
    var EngramaSounds = {
        playSuccess: playSuccess,
        playError: playError,
        playCoin: playCoin,
        playStreak: playStreak,
        setMuted: setMuted,
        isMuted: isMuted
    };

    // Export as global and as module if available
    root.EngramaSounds = EngramaSounds;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = EngramaSounds;
    }

})(typeof window !== 'undefined' ? window : this);
