// Touch + keyboard input. Owns its DOM listeners and removes them in destroy().

export class Input {
    constructor(surface, { brakeButton, sprintButton, steerMeter }) {
        this.steer = 0; // -1 (left) .. 1 (right)
        this.brake = false;
        this.sprint = false;
        this.enabled = false;

        this._keys = new Set();
        this._touchSteer = 0;
        this._pointerId = null;
        this._startX = 0;
        this._brakeHeld = false;
        this._sprintHeld = false;
        this._surface = surface;
        this._brakeButton = brakeButton;
        this._sprintButton = sprintButton;

        const listen = (target, type, fn, opts) => {
            if (!target) return;
            target.addEventListener(type, fn, opts);
            this._listeners.push(() => target.removeEventListener(type, fn, opts));
        };
        this._listeners = [];

        // drag anywhere on the canvas or steer meter to steer
        const onPointerDown = e => {
            if (e.cancelable) e.preventDefault();
            if (this._pointerId !== null) return;
            this._pointerId = e.pointerId;
            this._startX = e.clientX;
            this._touchSteer = 0;
            if (e.target && e.target.setPointerCapture) {
                try {
                    e.target.setPointerCapture(e.pointerId);
                } catch (_) {}
            }
        };
        listen(surface, 'pointerdown', onPointerDown, { passive: false });
        listen(surface, 'touchmove', e => {
            if (e.cancelable) e.preventDefault();
        }, { passive: false });
        if (steerMeter) {
            listen(steerMeter, 'pointerdown', onPointerDown, { passive: false });
            listen(steerMeter, 'touchmove', e => {
                if (e.cancelable) e.preventDefault();
            }, { passive: false });
        }
        listen(window, 'pointermove', e => {
            if (e.pointerId !== this._pointerId) return;
            if (e.cancelable) e.preventDefault();
            const range = Math.max(50, window.innerWidth * 0.12);
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
        }, { passive: false });
        const release = e => {
            if (e.pointerId !== this._pointerId) return;
            if (e.cancelable) e.preventDefault();
            if (e.target && e.target.releasePointerCapture) {
                try {
                    e.target.releasePointerCapture(e.pointerId);
                } catch (_) {}
            }
            this._pointerId = null;
            this._touchSteer = 0;
        };
        listen(window, 'pointerup', release, { passive: false });
        listen(window, 'pointercancel', release, { passive: false });

        // Brake button
        listen(brakeButton, 'pointerdown', e => {
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();
            this._brakeHeld = true;
            brakeButton.classList.add('pressed');
            if (e.target && e.target.setPointerCapture) {
                try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
            }
        }, { passive: false });
        const brakeUp = e => {
            if (e && e.cancelable) e.preventDefault();
            if (e && e.target && e.target.releasePointerCapture) {
                try { e.target.releasePointerCapture(e.pointerId); } catch (_) {}
            }
            this._brakeHeld = false;
            brakeButton.classList.remove('pressed');
        };
        listen(brakeButton, 'pointerup', brakeUp, { passive: false });
        listen(brakeButton, 'pointerleave', brakeUp, { passive: false });
        listen(brakeButton, 'pointercancel', brakeUp, { passive: false });

        // Sprint / Pedal button
        if (sprintButton) {
            listen(sprintButton, 'pointerdown', e => {
                if (e.cancelable) e.preventDefault();
                e.stopPropagation();
                this._sprintHeld = true;
                sprintButton.classList.add('pressed');
                if (e.target && e.target.setPointerCapture) {
                    try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
                }
            }, { passive: false });
            const sprintUp = e => {
                if (e && e.cancelable) e.preventDefault();
                if (e && e.target && e.target.releasePointerCapture) {
                    try { e.target.releasePointerCapture(e.pointerId); } catch (_) {}
                }
                this._sprintHeld = false;
                sprintButton.classList.remove('pressed');
            };
            listen(sprintButton, 'pointerup', sprintUp, { passive: false });
            listen(sprintButton, 'pointerleave', sprintUp, { passive: false });
            listen(sprintButton, 'pointercancel', sprintUp, { passive: false });
        }

        listen(window, 'keydown', e => {
            this._keys.add(e.code);
            if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
        });
        listen(window, 'keyup', e => this._keys.delete(e.code));
        listen(window, 'blur', () => {
            this._keys.clear();
            this._pointerId = null;
            this._touchSteer = 0;
            brakeUp();
            this._sprintHeld = false;
            if (sprintButton) sprintButton.classList.remove('pressed');
        });
    }

    update() {
        const k = this._keys;
        const keySteer = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0);
        this.steer = keySteer !== 0 ? keySteer : this._touchSteer;
        this.brake = this._brakeHeld || k.has('ArrowDown') || k.has('KeyS');
        this.sprint = this._sprintHeld || k.has('ShiftLeft') || k.has('ShiftRight') || k.has('KeyW') || k.has('ArrowUp') || k.has('Space');
        if (!this.enabled) {
            this.steer = 0;
            this.brake = false;
            this.sprint = false;
        }
    }

    destroy() {
        this._listeners.forEach(off => off());
        this._listeners = [];
    }
}
