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

/*
 * RegExp compatibility. Shared code uses Unicode property escapes (\p{L},
 * Chromium 64+) and lookbehind (Chromium 62+), which make `new RegExp` throw on
 * Chromium 53 and stop the whole bundle at load time. When the native
 * constructor throws, retry with \p{..} expanded to explicit ranges
 * (approximate: Latin, Greek, Cyrillic, Hebrew, Arabic, Thai, kana, CJK,
 * Hangul) and lookbehind groups removed (so those patterns match more
 * loosely on this TV rather than crashing the app).
 */
const NativeRegExp = RegExp;
const UNICODE_SETS: Record<string, string> = {
    L:
        'A-Za-z\\u00AA\\u00B5\\u00BA\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02C1' +
        '\\u0370-\\u0373\\u0376\\u0377\\u037B-\\u037D\\u037F\\u0386\\u0388-\\u03FF' +
        '\\u0400-\\u0481\\u048A-\\u052F\\u0531-\\u0556\\u0561-\\u0587\\u05D0-\\u05EA' +
        '\\u0620-\\u064A\\u0671-\\u06D3\\u0904-\\u0939\\u0E01-\\u0E30\\u1E00-\\u1FFF' +
        '\\u3041-\\u3096\\u30A1-\\u30FA\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uAC00-\\uD7A3',
    Ll: 'a-z\\u00B5\\u00DF-\\u00F6\\u00F8-\\u00FF\\u0250-\\u02AF\\u03AC-\\u03CE\\u0430-\\u045F',
    Lu: 'A-Z\\u00C0-\\u00D6\\u00D8-\\u00DE\\u0386\\u0388-\\u038F\\u0391-\\u03AB\\u0400-\\u042F',
    N: '0-9\\u00B2\\u00B3\\u00B9\\u00BC-\\u00BE\\u0660-\\u0669\\u06F0-\\u06F9\\u0966-\\u096F\\uFF10-\\uFF19',
    M: '\\u0300-\\u036F\\u0483-\\u0489\\u0591-\\u05BD\\u064B-\\u065F\\u0E31\\u0E34-\\u0E3A\\u1AB0-\\u1AFF\\u1DC0-\\u1DFF\\u20D0-\\u20FF\\uFE20-\\uFE2F',
};

function expandUnicodeProperties(src: string): string {
    let out = '';
    let inClass = false;
    for (let i = 0; i < src.length; i++) {
        const c = src.charAt(i);
        if (c === '\\') {
            const n = src.charAt(i + 1);
            if ((n === 'p' || n === 'P') && src.charAt(i + 2) === '{') {
                const end = src.indexOf('}', i + 3);
                const set = end > 0 ? UNICODE_SETS[src.slice(i + 3, end)] : '';
                if (set) {
                    if (inClass) out += n === 'p' ? set : '';
                    else out += (n === 'p' ? '[' : '[^') + set + ']';
                    i = end;
                    continue;
                }
            }
            out += c + n;
            i++;
            continue;
        }
        if (c === '[' && !inClass) inClass = true;
        else if (c === ']' && inClass) inClass = false;
        out += c;
    }
    return out;
}

function stripLookbehind(src: string): string {
    let out = '';
    let inClass = false;
    for (let i = 0; i < src.length; i++) {
        const c = src.charAt(i);
        if (c === '\\') {
            out += c + src.charAt(i + 1);
            i++;
            continue;
        }
        if (inClass) {
            if (c === ']') inClass = false;
            out += c;
            continue;
        }
        if (c === '[') {
            inClass = true;
            out += c;
            continue;
        }
        if (
            c === '(' &&
            src.charAt(i + 1) === '?' &&
            src.charAt(i + 2) === '<' &&
            (src.charAt(i + 3) === '!' || src.charAt(i + 3) === '=')
        ) {
            let depth = 1;
            let cls = false;
            let j = i + 4;
            for (; j < src.length && depth > 0; j++) {
                const d = src.charAt(j);
                if (d === '\\') j++;
                else if (cls) cls = d !== ']';
                else if (d === '[') cls = true;
                else if (d === '(') depth++;
                else if (d === ')') depth--;
            }
            i = j - 1;
            continue;
        }
        out += c;
    }
    return out;
}

function SafeRegExp(pattern: any, flags?: string): RegExp {
    try {
        return new NativeRegExp(pattern, flags);
    } catch (error) {
        const isRegExp = pattern instanceof NativeRegExp;
        const source = isRegExp ? pattern.source : String(pattern);
        const f = flags === undefined && isRegExp ? pattern.flags : flags;
        try {
            return new NativeRegExp(
                stripLookbehind(expandUnicodeProperties(source)),
                f
            );
        } catch (_retryError) {
            throw error;
        }
    }
}
(SafeRegExp as any).prototype = NativeRegExp.prototype;
w.RegExp = SafeRegExp;

export {};
