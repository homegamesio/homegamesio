'use strict';

const { zipSync } = require('fflate');
const MARKER = '.homegame/studio-backup.json';
const enc = new TextEncoder(), dec = new TextDecoder('utf-8', { fatal: true });
const fail = () => { throw new Error('Invalid Studio backup ZIP. Keep the original file and try another backup.'); };
const table = Uint32Array.from({ length: 256 }, (_, n) => {
    for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
});
function crc(bytes) {
    let value = 0xffffffff;
    for (const byte of bytes) value = table[(value ^ byte) & 255] ^ (value >>> 8);
    return (value ^ 0xffffffff) >>> 0;
}
function validate(files, portable) {
    const seen = new Set(); let total = 0;
    if (Object.keys(files).length > portable.limits.files) fail();
    for (const [name, bytes] of Object.entries(files)) {
        if (portable.normalizePath(name) !== name || /^\.homegame(?:\/|$)/i.test(name) || seen.has(name.toLowerCase())) fail();
        seen.add(name.toLowerCase());
        if (!(bytes instanceof Uint8Array) || bytes.length > portable.limits.fileBytes || (total += bytes.length) > portable.limits.totalBytes) fail();
    }
    for (const name of seen) {
        const parts = name.split('/');
        while (parts.length > 1) { parts.pop(); if (seen.has(parts.join('/'))) fail(); }
    }
}
function create(record, portable) {
    validate(record.files, portable);
    const entries = Object.assign(Object.create(null), {
        [MARKER]: enc.encode(JSON.stringify({ format: 'homegames-studio-draft', version: 1,
            name: String(record.name).slice(0, 100), activeFile: record.activeFile || null }))
    }, record.files);
    return zipSync(entries, { level: 0, mtime: new Date(2020, 0, 1) });
}
function isBackup(bytes) {
    return bytes.length >= 30 + MARKER.length && bytes[0] === 80 && bytes[1] === 75
        && enc.encode(MARKER).every((byte, index) => bytes[30 + index] === byte);
}
// Draft backups deliberately use stored (uncompressed) ZIP entries. Inspect
// every bound and checksum before restoring; never decompress or execute code.
// Ordinary playable packs continue through PortableProject.importArchive.
function read(bytes, portable) {
    if (!(bytes instanceof Uint8Array) || bytes.length > portable.limits.archiveBytes || !isBackup(bytes)) fail();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const records = [], files = Object.create(null); let at = 0, total = 0;
    while (at + 30 <= bytes.length && view.getUint32(at, true) === 0x04034b50) {
        const flags = view.getUint16(at + 6, true), method = view.getUint16(at + 8, true);
        const size = view.getUint32(at + 22, true), checksum = view.getUint32(at + 14, true);
        const length = view.getUint16(at + 26, true), extra = view.getUint16(at + 28, true), start = at + 30 + length + extra;
        if ((flags & ~2048) || method !== 0 || size !== view.getUint32(at + 18, true)
            || size > portable.limits.fileBytes || (total += size) > portable.limits.totalBytes + 4096
            || start + size > bytes.length || records.length > portable.limits.files) fail();
        const name = dec.decode(bytes.subarray(at + 30, at + 30 + length));
        if (Object.hasOwn(files, name)) fail();
        const data = bytes.subarray(start, start + size);
        if (crc(data) !== checksum) fail();
        files[name] = data.slice(); records.push({ name, at, flags, size, checksum }); at = start + size;
    }
    const directory = at;
    for (const record of records) {
        if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) fail();
        const length = view.getUint16(at + 28, true), extra = view.getUint16(at + 30, true), comment = view.getUint16(at + 32, true);
        if (at + 46 + length + extra + comment > bytes.length
            || view.getUint16(at + 8, true) !== record.flags || view.getUint16(at + 10, true) !== 0
            || view.getUint32(at + 16, true) !== record.checksum || view.getUint32(at + 20, true) !== record.size
            || view.getUint32(at + 24, true) !== record.size || view.getUint32(at + 42, true) !== record.at
            || view.getUint16(at + 34, true) !== 0 || (view.getUint32(at + 38, true) >>> 16 & 0xf000) === 0xa000
            || dec.decode(bytes.subarray(at + 46, at + 46 + length)) !== record.name) fail();
        at += 46 + length + extra + comment;
    }
    if (at + 22 !== bytes.length || view.getUint32(at, true) !== 0x06054b50
        || view.getUint16(at + 4, true) || view.getUint16(at + 6, true) || view.getUint16(at + 20, true)
        || view.getUint16(at + 8, true) !== records.length || view.getUint16(at + 10, true) !== records.length
        || view.getUint32(at + 12, true) !== at - directory || view.getUint32(at + 16, true) !== directory) fail();
    const info = JSON.parse(dec.decode(files[MARKER])); delete files[MARKER];
    if (info?.format !== 'homegames-studio-draft' || info.version !== 1 || typeof info.name !== 'string' || info.name.length > 100) fail();
    validate(files, portable);
    return { files, name: info.name, activeFile: Object.hasOwn(files, info.activeFile) ? info.activeFile : Object.keys(files)[0] };
}
module.exports = { create, read, isBackup };
