const DRIVING_KEYS = new Map([
    ['KeyW', 'throttle'],
    ['ArrowUp', 'throttle'],
    ['KeyS', 'brake'],
    ['ArrowDown', 'brake'],
    ['KeyA', 'left'],
    ['ArrowLeft', 'left'],
    ['KeyD', 'right'],
    ['ArrowRight', 'right'],
    ['Space', 'handbrake']
]);

const BLOCKED_DEFAULT_KEYS = new Set([
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'
]);

export class InputController {
    constructor() {
        this.keys = new Set();
        this.pointers = new Map();
        this.enabled = false;

        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);
        this.onBlur = this.onBlur.bind(this);
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);

        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
        window.addEventListener('blur', this.onBlur);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.clear();
        });

        for (const button of document.querySelectorAll('[data-control]')) {
            button.addEventListener('pointerdown', this.onPointerDown);
            button.addEventListener('pointerup', this.onPointerUp);
            button.addEventListener('pointercancel', this.onPointerUp);
            button.addEventListener('lostpointercapture', this.onPointerUp);
            button.addEventListener('contextmenu', (event) => event.preventDefault());
        }
    }

    setEnabled(enabled) {
        this.enabled = Boolean(enabled);
        if (!this.enabled) this.clear();
    }

    onKeyDown(event) {
        if (!this.enabled) return;
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        const action = DRIVING_KEYS.get(event.code);
        if (!action) return;
        this.keys.add(action);
        if (BLOCKED_DEFAULT_KEYS.has(event.code)) event.preventDefault();
    }

    onKeyUp(event) {
        const action = DRIVING_KEYS.get(event.code);
        if (!action) return;
        this.keys.delete(action);
    }

    onBlur() {
        this.clear();
    }

    onPointerDown(event) {
        if (!this.enabled) return;
        const button = event.currentTarget;
        const action = button?.dataset?.control;
        if (!action) return;
        event.preventDefault();
        this.pointers.set(event.pointerId, action);
        button.classList.add('is-pressed');
        try {
            button.setPointerCapture(event.pointerId);
        } catch {
            // Older WebViews can reject capture; the pointerup path still clears it.
        }
    }

    onPointerUp(event) {
        const action = this.pointers.get(event.pointerId);
        if (!action) return;
        this.pointers.delete(event.pointerId);
        for (const button of document.querySelectorAll(`[data-control="${action}"]`)) {
            const stillHeld = Array.from(this.pointers.values()).includes(action);
            if (!stillHeld) button.classList.remove('is-pressed');
        }
    }

    clear() {
        this.keys.clear();
        this.pointers.clear();
        for (const button of document.querySelectorAll('.touch-button.is-pressed')) {
            button.classList.remove('is-pressed');
        }
    }

    isActive(action) {
        if (this.keys.has(action)) return true;
        for (const pointerAction of this.pointers.values()) {
            if (pointerAction === action) return true;
        }
        return false;
    }

    snapshot() {
        return {
            throttle: this.isActive('throttle') ? 1 : 0,
            brake: this.isActive('brake') ? 1 : 0,
            steer: (this.isActive('right') ? 1 : 0) - (this.isActive('left') ? 1 : 0),
            handbrake: this.isActive('handbrake')
        };
    }
}
