// Shared by the landing page and self-hosting guide. Older manifests only
// contain version/date/sizeBytes; newer releases also include hashes and a DMG.
(function () {
    const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
    const hashPattern = /^[a-f0-9]{64}$/i;
    const validSize = value => Number.isSafeInteger(value) && value > 0;
    const sizeLabel = value => validSize(value) ? ` · ${Math.ceil(value / (1024 * 1024))} MB` : '';
    const downloadUrl = (version, extension = 'zip') => `/builds/homegames-${encodeURIComponent(version)}.${extension}`;

    function readManifest(manifest) {
        if (!manifest || !Array.isArray(manifest.builds)) return null;
        const seen = new Set();
        const builds = manifest.builds.filter(build => {
            if (!build || typeof build.version !== 'string' || !versionPattern.test(build.version) || seen.has(build.version)) return false;
            seen.add(build.version);
            return true;
        });
        const latest = builds.find(build => build.version === manifest.latest);
        // Never substitute an arbitrary older release for a broken latest entry.
        return latest ? { latest, older: builds.filter(build => build !== latest) } : null;
    }

    function hasDmg(build) {
        return build.dmg && validSize(build.dmg.sizeBytes) && hashPattern.test(build.dmg.sha256 || '');
    }

    async function renderDownloads(document, fetchManifest, location) {
        const status = document.getElementById('download-status');
        let releases;
        try {
            const response = await fetchManifest('/builds/manifest.json', { cache: 'no-cache' });
            if (!response.ok) throw new Error('Manifest unavailable');
            releases = readManifest(await response.json());
            if (!releases) throw new Error('No current release');
        } catch (error) {
            if (status) status.textContent = 'Version information is temporarily unavailable. The ZIP link above still points to the latest download.';
            return;
        }

        const { latest, older } = releases;
        const hero = document.getElementById('host-download-btn');
        if (hero) {
            hero.href = downloadUrl(latest.version);
            hero.textContent = `⤓ Download v${latest.version}${sizeLabel(latest.sizeBytes)}`;
        }
        const button = document.getElementById('download-btn');
        if (button) {
            button.href = downloadUrl(latest.version);
            button.textContent = `⤓ Download Homegames v${latest.version} ZIP${sizeLabel(latest.sizeBytes)}`;
        }
        if (status) status.textContent = typeof latest.date === 'string' ? `Released ${latest.date}.` : '';

        const macButton = document.getElementById('mac-download-btn');
        if (macButton && hasDmg(latest)) {
            macButton.href = downloadUrl(latest.version, 'dmg');
            macButton.textContent = `⤓ Download for macOS v${latest.version}${sizeLabel(latest.dmg.sizeBytes)}`;
            macButton.style.display = '';
        }
        const checksums = document.getElementById('download-checksums');
        if (checksums && hashPattern.test(latest.sha256 || '')) {
            const value = document.getElementById('download-checksums-value');
            value.textContent = `ZIP SHA-256: ${latest.sha256}` + (hasDmg(latest) ? `\nDMG SHA-256: ${latest.dmg.sha256}` : '');
            checksums.hidden = false;
        }

        const list = document.getElementById('old-builds-list');
        if (list && older.length) {
            list.textContent = '';
            for (const build of older) {
                const item = document.createElement('li');
                const link = document.createElement('a');
                link.href = downloadUrl(build.version);
                link.textContent = `v${build.version} ZIP${sizeLabel(build.sizeBytes)}`;
                item.appendChild(link);
                if (hasDmg(build)) {
                    const mac = document.createElement('a');
                    mac.href = downloadUrl(build.version, 'dmg');
                    mac.textContent = `macOS DMG${sizeLabel(build.dmg.sizeBytes)}`;
                    item.append(' · ');
                    item.appendChild(mac);
                }
                if (typeof build.date === 'string') item.append(` — ${build.date}`);
                list.appendChild(item);
            }
            const section = document.getElementById('old-builds');
            section.style.display = '';
            if (location.hash === '#old-builds') section.scrollIntoView();
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { readManifest, renderDownloads, downloadUrl, hasDmg };
    } else {
        renderDownloads(document, window.fetch.bind(window), window.location);
    }
})();
