// Touch + keyboard input. Owns its DOM listeners and removes them in destroy().

export class Input {
    constructor(surface, { brakeButton, bellButton, onBell }) {
        this.steer = 0; // -1 (left) .. 1 (right)
        this.brake = false;
        this.enabled = false;

        this._keys = new Set();
        this._touchSteer = 0;
        this._pointerId = null;
        this._startX = 0;
        this._brakeHeld = false;
        this._onBell = onBell;
        this._surface = surface;
        this._brakeButton = brakeButton;
        this._bellButton = bellButton;

        const listen = (target, type, fn, opts) => {
            target.addEventListener(type, fn, opts);
            this._listeners.push(() => target.removeEventListener(type, fn, opts));
        };
        this._listeners = [];

        // drag anywhere on the canvas to steer (relative to where the finger went down)
        listen(surface, 'pointerdown', e => {
            if (this._pointerId !== null) return;
            this._pointerId = e.pointerId;
            this._startX = e.clientX;
            this._touchSteer = 0;
        });
        listen(window, 'pointermove', e => {
            if (e.pointerId !== this._pointerId) return;
            const range = Math.max(60, window.innerWidth * 0.16);
            let dx = (e.clientX - this._startX) / range;
            // let the anchor follow when dragging past the range, so reversing feels instant
            if (dx > 1) {
                this._startX = e.clientX - range;
                dx = 1;
            } else if (dx < -1) {
                this._startX = e.clientX + range;
                dx = -1;
            }
            this._touchSteer = dx;
        });
        const release = e => {
            if (e.pointerId !== this._pointerId) return;
            this._pointerId = null;
            this._touchSteer = 0;
        };
        listen(window, 'pointerup', release);
        listen(window, 'pointercancel', release);

        listen(brakeButton, 'pointerdown', e => {
            e.stopPropagation();
            this._brakeHeld = true;
            brakeButton.classList.add('pressed');
        });
        const brakeUp = () => {
            this._brakeHeld = false;
            brakeButton.classList.remove('pressed');
        };
        listen(brakeButton, 'pointerup', brakeUp);
        listen(brakeButton, 'pointerleave', brakeUp);
        listen(brakeButton, 'pointercancel', brakeUp);

        listen(bellButton, 'pointerdown', e => {
            e.stopPropagation();
            if (this.enabled) this._onBell();
        });

        listen(window, 'keydown', e => {
            this._keys.add(e.code);
            if (e.code === 'Space') {
                e.preventDefault();
                if (!e.repeat && this.enabled) this._onBell();
            }
            if (e.code.startsWith('Arrow')) e.preventDefault();
        });
        listen(window, 'keyup', e => this._keys.delete(e.code));
        listen(window, 'blur', () => {
            this._keys.clear();
            this._pointerId = null;
            this._touchSteer = 0;
            brakeUp();
        });
    }

    update() {
        const k = this._keys;
        const keySteer = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0);
        this.steer = keySteer !== 0 ? keySteer : this._touchSteer;
        this.brake = this._brakeHeld || k.has('ArrowDown') || k.has('KeyS');
        if (!this.enabled) {
            this.steer = 0;
            this.brake = false;
        }
    }

    destroy() {
        this._listeners.forEach(off => off());
        this._listeners = [];
    }
}
