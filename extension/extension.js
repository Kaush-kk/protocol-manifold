import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const PALETTES = {
    interstellar: {
        bg: [0.014, 0.014, 0.020],
        grid: [0.45, 0.56, 0.78],
        pri: [1.00, 0.84, 0.55],
        sec: [0.95, 0.55, 0.22],
        acc: [1.00, 0.96, 0.88]
    },
    aether: {
        bg: [0.010, 0.016, 0.028],
        grid: [0.32, 0.55, 0.85],
        pri: [0.55, 0.85, 1.00],
        sec: [0.25, 0.52, 0.96],
        acc: [0.94, 0.98, 1.00]
    },
    cosmos: {
        bg: [0.018, 0.010, 0.030],
        grid: [0.52, 0.35, 0.82],
        pri: [0.95, 0.52, 0.78],
        sec: [0.62, 0.32, 0.95],
        acc: [1.00, 0.92, 0.97]
    },
    monolith: {
        bg: [0.012, 0.012, 0.015],
        grid: [0.42, 0.42, 0.46],
        pri: [0.88, 0.88, 0.92],
        sec: [0.55, 0.55, 0.60],
        acc: [1.00, 1.00, 1.00]
    }
};

export default class MathManifoldExtension extends Extension {
    enable() {
        this._t = 0.0;
        this._mode = "gargantua";
        this._paletteName = "interstellar";
        this._cfgTick = 0;
        this._zenTransition = 0.0; // 0 = full fabric, 1 = pure minimalist zen (off)

        this._mx = 960.0;
        this._my = 540.0;
        this._pmx = 960.0;
        this._pmy = 540.0;
        this._vx = 0.0;
        this._vy = 0.0;

        this._wasPressed = false;
        this._pressStartTime = 0.0;
        this._pressStartX = 0.0;
        this._pressStartY = 0.0;
        this._dragAbortedForCube = false;
        this._activeHole = null;

        this._waves = [];
        this._blackHoles = [];
        this._sparks = [];
        this._flashes = [];
        this._patchedMenus = new WeakSet();

        this._lx = 0.1; this._ly = 0.0; this._lz = 0.0;
        this._lorenzPts = [];
        for (let i = 0; i < 240; i++) this._stepLorenz();

        this._stars = [];
        for (let i = 0; i < 120; i++) {
            this._stars.push({
                r: 45 + Math.pow(Math.random(), 1.4) * 560,
                a: Math.random() * Math.PI * 2,
                spd: (0.003 + Math.random() * 0.010) * (i % 2 === 0 ? 1 : -0.7),
                tilt: 0.35 + Math.random() * 0.65,
                size: 1.3 + Math.random() * 2.0,
                lum: 0.35 + Math.random() * 0.65
            });
        }

        this._readConfig();
        this._suppressLeftHoldContextMenu();

        let monitor = Main.layoutManager.primaryMonitor;
        this._canvas = new St.DrawingArea({
            reactive: false,
            can_focus: false,
            x: monitor ? monitor.x : 0,
            y: monitor ? monitor.y : 0,
            width: monitor ? monitor.width : 1920,
            height: monitor ? monitor.height : 1080
        });

        this._repaintId = this._canvas.connect('repaint', (area) => this._onRepaint(area));
        Main.layoutManager._backgroundGroup.add_child(this._canvas);

        this._timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 20, () => {
            this._onTick();
            return GLib.SOURCE_CONTINUE;
        });
    }

    // Blocks GNOME's "Change Background..." popup menu from firing on Left-Click Hold
    // while keeping normal Right-Click menu and Desktop Cube Left-Click Drag 100% functional
    _suppressLeftHoldContextMenu() {
        try {
            if (!Main.layoutManager._bgManagers) return;
            for (let bgManager of Main.layoutManager._bgManagers) {
                if (!bgManager || !bgManager.backgroundActor) continue;
                let actor = bgManager.backgroundActor;
                let menu = actor._backgroundMenu;
                if (menu && !this._patchedMenus.has(menu)) {
                    let origOpen = menu.open.bind(menu);
                    menu._origOpen = origOpen;
                    menu.open = (animate) => {
                        let [, , mask] = global.get_pointer();
                        let leftHeld = (mask & Clutter.ModifierType.BUTTON1_MASK) !== 0;
                        let rightHeld = (mask & Clutter.ModifierType.BUTTON3_MASK) !== 0;
                        if (leftHeld && !rightHeld) {
                            return; // Block long-press left-click menu popup
                        }
                        origOpen(animate);
                    };
                    this._patchedMenus.add(menu);
                }
            }
        } catch (e) {}
    }

    _stepLorenz() {
        const sigma = 10.0, rho = 28.0, beta = 8.0 / 3.0, dt = 0.006;
        let dx = sigma * (this._ly - this._lx) * dt;
        let dy = (this._lx * (rho - this._lz) - this._ly) * dt;
        let dz = (this._lx * this._ly - beta * this._lz) * dt;
        this._lx += dx; this._ly += dy; this._lz += dz;
        this._lorenzPts.push({x: this._lx, y: this._ly, z: this._lz});
        if (this._lorenzPts.length > 240) this._lorenzPts.shift();
    }

    _readConfig() {
        try {
            let mPath = GLib.get_home_dir() + "/.config/manifold/mode";
            let [ok1, c1] = GLib.file_get_contents(mPath);
            if (ok1) {
                let m = new TextDecoder().decode(c1).trim();
                if (m) this._mode = m;
            }
            let pPath = GLib.get_home_dir() + "/.config/manifold/palette";
            let [ok2, c2] = GLib.file_get_contents(pPath);
            if (ok2) {
                let p = new TextDecoder().decode(c2).trim();
                if (p && PALETTES[p]) this._paletteName = p;
            }
        } catch (e) {}
    }

    _onTick() {
        if (!this._canvas || (Main.overview && Main.overview.visible)) {
            return;
        }

        this._t += 0.020;

        // Smooth transition into/out of "zen" (off) mode
        let targetZen = (this._mode === "zen") ? 1.0 : 0.0;
        this._zenTransition += (targetZen - this._zenTransition) * 0.12;

        if (this._zenTransition < 0.98) {
            this._stepLorenz();
        }

        if (this._canvas.get_next_sibling() !== null) {
            Main.layoutManager._backgroundGroup.set_child_above_sibling(this._canvas, null);
        }

        this._cfgTick++;
        if (this._cfgTick > 30) {
            this._cfgTick = 0;
            this._readConfig();
            this._suppressLeftHoldContextMenu();
            let monitor = Main.layoutManager.primaryMonitor;
            if (monitor && (this._canvas.width !== monitor.width || this._canvas.height !== monitor.height)) {
                this._canvas.set_position(monitor.x, monitor.y);
                this._canvas.set_size(monitor.width, monitor.height);
            }
        }

        let [px, py, mask] = global.get_pointer();
        this._pmx = this._mx;
        this._pmy = this._my;
        this._mx += (px - this._mx) * 0.30;
        this._my += (py - this._my) * 0.30;
        this._vx = px - this._pmx;
        this._vy = py - this._pmy;

        let pressed = (mask & Clutter.ModifierType.BUTTON1_MASK) !== 0;

        if (this._mode !== "zen") {
            if (pressed && !this._wasPressed) {
                this._pressStartTime = this._t;
                this._pressStartX = px;
                this._pressStartY = py;
                this._dragAbortedForCube = false;

                // Instant Gravitational Wave on Left-Click
                this._waves.push({
                    x: px, y: py,
                    r: 8.0, amp: 44.0, alpha: 1.0
                });
            } else if (pressed && this._wasPressed) {
                let heldTime = this._t - this._pressStartTime;
                let moveDist = Math.hypot(px - this._pressStartX, py - this._pressStartY);

                // If user immediately drags mouse (< 0.26s and > 26px), yield to Desktop Cube workspace drag!
                if (!this._activeHole && heldTime < 0.26 && moveDist > 26.0) {
                    this._dragAbortedForCube = true;
                }

                // If user holds steady for 0.26s, ignite a Black Hole!
                if (!this._dragAbortedForCube && heldTime >= 0.26) {
                    if (!this._activeHole) {
                        this._activeHole = {
                            x: px, y: py,
                            vx: (Math.random() - 0.5) * 1.2,
                            vy: (Math.random() - 0.5) * 1.2,
                            mass: 24.0,
                            age: 0.0,
                            spin: 0.0,
                            bounces: 0,
                            held: true
                        };
                        this._blackHoles.push(this._activeHole);
                    } else {
                        this._activeHole.x = this._mx;
                        this._activeHole.y = this._my;
                        this._activeHole.vx = Math.max(-14.0, Math.min(14.0, this._vx * 0.45));
                        this._activeHole.vy = Math.max(-14.0, Math.min(14.0, this._vy * 0.45));
                        this._activeHole.mass = Math.min(72.0, this._activeHole.mass + 0.65);
                    }
                }
            } else if (!pressed && this._wasPressed) {
                if (this._activeHole) {
                    this._activeHole.held = false;
                    this._activeHole = null;
                }
            }
        }
        this._wasPressed = pressed;

        // Step Gravitational Waves
        for (let w of this._waves) {
            w.r += 16.0;
            w.amp *= 0.968;
            w.alpha *= 0.964;
        }
        this._waves = this._waves.filter(w => w.alpha > 0.025);

        // N-Body Binary Black Hole Physics: Mutual Gravity, Bounce & Cataclysmic Kilonova Blast
        this._stepBlackHolePhysics();

        // Step Relativistic Kilonova Ejecta Sparks
        for (let sp of this._sparks) {
            sp.x += sp.vx;
            sp.y += sp.vy;
            sp.vx *= 0.96;
            sp.vy *= 0.96;
            sp.alpha *= 0.94;
        }
        this._sparks = this._sparks.filter(sp => sp.alpha > 0.03);

        // Step Supernova Gamma-Ray Flashes
        for (let fl of this._flashes) {
            fl.r += 24.0;
            fl.alpha *= 0.89;
        }
        this._flashes = this._flashes.filter(fl => fl.alpha > 0.02);

        for (let s of this._stars) s.a += s.spd;

        this._canvas.queue_repaint();
    }

    _stepBlackHolePhysics() {
        const n = this._blackHoles.length;
        const w = this._canvas ? this._canvas.width : 1920;
        const h = this._canvas ? this._canvas.height : 1080;

        // Pairwise gravitational attraction, elastic bounce & merger check
        for (let i = 0; i < n; i++) {
            let b1 = this._blackHoles[i];
            if (b1.merged) continue;

            for (let j = i + 1; j < n; j++) {
                let b2 = this._blackHoles[j];
                if (b2.merged) continue;

                let dx = b2.x - b1.x;
                let dy = b2.y - b1.y;
                let distSq = dx * dx + dy * dy + 120.0;
                let dist = Math.sqrt(distSq);
                let nx = dx / dist;
                let ny = dy / dist;

                // Mutual Gravitational Pull + Orbital Tangential Swirl (Binary Inspiral)
                let force = (0.95 * b1.mass * b2.mass) / distSq;
                let swirl = force * 0.28;

                if (!b1.held) {
                    b1.vx += (nx * force - ny * swirl) / (b1.mass * 0.15);
                    b1.vy += (ny * force + nx * swirl) / (b1.mass * 0.15);
                }
                if (!b2.held) {
                    b2.vx -= (nx * force - ny * swirl) / (b2.mass * 0.15);
                    b2.vy -= (ny * force + nx * swirl) / (b2.mass * 0.15);
                }

                // Collision Detection
                let minDist = (b1.mass + b2.mass) * 0.88;
                if (dist < minDist) {
                    // First Impact: Relativistic Ricochet Bounce + Shockwave!
                    if (b1.bounces < 1 && b2.bounces < 1 && !b1.held && !b2.held) {
                        b1.bounces++;
                        b2.bounces++;
                        let mx = (b1.x + b2.x) * 0.5;
                        let my = (b1.y + b2.y) * 0.5;

                        // Push apart outside overlap
                        let overlap = (minDist - dist) * 0.6 + 6.0;
                        b1.x -= nx * overlap; b1.y -= ny * overlap;
                        b2.x += nx * overlap; b2.y += ny * overlap;

                        // Elastic velocity rebound with tangential spin kick
                        let rvx = b2.vx - b1.vx;
                        let rvy = b2.vy - b1.vy;
                        let velAlongNormal = rvx * nx + rvy * ny;
                        let impulse = Math.max(5.5, Math.abs(velAlongNormal) * 1.35);

                        b1.vx = -nx * impulse - ny * 3.2;
                        b1.vy = -ny * impulse + nx * 3.2;
                        b2.vx = nx * impulse + ny * 3.2;
                        b2.vy = ny * impulse - nx * 3.2;

                        this._waves.push({x: mx, y: my, r: 12.0, amp: 52.0, alpha: 1.0});
                        for (let k = 0; k < 14; k++) {
                            let ang = (k / 14.0) * Math.PI * 2;
                            this._sparks.push({
                                x: mx, y: my,
                                vx: Math.cos(ang) * (5.0 + Math.random() * 5.0),
                                vy: Math.sin(ang) * (5.0 + Math.random() * 5.0),
                                size: 2.2, alpha: 0.95
                            });
                        }
                    } else {
                        // Second Impact: CATACLYSMIC BINARY MERGER & SUPERNOVA BLAST!
                        b1.merged = true;
                        b2.merged = true;
                        if (this._activeHole === b1 || this._activeHole === b2) {
                            this._activeHole = null;
                        }
                        let mx = (b1.x * b1.mass + b2.x * b2.mass) / (b1.mass + b2.mass);
                        let my = (b1.y * b1.mass + b2.y * b2.mass) / (b1.mass + b2.mass);

                        // Triple Relativistic Shockwave Cascade
                        this._waves.push({x: mx, y: my, r: 10.0, amp: 95.0, alpha: 1.0});
                        this._waves.push({x: mx, y: my, r: 42.0, amp: 65.0, alpha: 0.90});
                        this._waves.push({x: mx, y: my, r: 80.0, amp: 40.0, alpha: 0.75});

                        // Blinding Kilonova Flash Core
                        this._flashes.push({x: mx, y: my, r: 25.0, alpha: 1.0});

                        // 42 Relativistic Ejecta Jets
                        for (let k = 0; k < 42; k++) {
                            let ang = (k / 42.0) * Math.PI * 2 + (Math.random() - 0.5) * 0.15;
                            let spd = 4.0 + Math.random() * 14.0;
                            this._sparks.push({
                                x: mx, y: my,
                                vx: Math.cos(ang) * spd,
                                vy: Math.sin(ang) * spd,
                                size: 2.0 + Math.random() * 2.8,
                                alpha: 1.0
                            });
                        }
                    }
                }
            }
        }

        // Advance individual Black Holes (18-second extended lifespan + soft screen boundary bounce)
        for (let bh of this._blackHoles) {
            if (bh.merged) continue;
            bh.spin += 0.15;
            if (!bh.held) {
                bh.age += 0.020;
                bh.x += bh.vx;
                bh.y += bh.vy;
                bh.vx *= 0.994;
                bh.vy *= 0.994;

                // Softly reflect off monitor edges so black holes stay on screen to collide!
                let pad = 80.0;
                if (bh.x < pad) { bh.x = pad; bh.vx = Math.abs(bh.vx) * 0.85; }
                if (bh.x > w - pad) { bh.x = w - pad; bh.vx = -Math.abs(bh.vx) * 0.85; }
                if (bh.y < pad) { bh.y = pad; bh.vy = Math.abs(bh.vy) * 0.85; }
                if (bh.y > h - pad) { bh.y = h - pad; bh.vy = -Math.abs(bh.vy) * 0.85; }

                // Hold mass steady for first 12 seconds, then slowly Hawking-evaporate over next 6 seconds
                if (bh.age < 12.0) {
                    bh.mass *= 0.9992;
                } else {
                    bh.mass *= 0.982;
                }

                if (bh.mass < 3.8 && !bh.burst) {
                    bh.burst = true;
                    this._waves.push({x: bh.x, y: bh.y, r: 10.0, amp: 30.0, alpha: 0.85});
                }
            }
        }
        this._blackHoles = this._blackHoles.filter(bh => !bh.merged && bh.mass >= 3.2);
    }

    _warpPoint(x, y, cx, cy) {
        let dxM = x - this._mx;
        let dyM = y - this._my;
        let pullM = 18000.0 / (dxM * dxM + dyM * dyM + 3200.0);
        let wx = x - dxM * pullM;
        let wy = y - dyM * pullM;

        if (this._mode === "gargantua") {
            let dxC = wx - cx;
            let dyC = wy - cy;
            let pullC = 25000.0 / (dxC * dxC + dyC * dyC + 4200.0);
            wx -= dxC * pullC;
            wy -= dyC * pullC;
        }

        for (let w of this._waves) {
            let dxW = wx - w.x;
            let dyW = wy - w.y;
            let dist = Math.sqrt(dxW * dxW + dyW * dyW) + 0.001;
            let diff = dist - w.r;
            if (Math.abs(diff) < 165.0) {
                let env = Math.exp(-(diff * diff) / 3600.0);
                let disp = w.amp * env * Math.sin(diff * 0.09);
                wx += (dxW / dist) * disp;
                wy += (dyW / dist) * disp;
            }
        }

        for (let bh of this._blackHoles) {
            let dxB = wx - bh.x;
            let dyB = wy - bh.y;
            let distSq = dxB * dxB + dyB * dyB + 950.0;
            let pullB = Math.min(0.88, (bh.mass * 540.0) / distSq);
            let swirl = pullB * 0.55;
            wx -= dxB * pullB - dyB * swirl;
            wy -= dyB * pullB + dxB * swirl;
        }

        return [wx, wy];
    }

    _onRepaint(area) {
        let cr = area.get_context();
        let [w, h] = area.get_surface_size();
        let pal = PALETTES[this._paletteName] || PALETTES.interstellar;

        cr.setSourceRGB(pal.bg[0], pal.bg[1], pal.bg[2]);
        cr.paint();

        const cx = w * 0.50;
        const cy = h * 0.50;

        // Minimalist Mathematical Sanctum when Turned OFF ("zen" mode)
        if (this._zenTransition > 0.02) {
            this._drawMinimalistZenSanctum(cr, cx, cy, pal, this._zenTransition);
            if (this._zenTransition > 0.98) {
                cr.$dispose();
                return;
            }
        }

        let fabricAlpha = 1.0 - this._zenTransition;

        // INFINITE OVERSCAN SPACE-TIME FABRIC (-336px to +336px beyond screen edges so borders NEVER show!)
        const sp = 56;
        const margin = sp * 6;
        cr.setLineWidth(0.95);
        cr.setSourceRGBA(pal.grid[0], pal.grid[1], pal.grid[2], 0.22 * fabricAlpha);

        for (let gx = -margin; gx <= w + margin; gx += sp) {
            for (let gy = -margin; gy <= h + margin; gy += sp) {
                let [wx, wy] = this._warpPoint(gx, gy, cx, cy);
                if (gy === -margin) cr.moveTo(wx, wy);
                else cr.lineTo(wx, wy);
            }
        }
        for (let gy = -margin; gy <= h + margin; gy += sp) {
            for (let gx = -margin; gx <= w + margin; gx += sp) {
                let [wx, wy] = this._warpPoint(gx, gy, cx, cy);
                if (gx === -margin) cr.moveTo(wx, wy);
                else cr.lineTo(wx, wy);
            }
        }
        cr.stroke();

        // Highlighted Local Gravity Mesh Around Cursor
        let gxStart = Math.floor((this._mx - 220) / sp) * sp;
        let gxEnd = Math.ceil((this._mx + 220) / sp) * sp;
        let gyStart = Math.floor((this._my - 220) / sp) * sp;
        let gyEnd = Math.ceil((this._my + 220) / sp) * sp;

        cr.setLineWidth(1.25);
        cr.setSourceRGBA(pal.pri[0], pal.pri[1], pal.pri[2], 0.40 * fabricAlpha);
        for (let gx = gxStart; gx <= gxEnd; gx += sp) {
            for (let gy = gyStart; gy <= gyEnd; gy += sp) {
                let [wx, wy] = this._warpPoint(gx, gy, cx, cy);
                if (gy === gyStart) cr.moveTo(wx, wy);
                else cr.lineTo(wx, wy);
            }
        }
        for (let gy = gyStart; gy <= gyEnd; gy += sp) {
            for (let gx = gxStart; gx <= gxEnd; gx += sp) {
                let [wx, wy] = this._warpPoint(gx, gy, cx, cy);
                if (gx === gxStart) cr.moveTo(wx, wy);
                else cr.lineTo(wx, wy);
            }
        }
        cr.stroke();

        if (this._mode === "gargantua") this._drawGargantua(cr, cx, cy, pal);
        else if (this._mode === "supernova") this._drawSupernova(cr, cx, cy, pal);
        else if (this._mode === "attractor") this._drawAttractor(cr, cx, cy, pal);
        else if (this._mode === "pendulum") this._drawPendulumWaves(cr, cx, cy, pal);
        else if (this._mode === "fibonacci") this._drawFibonacciGalaxy(cr, cx, cy, pal);
        else if (this._mode === "tesseract") this._drawTesseract(cr, cx, cy, pal);
        else if (this._mode === "geodesic") this._drawGeodesicAstrolabe(cr, cx, cy, pal);

        // Gravitational Shockwaves
        for (let wv of this._waves) {
            cr.setLineWidth(2.6);
            cr.setSourceRGBA(pal.acc[0], pal.acc[1], pal.acc[2], wv.alpha * 0.58);
            cr.arc(wv.x, wv.y, wv.r, 0, Math.PI * 2);
            cr.stroke();

            cr.setLineWidth(8.0);
            cr.setSourceRGBA(pal.pri[0], pal.pri[1], pal.pri[2], wv.alpha * 0.18);
            cr.arc(wv.x, wv.y, Math.max(1.0, wv.r - 5.0), 0, Math.PI * 2);
            cr.stroke();
        }

        // Kilonova Merger Flashes
        for (let fl of this._flashes) {
            cr.setSourceRGBA(pal.acc[0], pal.acc[1], pal.acc[2], fl.alpha * 0.45);
            cr.arc(fl.x, fl.y, fl.r, 0, Math.PI * 2);
            cr.fill();
        }

        // Relativistic Merger Sparks
        for (let spk of this._sparks) {
            cr.setSourceRGBA(pal.acc[0], pal.acc[1], pal.acc[2], spk.alpha);
            cr.arc(spk.x, spk.y, spk.size, 0, Math.PI * 2);
            cr.fill();
        }

        // Dynamic Black Holes
        for (let bh of this._blackHoles) {
            this._drawDynamicBlackHole(cr, bh, pal);
        }

        cr.$dispose();
    }

    // Minimalist Mathematical Sanctum (Displayed when `manifoldctl off` is triggered: Zero Grid, Zero Fabric)
    _drawMinimalistZenSanctum(cr, cx, cy, pal, alpha) {
        let breath = Math.sin(this._t * 0.6);

        // 1. Hairline Golden Ratio Outer Horizon Ring
        cr.setLineWidth(0.9);
        cr.setSourceRGBA(pal.pri[0], pal.pri[1], pal.pri[2], 0.28 * alpha);
        cr.arc(cx, cy, 180.0 + breath * 3.0, 0, Math.PI * 2);
        cr.stroke();

        // 2. Sacred Vesica Piscis Dual Off-Axis Harmonic Circles
        let offset = 55.6; // 180 / phi^2.5
        cr.setLineWidth(0.75);
        cr.setSourceRGBA(pal.grid[0], pal.grid[1], pal.grid[2], 0.22 * alpha);
        let rot = this._t * 0.12;
        let ox = Math.cos(rot) * offset;
        let oy = Math.sin(rot) * offset;
        cr.arc(cx + ox, cy + oy, 124.4, 0, Math.PI * 2);
        cr.stroke();
        cr.arc(cx - ox, cy - oy, 124.4, 0, Math.PI * 2);
        cr.stroke();

        // 3. Minimalist Lemniscate of Bernoulli (Infinity Core)
        cr.setLineWidth(1.5);
        cr.setSourceRGBA(pal.acc[0], pal.acc[1], pal.acc[2], 0.62 * alpha);
        let scale = 68.0;
        for (let i = 0; i <= 160; i++) {
            let u = (i / 160.0) * Math.PI * 2;
            let denom = 1.0 + Math.sin(u) * Math.sin(u);
            let ix = cx + (scale * Math.cos(u)) / denom;
            let iy = cy + (scale * Math.sin(u) * Math.cos(u)) / denom;
            if (i === 0) cr.moveTo(ix, iy);
            else cr.lineTo(ix, iy);
        }
        cr.stroke();

        // 4. Single Orbiting Eigen-Point on the Outer Ring
        let px = cx + Math.cos(-this._t * 0.35) * (180.0 + breath * 3.0);
        let py = cy + Math.sin(-this._t * 0.35) * (180.0 + breath * 3.0);
        cr.setSourceRGBA(pal.acc[0], pal.acc[1], pal.acc[2], 0.90 * alpha);
        cr.arc(px, py, 3.0, 0, Math.PI * 2);
        cr.fill();
    }

    _drawGargantua(cr, cx, cy, pal) {
        for (let i = 3; i >= 1; i--) {
            cr.setLineWidth(2.0 + i * 3.5);
            cr.setSourceRGBA(pal.pri[0], pal.pri[1], pal.pri[2], 0.08 * i);
            cr.arc(cx, cy, 118 + i * 6, 0, Math.PI * 2);
            cr.stroke();
        }
        const tilt = 0.28;
        cr.save();
        cr.translate(cx, cy);
        cr.rotate(-0.22 + Math.sin(this._t * 0.15) * 0.05);
        for (let r = 135; r <= 295; r += 10) {
            let frac = (r - 135) / 160.0;
            cr.setLineWidth(2.2);
            let col = frac < 0.4 ? pal.acc : (frac < 0.75 ? pal.pri : pal.sec);
            cr.setSourceRGBA(col[0], col[1], col[2], (1.0 - frac * 0.75) * 0.52);
            let aStart = this._t * (1.8 - frac * 0.9) + r * 0.07;
            cr.save();
            cr.scale(1.0, tilt);
            cr.arc(0, 0, r, aStart, aStart + Math.PI * 1.45);
            cr.restore();
            cr.stroke();
        }
        cr.restore();

        cr.setSourceRGB(0.01, 0.01, 0.014);
        cr.arc(cx, cy, 112, 0, Math.PI * 2);
        cr.fill();

        cr.setLineWidth(2.2);
        cr.setSourceRGBA(pal.acc[0], pal.acc[1], pal.acc[2], 0.88);
        cr.arc(cx, cy, 113, 0, Math.PI * 2);
        cr.stroke();
    }

    _drawDynamicBlackHole(cr, bh, pal) {
        let r = bh.mass;
        for (let s = 0; s < 3; s++) {
            let a = bh.spin * (1.4 + s * 0.3) + s * 2.1;
            cr.setLineWidth(2.0 + s * 1.5);
            cr.setSourceRGBA(pal.pri[0], pal.pri[1], pal.pri[2], 0.48);
            cr.arc(bh.x, bh.y, r * (1.25 + s * 0.22), a, a + 1.9);
            cr.stroke();
        }
        cr.setSourceRGB(0.008, 0.008, 0.012);
        cr.arc(bh.x, bh.y, r, 0, Math.PI * 2);
        cr.fill();

        cr.setLineWidth(2.2);
        cr.setSourceRGBA(pal.acc[0], pal.acc[1], pal.acc[2], 0.94);
        cr.arc(bh.x, bh.y, r + 1.2, 0, Math.PI * 2);
        cr.stroke();
    }

    _drawSupernova(cr, cx, cy, pal) {
        for (let s of this._stars) {
            let sx = cx + Math.cos(s.a) * s.r;
            let sy = cy + Math.sin(s.a) * s.r * s.tilt;
            let [wx, wy] = this._warpPoint(sx, sy, cx, cy);
            cr.setSourceRGBA(pal.pri[0], pal.pri[1], pal.pri[2], s.lum);
            cr.arc(wx, wy, s.size, 0, Math.PI * 2);
            cr.fill();
        }
    }

    _drawAttractor(cr, cx, cy, pal) {
        let yaw = this._t * 0.35 + (this._mx - cx) * 0.0007;
        let cy_a = Math.cos(yaw), sy_a = Math.sin(yaw);
        for (let i = 1; i < this._lorenzPts.length; i++) {
            let p0 = this._lorenzPts[i - 1], p1 = this._lorenzPts[i];
            let f = i / this._lorenzPts.length;
            let [wx0, wy0] = this._warpPoint(cx + (p0.x * cy_a - p0.y * sy_a) * 11.5, cy + 145 - p0.z * 8.5, cx, cy);
            let [wx1, wy1] = this._warpPoint(cx + (p1.x * cy_a - p1.y * sy_a) * 11.5, cy + 145 - p1.z * 8.5, cx, cy);
            cr.setLineWidth(1.0 + f * 2.8);
            cr.setSourceRGBA(
                pal.sec[0] * (1 - f) + pal.acc[0] * f,
                pal.sec[1] * (1 - f) + pal.acc[1] * f,
                pal.sec[2] * (1 - f) + pal.acc[2] * f,
                f * 0.88
            );
            cr.moveTo(wx0, wy0);
            cr.lineTo(wx1, wy1);
            cr.stroke();
        }
    }

    _drawPendulumWaves(cr, cx, cy, pal) {
        for (let k = 1; k <= 8; k++) {
            let baseR = k * 42.0;
            let f = k / 8.0;
            cr.setLineWidth(1.8);
            cr.setSourceRGBA(
                pal.pri[0] * (1 - f) + pal.sec[0] * f,
                pal.pri[1] * (1 - f) + pal.sec[1] * f,
                pal.pri[2] * (1 - f) + pal.sec[2] * f,
                0.65
            );
            for (let i = 0; i <= 150; i++) {
                let th = (i / 150.0) * Math.PI * 2;
                let r = baseR + 18.0 * Math.sin(k * th + this._t * (1.2 + k * 0.15));
                let [wx, wy] = this._warpPoint(cx + r * Math.cos(th), cy + r * Math.sin(th), cx, cy);
                if (i === 0) cr.moveTo(wx, wy);
                else cr.lineTo(wx, wy);
            }
            cr.stroke();
        }
    }

    _drawFibonacciGalaxy(cr, cx, cy, pal) {
        const goldenAngle = Math.PI * (3.0 - Math.sqrt(5.0));
        for (let i = 1; i <= 240; i++) {
            let r = 20.0 * Math.sqrt(i);
            let a = i * goldenAngle + this._t * 0.25;
            let [wx, wy] = this._warpPoint(cx + r * Math.cos(a), cy + r * Math.sin(a), cx, cy);
            let f = i / 240.0;
            cr.setSourceRGBA(
                pal.acc[0] * (1 - f) + pal.pri[0] * f,
                pal.acc[1] * (1 - f) + pal.pri[1] * f,
                pal.acc[2] * (1 - f) + pal.pri[2] * f,
                (1.0 - f * 0.65) * 0.88
            );
            cr.arc(wx, wy, 2.2 + (1.0 - f) * 2.5, 0, Math.PI * 2);
            cr.fill();
        }
    }

    _drawTesseract(cr, cx, cy, pal) {
        let verts = [];
        let a1 = this._t * 0.45, a2 = this._t * 0.32;
        let c1 = Math.cos(a1), s1 = Math.sin(a1), c2 = Math.cos(a2), s2 = Math.sin(a2);
        for (let i = 0; i < 16; i++) {
            let x = (i & 1) ? 1 : -1, y = (i & 2) ? 1 : -1, z = (i & 4) ? 1 : -1, w = (i & 8) ? 1 : -1;
            let xw = x * c1 - w * s1, ww = x * s1 + w * c1;
            let yz = y * c2 - z * s2, zz = y * s2 + z * c2;
            let proj4 = 1.0 / (2.6 - ww * 0.65);
            let rx = (xw * proj4) * c2 - (zz * proj4) * s2;
            let ry = (yz * proj4) * c1 - (zz * proj4) * s1;
            verts.push(this._warpPoint(cx + rx * 230.0, cy + ry * 230.0, cx, cy));
        }
        cr.setLineWidth(1.8);
        for (let i = 0; i < 16; i++) {
            for (let b = 0; b < 4; b++) {
                let j = i ^ (1 << b);
                if (i < j) {
                    let col = b === 3 ? pal.acc : pal.pri;
                    cr.setSourceRGBA(col[0], col[1], col[2], b === 3 ? 0.78 : 0.48);
                    cr.moveTo(verts[i][0], verts[i][1]);
                    cr.lineTo(verts[j][0], verts[j][1]);
                    cr.stroke();
                }
            }
        }
    }

    _drawGeodesicAstrolabe(cr, cx, cy, pal) {
        const radii = [95, 155, 225, 305];
        for (let idx = 0; idx < radii.length; idx++) {
            let r = radii[idx];
            cr.setLineWidth(idx % 2 === 0 ? 1.6 : 1.0);
            cr.setSourceRGBA(pal.pri[0], pal.pri[1], pal.pri[2], 0.42);
            cr.arc(cx, cy, r, 0, Math.PI * 2);
            cr.stroke();

            let pAngle = this._t * (0.45 - idx * 0.08) * (idx % 2 === 0 ? 1 : -1);
            let [wx, wy] = this._warpPoint(cx + Math.cos(pAngle) * r, cy + Math.sin(pAngle) * r, cx, cy);
            cr.setSourceRGBA(pal.acc[0], pal.acc[1], pal.acc[2], 0.95);
            cr.arc(wx, wy, 4.5, 0, Math.PI * 2);
            cr.fill();
        }
    }

    disable() {
        // Restore original background menu behavior on disable
        try {
            if (Main.layoutManager._bgManagers) {
                for (let bgManager of Main.layoutManager._bgManagers) {
                    let menu = bgManager?.backgroundActor?._backgroundMenu;
                    if (menu && menu._origOpen) {
                        menu.open = menu._origOpen;
                    }
                }
            }
        } catch (e) {}

        if (this._timerId) {
            GLib.Source.remove(this._timerId);
            this._timerId = null;
        }
        if (this._canvas) {
            if (this._repaintId) {
                this._canvas.disconnect(this._repaintId);
                this._repaintId = null;
            }
            this._canvas.destroy();
            this._canvas = null;
        }
    }
}
