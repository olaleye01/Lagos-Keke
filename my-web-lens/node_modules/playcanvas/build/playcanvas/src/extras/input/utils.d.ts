export function isTouchPointer(pointerType: any): boolean;
export function movementState(): {
    down: (event: PointerEvent) => void;
    move: (event: PointerEvent) => number[];
    up: (event: PointerEvent) => void;
};
