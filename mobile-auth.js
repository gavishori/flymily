(() => {
  'use strict';

  const MOBILE_QUERY = '(max-width: 820px)';
  const EDITOR_DIALOG_IDS = ['expenseModal', 'journalModal'];
  const ALL_DIALOG_IDS = [
    'authModal',
    'tripModal',
    'expenseModal',
    'journalModal',
    'confirmDeleteModal',
    'filterModal',
    'breakdownDialog',
    'unsavedChangesModal',
    'mapSelectModal',
    'tripTodayModal',
    'rowMenuModal',
    'expLocationModal',
    'jrLocationModal',
    'fxDetailsModal'
  ];

  const mq = window.matchMedia ? window.matchMedia(MOBILE_QUERY) : null;
  let overflowScanTimer = 0;
  let lastOverflowScanAt = 0;

  function isMobile(){
    return mq ? mq.matches : window.innerWidth <= 820;
  }

  function px(value){
    return `${Math.max(0, Math.round(value))}px`;
  }

  function getViewport(){
    const vv = window.visualViewport;
    return {
      width: vv ? vv.width : window.innerWidth,
      height: vv ? vv.height : window.innerHeight,
      offsetTop: vv ? vv.offsetTop : 0
    };
  }

  function updateFixedHeaderVars(){
    if (!isMobile()) return;
    const root = document.documentElement;
    const appHeader = document.querySelector('.app > header');
    const actionRail = document.getElementById('mobileOverviewActionRail');
    const headerHeight = appHeader ? appHeader.getBoundingClientRect().height : 0;
    const railHeight = actionRail ? actionRail.getBoundingClientRect().height : 0;
    root.style.setProperty('--mobile-fixed-header-h', px(headerHeight));
    root.style.setProperty('--mobile-fixed-rail-h', px(railHeight));
  }

  function updateViewportVars(){
    const root = document.documentElement;
    const layoutHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const layoutWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const vv = getViewport();
    const keyboardSpace = Math.max(0, layoutHeight - vv.height - vv.offsetTop);
    const editorHeight = isMobile()
      ? Math.max(220, Math.min(layoutHeight * 0.5, Math.max(220, vv.height - 12), 430))
      : Math.min(layoutHeight, 720);

    root.style.setProperty('--mobile-vh', px(vv.height));
    root.style.setProperty('--mobile-vw', px(vv.width || layoutWidth));
    root.style.setProperty('--mobile-keyboard-space', px(keyboardSpace));
    root.style.setProperty('--mobile-editor-height', px(editorHeight));
    document.body.classList.toggle('mobile-ui', isMobile());
    document.body.classList.toggle('mobile-editor-redesign', isMobile());
    document.body.classList.toggle('keyboard-open', keyboardSpace > 80);
    updateFixedHeaderVars();
  }

  function markOpenEditorDialog(){
    const active = EDITOR_DIALOG_IDS.some((id) => document.getElementById(id)?.open);
    document.body.classList.toggle('mobile-editor-open', active && isMobile());
  }

  function normalizeDialog(dialog, opts = {}){
    if (!dialog || !isMobile()) return;
    const resetScroll = opts.resetScroll === true;

    dialog.style.maxWidth = '';
    dialog.style.width = '';
    dialog.style.left = '';
    dialog.style.right = '';
    dialog.style.transform = '';

    if (resetScroll && EDITOR_DIALOG_IDS.includes(dialog.id)) {
      dialog.scrollTop = 0;
      const body = dialog.querySelector('.body');
      if (body) body.scrollTop = 0;
    }
  }

  function normalizeOpenDialogs(){
    updateViewportVars();
    if (isEditingRichText()) {
      markOpenEditorDialog();
      return;
    }
    ALL_DIALOG_IDS.forEach((id) => normalizeDialog(document.getElementById(id)));
    markOpenEditorDialog();
  }

  function isEditingRichText(){
    const active = document.activeElement;
    return !!(active && active.closest && active.closest('#expText, #jrText'));
  }

  function removeHorizontalOverflow(){
    if (!isMobile()) return;
    const now = Date.now();
    if (now - lastOverflowScanAt < 450) return;
    lastOverflowScanAt = now;

    const viewportWidth = document.documentElement.clientWidth || window.innerWidth || 0;
    if (!viewportWidth) return;

    document.querySelectorAll('body *').forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      if (el.closest('dialog[open]') && !el.closest('#expenseModal, #journalModal')) return;

      const rect = el.getBoundingClientRect();
      if (rect.width <= viewportWidth + 1) return;

      const tag = el.tagName.toLowerCase();
      if (['html', 'body', 'script', 'style'].includes(tag)) return;

      el.style.maxWidth = '100%';
      el.style.minWidth = '0';
      if (getComputedStyle(el).overflowX === 'visible') el.style.overflowX = 'hidden';
    });
  }

  function scheduleRemoveHorizontalOverflow(delay = 80){
    if (!isMobile()) return;
    if (overflowScanTimer) window.clearTimeout(overflowScanTimer);
    const run = () => {
      overflowScanTimer = 0;
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(removeHorizontalOverflow, { timeout: 800 });
      } else {
        removeHorizontalOverflow();
      }
    };
    overflowScanTimer = window.setTimeout(run, delay);
  }

  function wireDialogEvents(){
    ALL_DIALOG_IDS.forEach((id) => {
      const dialog = document.getElementById(id);
      if (!dialog || dialog.dataset.mobileAuthWired) return;
      dialog.dataset.mobileAuthWired = '1';
      dialog.addEventListener('close', () => setTimeout(normalizeOpenDialogs, 0));
      dialog.addEventListener('cancel', () => setTimeout(normalizeOpenDialogs, 0));
    });
  }

  function wireEditorFocus(){
    ['expText', 'jrText', 'expTitle', 'jrTitle', 'expAmount', 'expDate', 'expTime', 'jrDate', 'jrTime'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el || el.dataset.mobileKeyboardWired) return;
      el.dataset.mobileKeyboardWired = '1';
      el.addEventListener('focus', () => {
        updateViewportVars();
        if (!el.closest('#expText, #jrText')) normalizeDialog(el.closest('dialog'));
      }, { passive: true });
      el.addEventListener('blur', () => setTimeout(normalizeOpenDialogs, 80), { passive: true });
    });
  }

  function keepActiveEditorCaretVisible(){
    if (!isMobile()) return;
    const editor = document.activeElement;
    if (!editor || !editor.matches?.('#expText, #jrText')) return;
    const sel = window.getSelection?.();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    const editorRect = editor.getBoundingClientRect();
    let caretRect = range.getBoundingClientRect();
    if (!caretRect || (!caretRect.height && !caretRect.width)) {
      const clone = range.cloneRange();
      const marker = document.createElement('span');
      marker.textContent = '\u200b';
      marker.style.cssText = 'display:inline-block;width:1px;height:1em;overflow:hidden;';
      clone.insertNode(marker);
      caretRect = marker.getBoundingClientRect();
      marker.remove();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    const bottomSlack = 84;
    if (caretRect.bottom > editorRect.bottom - bottomSlack) {
      editor.scrollTop += caretRect.bottom - (editorRect.bottom - bottomSlack);
    } else if (caretRect.top < editorRect.top + 18) {
      editor.scrollTop -= (editorRect.top + 18) - caretRect.top;
    }
  }

  function wireRichTextCaretScroll(){
    ['expText'].forEach((id) => {
      const editor = document.getElementById(id);
      if (!editor || editor.dataset.mobileCaretScrollWired) return;
      editor.dataset.mobileCaretScrollWired = '1';
      const schedule = () => requestAnimationFrame(keepActiveEditorCaretVisible);
      ['focus', 'click', 'keyup', 'input', 'touchend'].forEach((eventName) => {
        editor.addEventListener(eventName, schedule, { passive: true });
      });
    });
  }

  function patchShowModal(){
    if (HTMLDialogElement.prototype.__mobileAuthPatched) return;
    HTMLDialogElement.prototype.__mobileAuthPatched = true;

    const original = HTMLDialogElement.prototype.showModal;
    HTMLDialogElement.prototype.showModal = function patchedShowModal(){
      const result = original.apply(this, arguments);
      requestAnimationFrame(() => {
        normalizeDialog(this, { resetScroll: true });
        normalizeOpenDialogs();
        scheduleRemoveHorizontalOverflow(120);
      });
      return result;
    };
  }

  function boot(){
    updateViewportVars();
    wireDialogEvents();
    wireEditorFocus();
    wireRichTextCaretScroll();
    patchShowModal();
    normalizeOpenDialogs();
    scheduleRemoveHorizontalOverflow(300);

    const refresh = () => {
      updateViewportVars();
      normalizeOpenDialogs();
      scheduleRemoveHorizontalOverflow(120);
    };

    window.addEventListener('resize', refresh, { passive: true });
    window.addEventListener('orientationchange', () => setTimeout(refresh, 120), { passive: true });
    window.addEventListener('pageshow', () => setTimeout(refresh, 0), { passive: true });

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', refresh, { passive: true });
      window.visualViewport.addEventListener('scroll', refresh, { passive: true });
    }

    if (mq) {
      const onChange = () => setTimeout(refresh, 0);
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else mq.addListener(onChange);
    }

    const observer = new MutationObserver(() => {
      wireDialogEvents();
      wireEditorFocus();
      wireRichTextCaretScroll();
      normalizeOpenDialogs();
      scheduleRemoveHorizontalOverflow(180);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
