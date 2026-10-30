/**
 * Minimal M3U parser for the direct (no home server) mode. It produces the same
 * item shape the home server's `/parse` route returns, limited to the fields the
 * TV reads: name, url, tvg.*, group.title, radio. Kept free of imports and of
 * syntax/APIs newer than ES2016 so it runs on Chromium 53 (webOS 4).
 */
export interface DirectM3uItem {
    name: string;
    url: string;
    tvg: { id: string; name: string; url: string; logo: string; rec: string };
    group: { title: string };
    http: { referrer: string; 'user-agent': string };
    radio: string;
    raw: string;
}

interface Pending {
    name: string;
    attrs: Record<string, string>;
    group: string;
    referrer: string;
    userAgent: string;
}

/** Split `-1 tvg-id="x" group-title="a,b",Name` at the first unquoted comma. */
function splitExtinf(body: string): [string, string] {
    let quoted = false;
    for (let i = 0; i < body.length; i++) {
        const c = body.charAt(i);
        if (c === '"') quoted = !quoted;
        else if (c === ',' && !quoted) return [body.slice(0, i), body.slice(i + 1)];
    }
    return [body, ''];
}

function parseExtinf(line: string): Pending {
    const [head, name] = splitExtinf(line.slice('#EXTINF:'.length));
    const attrs: Record<string, string> = {};
    const pattern = /([A-Za-z0-9_-]+)="([^"]*)"/g;
    let match = pattern.exec(head);
    while (match) {
        attrs[match[1].toLowerCase()] = match[2];
        match = pattern.exec(head);
    }
    return {
        name: name.trim() || attrs['tvg-name'] || '',
        attrs,
        group: '',
        referrer: '',
        userAgent: '',
    };
}

function build(pending: Pending, url: string): DirectM3uItem {
    const a = pending.attrs;
    return {
        name: pending.name,
        url,
        tvg: {
            id: a['tvg-id'] || '',
            name: a['tvg-name'] || '',
            url: a['tvg-url'] || '',
            logo: a['tvg-logo'] || '',
            rec: a['tvg-rec'] || '',
        },
        group: { title: a['group-title'] || pending.group },
        http: {
            referrer: pending.referrer,
            'user-agent': pending.userAgent,
        },
        radio: a['radio'] || '',
        raw: '',
    };
}

export function parseM3u(content: string): { items: DirectM3uItem[] } {
    const items: DirectM3uItem[] = [];
    let pending: Pending | undefined;
    const lines = content.replace(/^﻿/, '').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        if (line.indexOf('#EXTINF:') === 0) {
            pending = parseExtinf(line);
        } else if (line.charAt(0) === '#') {
            if (!pending) continue;
            if (line.indexOf('#EXTGRP:') === 0 && !pending.group)
                pending.group = line.slice('#EXTGRP:'.length).trim();
            else if (line.indexOf('#EXTVLCOPT:http-referrer=') === 0)
                pending.referrer = line.slice(
                    '#EXTVLCOPT:http-referrer='.length
                );
            else if (line.indexOf('#EXTVLCOPT:http-user-agent=') === 0)
                pending.userAgent = line.slice(
                    '#EXTVLCOPT:http-user-agent='.length
                );
        } else if (pending) {
            items.push(build(pending, line));
            pending = undefined;
        }
    }
    return { items };
}
