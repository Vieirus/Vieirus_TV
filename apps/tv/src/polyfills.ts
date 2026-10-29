/*
 * Minimal polyfills for webOS 4.x TVs (2018-2019, Chromium 53).
 * Must be the first import of main.tsx. The build target only rewrites syntax,
 * not missing browser APIs, so these are added at runtime when absent.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
const w = window as any;

if (!Object.entries) {
    Object.entries = function (o: any) {
        return Object.keys(o).map((k) => [k, o[k]]);
    } as any;
}

if (!Object.values) {
    Object.values = function (o: any) {
        return Object.keys(o).map((k) => o[k]);
    } as any;
}

if (!String.prototype.padStart) {
    String.prototype.padStart = function (len: number, fill?: string) {
        let s = String(this);
        const pad = fill === undefined ? ' ' : String(fill);
        if (!pad) return s;
        while (s.length < len) s = pad + s;
        return s.length > len && pad.length > 1
            ? s.slice(s.length - len)
            : s;
    };
}

if (!String.prototype.padEnd) {
    String.prototype.padEnd = function (len: number, fill?: string) {
        let s = String(this);
        const pad = fill === undefined ? ' ' : String(fill);
        if (!pad) return s;
        while (s.length < len) s += pad;
        return s.slice(0, Math.max(len, String(this).length));
    };
}

if (!(Promise.prototype as any).finally) {
    (Promise.prototype as any).finally = function (cb: () => unknown) {
        const P = (this.constructor || Promise) as PromiseConstructor;
        return this.then(
            (v: unknown) => P.resolve(cb()).then(() => v),
            (e: unknown) =>
                P.resolve(cb()).then(() => {
                    throw e;
                })
        );
    };
}

// AbortController: Chromium 66+. This version tracks `aborted` and listeners
// so the app's own logic works; it cannot cancel an in-flight fetch on 53.
if (!w.AbortController) {
    class Signal {
        aborted = false;
        onabort: ((e: unknown) => void) | null = null;
        private listeners: Array<(e: unknown) => void> = [];
        addEventListener(type: string, fn: (e: unknown) => void) {
            if (type === 'abort') this.listeners.push(fn);
        }
        removeEventListener(type: string, fn: (e: unknown) => void) {
            if (type === 'abort')
                this.listeners = this.listeners.filter((l) => l !== fn);
        }
        dispatch() {
            const event = { type: 'abort', target: this };
            if (this.onabort) this.onabort(event);
            this.listeners.slice().forEach((l) => l(event));
        }
    }
    class Controller {
        signal = new Signal();
        abort() {
            if (this.signal.aborted) return;
            this.signal.aborted = true;
            this.signal.dispatch();
        }
    }
    w.AbortController = Controller;
    w.AbortSignal = Signal;
}

export {};
