// Studio admin helpers: confirm dialogs, image previews, clickable inbox rows.
(function () {
  // Confirm before destructive actions
  document.querySelectorAll('form[data-confirm]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      if (!window.confirm(form.dataset.confirm)) e.preventDefault();
    });
  });
  // Buttons that submit a form elsewhere (form="id") — confirm there too
  document.querySelectorAll('button[form]').forEach((btn) => {
    const target = document.getElementById(btn.getAttribute('form'));
    if (target && target.dataset.confirm) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (window.confirm(target.dataset.confirm)) target.submit();
      });
    }
  });

  // Show / hide toggle on every password field
  document.querySelectorAll('input[type=password]').forEach((input) => {
    const wrap = document.createElement('span');
    wrap.className = 'adm-pw';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'adm-pw-toggle';
    btn.textContent = 'Show';
    btn.setAttribute('aria-label', 'Show password');
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Hide' : 'Show';
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      btn.setAttribute('aria-pressed', String(show));
      input.focus();
    });
    wrap.appendChild(btn);
  });

  // Image previews (+ optional caption fields for new uploads)
  document.querySelectorAll('input[type=file][data-preview]').forEach((input) => {
    const drop = input.closest('.adm-drop');
    const box = drop && drop.parentElement.querySelector('.adm-previews');
    if (!box) return;
    input.addEventListener('change', () => {
      box.innerHTML = '';
      Array.from(input.files).forEach((file) => {
        const fig = document.createElement('figure');
        const img = document.createElement('img');
        img.alt = '';
        img.src = URL.createObjectURL(file);
        const cap = document.createElement('figcaption');
        cap.textContent = file.name;
        fig.append(img, cap);
        if (input.hasAttribute('data-captions')) {
          const ta = document.createElement('textarea');
          ta.name = 'new_caption';
          ta.rows = 2;
          ta.placeholder = 'Caption (optional)';
          fig.append(ta);
        }
        box.append(fig);
      });
      const label = drop.querySelector('span');
      if (label && input.files.length) label.innerHTML = '<b>' + input.files.length + ' file(s) selected</b> — click to change';
    });
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.add('is-over')));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('is-over')));
  });

  // Clickable inbox rows
  document.querySelectorAll('tr[data-href]').forEach((tr) => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('a, button')) return;
      window.location.href = tr.dataset.href;
    });
  });

  // Warn about unsaved changes on long forms
  const form = document.querySelector('.adm-form');
  if (form) {
    let dirty = false;
    form.addEventListener('input', () => { dirty = true; });
    form.addEventListener('submit', () => { dirty = false; });
    window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  }
})();
