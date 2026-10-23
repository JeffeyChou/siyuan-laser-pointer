import {
    Plugin,
    showMessage,
} from "siyuan";
import "./index.scss";

const ICON = "iconLaserPointer";
const HOTKEY = "⌥⇧L";
// A released stroke stays fully visible for HOLD_MS, then fades over FADE_MS.
const HOLD_MS = 900;
const FADE_MS = 600;
const RGB = "255, 40, 40";

interface Point {
    x: number;
    y: number;
}

interface Stroke {
    points: Point[];
    end: number; // release time; 0 while drawing
}

export default class LaserPointerPlugin extends Plugin {
    private active = false;
    private lastToggle = 0;
    private strokes: Stroke[] = [];
    private current: Stroke = null;
    private pointer: Point = null;
    private raf = 0;
    private dpr = 1;
    private topBarEl: HTMLElement;
    private overlay: HTMLDivElement = null;
    private canvas: HTMLCanvasElement = null;
    private ctx: CanvasRenderingContext2D = null;

    private get tr() {
        return this.i18n as Record<string, string>;
    }

    onload() {
        // The beam dot stays red so the icon reads as a laser pointer.
        this.addIcons(`<symbol id="${ICON}" viewBox="0 0 32 32">
<path d="M2.3 27.5 15.6 14.2a2 2 0 0 1 2.8 0l1.4 1.4a2 2 0 0 1 0 2.8L6.5 31.7a2 2 0 0 1-2.8 0l-1.4-1.4a2 2 0 0 1 0-2.8z"/>
<path d="M18.4 12.6 24.6 6.4l1 1-6.2 6.2z" opacity=".55"/>
<circle cx="26.5" cy="5.5" r="4.6" fill="#ff3030"/>
<circle cx="26.5" cy="5.5" r="1.8" fill="#fff"/>
</symbol>`);

        this.topBarEl = this.addTopBar({
            icon: ICON,
            title: `${this.tr.toggle} Alt+Shift+L`,
            position: "right",
            callback: () => this.toggle(),
        });

        // SiYuan replaces the keymap with the saved one after plugins load, which
        // drops a plugin's default hotkey, so the default is handled here. The
        // command stays so another key can be bound in Settings → Keymap.
        this.addCommand({
            langKey: "toggle",
            hotkey: HOTKEY,
            callback: () => this.toggle(),
        });
        window.addEventListener("keydown", this.onHotkey, true);
    }

    onunload() {
        window.removeEventListener("keydown", this.onHotkey, true);
        this.toggle(false);
    }

    private onHotkey = (e: KeyboardEvent) => {
        if (e.code !== "KeyL" || !e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey || e.repeat) {
            return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
        this.toggle();
    };

    private toggle(on = !this.active) {
        if (on === this.active) {
            return;
        }
        // One key press can reach both onHotkey and the SiYuan command.
        const now = performance.now();
        if (now - this.lastToggle < 200) {
            return;
        }
        this.lastToggle = now;
        this.active = on;
        if (on) {
            // Keystrokes must not reach the editor while drawing.
            (document.activeElement as HTMLElement)?.blur?.();
            this.mount();
            showMessage(this.tr.on, 3000);
        } else {
            this.unmount();
        }
        this.topBarEl?.classList.toggle("laser-pointer--on", on);
    }

    private mount() {
        const overlay = document.createElement("div");
        overlay.className = "laser-pointer-overlay";
        const canvas = document.createElement("canvas");
        overlay.append(canvas);
        document.body.append(overlay);
        this.overlay = overlay;
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.resize();

        overlay.addEventListener("pointerdown", this.onDown);
        overlay.addEventListener("pointermove", this.onMove);
        overlay.addEventListener("pointerup", this.onUp);
        overlay.addEventListener("pointercancel", this.onUp);
        overlay.addEventListener("pointerleave", this.onLeave);
        overlay.addEventListener("wheel", this.onWheel, {passive: false});
        overlay.addEventListener("contextmenu", this.onContextMenu);
        window.addEventListener("keydown", this.onKey, true);
        window.addEventListener("resize", this.resize);
    }

    private unmount() {
        window.removeEventListener("keydown", this.onKey, true);
        window.removeEventListener("resize", this.resize);
        cancelAnimationFrame(this.raf);
        this.raf = 0;
        this.overlay?.remove();
        this.overlay = null;
        this.canvas = null;
        this.ctx = null;
        this.strokes = [];
        this.current = null;
        this.pointer = null;
    }

    private resize = () => {
        if (!this.canvas) {
            return;
        }
        this.dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.round(window.innerWidth * this.dpr);
        this.canvas.height = Math.round(window.innerHeight * this.dpr);
        this.kick();
    };

    private onDown = (e: PointerEvent) => {
        if (e.button !== 0) {
            return;
        }
        e.preventDefault();
        this.overlay.setPointerCapture(e.pointerId);
        this.pointer = {x: e.clientX, y: e.clientY};
        this.current = {points: [{x: e.clientX, y: e.clientY}], end: 0};
        this.strokes.push(this.current);
        this.kick();
    };

    private onMove = (e: PointerEvent) => {
        this.pointer = {x: e.clientX, y: e.clientY};
        if (this.current) {
            const events = e.getCoalescedEvents?.() || [];
            for (const c of events.length ? events : [e]) {
                this.current.points.push({x: c.clientX, y: c.clientY});
            }
        }
        this.kick();
    };

    private onUp = () => {
        if (!this.current) {
            return;
        }
        this.current.end = performance.now();
        this.current = null;
        this.kick();
    };

    private onLeave = () => {
        if (this.current) {
            return;
        }
        this.pointer = null;
        this.kick();
    };

    // Right click exits, like pressing Esc.
    private onContextMenu = (e: MouseEvent) => {
        e.preventDefault();
        this.toggle(false);
    };

    private onKey = (e: KeyboardEvent) => {
        if (e.key !== "Escape") {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        this.toggle(false);
    };

    // The overlay covers the page, so scroll whatever is underneath the pointer.
    private onWheel = (e: WheelEvent) => {
        e.preventDefault();
        this.overlay.style.pointerEvents = "none";
        let el = document.elementFromPoint(e.clientX, e.clientY);
        this.overlay.style.pointerEvents = "";
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
        for (; el && el !== document.documentElement; el = el.parentElement) {
            const style = getComputedStyle(el);
            const canY = /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight;
            const canX = /(auto|scroll)/.test(style.overflowX) && el.scrollWidth > el.clientWidth;
            if ((e.deltaY && canY) || (e.deltaX && canX)) {
                el.scrollBy({left: e.deltaX * unit, top: e.deltaY * unit});
                return;
            }
        }
    };

    private kick() {
        if (!this.raf && this.ctx) {
            this.raf = requestAnimationFrame(this.frame);
        }
    }

    private frame = () => {
        this.raf = 0;
        const ctx = this.ctx;
        if (!ctx) {
            return;
        }
        const now = performance.now();
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

        this.strokes = this.strokes.filter((s) => !s.end || now - s.end < HOLD_MS + FADE_MS);
        for (const s of this.strokes) {
            const alpha = s.end ? Math.min(1, 1 - (now - s.end - HOLD_MS) / FADE_MS) : 1;
            this.drawStroke(s.points, alpha);
        }
        if (this.pointer) {
            this.drawDot(this.pointer);
        }
        if (this.strokes.length) {
            this.kick();
        }
    };

    private drawStroke(points: Point[], alpha: number) {
        const ctx = this.ctx;
        const path = new Path2D();
        path.moveTo(points[0].x, points[0].y);
        if (points.length === 1) {
            path.lineTo(points[0].x + 0.01, points[0].y);
        } else {
            // Quadratic curves through the midpoints keep the line smooth.
            for (let i = 1; i < points.length - 1; i++) {
                const p = points[i];
                const q = points[i + 1];
                path.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
            }
            const last = points[points.length - 1];
            path.lineTo(last.x, last.y);
        }

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.shadowColor = `rgba(${RGB}, 0.9)`;
        ctx.shadowBlur = 14;
        ctx.strokeStyle = `rgba(${RGB}, 0.6)`;
        ctx.lineWidth = 8;
        ctx.stroke(path);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(255, 236, 236, 0.95)";
        ctx.lineWidth = 2.5;
        ctx.stroke(path);
        ctx.restore();
    }

    private drawDot({x, y}: Point) {
        const ctx = this.ctx;
        ctx.save();
        ctx.shadowColor = `rgba(${RGB}, 1)`;
        ctx.shadowBlur = 16;
        ctx.fillStyle = `rgba(${RGB}, 0.95)`;
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255, 240, 240, 0.95)";
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}
