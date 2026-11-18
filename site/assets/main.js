/* MaikNote for Windows site — based on Aprilming/maiknote. */
(() => {
  const REPO = '1578393930/MaikNote-for-Windows';
  const CACHE_KEY = 'mn-windows-release';

  /* ---------- theme ---------- */
  const root = document.documentElement;
  const stored = localStorage.getItem('mn-theme');
  root.dataset.theme = stored || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

  document.getElementById('themeToggle')?.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    localStorage.setItem('mn-theme', next);
  });

  /* ---------- sticky nav border ---------- */
  const nav = document.getElementById('nav');
  const onScroll = () => nav?.classList.toggle('is-stuck', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- copy to clipboard ---------- */
  document.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const target = document.querySelector(btn.dataset.copy);
      if (!target) return;
      const text = target.textContent;
      let ok = false;
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      }
      const label = btn.textContent;
      btn.textContent = ok ? '已复制' : '复制失败';
      setTimeout(() => { btn.textContent = label; }, 1600);
    });
  });

  /* ---------- resolve latest release assets ---------- */
  // 版本号只从 GitHub Releases 读，HTML 里不写死任何版本；拿到之前整段隐藏。
  const setVersion = (v) => {
    if (!v) return;
    document.querySelectorAll('[data-version]').forEach((el) => { el.textContent = v; });
    document.querySelectorAll('[data-ver-wrap]').forEach((el) => { el.hidden = false; });
  };

  const applyAsset = (kind, url) => {
    document.querySelectorAll('[data-download="' + kind + '"]').forEach((a) => {
      a.href = url;
    });
  };

  const resolveRelease = async () => {
    let release = null;
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      if (cached && Date.now() - cached.savedAt < 10 * 60 * 1000) release = cached.release;
    } catch { /* ignore bad cache */ }

    if (!release) {
      try {
        const res = await fetch('https://api.github.com/repos/' + REPO + '/releases/latest', {
          headers: { Accept: 'application/vnd.github+json' },
        });
        if (res.ok) {
          release = await res.json();
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), release }));
        }
      } catch { /* offline or rate limited: keep the release page links */ }
    }

    if (!release || release.draft || release.prerelease || !Array.isArray(release.assets)) return;
    const version = String(release.tag_name || '').replace(/^v/, '');
    if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) return;

    setVersion(version);
    const applyWindowsAsset = (kind, suffix) => {
      const name = `MaikNote_${version}_x64-${suffix}`;
      const url = `https://github.com/${REPO}/releases/download/${release.tag_name}/${name}`;
      const asset = release.assets.find((a) => a.name === name && a.browser_download_url === url);
      if (asset) applyAsset(kind, url);
    };
    applyWindowsAsset('setup', 'setup.exe');
    applyWindowsAsset('portable', 'portable.zip');
  };

  resolveRelease();

  /* ---------- reveal on scroll ---------- */
  const targets = Array.from(document.querySelectorAll('.idea, .card, .window, .dl-card, .install, .faq details, .key-row'));
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!reduce && 'IntersectionObserver' in window) {
    targets.forEach((el, i) => {
      el.classList.add('reveal');
      el.style.transitionDelay = Math.min(i % 6, 5) * 55 + 'ms';
    });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    targets.forEach((el) => io.observe(el));
  }
})();
