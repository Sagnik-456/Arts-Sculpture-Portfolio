/* Public site behaviour — vanilla, progressive enhancement only.
   Everything works as plain links/forms without this file. */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }

  /* ---------- scroll reveal ---------- */
  function initReveal() {
    var els = $$('[data-reveal]');
    if (!els.length) return;
    if (!('IntersectionObserver' in window) || reduceMotion) return; // content stays visible
    root.classList.add('js');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    els.forEach(function (el) {
      // Anything already on screen at load is shown immediately (no flash-hide).
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) el.classList.add('is-in');
      io.observe(el);
    });
  }

  /* ---------- "Works" dropdown: close on outside click / Esc ---------- */
  function initDropdowns() {
    var dds = $$('[data-dropdown]');
    if (!dds.length) return;
    doc.addEventListener('click', function (e) {
      dds.forEach(function (d) { if (d.open && !d.contains(e.target)) d.open = false; });
    });
    doc.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      dds.forEach(function (d) {
        if (d.open) { d.open = false; var s = $('summary', d); if (s) s.focus(); }
      });
    });
  }

  /* ---------- horizontal rows: prev / next ---------- */
  function initRows() {
    $$('[data-row]').forEach(function (row) {
      var track = $('[data-row-track]', row);
      var wrap = $('.row__arrows', row);
      var prev = $('[data-row-prev]', row);
      var next = $('[data-row-next]', row);
      if (!track || !wrap || !prev || !next) return;

      function update() {
        var max = track.scrollWidth - track.clientWidth;
        var overflow = max > 4;
        wrap.hidden = !overflow;
        prev.disabled = track.scrollLeft <= 4;
        next.disabled = track.scrollLeft >= max - 4;
      }
      function go(dir) {
        var step = Math.max(track.clientWidth * 0.8, 240);
        track.scrollBy({ left: dir * step, behavior: reduceMotion ? 'auto' : 'smooth' });
      }
      prev.addEventListener('click', function () { go(-1); });
      next.addEventListener('click', function () { go(1); });
      track.addEventListener('scroll', throttle(update, 80), { passive: true });
      window.addEventListener('resize', throttle(update, 150));
      // images load lazily and change scrollWidth
      $$('img', track).forEach(function (img) { if (!img.complete) img.addEventListener('load', update, { once: true }); });
      update();
    });
  }

  function throttle(fn, ms) {
    var t = null;
    return function () {
      if (t) return;
      t = setTimeout(function () { t = null; fn(); }, ms);
    };
  }

  /* ---------- work gallery: thumbnail swap + lightbox ---------- */
  function initGallery() {
    var gal = $('[data-gallery]');
    if (!gal) return;
    var stage = $('[data-stage]', gal);
    var stageImg = $('[data-stage-img]', gal);
    var cap = $('[data-stage-cap]', gal);
    var thumbs = $$('[data-thumb]', gal);
    if (!stage || !stageImg || !thumbs.length) return;

    var items = thumbs.map(function (t) {
      return { md: t.getAttribute('data-md'), lg: t.getAttribute('data-lg'), w: t.getAttribute('data-w'), h: t.getAttribute('data-h'), caption: t.getAttribute('data-caption') || '' };
    });
    var current = 0;
    var title = stageImg.getAttribute('alt') || '';

    function show(i) {
      current = (i + items.length) % items.length;
      var it = items[current];
      stageImg.src = it.lg;
      stageImg.srcset = it.md + ' 1100w, ' + it.lg + ' 2000w';
      if (it.w && it.h) { stageImg.width = it.w; stageImg.height = it.h; }
      stage.href = it.lg;
      stage.setAttribute('data-index', String(current));
      if (cap) { cap.textContent = it.caption; cap.hidden = !it.caption; }
      thumbs.forEach(function (t, k) {
        var on = k === current;
        t.classList.toggle('is-active', on);
        if (t.tagName === 'A') { if (on) t.setAttribute('aria-current', 'true'); else t.removeAttribute('aria-current'); }
      });
    }

    thumbs.forEach(function (t, k) {
      if (t.tagName !== 'A') return;
      t.addEventListener('click', function (e) { e.preventDefault(); show(k); });
    });

    /* lightbox */
    var lb = null, lbImg, lbCap, lbCount, lbPrev, lbNext, lastFocus = null;

    function icon(d) {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
    function build() {
      lb = doc.createElement('div');
      lb.className = 'lb';
      lb.hidden = true;
      lb.setAttribute('role', 'dialog');
      lb.setAttribute('aria-modal', 'true');
      lb.setAttribute('aria-label', 'Image viewer: ' + title);
      lb.innerHTML =
        '<div class="lb__bar"><span class="lb__count" aria-live="polite"></span><span class="lb__title"></span>' +
        '<button class="lb__btn lb__btn--close" type="button" data-lb-close aria-label="Close viewer">' + icon('M6 6l12 12M18 6L6 18') + '</button></div>' +
        '<div class="lb__stage"><img class="lb__img" alt="">' +
        '<button class="lb__btn lb__prev" type="button" aria-label="Previous image">' + icon('M15 5l-7 7 7 7') + '</button>' +
        '<button class="lb__btn lb__next" type="button" aria-label="Next image">' + icon('M9 5l7 7-7 7') + '</button></div>' +
        '<p class="lb__cap"></p>';
      doc.body.appendChild(lb);
      lbImg = $('.lb__img', lb);
      lbCap = $('.lb__cap', lb);
      lbCount = $('.lb__count', lb);
      lbPrev = $('.lb__prev', lb);
      lbNext = $('.lb__next', lb);
      $('.lb__title', lb).textContent = title;
      lbImg.alt = title;
      $('[data-lb-close]', lb).addEventListener('click', close);
      lbPrev.addEventListener('click', function () { step(-1); });
      lbNext.addEventListener('click', function () { step(1); });
      lb.addEventListener('click', function (e) { if (e.target === lb || e.target.classList.contains('lb__stage')) close(); });
      lb.addEventListener('keydown', onKey);
      // swipe
      var x0 = null;
      lb.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
      lb.addEventListener('touchend', function (e) {
        if (x0 === null) return;
        var dx = e.changedTouches[0].clientX - x0;
        if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
        x0 = null;
      });
    }
    function render() {
      var it = items[current];
      lbImg.src = it.lg;
      lbCap.textContent = it.caption;
      var many = items.length > 1;
      lbCount.textContent = many ? (current + 1) + ' / ' + items.length : '';
      lbPrev.hidden = !many;
      lbNext.hidden = !many;
    }
    function step(d) { show(current + d); render(); }
    function open() {
      if (!lb) build();
      lastFocus = doc.activeElement;
      render();
      lb.hidden = false;
      doc.body.classList.add('lb-open');
      $('[data-lb-close]', lb).focus();
    }
    function close() {
      if (!lb || lb.hidden) return;
      lb.hidden = true;
      doc.body.classList.remove('lb-open');
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowLeft' && items.length > 1) step(-1);
      else if (e.key === 'ArrowRight' && items.length > 1) step(1);
      else if (e.key === 'Tab') {
        var f = $$('button:not([hidden])', lb);
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    stage.addEventListener('click', function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // let "open in new tab" work
      e.preventDefault();
      open();
    });
  }

  /* ---------- copy link ---------- */
  function initShare() {
    var btn = $('[data-share]');
    if (!btn) return;
    var label = $('[data-share-label]', btn);
    var canShare = navigator.share && window.matchMedia('(pointer: coarse)').matches;
    if (!canShare && !(navigator.clipboard && window.isSecureContext)) return;
    if (canShare && label) label.textContent = 'Share';
    btn.hidden = false;
    btn.addEventListener('click', function () {
      var url = location.href.split('#')[0];
      if (canShare) {
        navigator.share({ title: doc.title, url: url }).catch(function () {});
        return;
      }
      navigator.clipboard.writeText(url).then(function () {
        if (!label) return;
        label.textContent = 'Link copied';
        setTimeout(function () { label.textContent = 'Copy link'; }, 2200);
      });
    });
  }

  /* ---------- contact: focus the error summary ---------- */
  function initFormErrors() {
    var alertBox = $('[data-focus-on-load]');
    if (alertBox) alertBox.focus();
  }

  /* ---------- keep active category chip in view on mobile ---------- */
  function initActiveChip() {
    $$('.chips__list .is-active, .side__list .is-active').forEach(function (el) {
      var list = el.closest('ul');
      if (!list || list.scrollWidth <= list.clientWidth) return;
      list.scrollLeft += el.getBoundingClientRect().left - list.getBoundingClientRect().left - 16;
    });
  }

  function ready(fn) {
    if (doc.readyState !== 'loading') fn();
    else doc.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    initReveal();
    initDropdowns();
    initRows();
    initGallery();
    initShare();
    initFormErrors();
    initActiveChip();
  });
})();
