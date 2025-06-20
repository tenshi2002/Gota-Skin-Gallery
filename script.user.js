// ==UserScript==
// @name         working namelor changer + diag Feed + Hotkeys + Favorites)
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  a script that was made with 0 experince dont expect much
// @author       Tenshi
// @match        *://*.gota.io/*
// @match        *://gota.io/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      cdnjs.cloudflare.com
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // === Performance Optimization Functions ===
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    function throttle(func, limit) {
        let inThrottle;
        return function executedFunction(...args) {
            if (!inThrottle) {
                func(...args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    function requestIdleCallback(callback) {
        if ('requestIdleCallback' in window) {
            return window.requestIdleCallback(callback);
        }
        return setTimeout(callback, 1);
    }

    function memoize(fn) {
        const cache = new Map();
        return (...args) => {
            const key = JSON.stringify(args);
            if (cache.has(key)) return cache.get(key);
            const result = fn.apply(this, args);
            cache.set(key, result);
            return result;
        };
    }

    // Cache DOM queries
    const domCache = new Map();
    function getCachedElement(selector) {
        if (!domCache.has(selector)) {
            domCache.set(selector, document.querySelector(selector));
        }
        return domCache.get(selector);
    }

    // Enhanced DOM caching system
    const domCacheWithExpiry = new Map();
    const CACHE_DURATION = 5000; // 5 seconds cache duration

    function getCachedElementWithExpiry(selector) {
        const now = Date.now();
        const cached = domCacheWithExpiry.get(selector);

        if (cached && now - cached.timestamp < CACHE_DURATION) {
            return cached.element;
        }

        const element = document.querySelector(selector);
        domCacheWithExpiry.set(selector, {
            element,
            timestamp: now
        });
        return element;
    }

    function clearExpiredCache() {
        const now = Date.now();
        for (const [selector, data] of domCacheWithExpiry) {
            if (now - data.timestamp > CACHE_DURATION) {
                domCacheWithExpiry.delete(selector);
            }
        }
    }

    // Periodic cache cleanup
    setInterval(clearExpiredCache, CACHE_DURATION);

    // RAF wrapper for smooth animations
    function rafThrottle(callback) {
        let requestId = null;
        return function throttled(...args) {
            if (requestId === null) {
                requestId = requestAnimationFrame(() => {
                    callback.apply(this, args);
                    requestId = null;
                });
            }
        };
    }

    // Enhanced RAF Queue System
    const rafQueue = new Set();
    let rafProcessing = false;

    function processRAFQueue() {
        if (rafProcessing || rafQueue.size === 0) return;

        rafProcessing = true;
        requestAnimationFrame(() => {
            for (const callback of rafQueue) {
                try {
                    callback();
                } catch (error) {
                    console.error('RAF Queue Error:', error);
                }
            }
            rafQueue.clear();
            rafProcessing = false;
        });
    }

    function queueRAF(callback) {
        rafQueue.add(callback);
        processRAFQueue();
    }

    // Batch DOM updates
    function batchDOMUpdates(updates) {
        return new Promise(resolve => {
            requestAnimationFrame(() => {
                updates();
                resolve();
            });
        });
    }

    // Batch RAF updates
    function batchRAF(updates) {
        return new Promise(resolve => {
            queueRAF(() => {
                updates();
                resolve();
            });
        });
    }

    // === Constants and State Variables ===
    const PATH1_MIN_DELAY = 755;
    const PATH2_MIN_DELAY = 785;
    const PATH3_MIN_DELAY = 800;
    const PATH4_MIN_DELAY = 815;
    const PATH5_MIN_DELAY = 830;
    const EDGE_TOUCH_DISTANCE = 1;
    const BASE_DISTANCE = 15;

    let isRunning = false;
    let intervalId = null;
    let isScriptRunning = false;
    let lastActionTime = 0;
    let isColorChangerRunning = false;
    let colorChangerIntervalId = null;
    let skinsList = [];
    let isLoadingSkins = false;
    let favoriteSkins = JSON.parse(localStorage.getItem('gota-favorite-skins')) || [];
    let notificationsEnabled = JSON.parse(localStorage.getItem('gota-notifications-enabled') || 'false');
    let unusedSkins = []; // Track unused skins for true random selection
    let lastUsedSkin = null; // Track the last used skin
    let currentIndex = 0; // Add currentIndex variable for skin alternation

    // Performance Optimization Systems
    const ElementCache = {
        elements: new Map(),
        getElement(id) {
            let element = this.elements.get(id);
            // Check if cached element is still in the DOM
            if (!element || !document.body.contains(element)) {
                element = document.getElementById(id);
                if (element) {
                    this.elements.set(id, element);
                } else {
                    this.elements.delete(id);
                }
            }
            return element;
        },
        clearCache() {
            this.elements.clear();
        }
    };

    // Add a toggle counter to periodically clear cache
    let toggleCounter = 0;
    const TOGGLE_CACHE_CLEAR_INTERVAL = 20;

    const TOGGLE_OPTIONS = Object.freeze(['ALL', 'PARTY', 'SELF', 'NONE']);
    const TOGGLE_DELAY = 100; // Minimum time between toggles in ms

    const ToggleState = {
        lastToggleTime: 0,
        toggleQueue: new Map(),
        isProcessing: false
    };

    const PerformanceMetrics = {
        toggleTimes: [],

        recordToggle(operation, duration) {
            this.toggleTimes.push({ operation, duration, timestamp: Date.now() });

            // Keep only last 100 measurements
            if (this.toggleTimes.length > 100) {
                this.toggleTimes.shift();
            }

            // Log if performance is degrading
            this.checkPerformance();
        },

        checkPerformance() {
            const recent = this.toggleTimes.slice(-10);
            if (recent.length < 10) return;

            const avgDuration = recent.reduce((sum, {duration}) => sum + duration, 0) / recent.length;
            if (avgDuration > 100) { // If average toggle takes more than 100ms
                console.warn('Performance degrading. Average toggle time:', avgDuration.toFixed(2), 'ms');
                this.cleanup();
            }
        },

        cleanup() {
            // Force cleanup of caches and queues
            ElementCache.clearCache();
            ToggleState.toggleQueue.clear();
            this.toggleTimes = [];
        }
    };

    // Add timer variables
    let skinTimerInterval = null;
    let colorTimerInterval = null;
    let skinNextChange = 15.5;
    let colorNextChange = 15.5;
    let showSkinTimer = false;
    let showColorTimer = false;

    // === Default Configuration ===
    const defaultHotkeys = {
        disableMassEject: '',
        showMass: '',
        showNames: '',
        showSkins: '',
        autoRespawn: '',
        partyCode: '',
        hideChat: '',
        spectateMode: '',
        leaveParty: '',
        pentaSplit: '',
        octoSplit: '',
        tripleSplit: '',
        split16x256: '',
        split16x16Long: '',
        split8x: '',
        split16x: '',
        split32x: '',
        split256x: ''
    };

    // === Styles ===
    const styles = {
        '.enhancer-btn': {
            'position': 'relative',
            'margin': '0 3px',
            'padding': '6px 12px',
            'color': '#fff',
            'background-color': 'rgba(0, 0, 0, .7)',
            'border': 'none',
            'border-radius': '4px',
            'cursor': 'pointer',
            'float': 'none',
            'height': 'auto',
            'line-height': '1.5',
            'font-size': '15x',
            'font-weight': '500',
            'font-family': '"Open Sans", sans-serif',
            'transition': 'all 0.2s ease',
            'box-shadow': '0 2px 4px rgba(0,0,0,0.1)'
        },
        '.g-recaptcha, .grecaptcha-badge': {
            'display': 'none !important'
        },
        '.bottom-btn': {
            'height': '28px'
        },
        '.-features-table': {
            'margin': 'auto',
            'width': 'max-content',
            'border-collapse': 'collapse'
        },
        '.enhancer-btn:hover': {
            'background-color': '#333'
        },
        '.enhancer-window': {
            'position': 'fixed',
            'top': '50%',
            'left': '50%',
            'transform': 'translate(-50%, -50%)',
            'padding': '10px',
            'background-color': '#222',
            'border': '1px solid rgb(169, 169, 169)',
            'border-radius': '5px',
            'color': '#fff',
            'font-family': 'Arial, sans-serif',
            'z-index': '1000',
            'display': 'none',
            'min-width': '300px',
            'max-width': '80vw',
            'max-height': '85vh',
            'overflow-y': 'auto'
        },
        '.enhancer-blackout': {
            'position': 'fixed',
            'top': '0',
            'right': '0',
            'bottom': '0',
            'left': '0',
            'background': 'rgba(0,0,0,0.7)',
            'display': 'none',
            'z-index': '999'
        },
        '.enhancer-table': {
            'width': '100%',
            'border-collapse': 'collapse',
            'margin': '10px 0',
            'background': '#222',
            'font-size': '16px'
        },
        '.enhancer-table th': {
            'text-align': 'left',
            'padding': '5px 8px',
            'background-color': '#333',
            'font-weight': 'normal',
            'font-size': '16px',
            'border-bottom': '1px solid rgb(169, 169, 169)'
        },
        '.enhancer-table td': {
            'padding': '5px 8px',
            'border-bottom': '1px solid rgb(169, 169, 169)',
            'font-size': '16px'
        },
        '.enhancer-table input[type="text"]': {
            'width': 'auto',
            'height': '20px',
            'padding': '0 5px',
            'background': '#fff',
            'border': '1px solid rgb(169, 169, 169)',
            'color': '#333',
            'border-radius': '5px',
            'font-size': '16px',
            'outline': 'none'
        },
        '.enhancer-section': {
            'margin-bottom': '10px',
            'padding': '8px',
            'background': '#222',
            'border': '1px solid rgb(169, 169, 169)',
            'border-radius': '5px'
        },
        '.enhancer-section-title': {
            'font-size': '16px',
            'font-weight': 'normal',
            'margin': '0 0 8px',
            'padding-bottom': '5px',
            'border-bottom': '1px solid rgb(169, 169, 169)',
            'color': '#fff'
        },
        '.enhancer-btn-action': {
            'width': 'auto',
            'height': '20px',
            'padding': '0 8px',
            'margin': '2px',
            'background-color': '#222',
            'border': '1px solid rgb(169, 169, 169)',
            'color': '#fff',
            'border-radius': '5px',
            'cursor': 'pointer',
            'font-size': '16px',
            'line-height': '18px',
            'outline': 'none'
        },
        '.enhancer-btn-action:hover': {
            'background-color': '#333'
        },
        '.enhancer-footer': {
            'margin-top': '10px',
            'padding-top': '8px',
            'border-top': '1px solid rgb(169, 169, 169)',
            'text-align': 'right'
        },
        '.color-picker-container': {
            'margin': '8px 0',
            'padding': '8px',
            'background': '#222',
            'border': '1px solid rgb(169, 169, 169)',
            'border-radius': '5px'
        },
        '.color-input': {
            'width': 'auto',
            'height': '20px',
            'padding': '0 5px',
            'background': '#fff',
            'border': '1px solid rgb(169, 169, 169)',
            'color': '#333',
            'border-radius': '5px',
            'margin-right': '8px',
            'font-size': '16px',
            'outline': 'none'
        },
        '.enhancer-checkbox-wrapper': {
            'display': 'flex',
            'align-items': 'center',
            'margin': '5px 0',
            'padding': '5px',
            'background': '#222',
            'border-radius': '5px'
        },
        '.enhancer-label': {
            'font-size': '16px',
            'color': '#fff'
        },
        '.text-center': {
            'text-align': 'center'
        },
        '.text-left': {
            'text-align': 'left'
        },
        '.text-right': {
            'text-align': 'right'
        },
        '.d-none': {
            'display': 'none'
        },
        '.text-red': {
            'color': 'red'
        },
        '.hotkey-notification': {
            'position': 'fixed',
            'bottom': '20px',
            'right': '20px',
            'background-color': 'rgba(0, 0, 0, 0.8)',
            'color': '#fff',
            'padding': '8px 15px',
            'border-radius': '5px',
            'font-family': 'Arial, sans-serif',
            'font-size': '14px',
            'z-index': '9999',
            'pointer-events': 'none',
            'transition': 'opacity 0.3s ease-in-out',
            'opacity': '0'
        },
        '.hotkey-notification.show': {
            'opacity': '1'
        },
        '.hotkey-notification.success': {
            'background-color': 'rgba(40, 167, 69, 0.9)',
            'border-left': '4px solid #28a745'
        },
        '.hotkey-notification.warning': {
            'background-color': 'rgba(255, 193, 7, 0.9)',
            'border-left': '4px solid #ffc107'
        },
        '.hotkey-notification.error': {
            'background-color': 'rgba(220, 53, 69, 0.9)',
            'border-left': '4px solid #dc3545'
        },
        '.hotkey-notification.skin': {
            'background-color': 'rgba(219, 112, 219, 0.9)',
            'border-left': '4px solid #da70d6',
            'color': 'white',
            'text-shadow': '0 1px 1px rgba(0, 0, 0, 0.2)'
        },
        '.hotkey-notification.spectate': {
            'background-color': 'rgba(75, 0, 130, 0.9)',  // Indigo color
            'border-left': '4px solid #4b0082',
            'color': 'white',
            'text-shadow': '0 1px 1px rgba(0, 0, 0, 0.2)'
        },
        '.hotkey-notification.party': {
            'background-color': 'rgba(0, 191, 255, 0.9)',  // Deep Sky Blue
            'border-left': '4px solid #00bfff',
            'color': 'white',
            'text-shadow': '0 1px 1px rgba(0, 0, 0, 0.2)'
        },
        '.hotkey-notification.dynamic-color': {
            'color': 'white',
            'text-shadow': '0 1px 1px rgba(0, 0, 0, 0.2)'
        },
        '.timer-display': {
            'position': 'fixed',
            'top': '10px',
            'left': '10px',
            'background-color': 'rgba(0, 0, 0, 0.8)',
            'color': '#fff',
            'padding': '8px 15px',
            'border-radius': '5px',
            'font-family': 'Arial, sans-serif',
            'font-size': '14px',
            'z-index': '9999',
            'cursor': 'move',
            'user-select': 'none',
            'display': 'none'
        },
        '.timer-display.skin': {
            'border-left': '4px solid #da70d6'
        },
        '.timer-display.color': {
            'border-left': '4px solid #00bfff'
        }
    };

    // === Utility Functions ===
    function createStyles() {
        const style = document.createElement('style');
        document.head.appendChild(style);
        const stylesheet = style.sheet;

        for (const selector in styles) {
            let rule = selector + '{';
            for (const property in styles[selector]) {
                rule += property + ':' + styles[selector][property] + ';';
            }
            rule += '}';
            stylesheet.insertRule(rule, stylesheet.cssRules.length);
        }
    }

   // === UI Creation Functions ===
    function createEnhancerUI() {
        const mainButton = document.createElement('button');
        mainButton.className = 'gota-btn bottom-btn enhancer-btn';
        mainButton.innerHTML = '<i class="fas fa-cog"></i> Extra';
        mainButton.style.margin = '0 18px';
        mainButton.style.float = 'none';

        const blackout = document.createElement('div');
        blackout.className = 'enhancer-blackout';

        const window = document.createElement('div');
        window.className = 'enhancer-window';

        // Add Font Awesome using GM_addStyle
        GM_addStyle(`@import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css');`);

        window.innerHTML = `
            <div class="enhancer-section">
                <div class="enhancer-section-title">
                    <i class="fas fa-keyboard"></i> Hotkeys Configuration
                </div>
                ${createHotkeysTable()}
            </div>

            <div class="enhancer-section">
                <div class="enhancer-section-title">
                    <i class="fas fa-mask"></i> Auto Skin Changer
                </div>
                <div class="switch-container">
                    <label class="switch">
                        <input type="checkbox" id="use-random-skins">
                        <span class="switch-slider"></span>
                    </label>
                    <span>Use Random Skins</span>
                </div>
                <div class="switch-container">
                    <label class="switch">
                        <input type="checkbox" id="show-skin-timer">
                        <span class="switch-slider"></span>
                    </label>
                    <span>Show Timer</span>
                </div>
                ${createSkinChangerTable()}
            </div>

            <div class="enhancer-section">
                <div class="enhancer-section-title">
                    <i class="fas fa-palette"></i> Cell Color
                </div>
                ${createColorPickerSection()}
                <div class="switch-container">
                    <label class="switch">
                        <input type="checkbox" id="use-random-colors">
                        <span class="switch-slider"></span>
                    </label>
                    <span>Use Random Colors</span>
                </div>
                <div class="switch-container">
                    <label class="switch">
                        <input type="checkbox" id="show-color-timer">
                        <span class="switch-slider"></span>
                    </label>
                    <span>Show Timer</span>
                </div>
            </div>

            <div class="enhancer-section">
                <div class="enhancer-section-title">
                    <i class="fas fa-bell"></i> Notifications
                </div>
                <div class="switch-container">
                    <label class="switch">
                        <input type="checkbox" id="notifications-toggle" ${notificationsEnabled ? 'checked' : ''}>
                        <span class="switch-slider"></span>
                    </label>
                    <span>Enable Notifications</span>
                </div>
            </div>

            <div class="enhancer-section">
                <div class="enhancer-section-title">
                    <i class="fas fa-comment-dots"></i> Spam Chat
                </div>
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                    <input type="text" id="spam-chat-message" placeholder="Enter message to spam" style="flex: 1; padding: 5px;">
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <input type="range" id="spam-chat-slider" min="0" max="120" step="10" value="0" style="width: 200px;">
                    <span id="spam-chat-slider-value" style="min-width: 40px;">OFF</span>
                </div>
            </div>

            <div class="enhancer-footer">
                <button class="enhancer-btn-action" id="enhancer-close">
                    <i class="fas fa-times"></i> Close
                </button>
            </div>
        `;

        document.body.appendChild(blackout);
        document.body.appendChild(window);

        const bottomLeft = document.querySelector('.main-bottom-left');
        if (bottomLeft) {
            bottomLeft.appendChild(mainButton);
        }

        setupUIEventListeners(mainButton, window, blackout);
    }

    function createHotkeysTable() {
        const hotkeys = getHotkeys();
        let html = `
            <table class="enhancer-table">
                <tr>
                    <th>Action</th>
                    <th>Key</th>
                </tr>
        `;

        const hotkeyLabels = {
            pentaSplit: 'diag feed (32x32)',
            octoSplit: 'diag feed (32x256)',
            split16x: '16x Split',
            split32x: '32x Split',
            split256x: '256x Split',
            disableMassEject: 'Disable Mass Eject',
            showMass: 'Show Mass',
            showNames: 'Show Names',
            showSkins: 'Show Skins',
            autoRespawn: 'Auto Respawn',
            partyCode: 'Party Code',
            hideChat: 'Hide Chat',
            spectateMode: 'Spectate Mode',
            leaveParty: 'Leave Party'
        };

        for (const [key, label] of Object.entries(hotkeyLabels)) {
            html += `
                <tr>
                    <td>${label}</td>
                    <td><input type="text" value="${hotkeys[key] || ''}" data-hotkey="${key}" readonly></td>
                </tr>
            `;
        }

        html += '</table>';
        return html;
    }

    function createSkinChangerTable() {
        const skins = getSkinNames();
        return `
            <table class="enhancer-table">
                <tr>
                    <td>Skin 1</td>
                    <td><input type="text" id="skin1" value="${skins.skin1}"></td>
                </tr>
                <tr>
                    <td>Skin 2</td>
                    <td><input type="text" id="skin2" value="${skins.skin2}"></td>
                </tr>
                <tr>
                    <td colspan="2">
                        <div id="random-skins-info" style="display: none; margin: 10px 0; font-size: 12px;">
                            Loading available skins...
                        </div>
                        <button class="enhancer-btn-action" id="toggle-skin-change">
                            ${isRunning ? 'Stop' : 'Start'} Auto Change
                        </button>
                    </td>
                </tr>
            </table>
            <div class="enhancer-section">
                <div class="enhancer-section-title">Favorite Skins</div>
                <div class="favorites-container" style="max-height: 200px; overflow-y: auto; margin: 10px 0;">
                    <div id="favorites-list" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 5px;"></div>
                </div>
                <div style="display: flex; gap: 10px; margin: 10px 0;">
                    <input type="text" id="new-favorite-skin" placeholder="Enter skin name" style="flex: 1; padding: 5px;">
                    <button class="enhancer-btn-action" id="add-favorite-btn">Add to List</button>
                </div>
            </div>
        `;
    }

    function createColorPickerSection() {
        // Load saved colors
        const savedColors = JSON.parse(localStorage.getItem('enhancer-colors') || JSON.stringify(DEFAULT_COLORS));
        const color1 = savedColors.color1 || DEFAULT_COLORS.color1;
        const color2 = savedColors.color2 || DEFAULT_COLORS.color2;

        return `
            <div class="enhancer-section">
                <div class="enhancer-section-title">Cell Color</div>
                <div class="color-picker-container">
                    <div style="margin-bottom: 10px;">
                        <div style="margin-bottom: 10px;">
                            <div style="display: flex; align-items: center; margin-bottom: 5px;">
                                <div id="color-preview1" class="color-preview"></div>
                                <input type="color" id="color-picker1" style="vertical-align: middle; margin: 0 5px;">
                                <span style="color: #ff0000; margin: 0 5px;">←</span>
                                <span style="color: #fff;">Choose Color: 1</span>
                            </div>
                            <div style="display: flex; align-items: center;">
                                <div id="color-preview2" class="color-preview"></div>
                                <input type="color" id="color-picker2" style="vertical-align: middle; margin: 0 5px;">
                                <span style="color: #ff0000; margin: 0 5px;">←</span>
                                <span style="color: #fff;">Choose Color: 2</span>
                            </div>
                        </div>
                        <div>
                            Color 1:
                            R: <input type="number" id="red1" class="color-input" min="25" max="255" value="${color1.r}">
                            G: <input type="number" id="green1" class="color-input" min="25" max="255" value="${color1.g}">
                            B: <input type="number" id="blue1" class="color-input" min="25" max="255" value="${color1.b}">
                            <button class="enhancer-btn-action" id="random-color1">Random</button>
                        </div>
                        <div style="margin-top: 10px;">
                            Color 2:
                            R: <input type="number" id="red2" class="color-input" min="25" max="255" value="${color2.r}">
                            G: <input type="number" id="green2" class="color-input" min="25" max="255" value="${color2.g}">
                            B: <input type="number" id="blue2" class="color-input" min="25" max="255" value="${color2.b}">
                            <button class="enhancer-btn-action" id="random-color2">Random</button>
                        </div>
                    </div>
                    <div style="margin-top: 15px; display: flex; justify-content: space-between; align-items: center;">
                        <button class="enhancer-btn-action" id="toggle-color-change">Start Auto Change</button>
                        <div>
                            <button class="enhancer-btn-action" id="apply-color1">Apply Color 1</button>
                            <button class="enhancer-btn-action" id="apply-color2">Apply Color 2</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // === Game Functions ===
    function getYourCells() {
        if (typeof GOTA !== 'undefined' && GOTA.cells) {
            return GOTA.cells.filter(cell => cell.isYours);
        }
        return [];
    }

    function getOtherPlayerCells() {
        if (typeof GOTA !== 'undefined' && GOTA.cells) {
            return GOTA.cells.filter(cell => !cell.isYours && !cell.isVirus && !cell.isFood);
        }
        return [];
    }

    function getEdgeDistance(cell1, cell2) {
        let centerDistance = Math.sqrt(Math.pow(cell2.x - cell1.x, 2) + Math.pow(cell2.y - cell1.y, 2));
        return centerDistance - cell1.radius - cell2.radius;
    }

    function simulateSpacebarPress() {
        const eventDown = new KeyboardEvent('keydown', {
            key: ' ',
            code: 'Space',
            keyCode: 32,
            which: 32,
            bubbles: true
        });
        document.dispatchEvent(eventDown);

        const eventUp = new KeyboardEvent('keyup', {
            key: ' ',
            code: 'Space',
            keyCode: 32,
            which: 32,
            bubbles: true
        });
        document.dispatchEvent(eventUp);
    }

    // Regular instant splits
    function perform16xSplit() {
        for (let i = 0; i < 4; i++) simulateSpacebarPress();
    }

    function perform32xSplit() {
        for (let i = 0; i < 5; i++) simulateSpacebarPress();
    }

    function perform256xSplit() {
        for (let i = 0; i < 8; i++) simulateSpacebarPress();
    }

    // Reliable splits with tiny delays
    async function performReliable16xSplit() {
        for (let i = 0; i < 4; i++) {
            simulateSpacebarPress();
            await new Promise(resolve => setTimeout(resolve, 2));
        }
    }

    async function performReliable32xSplit() {
        for (let i = 0; i < 5; i++) {
            simulateSpacebarPress();
            await new Promise(resolve => setTimeout(resolve, 2));
        }
    }

    async function performReliable256xSplit() {
        for (let i = 0; i < 8; i++) {
            simulateSpacebarPress();
            await new Promise(resolve => setTimeout(resolve, 2));
        }
    }

    // Add option to switch between split types
    let useReliableSplits = false;

    function toggleSplitType() {
        useReliableSplits = !useReliableSplits;
        const toggleBtn = document.getElementById('split-type-toggle');
        if (toggleBtn) {
            toggleBtn.textContent = useReliableSplits ? 'Using Reliable Splits' : 'Using Fast Splits';
        }
    }

    function performPentaSplit() {
        for (let i = 0; i < 5; i++) simulateSpacebarPress();
    }

    function performOctoSplit() {
        for (let i = 0; i < 8; i++) simulateSpacebarPress();
    }

    function performTripleSplit() {
        for (let i = 0; i < 4; i++) simulateSpacebarPress();
    }

    function calculateProximityBasedDelay(minDelay) {
        let otherCells = getOtherPlayerCells();
        if (otherCells.length === 0) {
            return minDelay;
        }

        let yourCells = getYourCells();
        if (yourCells.length === 0) {
            return minDelay;
        }

        let minEdgeDistance = Infinity;
        for (let cell of yourCells) {
            for (let otherCell of otherCells) {
                let edgeDistance = getEdgeDistance(cell, otherCell);
                if (edgeDistance < minEdgeDistance) {
                    minEdgeDistance = edgeDistance;
                }
            }
        }

        let delay;
        if (minEdgeDistance <= EDGE_TOUCH_DISTANCE) {
            delay = minDelay;
        } else if (minEdgeDistance <= BASE_DISTANCE) {
            delay = minDelay + (BASE_DISTANCE - minEdgeDistance) * (minDelay / BASE_DISTANCE);
        } else {
            delay = minDelay;
        }

        return delay;
    }

    function calculateMassBasedDelay() {
        let yourCells = getYourCells();
        if (yourCells.length === 0) {
            return 0;
        }

        let totalMass = yourCells.reduce((sum, cell) => sum + cell.mass, 0);
        return totalMass / 5;
    }

    function calculateTotalDelay(isTripleSplit, minDelay) {
        let proximityDelay = calculateProximityBasedDelay(minDelay);
        let massDelay = calculateMassBasedDelay();
        return Math.max(minDelay, proximityDelay + massDelay);
    }

    function start16x256Split() {
        if (isScriptRunning) return;
        isScriptRunning = true;
        perform16xSplit();

        let delay = calculateTotalDelay(false, PATH3_MIN_DELAY);
        let startTime = performance.now();

        function loop(currentTime) {
            if (currentTime - startTime >= delay) {
                perform256xSplit();
                isScriptRunning = false;
            } else {
                requestAnimationFrame(loop);
            }
        }
        requestAnimationFrame(loop);
    }

    function start16x16LongSplit() {
        if (isScriptRunning) return;
        isScriptRunning = true;
        perform16xSplit();

        let delay = calculateTotalDelay(false, PATH2_MIN_DELAY);
        let startTime = performance.now();

        function loop(currentTime) {
            if (currentTime - startTime >= delay) {
                perform16xSplit();
                isScriptRunning = false;
            } else {
                requestAnimationFrame(loop);
            }
        }
        requestAnimationFrame(loop);
    }

    function startPentaSplit() {
        if (isScriptRunning) return;
        isScriptRunning = true;

        performPentaSplit();
        lastActionTime = performance.now();

        let delay = calculateTotalDelay(false, PATH4_MIN_DELAY);

        function loop(currentTime) {
            const elapsed = currentTime - lastActionTime;
            if (elapsed >= delay) {
                performPentaSplit();
                isScriptRunning = false;
            } else {
                requestAnimationFrame(loop);
            }
        }
        requestAnimationFrame(loop);
    }

    function startOctoSplit() {
        if (isScriptRunning) return;
        isScriptRunning = true;

        performPentaSplit();
        lastActionTime = performance.now();

        let delay = calculateTotalDelay(false, PATH5_MIN_DELAY);

        function loop(currentTime) {
            const elapsed = currentTime - lastActionTime;
            if (elapsed >= delay) {
                performOctoSplit();
                isScriptRunning = false;
            } else {
                requestAnimationFrame(loop);
            }
        }
        requestAnimationFrame(loop);
    }

    function startTripleSplit() {
        if (isScriptRunning) return;
        isScriptRunning = true;

        performTripleSplit();
        lastActionTime = performance.now();

        let delay = calculateTotalDelay(true, PATH1_MIN_DELAY);

        function loop(currentTime) {
            const elapsed = currentTime - lastActionTime;
            if (elapsed >= delay) {
                performTripleSplit();
                isScriptRunning = false;
            } else {
                requestAnimationFrame(loop);
            }
        }
        requestAnimationFrame(loop);
    }

    // === Skin Changer Functions ===
    function toggleSkinChanger() {
        if (isRunning) {
            stopSkinChanger();
        } else {
            startSkinChanger();
        }
    }

    function startSkinChanger() {
        const useRandom = document.getElementById('use-random-skins')?.checked;
        const skin1 = document.getElementById('skin1').value.trim();
        const skin2 = document.getElementById('skin2').value.trim();

        if (!useRandom && (!skin1 || !skin2)) {
            alert('Please enter valid skin names in both fields.');
            return;
        }

        saveSkinNames(skin1, skin2);
        isRunning = true;

        // Start the timer
        startTimer('skin');

        // Reset the unused skins pool when starting
        if (useRandom) {
            unusedSkins = [...favoriteSkins];
            lastUsedSkin = null;
            const randomSkin = getRandomSkin();
            changeSkin(randomSkin);
            showNotification('Auto Skin Changer started with Random Skins', 'success');
        } else {
            currentIndex = 0; // Reset currentIndex when starting
            changeSkin(skin1);
            showNotification('Auto Skin Changer started', 'success');
        }

        intervalId = setInterval(() => {
            if (useRandom) {
                changeSkin(getRandomSkin());
            } else {
                currentIndex = (currentIndex + 1) % 2;
                changeSkin(currentIndex === 0 ? skin1 : skin2);
            }
        }, 15500);

        const toggleButton = document.getElementById('toggle-skin-change');
        if (toggleButton) {
            toggleButton.textContent = 'Stop Auto Change';
            toggleButton.style.backgroundColor = '#f00';
        }
    }

    function stopSkinChanger() {
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
        isRunning = false;
        // Reset the unused skins pool when stopping
        unusedSkins = [];
        lastUsedSkin = null;

        // Stop the timer
        stopTimer('skin');

        const toggleButton = document.getElementById('toggle-skin-change');
        if (toggleButton) {
            toggleButton.textContent = 'Start Auto Change';
            toggleButton.style.backgroundColor = '';
        }

        showNotification('Auto Skin Changer stopped', 'error');
    }

    function changeSkin(skinName) {
        const skinNameInput = document.getElementById('spSkinName');
        const updateButton = document.getElementById('btn-updateSP');

        if (!skinNameInput || !updateButton) return;

        skinNameInput.value = skinName;
        skinNameInput.dispatchEvent(new Event('input', { bubbles: true }));
        updateButton.click();

        // Show notification when skin changes with skin type
        showNotification(`Skin changed to: ${skinName}`, 'skin');
    }

    // === Color Changer Functions ===
    function applyColor(r, g, b) {
        const chatPanel = document.querySelector('#chat-panel');
        const chatInput = document.querySelector('#chat-input');
        if (!chatPanel || !chatInput) return;

        const wasHidden = chatPanel.style.display === 'none';
        if (wasHidden) {
            chatPanel.style.opacity = '0';
            chatPanel.style.display = 'block';
        }

        chatInput.value = `!color ${r} ${g} ${b}`;
        chatInput.focus();
        chatInput.dispatchEvent(new KeyboardEvent('keyup', { keyCode: 13, which: 13 }));
        chatInput.blur();

        if (wasHidden) {
            setTimeout(() => {
                chatPanel.style.display = 'none';
                chatPanel.style.opacity = '1';
            }, 500);
        }

        // Show notification in the same color as applied
        const notification = document.createElement('div');
        notification.className = 'hotkey-notification dynamic-color';
        notification.style.backgroundColor = `rgba(${r}, ${g}, ${b}, 0.9)`;
        notification.style.borderLeft = `4px solid rgb(${r}, ${g}, ${b})`;
        showNotification('Color changed', null, 2000, notification);
    }

    function startColorChanger(color1Inputs, color2Inputs) {
        if (!color1Inputs || !color2Inputs) return;

        isColorChangerRunning = true;
        const toggleBtn = document.querySelector('#toggle-color-change');
        const useRandomColors = document.getElementById('use-random-colors')?.checked;

        if (toggleBtn) {
            toggleBtn.textContent = 'Stop Auto Change';
            toggleBtn.style.backgroundColor = '#f00';
        }

        if (useRandomColors) {
            const randomColor = generateSophisticatedColor();
            applyColor(randomColor.r, randomColor.g, randomColor.b);
        } else {
            applyColor(
                parseInt(color1Inputs.redInput.value),
                parseInt(color1Inputs.greenInput.value),
                parseInt(color1Inputs.blueInput.value)
            );
        }

        showNotification('Auto Color Change started', 'success');

        // Start the timer
        startTimer('color');

        let currentColor = 2;
        colorChangerIntervalId = setInterval(() => {
            if (useRandomColors) {
                const randomColor = generateSophisticatedColor();
                applyColor(randomColor.r, randomColor.g, randomColor.b);
            } else {
                const inputs = currentColor === 1 ? color1Inputs : color2Inputs;
                applyColor(
                    parseInt(inputs.redInput.value),
                    parseInt(inputs.greenInput.value),
                    parseInt(inputs.blueInput.value)
                );
                currentColor = currentColor === 1 ? 2 : 1;
            }
        }, 15500);
    }

    function stopColorChanger() {
        if (colorChangerIntervalId) {
            clearInterval(colorChangerIntervalId);
            colorChangerIntervalId = null;
        }
        isColorChangerRunning = false;

        // Stop the timer
        stopTimer('color');

        const toggleBtn = document.querySelector('#toggle-color-change');
        if (toggleBtn) {
            toggleBtn.textContent = 'Start Auto Change';
            toggleBtn.style.backgroundColor = '';
        }

        showNotification('Auto Color Change stopped', 'error');
    }

    // === Hotkey Functions ===
    function setupHotkeyListeners() {
        const hotkeyHandler = throttle((event) => {
            if (isInputFieldFocused()) return;

            try {
                const hotkeys = getHotkeys();
                const key = event.code;
                const cleanedKey = cleanKeyName(key);

                // Only log if it's a configured hotkey
                const actionMap = {};
                Object.entries(hotkeys).forEach(([action, keyCode]) => {
                    actionMap[keyCode] = action;
                });

                if (actionMap[cleanedKey]) {
                    console.log('Hotkey pressed:', cleanedKey, 'Action:', actionMap[cleanedKey]);
                }

                switch(cleanedKey) {
                    case hotkeys.pentaSplit:
                        requestIdleCallback(() => {
                            startPentaSplit();
                            showNotification('diag feed (32x32) Activated', 'success');
                        });
                        break;
                    case hotkeys.octoSplit:
                        requestIdleCallback(() => {
                            startOctoSplit();
                            showNotification('diag feed (32x256) Activated', 'success');
                        });
                        break;
                    case hotkeys.tripleSplit:
                        requestIdleCallback(() => {
                            startTripleSplit();
                            showNotification('Triple Split Activated', 'success');
                        });
                        break;
                    case hotkeys.split16x256:
                        requestIdleCallback(() => {
                            start16x256Split();
                        });
                        break;
                    case hotkeys.split16x16Long:
                        requestIdleCallback(() => {
                            start16x16LongSplit();
                        });
                        break;
                    case hotkeys.split8x:
                        requestIdleCallback(() => {
                            perform8xSplit();
                        });
                        break;
                    case hotkeys.split16x:
                        requestIdleCallback(() => {
                            perform16xSplit();
                        });
                        break;
                    case hotkeys.split32x:
                        requestIdleCallback(() => {
                            perform32xSplit();
                        });
                        break;
                    case hotkeys.split256x:
                        requestIdleCallback(() => {
                            perform256xSplit();
                        });
                        break;
                    case hotkeys.disableMassEject:
                        requestIdleCallback(() => {
                            const checkbox = document.getElementById('cDisablePersistEjectMass');
                            if (checkbox) {
                                checkbox.checked = !checkbox.checked;
                                checkbox.dispatchEvent(new Event('change'));
                                showNotification(
                                    `Mass Eject ${!checkbox.checked ? 'Enabled' : 'Disabled'}`,
                                    !checkbox.checked ? 'success' : 'error'
                                );
                            }
                        });
                        break;
                    case hotkeys.autoRespawn:
                        requestIdleCallback(() => {
                            const checkbox = document.getElementById('cAutoRespawn');
                            if (checkbox) {
                                checkbox.checked = !checkbox.checked;
                                checkbox.dispatchEvent(new Event('change'));
                                showNotification(
                                    `Auto Respawn ${checkbox.checked ? 'Enabled' : 'Disabled'}`,
                                    checkbox.checked ? 'success' : 'error'
                                );
                            }
                        });
                        break;
                    case hotkeys.hideChat:
                        requestIdleCallback(() => {
                            const checkbox = document.getElementById('cHideChat');
                            if (checkbox) {
                                checkbox.checked = !checkbox.checked;
                                checkbox.dispatchEvent(new Event('change'));
                                showNotification(
                                    `Chat ${!checkbox.checked ? 'Visible' : 'Hidden'}`,
                                    !checkbox.checked ? 'success' : 'error'
                                );
                            }
                        });
                        break;
                    case hotkeys.showNames:
                        requestIdleCallback(() => {
                            toggleNames();
                        });
                        break;
                    case hotkeys.showSkins:
                        requestIdleCallback(() => {
                            toggleSkins();
                        });
                        break;
                    case hotkeys.spectateMode:
                        requestIdleCallback(() => {
                            toggleSpectateMode();
                            showNotification('Spectating', 'spectate');
                        });
                        break;
                    case hotkeys.partyCode:
                        requestIdleCallback(() => {
                            togglePartyCodeMode();
                            showNotification('Displaying Party Code', 'party');
                        });
                        break;
                    case hotkeys.leaveParty:
                        requestIdleCallback(() => {
                            leaveParty();
                            showNotification('Leaving Party', 'error');
                        });
                        break;
                }
            } catch (error) {
                console.error('Error in hotkey handler:', error);
            }
        }, 16);

        document.addEventListener('keydown', hotkeyHandler);
    }

    function isInputFieldFocused() {
        const activeElement = document.activeElement;
        return (
            activeElement &&
            (activeElement.tagName === 'INPUT' ||
                activeElement.tagName === 'TEXTAREA' ||
                activeElement.isContentEditable)
        );
    }

    function toggleCheckbox(id) {
        const checkbox = document.getElementById(id);
        if (checkbox) {
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change'));
        }
    }

    // Optimized toggle function
    function optimizedToggle(elementId, notificationPrefix = '') {
        const now = performance.now();
        if (now - ToggleState.lastToggleTime < TOGGLE_DELAY) {
            return; // Prevent too frequent toggles
        }

        // Always get a fresh element or valid cached one
        const element = ElementCache.getElement(elementId);
        if (!element) return;

        // Use RAF for smooth UI updates
        requestAnimationFrame(() => {
            const currentIndex = TOGGLE_OPTIONS.indexOf(element.value);
            const nextIndex = (currentIndex + 1) % TOGGLE_OPTIONS.length;
            const newValue = TOGGLE_OPTIONS[nextIndex];

            element.value = newValue;

            // Use a custom event with less overhead
            const event = new CustomEvent('change', {
                bubbles: true,
                detail: { programmatic: true }
            });

            element.dispatchEvent(event);

            if (notificationPrefix) {
                showNotification(`${notificationPrefix}: ${newValue}`, 'success');
            }

            ToggleState.lastToggleTime = now;

            // Increment toggle counter and clear cache every interval
            toggleCounter++;
            if (toggleCounter >= TOGGLE_CACHE_CLEAR_INTERVAL) {
                ElementCache.clearCache();
                toggleCounter = 0;
            }

            // Record performance metrics
            PerformanceMetrics.recordToggle('toggle', performance.now() - now);
        });
    }

    // Optimized toggle functions
    function toggleNames() {
        optimizedToggle('sShowNames', 'Names');
    }

    function toggleSkins() {
        optimizedToggle('sShowSkins', 'Skins');
    }

    function toggleChat() {
        const checkbox = ElementCache.getElement('cHideChat');
        if (!checkbox) return;

        const now = performance.now();
        requestAnimationFrame(() => {
            checkbox.checked = !checkbox.checked;
            const event = new CustomEvent('change', {
                bubbles: true,
                detail: { programmatic: true }
            });
            checkbox.dispatchEvent(event);

            showNotification(
                `Chat ${!checkbox.checked ? 'Visible' : 'Hidden'}`,
                !checkbox.checked ? 'success' : 'error'
            );

            // Record performance metrics
            PerformanceMetrics.recordToggle('chat', performance.now() - now);
        });
    }

    function cleanupToggles() {
        ElementCache.clearCache();
        ToggleState.toggleQueue.clear();
        ToggleState.isProcessing = false;
    }

    function togglePartyCodeMode() {
        const publicModeElement = document.getElementById('menu-pu_pr');
        if (publicModeElement) {
            publicModeElement.click();
        }
    }

    function toggleSpectateMode() {
        const spectateElement = document.getElementById('menu-spectate');
        if (spectateElement) {
            spectateElement.click();
        }
    }

    function leaveParty() {
        const chatPanel = document.querySelector('#chat-panel');
        const chatInput = document.querySelector('#chat-input');
        if (!chatPanel || !chatInput) return;

        const wasHidden = chatPanel.style.display === 'none';
        if (wasHidden) {
            chatPanel.style.opacity = '0';
            chatPanel.style.display = 'block';
        }

        chatInput.value = '/leave';
        chatInput.focus();
        chatInput.dispatchEvent(new KeyboardEvent('keyup', { keyCode: 13, which: 13 }));
        chatInput.blur();

        if (wasHidden) {
            setTimeout(() => {
                chatPanel.style.display = 'none';
                chatPanel.style.opacity = '1';
            }, 500);
        }
    }

    function saveAllSettings() {
        const skin1 = document.getElementById('skin1').value.trim();
        const skin2 = document.getElementById('skin2').value.trim();
        saveSkinNames(skin1, skin2);

        const hotkeys = getHotkeys();
        document.querySelectorAll('input[data-hotkey]').forEach(input => {
            hotkeys[input.dataset.hotkey] = input.value;
        });
        saveHotkeys(hotkeys);
    }

    // === Storage Functions ===
    const DEFAULT_COLORS = {
        color1: { r: 255, g: 50, b: 50 },
        color2: { r: 50, g: 50, b: 255 }
    };

    function initializeStorage() {
        // Initialize hotkeys if not exists
        if (!localStorage.getItem('enhancer-hotkeys')) {
            localStorage.setItem('enhancer-hotkeys', JSON.stringify(defaultHotkeys));
        }

        // Initialize skin names if not exists
        if (!localStorage.getItem('enhancer-skins')) {
            localStorage.setItem('enhancer-skins', JSON.stringify({
                skin1: 'Default1',
                skin2: 'Default2'
            }));
        }

        // Initialize or update color settings
        let savedColors = localStorage.getItem('enhancer-colors');
        if (!savedColors) {
            localStorage.setItem('enhancer-colors', JSON.stringify(DEFAULT_COLORS));
        } else {
            try {
                savedColors = JSON.parse(savedColors);
                // Ensure both colors exist and have valid values
                if (!savedColors.color1 || !savedColors.color2) {
                    localStorage.setItem('enhancer-colors', JSON.stringify(DEFAULT_COLORS));
                }
            } catch (e) {
                localStorage.setItem('enhancer-colors', JSON.stringify(DEFAULT_COLORS));
            }
        }
    }

    function getHotkeys() {
        try {
            const storedHotkeys = localStorage.getItem('enhancer-hotkeys');
            if (!storedHotkeys) {
                localStorage.setItem('enhancer-hotkeys', JSON.stringify(defaultHotkeys));
                return defaultHotkeys;
            }
            return JSON.parse(storedHotkeys);
        } catch (error) {
            console.error('Error getting hotkeys:', error);
            return defaultHotkeys;
        }
    }

    function saveHotkeys(hotkeys) {
        try {
            localStorage.setItem('enhancer-hotkeys', JSON.stringify(hotkeys));
        } catch (error) {
            console.error('Error saving hotkeys:', error);
        }
    }

    function getSkinNames() {
        return JSON.parse(localStorage.getItem('enhancer-skins')) || {
            skin1: 'Default1',
            skin2: 'Default2'
        };
    }

    function saveSkinNames(skin1, skin2) {
        localStorage.setItem('enhancer-skins', JSON.stringify({ skin1, skin2 }));
    }

    // === Event Listeners ===
    function setupUIEventListeners(mainButton, window, blackout) {
        mainButton.addEventListener('click', () => {
            requestIdleCallback(() => {
                blackout.style.display = 'block';
                window.style.display = 'block';
                window.classList.add('fade-in');
            });
        });

        window.querySelector('#enhancer-close').addEventListener('click', () => {
            blackout.style.display = 'none';
            window.style.display = 'none';
            window.classList.remove('fade-in');
        });

        blackout.addEventListener('click', (e) => {
            if (e.target === blackout) {
                blackout.style.display = 'none';
                window.style.display = 'none';
                window.classList.remove('fade-in');
            }
        });

        // Add notification toggle listener
        const notificationsToggle = window.querySelector('#notifications-toggle');
        if (notificationsToggle) {
            notificationsToggle.addEventListener('change', (e) => {
                notificationsEnabled = e.target.checked;
                localStorage.setItem('gota-notifications-enabled', JSON.stringify(notificationsEnabled));
            });
        }

        setupSkinChangerListeners(window);
        setupColorPickerListeners(window);
        setupHotkeyInputListeners(window);

        // Spam Chat listeners
        const spamMsgInput = window.querySelector('#spam-chat-message');
        const spamSlider = window.querySelector('#spam-chat-slider');
        const spamSliderValue = window.querySelector('#spam-chat-slider-value');
        let lastSliderValue = 0;
        if (spamSlider && spamSliderValue && spamMsgInput) {
            function updateSliderDisplay(val) {
                if (val === 0) {
                    spamSliderValue.textContent = 'OFF';
                } else {
                    spamSliderValue.textContent = val + 's';
                }
            }
            spamSlider.addEventListener('input', () => {
                let val = parseInt(spamSlider.value, 10);
                if (val > 0 && val < 10) val = 10;
                if (val % 10 !== 0 && val !== 0) val = Math.round(val / 10) * 10;
                spamSlider.value = val;
                updateSliderDisplay(val);
                if (val === 0) {
                    stopSpamChat();
                } else {
                    const msg = spamMsgInput.value.trim();
                    if (msg) {
                        startSpamChat(msg, val);
                    } else {
                        stopSpamChat();
                    }
                }
                lastSliderValue = val;
            });
            spamMsgInput.addEventListener('input', () => {
                const val = parseInt(spamSlider.value, 10);
                if (val >= 10) {
                    const msg = spamMsgInput.value.trim();
                    if (msg) {
                        startSpamChat(msg, val);
                    } else {
                        stopSpamChat();
                    }
                }
            });
            updateSliderDisplay(0);
        }
    }

    function setupSkinChangerListeners(window) {
        const toggleButton = window.querySelector('#toggle-skin-change');
        const randomCheckbox = window.querySelector('#use-random-skins');
        const randomInfo = window.querySelector('#random-skins-info');
        const skin1Input = window.querySelector('#skin1');
        const skin2Input = window.querySelector('#skin2');

        if (toggleButton) {
            toggleButton.addEventListener('click', toggleSkinChanger);
        }

        if (randomCheckbox && randomInfo && skin1Input && skin2Input) {
            randomCheckbox.addEventListener('change', (e) => {
                const useRandom = e.target.checked;
                if (useRandom) {
                    randomInfo.style.display = 'block';
                    randomInfo.textContent = `${favoriteSkins.length} favorite skins available for random selection`;
                    skin1Input.disabled = true;
                    skin2Input.disabled = true;
                    showNotification('Random Skins On', 'success');
                } else {
                    randomInfo.style.display = 'none';
                    skin1Input.disabled = false;
                    skin2Input.disabled = false;
                    showNotification('Random Skins Off', 'error');
                }

                // Restart skin changer if it's running
                if (isRunning) {
                    if (intervalId) {
                        clearInterval(intervalId);
                        intervalId = null;
                    }

                    currentIndex = 0; // Reset currentIndex when switching modes
                    const skin1 = document.getElementById('skin1').value.trim();
                    const skin2 = document.getElementById('skin2').value.trim();

                    if (!useRandom && (!skin1 || !skin2)) {
                        stopSkinChanger();
                        alert('Please enter valid skin names in both fields.');
                        return;
                    }

                    if (useRandom) {
                        unusedSkins = [...favoriteSkins];
                        lastUsedSkin = null;
                        changeSkin(getRandomSkin());
                    } else {
                        changeSkin(skin1);
                    }

                    intervalId = setInterval(() => {
                        if (useRandom) {
                            changeSkin(getRandomSkin());
                        } else {
                            currentIndex = (currentIndex + 1) % 2;
                            changeSkin(currentIndex === 0 ? skin1 : skin2);
                        }
                    }, 15500);
                }
            });
        }

        [skin1Input, skin2Input].forEach(input => {
            if (input) {
                input.addEventListener('input', () => {
                    const skin1 = document.getElementById('skin1').value.trim();
                    const skin2 = document.getElementById('skin2').value.trim();
                    saveSkinNames(skin1, skin2);

                    if (isRunning) {
                        stopSkinChanger();
                        startSkinChanger();
                    }
                });
            }
        });

        // Setup favorites listeners
        setupFavoritesListeners();
        updateFavoritesUI();
    }

    function setupColorPickerListeners(window) {
        const setupColorPicker = (num) => {
            const colorPicker = window.querySelector(`#color-picker${num}`);
            const redInput = window.querySelector(`#red${num}`);
            const greenInput = window.querySelector(`#green${num}`);
            const blueInput = window.querySelector(`#blue${num}`);
            const colorPreview = window.querySelector(`#color-preview${num}`);
            const applyColorBtn = window.querySelector(`#apply-color${num}`);
            const randomColorBtn = window.querySelector(`#random-color${num}`);

            if (!colorPicker || !redInput || !greenInput || !blueInput || !colorPreview) return;

            // Load saved colors
            const savedColors = JSON.parse(localStorage.getItem('enhancer-colors') || '{}');
            if (savedColors[`color${num}`]) {
                redInput.value = savedColors[`color${num}`].r;
                greenInput.value = savedColors[`color${num}`].g;
                blueInput.value = savedColors[`color${num}`].b;
            }

            function updateColorPreview() {
                const r = redInput.value;
                const g = greenInput.value;
                const b = blueInput.value;
                colorPreview.style.backgroundColor = `rgb(${r},${g},${b})`;
                colorPicker.value = rgbToHex(parseInt(r), parseInt(g), parseInt(b));
            }

            function rgbToHex(r, g, b) {
                return '#' + [r, g, b].map(x => {
                    const hex = parseInt(x).toString(16);
                    return hex.length === 1 ? '0' + hex : hex;
                }).join('');
            }

            function hexToRgb(hex) {
                const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                if (!result) return null;

                const rgb = {
                    r: parseInt(result[1], 16),
                    g: parseInt(result[2], 16),
                    b: parseInt(result[3], 16)
                };

                rgb.r = Math.max(25, rgb.r);
                rgb.g = Math.max(25, rgb.g);
                rgb.b = Math.max(25, rgb.b);

                return rgb;
            }

            colorPicker.addEventListener('input', (e) => {
                const rgb = hexToRgb(e.target.value);
                if (rgb) {
                    redInput.value = rgb.r;
                    greenInput.value = rgb.g;
                    blueInput.value = rgb.b;
                    updateColorPreview();
                }
            });

            [redInput, greenInput, blueInput].forEach(input => {
                input.addEventListener('input', (e) => {
                    let value = parseInt(e.target.value);
                    if (isNaN(value)) value = 25;
                    if (value < 25) value = 25;
                    if (value > 255) value = 255;
                    e.target.value = value;
                    updateColorPreview();

                    // Save colors when changed
                    const savedColors = JSON.parse(localStorage.getItem('enhancer-colors') || '{}');
                    savedColors[`color${num}`] = {
                        r: parseInt(redInput.value),
                        g: parseInt(greenInput.value),
                        b: parseInt(blueInput.value)
                    };
                    localStorage.setItem('enhancer-colors', JSON.stringify(savedColors));
                });
            });

            if (applyColorBtn) {
                applyColorBtn.addEventListener('click', () => {
                    const r = parseInt(redInput.value);
                    const g = parseInt(greenInput.value);
                    const b = parseInt(blueInput.value);

                    // Save colors when applied
                    const savedColors = JSON.parse(localStorage.getItem('enhancer-colors') || '{}');
                    savedColors[`color${num}`] = { r, g, b };
                    localStorage.setItem('enhancer-colors', JSON.stringify(savedColors));

                    applyColor(r, g, b);
                });
            }

            // Add random color button listener
            if (randomColorBtn) {
                randomColorBtn.addEventListener('click', () => {
                    const randomColor = generateSophisticatedColor();
                    redInput.value = randomColor.r;
                    greenInput.value = randomColor.g;
                    blueInput.value = randomColor.b;
                    updateColorPreview();

                    // Apply the random color
                    applyColor(randomColor.r, randomColor.g, randomColor.b);
                });
            }

            updateColorPreview();
            return { redInput, greenInput, blueInput };
        };

        const randomColorsCheckbox = window.querySelector('#use-random-colors');
        const color1Inputs = setupColorPicker(1);
        const color2Inputs = setupColorPicker(2);
        const colorPicker1 = window.querySelector('#color-picker1');
        const colorPicker2 = window.querySelector('#color-picker2');
        const randomColor1Btn = window.querySelector('#random-color1');
        const randomColor2Btn = window.querySelector('#random-color2');
        const applyColor1Btn = window.querySelector('#apply-color1');
        const applyColor2Btn = window.querySelector('#apply-color2');

        if (randomColorsCheckbox) {
            randomColorsCheckbox.addEventListener('change', (e) => {
                const useRandom = e.target.checked;
                const inputs = [
                    ...Object.values(color1Inputs),
                    ...Object.values(color2Inputs),
                    colorPicker1,
                    colorPicker2,
                    randomColor1Btn,
                    randomColor2Btn,
                    applyColor1Btn,
                    applyColor2Btn
                ];

                inputs.forEach(input => {
                    if (input) input.disabled = useRandom;
                });

                showNotification(useRandom ? 'Random Colors On' : 'Random Colors Off', useRandom ? 'success' : 'error');

                // Restart color changer if it's running
                if (isColorChangerRunning) {
                    if (colorChangerIntervalId) {
                        clearInterval(colorChangerIntervalId);
                        colorChangerIntervalId = null;
                    }
                    startColorChanger(color1Inputs, color2Inputs);
                }
            });
        }

        const toggleColorChangeBtn = window.querySelector('#toggle-color-change');
        if (toggleColorChangeBtn && color1Inputs && color2Inputs) {
            toggleColorChangeBtn.addEventListener('click', () => {
                if (isColorChangerRunning) {
                    stopColorChanger();
                } else {
                    startColorChanger(color1Inputs, color2Inputs);
                }
            });
        }
    }

    function setupHotkeyInputListeners(window) {
        window.querySelectorAll('input[data-hotkey]').forEach(input => {
            input.addEventListener('keydown', (e) => {
                e.preventDefault();
                const cleanedKey = cleanKeyName(e.code);
                input.value = cleanedKey;

                // Update hotkeys in storage with the cleaned key
                const hotkeys = getHotkeys();
                hotkeys[input.dataset.hotkey] = cleanedKey; // Store the cleaned key instead of raw code
                saveHotkeys(hotkeys);

                console.log('Updated hotkeys:', hotkeys); // Debug log
            });
        });
    }

    // === Initialize ===
    function initialize() {
        if (!document.querySelector('.main-bottom-right')) {
            setTimeout(initialize, 1000);
            return;
        }

        try {
            // Initialize storage first
            initializeStorage();

            // Initialize toggles with optimizations
            initializeToggles();

            // Create draggable timers
            createDraggableTimers();

            // Then create UI and setup listeners
            createStyles();
            createEnhancerUI();
            setupHotkeyListeners();

            // Load timer preferences
            showSkinTimer = JSON.parse(localStorage.getItem('show-skin-timer') || 'false');
            showColorTimer = JSON.parse(localStorage.getItem('show-color-timer') || 'false');

            // Set up periodic cleanup and performance monitoring
            setInterval(() => {
                if (!document.hidden) {  // Only run when page is visible
                    PerformanceMetrics.checkPerformance();
                }
            }, 30000);  // Check every 30 seconds

            // Pre-cache frequently used elements
            ElementCache.getElement('sShowNames');
            ElementCache.getElement('sShowSkins');
            ElementCache.getElement('cHideChat');

            console.log('gota.io Ultimate Enhancer loaded successfully!');
        } catch (error) {
            console.error('Error initializing Ultimate Enhancer:', error);
            cleanup(); // Cleanup on initialization failure
        }
    }

    function cleanup() {
        // Execute all cleanup handlers
        for (const handler of cleanupHandlers) {
            try {
                handler();
            } catch (error) {
                console.error('Cleanup handler error:', error);
            }
        }
        cleanupHandlers.clear();

        // Clear all intervals
        if (intervalId) clearInterval(intervalId);
        if (colorChangerIntervalId) clearInterval(colorChangerIntervalId);
        if (skinTimerInterval) clearInterval(skinTimerInterval);
        if (colorTimerInterval) clearInterval(colorTimerInterval);

        // Clear all caches
        ElementCache.clearCache();
        ToggleState.toggleQueue.clear();
        PerformanceMetrics.cleanup();

        // Remove all event listeners
        cleanupAllEventListeners();

        isInitialized = false;
    }

    function initializeToggles() {
        // Pre-cache frequently used elements
        ElementCache.getElement('sShowNames');
        ElementCache.getElement('sShowSkins');
        ElementCache.getElement('cHideChat');

        // Add cleanup to existing cleanup handlers
        registerCleanupHandler(cleanupToggles);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

    // === Helper Functions ===
    function cleanKeyName(keyCode) {
        // Remove 'Key' prefix from letters
        if (keyCode.startsWith('Key')) {
            return keyCode.slice(3);
        }
        // Remove 'Digit' prefix from numbers
        if (keyCode.startsWith('Digit')) {
            return keyCode.slice(5);
        }
        // Handle function keys
        if (keyCode.startsWith('F') && keyCode.length <= 3) {
            return keyCode; // Keep F1-F12 as is
        }
        // Special keys mapping
        const specialKeys = {
            'Space': 'SPACE',
            'Enter': 'ENTER',
            'Backspace': 'BACK',
            'Delete': 'DEL',
            'Escape': 'ESC',
            'ArrowUp': 'UP',
            'ArrowDown': 'DOWN',
            'ArrowLeft': 'LEFT',
            'ArrowRight': 'RIGHT',
            'ShiftLeft': 'SHIFT',
            'ShiftRight': 'SHIFT',
            'ControlLeft': 'CTRL',
            'ControlRight': 'CTRL',
            'AltLeft': 'ALT',
            'AltRight': 'ALT',
            'Tab': 'TAB',
            'NumpadAdd': '+',
            'NumpadSubtract': '-',
            'NumpadMultiply': '*',
            'NumpadDivide': '/',
            'NumpadDecimal': '.',
            'Comma': ',',
            'Period': '.',
            'Semicolon': ';',
            'Quote': "'",
            'BracketLeft': '[',
            'BracketRight': ']',
            'Backslash': '\\',
            'Minus': '-',
            'Equal': '=',
            'Slash': '/'
        };

        // For Numpad numbers, just return the number
        if (keyCode.startsWith('Numpad')) {
            const num = keyCode.slice(6);
            if (!isNaN(num)) {
                return num;
            }
        }

        return specialKeys[keyCode] || keyCode;
    }

    function getRandomSkin() {
        if (favoriteSkins.length === 0) return 'Default';

        // If we've used all skins or haven't started yet, reset the unused skins pool
        if (unusedSkins.length === 0) {
            // Create a new array with all skins except the last used one
            unusedSkins = favoriteSkins.filter(skin => skin !== lastUsedSkin);

            // If we filtered out the last used skin and no skins are left
            // (this would only happen with 1 skin in favorites)
            if (unusedSkins.length === 0) {
                unusedSkins = [...favoriteSkins];
            }
        }

        // Get a random index from the unused skins
        const randomIndex = Math.floor(Math.random() * unusedSkins.length);
        // Get the skin and remove it from unused pool
        const selectedSkin = unusedSkins.splice(randomIndex, 1)[0];
        // Update last used skin
        lastUsedSkin = selectedSkin;

        return selectedSkin;
    }

    // === New 8x Split Function ===
    function perform8xSplit() {
        for (let i = 0; i < 3; i++) simulateSpacebarPress();
    }

    // Add notification functions
    let activeNotifications = [];
    let notificationCount = 0;

    function showNotification(message, type = 'success', duration = 2000, customElement = null) {
        if (!notificationsEnabled) return;

        const notification = customElement || document.createElement('div');
        const id = `notification-${notificationCount++}`;
        notification.id = id;
        if (!customElement) {
            notification.className = `hotkey-notification ${type}`;
        }
        notification.textContent = message;

        // Position notifications vertically
        const offset = activeNotifications.length * 50;
        notification.style.transform = `translateY(-${offset}px)`;

        document.body.appendChild(notification);
        activeNotifications.push({ id, element: notification });

        // Trigger animation
        requestAnimationFrame(() => {
            notification.classList.add('show');
        });

        // Remove notification after duration
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
                activeNotifications = activeNotifications.filter(n => n.id !== id);
                // Reposition remaining notifications
                activeNotifications.forEach((n, index) => {
                    n.element.style.transform = `translateY(-${index * 50}px)`;
                });
            }, 300);
        }, duration);
    }

    function addToFavorites(skinName) {
        if (!favoriteSkins.includes(skinName)) {
            favoriteSkins.push(skinName);
            localStorage.setItem('gota-favorite-skins', JSON.stringify(favoriteSkins));
            updateFavoritesUI();
            return true;
        }
        return false;
    }

    function removeFromFavorites(skinName) {
        const index = favoriteSkins.indexOf(skinName);
        if (index > -1) {
            favoriteSkins.splice(index, 1);
            localStorage.setItem('gota-favorite-skins', JSON.stringify(favoriteSkins));
            updateFavoritesUI();
            showNotification(`Deleted skin: ${skinName}`, 'error');
            return true;
        }
        return false;
    }

    function updateFavoritesUI() {
        const favoritesList = document.getElementById('favorites-list');
        if (!favoritesList) return;

        favoritesList.innerHTML = favoriteSkins.map(skin => `
            <div class="favorite-skin-item" style="display: flex; align-items: center; background: #444; padding: 5px; border-radius: 3px;">
                <span style="flex: 1; overflow: hidden; text-overflow: ellipsis;">${skin}</span>
                <button class="enhancer-btn-action use-skin-btn" data-skin="${skin}" style="padding: 2px 5px; margin-left: 5px;">Use</button>
                <button class="enhancer-btn-action remove-skin-btn" data-skin="${skin}" style="padding: 2px 5px; margin-left: 5px;">×</button>
            </div>
        `).join('');

        // Add event listeners for the buttons
        favoritesList.querySelectorAll('.use-skin-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const skin = btn.getAttribute('data-skin');
                changeSkin(skin);
            });
        });

        favoritesList.querySelectorAll('.remove-skin-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const skin = btn.getAttribute('data-skin');
                removeFromFavorites(skin);
            });
        });
    }

    function setupFavoritesListeners() {
        const addButton = document.getElementById('add-favorite-btn');
        const newSkinInput = document.getElementById('new-favorite-skin');

        if (addButton && newSkinInput) {
            addButton.addEventListener('click', () => {
                const skinName = newSkinInput.value.trim();
                if (skinName && addToFavorites(skinName)) {
                    newSkinInput.value = '';
                    showNotification(`Added skin: ${skinName}`, 'success');
                }
            });

            newSkinInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    addButton.click();
                }
            });
        }
    }

    // Add sophisticated color generation functions
    function generateSophisticatedColor() {
        // Base colors with their RGB ranges to ensure sophisticated combinations
        const colorRanges = [
            // Cool tones
            { r: [100, 150], g: [200, 255], b: [220, 255] }, // Aquamarine variants
            { r: [0, 100], g: [150, 200], b: [200, 255] },   // Azure/Cerulean
            { r: [176, 224], g: [196, 224], b: [222, 255] }, // Powder blue

            // Warm tones
            { r: [255, 255], g: [180, 218], b: [180, 215] }, // Peach/Coral
            { r: [250, 255], g: [160, 200], b: [150, 180] }, // Salmon variants
            { r: [255, 255], g: [170, 200], b: [150, 170] }, // Light terracotta

            // Purple family
            { r: [218, 255], g: [112, 170], b: [214, 255] }, // Orchid/Lilac
            { r: [200, 230], g: [150, 190], b: [220, 255] }, // Wisteria
            { r: [180, 220], g: [140, 180], b: [220, 255] }, // Medium purple

            // Green family
            { r: [150, 200], g: [200, 255], b: [180, 220] }, // Sage/Seafoam
            { r: [170, 210], g: [220, 255], b: [180, 220] }, // Mint variants
            { r: [160, 190], g: [200, 230], b: [160, 190] }, // Pistachio

            // Mixed/Special
            { r: [230, 255], g: [180, 220], b: [190, 220] }, // Rose gold
            { r: [220, 255], g: [200, 230], b: [200, 230] }, // Pearl/Ivory
            { r: [200, 230], g: [190, 220], b: [170, 200] }, // Champagne

            // Modern colors
            { r: [250, 255], g: [150, 190], b: [180, 220] }, // Millennial pink
            { r: [150, 200], g: [220, 255], b: [200, 240] }, // Neo mint
            { r: [180, 220], g: [180, 220], b: [230, 255] }  // Serenity blue
        ];

        // Pick a random color range
        const range = colorRanges[Math.floor(Math.random() * colorRanges.length)];

        // Generate random values within the chosen range
        const r = Math.floor(Math.random() * (range.r[1] - range.r[0]) + range.r[0]);
        const g = Math.floor(Math.random() * (range.g[1] - range.g[0]) + range.g[0]);
        const b = Math.floor(Math.random() * (range.b[1] - range.b[0]) + range.b[0]);

        return { r, g, b };
    }

    function updateTimer(type, timeLeft) {
        const timerElement = document.getElementById(`${type}-timer`);
        if (timerElement) {
            timerElement.textContent = `${type.charAt(0).toUpperCase() + type.slice(1)}: ${timeLeft.toFixed(1)}s`;
        }
    }

    function startTimer(type) {
        const timerElement = document.getElementById(`${type}-timer`);
        if (!timerElement) return;

        const shouldShow = type === 'skin' ? showSkinTimer : showColorTimer;
        if (!shouldShow) return;

        // Show timer
        timerElement.style.display = 'block';

        // Reset time
        if (type === 'skin') {
            skinNextChange = 15.5;
            if (skinTimerInterval) clearInterval(skinTimerInterval);
            skinTimerInterval = setInterval(() => {
                skinNextChange = Math.max(0, skinNextChange - 0.1);
                updateTimer('skin', skinNextChange);
                if (skinNextChange <= 0) skinNextChange = 15.5;
            }, 100);
        } else {
            colorNextChange = 15.5;
            if (colorTimerInterval) clearInterval(colorTimerInterval);
            colorTimerInterval = setInterval(() => {
                colorNextChange = Math.max(0, colorNextChange - 0.1);
                updateTimer('color', colorNextChange);
                if (colorNextChange <= 0) colorNextChange = 15.5;
            }, 100);
        }
    }

    function stopTimer(type) {
        const timerElement = document.getElementById(`${type}-timer`);
        if (!timerElement) return;

        // Hide timer
        timerElement.style.display = 'none';

        // Clear interval
        if (type === 'skin') {
            if (skinTimerInterval) {
                clearInterval(skinTimerInterval);
                skinTimerInterval = null;
            }
        } else {
            if (colorTimerInterval) {
                clearInterval(colorTimerInterval);
                colorTimerInterval = null;
            }
        }
    }

    function createDraggableTimers() {
        const skinTimer = document.createElement('div');
        skinTimer.id = 'skin-timer';
        skinTimer.className = 'timer-display skin';
        skinTimer.textContent = 'Skin: --.-s';

        const colorTimer = document.createElement('div');
        colorTimer.id = 'color-timer';
        colorTimer.className = 'timer-display color';
        colorTimer.textContent = 'Color: --.-s';
        colorTimer.style.top = '50px'; // Position below skin timer

        document.body.appendChild(skinTimer);
        document.body.appendChild(colorTimer);

        // Make timers draggable
        [skinTimer, colorTimer].forEach(makeElementDraggable);
    }

    function makeElementDraggable(element) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        element.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            element.style.top = (element.offsetTop - pos2) + "px";
            element.style.left = (element.offsetLeft - pos1) + "px";
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }

    // Enhanced Event Management System
    const eventHandlers = new Map();

    function addOptimizedEventListener(element, eventType, handler, options = {}) {
        if (!element) return;

        const wrappedHandler = rafThrottle((event) => {
            queueRAF(() => handler(event));
        });

        element.addEventListener(eventType, wrappedHandler, options);

        // Store handler reference for cleanup
        if (!eventHandlers.has(element)) {
            eventHandlers.set(element, new Map());
        }
        eventHandlers.get(element).set(eventType, {
            original: handler,
            wrapped: wrappedHandler
        });
    }

    function removeOptimizedEventListener(element, eventType) {
        if (!element || !eventHandlers.has(element)) return;

        const elementHandlers = eventHandlers.get(element);
        const handler = elementHandlers.get(eventType);

        if (handler) {
            element.removeEventListener(eventType, handler.wrapped);
            elementHandlers.delete(eventType);
        }

        if (elementHandlers.size === 0) {
            eventHandlers.delete(element);
        }
    }

    function cleanupAllEventListeners() {
        for (const [element, handlers] of eventHandlers) {
            for (const [eventType, handler] of handlers) {
                element.removeEventListener(eventType, handler.wrapped);
            }
        }
        eventHandlers.clear();
    }

    // Enhanced Cleanup and Initialization System
    let isInitialized = false;
    let cleanupHandlers = new Set();

    function registerCleanupHandler(handler) {
        cleanupHandlers.add(handler);
    }

    // === Spam Chat Feature ===
    let spamChatIntervalId = null;
    let spamChatActive = false;
    let spamChatMessage = '';
    let spamChatInterval = 0;

    function startSpamChat(message, intervalSec) {
        stopSpamChat();
        if (!message || intervalSec < 10) return;
        spamChatActive = true;
        spamChatMessage = message;
        spamChatInterval = intervalSec;
        sendSpamMessage();
        spamChatIntervalId = setInterval(sendSpamMessage, intervalSec * 1000);
    }

    function stopSpamChat() {
        if (spamChatIntervalId) {
            clearInterval(spamChatIntervalId);
            spamChatIntervalId = null;
        }
        spamChatActive = false;
    }

    function sendSpamMessage() {
        const chatPanel = document.querySelector('#chat-panel');
        const chatInput = document.querySelector('#chat-input');
        if (!chatPanel || !chatInput) {
            console.warn('Spam Chat: chat panel or input not found.');
            return;
        }
        const wasHidden = chatPanel.style.display === 'none';
        if (wasHidden) {
            chatPanel.style.opacity = '0';
            chatPanel.style.display = 'block';
        }
        chatInput.value = spamChatMessage;
        chatInput.focus();
        chatInput.dispatchEvent(new KeyboardEvent('keyup', { keyCode: 13, which: 13 }));
        chatInput.blur();
        if (wasHidden) {
            setTimeout(() => {
                chatPanel.style.display = 'none';
                chatPanel.style.opacity = '1';
            }, 500);
        }
    }
})();
