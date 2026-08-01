/* DISEC Research Wiki — offline image fallback.
   Scraped source documents embed remote images (Wikimedia, UN, etc.)
   that cannot load when the site is used offline. Any image that fails
   is replaced with a neutral placeholder instead of a broken icon. */
(function () {
  'use strict';

  var FALLBACK = 'Image unavailable offline';
  var PROCESSED = 'data-disec-img-fallback';

  function placeholder(img) {
    if (img.getAttribute(PROCESSED)) return;
    img.setAttribute(PROCESSED, 'true');
    var box = document.createElement('span');
    box.className = 'disec-img-fallback';
    box.textContent = FALLBACK;
    if (img.alt && img.alt.trim()) box.textContent = '[' + img.alt.trim() + '] — ' + FALLBACK;
    if (img.parentNode) img.parentNode.replaceChild(box, img);
  }

  function watch(img) {
    if (img.complete && img.naturalWidth === 0 && (img.src || img.getAttribute('src'))) {
      placeholder(img);
    } else {
      img.addEventListener('error', function () { placeholder(img); }, { once: true });
    }
  }

  function scan() {
    var imgs = document.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) watch(imgs[i]);
  }

  function start() {
    scan();
    var mo = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var added = mutations[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          if (added[j].nodeType === 1) {
            var imgs = added[j].querySelectorAll ? added[j].querySelectorAll('img') : [];
            for (var k = 0; k < imgs.length; k++) watch(imgs[k]);
            if (added[j].tagName === 'IMG') watch(added[j]);
          }
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
