/**
 * HUAHUI extras - 参考图粘贴板 + 截图编辑
 * 主体代码源自 jsq/111.html 原版（行 4200-6500），加上一个简化的 buildSnapshotBlob。
 * 以普通 <script> 加载（非 ESM），所有函数挂在 global。
 */

// ============================================================
// 简化版 buildSnapshotBlob - 只处理 2D #main-svg
// ============================================================
function buildSnapshotBlob() {
  var svg = document.getElementById('main-svg');
  if (!svg) return Promise.reject(new Error('INVALID_DIAGRAM'));
  var hasDiagram = !!svg.querySelector('.svg-wall, .svg-guide, .svg-angle-arc, .svg-direction-label');
  var rawText = (svg.textContent || '').replace(/\s+/g, '');
  if (!hasDiagram || !rawText || rawText.indexOf('请输入数据') > -1) {
    return Promise.reject(new Error('INVALID_DIAGRAM'));
  }
  var vbAttr = svg.getAttribute('viewBox') || '0 0 800 600';
  var vp = vbAttr.trim().split(/\s+/).map(Number);
  var minX = vp[0] || 0, minY = vp[1] || 0, w = vp[2] || 800, h = vp[3] || 600;
  var pad = Math.max(w, h) * 0.05;

  var ns = 'http://www.w3.org/2000/svg';
  var exportSvg = document.createElementNS(ns, 'svg');
  exportSvg.setAttribute('xmlns', ns);
  exportSvg.setAttribute('viewBox', [minX - pad, minY - pad, w + pad * 2, h + pad * 2].join(' '));
  exportSvg.setAttribute('width', w + pad * 2);
  exportSvg.setAttribute('height', h + pad * 2);

  var bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('x', minX - pad);
  bg.setAttribute('y', minY - pad);
  bg.setAttribute('width', w + pad * 2);
  bg.setAttribute('height', h + pad * 2);
  bg.setAttribute('fill', '#ffffff');
  exportSvg.appendChild(bg);

  var styleEl = document.createElementNS(ns, 'style');
  styleEl.textContent =
    ".svg-wall{stroke:#1c1714;stroke-width:4;fill:none;stroke-linecap:round;stroke-linejoin:round}" +
    ".svg-guide{stroke:#d61f1f;stroke-width:2.5;fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:4 2;opacity:.95}" +
    ".svg-angle-arc{fill:none;stroke:#9a6b3e;stroke-width:2}" +
    ".svg-text,.svg-guide-text,.svg-angle-text{font-weight:800;font-family:'Inter','SF Mono',monospace;text-anchor:middle;dominant-baseline:middle;paint-order:stroke;stroke:#fff;stroke-width:3.5px}" +
    ".svg-text{fill:#1c1714;font-size:17px}" +
    ".svg-guide-text{fill:#d61f1f;font-size:17px}" +
    ".svg-angle-text{fill:#9a6b3e;font-size:18px}" +
    ".svg-direction-label{fill:#d61f1f;font-weight:800;font-size:22px;font-family:'Inter','PingFang SC',sans-serif;paint-order:stroke;stroke:#fff;stroke-width:4px}";
  exportSvg.appendChild(styleEl);

  Array.prototype.slice.call(svg.childNodes).forEach(function (node) {
    exportSvg.appendChild(node.cloneNode(true));
  });

  var sigInput = document.getElementById('capture-signature');
  var sig = ((sigInput && sigInput.value) || '').trim();
  if (sig) {
    var sigFont = Math.max(w, h) * 0.022;
    var t = document.createElementNS(ns, 'text');
    t.setAttribute('x', minX + w + pad - 20);
    t.setAttribute('y', minY + h + pad - 14);
    t.setAttribute('text-anchor', 'end');
    t.setAttribute('font-size', sigFont);
    t.setAttribute('fill', '#6b7280');
    t.setAttribute('font-weight', '700');
    t.setAttribute('font-family', "'Microsoft YaHei UI','Segoe UI',sans-serif");
    t.textContent = '制图人：' + sig;
    exportSvg.appendChild(t);
  }

  var serialized = new XMLSerializer().serializeToString(exportSvg);
  var svgBlob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + serialized], { type: 'image/svg+xml;charset=utf-8' });
  var url = URL.createObjectURL(svgBlob);

  return new Promise(function (resolve, reject) {
    var img = new Image();
    img.onload = function () {
      var scale = 2;
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round((w + pad * 2) * scale));
      canvas.height = Math.max(1, Math.round((h + pad * 2) * scale));
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(function (b) {
        if (b) resolve(b);
        else reject(new Error('SNAPSHOT_BLOB_EMPTY'));
      }, 'image/png');
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      reject(new Error('SNAPSHOT_LOAD_FAILED'));
    };
    img.src = url;
  });
}

// ============================================================
// 以下来自 jsq/111.html 原版（参考图 + 截图编辑器，verbatim）
// ============================================================

var referenceViewState = { scale: 1, minScale: 0.5, maxScale: 6, dragging: false, startX: 0, startY: 0, startScrollLeft: 0, startScrollTop: 0 };
var referenceViewerWindow = null;
var snapshotEditorState = {
    tool: 'rect',
    color: '#2563eb',
    shapes: [],
    draftShape: null,
    pointerId: null,
    startPoint: null,
    baseImage: null,
    objectUrl: '',
    open: false,
    nextShapeId: 1,
    selectedShapeId: null,
    history: [],
    historyIndex: -1,
    arrowLineWidth: 18,
    dragShapeId: null,
    dragStartPoint: null,
    dragStartShape: null,
    dragLongPressTimer: null,
    resizeShapeId: null,
    resizeStartPoint: null,
    resizeStartShape: null,
    viewScale: 1,
    fitScale: 1,
    viewportPanPointerId: null,
    viewportPanCaptureTarget: null,
    viewportPanStartClient: null,
    viewportPanStartScroll: null,
    viewportPanning: false,
    spacePressed: false
};

function setCaptureStatus(message, isError) {
    var status = document.getElementById('capture-status');
    if (!status) return;
    status.textContent = message || '';
    status.style.display = message ? 'block' : 'none';
    status.className = 'capture-status' + (message ? (isError ? ' error' : ' success') : '');
}

function setCaptureBusy(isBusy) {
    ['capture-btn', 'capture-edit-btn'].forEach(function(id) {
        var button = document.getElementById(id);
        if (button) {
            button.disabled = !!isBusy;
        }
    });
}

function setReferenceStatus(message, isError) {
    var status = document.getElementById('reference-status');
    if (!status) return;
    status.textContent = message || '';
    status.className = 'reference-status' + (message ? (isError ? ' error' : ' success') : '');
}

function setReferenceDropzoneActive(isActive) {
    var dropzone = document.getElementById('reference-dropzone');
    if (!dropzone) return;
    dropzone.classList.toggle('is-active', !!isActive);
}

function syncWorkbenchFrameHeights() {
    var diagramBox = document.querySelector('.diagram-box');
    var dropzone = document.getElementById('reference-dropzone');
    if (!diagramBox || !dropzone) return;
    var diagramHeight = Math.round(diagramBox.getBoundingClientRect().height);
    if (!diagramHeight) {
        diagramHeight = Math.round(parseFloat(window.getComputedStyle(diagramBox).height) || 0);
    }
    if (!diagramHeight) return;
    dropzone.style.height = diagramHeight + 'px';
    dropzone.style.minHeight = diagramHeight + 'px';
}

function showReferenceImage(dataUrl) {
    var preview = document.getElementById('reference-preview');
    var placeholder = document.getElementById('reference-placeholder');
    var dropzone = document.getElementById('reference-dropzone');
    var viewer = document.getElementById('reference-viewer');
    var viewerImage = document.getElementById('reference-viewer-image');
    if (!preview || !placeholder) return;
    preview.src = dataUrl;
    preview.hidden = false;
    placeholder.hidden = true;
    if (dropzone) dropzone.classList.add('has-image');
    if (viewer && !viewer.hidden && viewerImage) {
        viewerImage.src = dataUrl;
    }
}

function clearReferenceImage() {
    var preview = document.getElementById('reference-preview');
    var placeholder = document.getElementById('reference-placeholder');
    var dropzone = document.getElementById('reference-dropzone');
    if (!preview || !placeholder) return;
    preview.src = '';
    preview.hidden = true;
    placeholder.hidden = false;
    if (dropzone) dropzone.classList.remove('has-image');
    closeReferenceViewer();
    setReferenceStatus('', false);
}

function onReferenceViewerClosed() {
    referenceViewerWindow = null;
    document.body.classList.remove('reference-dock-open');
}

function getReferenceViewerMetrics() {
    var screenObj = window.screen || {};
    var availLeft = typeof screenObj.availLeft === 'number' ? screenObj.availLeft : 0;
    var availTop = typeof screenObj.availTop === 'number' ? screenObj.availTop : 0;
    var availWidth = screenObj.availWidth || window.innerWidth || 1440;
    var availHeight = screenObj.availHeight || window.innerHeight || 900;
    var viewerWidth = Math.max(420, Math.round(availWidth * 0.42));
    var leftWidth = Math.max(860, availWidth - viewerWidth);
    viewerWidth = Math.max(360, availWidth - leftWidth);
    return {
        availLeft: availLeft,
        availTop: availTop,
        availWidth: availWidth,
        availHeight: availHeight,
        leftWidth: leftWidth,
        viewerWidth: viewerWidth
    };
}

function getReferenceViewerFeatures(metrics) {
    return [
        'popup=yes',
        'resizable=yes',
        'scrollbars=yes',
        'menubar=no',
        'toolbar=no',
        'location=no',
        'status=no',
        'width=' + metrics.viewerWidth,
        'height=' + metrics.availHeight,
        'left=' + (metrics.availLeft + metrics.leftWidth),
        'top=' + metrics.availTop
    ].join(',');
}

function writeReferenceViewerWindow(popup, dataUrl) {
    if (!popup || popup.closed) return;
    popup.document.open();
    popup.document.write(
        '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>来图查看</title><style>' +
        'html,body{margin:0;height:100%;background:#f3efe9;font-family:Segoe UI,Microsoft YaHei UI,sans-serif;}' +
        'body{display:flex;flex-direction:column;gap:10px;padding:14px;box-sizing:border-box;}' +
        '.viewer-shell{flex:1;display:flex;align-items:center;justify-content:center;background:#fff;border:1px solid #ddd3cb;border-radius:18px;box-shadow:0 18px 38px rgba(15,23,42,.12);overflow:hidden;}' +
        '.viewer-shell img{width:100%;height:100%;object-fit:contain;background:#fff;display:block;}' +
        '.viewer-bar{display:flex;justify-content:space-between;align-items:center;gap:10px;color:#6b5f57;font-size:12px;font-weight:700;}' +
        '.viewer-close{border:none;border-radius:999px;padding:8px 12px;background:#1f2937;color:#fff;font-weight:700;cursor:pointer;}' +
        '</style></head><body><div class="viewer-bar"><span>双击图片框打开的参考图窗口</span><button type="button" class="viewer-close" onclick="window.close()">关闭</button></div><div class="viewer-shell"><img id="viewer-image" alt="参考图查看"></div>' +
        '<script>window.addEventListener("beforeunload",function(){try{if(window.opener&&window.opener.onReferenceViewerClosed){window.opener.onReferenceViewerClosed();}}catch(e){}});window.addEventListener("keydown",function(e){if(e.key==="Escape"){window.close();}});<\/script>' +
        '</body></html>'
    );
    popup.document.close();
    var viewerImage = popup.document.getElementById('viewer-image');
    if (viewerImage) viewerImage.src = dataUrl;
}

function openReferenceViewer() {
    var preview = document.getElementById('reference-preview');
    var viewer = document.getElementById('reference-viewer');
    var viewerImage = document.getElementById('reference-viewer-image');
    if (!preview || !viewer || !viewerImage || preview.hidden || !preview.src) return;
    viewerImage.src = preview.src;
    viewer.hidden = false;
    document.body.classList.add('reference-dock-open');
    requestAnimationFrame(function() {
        syncReferenceViewerDock();
        resetReferenceViewTransform();
        syncWorkbenchFrameHeights();
    });
    setTimeout(function() {
        syncReferenceViewerDock();
        resetReferenceViewTransform();
        syncWorkbenchFrameHeights();
    }, 320);
    setReferenceStatus('', false);
}

function closeReferenceViewer() {
    var viewer = document.getElementById('reference-viewer');
    var viewerImage = document.getElementById('reference-viewer-image');
    if (viewer) viewer.hidden = true;
    if (viewerImage) viewerImage.src = '';
    document.body.classList.remove('reference-dock-open');
    if (viewer) {
        viewer.style.left = '';
        viewer.style.right = '';
        viewer.style.width = '';
    }
    document.body.style.removeProperty('--viewer-dock-width');
    referenceViewState.dragging = false;
    resetReferenceViewTransform();
    requestAnimationFrame(syncWorkbenchFrameHeights);
    setTimeout(syncWorkbenchFrameHeights, 320);
}

function syncReferenceViewerDock() {
    var viewer = document.getElementById('reference-viewer');
    var container = document.querySelector('.container');
    var gap = 2;
    var rightGap = 10;
    var minWidth = 360;
    if (!viewer || viewer.hidden || !container) return;
    var containerRect = container.getBoundingClientRect();
    var left = Math.round(containerRect.right + gap);
    var maxLeft = window.innerWidth - minWidth - rightGap;
    if (left > maxLeft) left = maxLeft;
    if (left < 220) left = 220;
    var width = Math.max(minWidth, window.innerWidth - left - rightGap);
    viewer.style.left = left + 'px';
    viewer.style.right = rightGap + 'px';
    viewer.style.width = width + 'px';
    document.body.style.setProperty('--viewer-dock-width', width + 'px');
}

function getReferenceViewBaseMetrics() {
    var viewport = document.getElementById('reference-viewer-viewport');
    var stage = document.getElementById('reference-viewer-stage');
    var viewerImage = document.getElementById('reference-viewer-image');
    if (!viewport || !stage || !viewerImage || !viewerImage.naturalWidth || !viewerImage.naturalHeight) return null;
    var viewportWidth = viewport.clientWidth || 0;
    var viewportHeight = viewport.clientHeight || 0;
    if (!viewportWidth || !viewportHeight) return null;
    var fitScale = Math.min(viewportWidth / viewerImage.naturalWidth, 1);
    var renderedWidth = viewerImage.naturalWidth * fitScale * referenceViewState.scale;
    var renderedHeight = viewerImage.naturalHeight * fitScale * referenceViewState.scale;
    var stageWidth = Math.max(Math.round(renderedWidth), viewportWidth);
    var stageHeight = Math.max(Math.round(renderedHeight), viewportHeight);
    var imageLeft = Math.round((stageWidth - renderedWidth) / 2);
    var imageTop = Math.round((stageHeight - renderedHeight) / 2);
    return {
        viewport: viewport,
        stage: stage,
        image: viewerImage,
        viewportWidth: viewportWidth,
        viewportHeight: viewportHeight,
        fitScale: fitScale,
        renderedWidth: Math.round(renderedWidth),
        renderedHeight: Math.round(renderedHeight),
        stageWidth: stageWidth,
        stageHeight: stageHeight,
        imageLeft: imageLeft,
        imageTop: imageTop
    };
}

function clampReferenceViewScroll(metrics, scrollLeft, scrollTop) {
    var maxScrollLeft = Math.max(0, metrics.stageWidth - metrics.viewportWidth);
    var maxScrollTop = Math.max(0, metrics.stageHeight - metrics.viewportHeight);
    return {
        left: Math.max(0, Math.min(maxScrollLeft, scrollLeft)),
        top: Math.max(0, Math.min(maxScrollTop, scrollTop))
    };
}

function applyReferenceViewLayout(anchorPoint) {
    var metrics = getReferenceViewBaseMetrics();
    if (!metrics) return;
    if (referenceViewState.scale < referenceViewState.minScale) referenceViewState.scale = referenceViewState.minScale;
    if (referenceViewState.scale > referenceViewState.maxScale) referenceViewState.scale = referenceViewState.maxScale;
    metrics.stage.style.width = metrics.stageWidth + 'px';
    metrics.stage.style.height = metrics.stageHeight + 'px';
    metrics.image.style.width = metrics.renderedWidth + 'px';
    metrics.image.style.height = metrics.renderedHeight + 'px';
    metrics.image.style.left = metrics.imageLeft + 'px';
    metrics.image.style.top = metrics.imageTop + 'px';
    metrics.viewport.classList.toggle('is-dragging', !!referenceViewState.dragging);
    if (!anchorPoint) {
        var centeredScroll = clampReferenceViewScroll(
            metrics,
            Math.max(0, (metrics.stageWidth - metrics.viewportWidth) / 2),
            0
        );
        metrics.viewport.scrollLeft = centeredScroll.left;
        metrics.viewport.scrollTop = centeredScroll.top;
        return;
    }
    var clampedScroll = clampReferenceViewScroll(metrics, anchorPoint.scrollLeft, anchorPoint.scrollTop);
    metrics.viewport.scrollLeft = clampedScroll.left;
    metrics.viewport.scrollTop = clampedScroll.top;
}

function resetReferenceViewTransform() {
    referenceViewState.scale = 1;
    referenceViewState.dragging = false;
    applyReferenceViewLayout();
}

function zoomReferenceView(scaleFactor, clientX, clientY) {
    var oldMetrics = getReferenceViewBaseMetrics();
    if (!oldMetrics) return;
    var rect = oldMetrics.viewport.getBoundingClientRect();
    var pointerX = clientX - rect.left;
    var pointerY = clientY - rect.top;
    var prevScale = referenceViewState.scale;
    var nextScale = Math.max(referenceViewState.minScale, Math.min(referenceViewState.maxScale, prevScale * scaleFactor));
    if (Math.abs(nextScale - prevScale) < 0.0001) return;
    var naturalX = (oldMetrics.viewport.scrollLeft + pointerX - oldMetrics.imageLeft) / (oldMetrics.fitScale * prevScale);
    var naturalY = (oldMetrics.viewport.scrollTop + pointerY - oldMetrics.imageTop) / (oldMetrics.fitScale * prevScale);
    referenceViewState.scale = nextScale;
    var previewMetrics = getReferenceViewBaseMetrics();
    if (!previewMetrics) return;
    var nextScrollLeft = naturalX * (previewMetrics.fitScale * nextScale) + previewMetrics.imageLeft - pointerX;
    var nextScrollTop = naturalY * (previewMetrics.fitScale * nextScale) + previewMetrics.imageTop - pointerY;
    applyReferenceViewLayout({
        scrollLeft: nextScrollLeft,
        scrollTop: nextScrollTop
    });
}

function loadReferenceImageFile(file) {
    if (!file || !file.type || file.type.indexOf('image/') !== 0) {
        setReferenceStatus('请粘贴图片文件。', true);
        return;
    }
    var reader = new FileReader();
    reader.onload = function() {
        showReferenceImage(reader.result);
        setReferenceStatus('参考图已贴入。', false);
    };
    reader.onerror = function() {
        setReferenceStatus('图片读取失败，请重试。', true);
    };
    reader.readAsDataURL(file);
}

function getImageFileFromItems(items) {
    if (!items) return null;
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item.kind === 'file' && item.type && item.type.indexOf('image/') === 0) {
            return item.getAsFile();
        }
    }
    return null;
}

function handleReferencePaste(event) {
    var file = getImageFileFromItems(event.clipboardData && event.clipboardData.items);
    if (!file) {
        setReferenceStatus('剪贴板里没有图片，请先复制图片。', true);
        return;
    }
    event.preventDefault();
    loadReferenceImageFile(file);
}

async function pasteReferenceImage() {
    var dropzone = document.getElementById('reference-dropzone');
    if (!navigator.clipboard || !navigator.clipboard.read) {
        if (dropzone) dropzone.focus();
        setReferenceStatus('当前环境不支持一键读取，请先点右框再 Ctrl+V。', true);
        return;
    }
    try {
        var items = await navigator.clipboard.read();
        for (var i = 0; i < items.length; i++) {
            var clipboardItem = items[i];
            for (var j = 0; j < clipboardItem.types.length; j++) {
                var type = clipboardItem.types[j];
                if (type.indexOf('image/') === 0) {
                    var blob = await clipboardItem.getType(type);
                    loadReferenceImageFile(blob);
                    return;
                }
            }
        }
        setReferenceStatus('剪贴板里没有图片，请先复制图片。', true);
    } catch (error) {
        if (dropzone) dropzone.focus();
        setReferenceStatus('读取剪贴板失败，请点右框后 Ctrl+V。', true);
    }
}

function setupReferencePanel() {
    var dropzone = document.getElementById('reference-dropzone');
    if (!dropzone) return;
    dropzone.addEventListener('click', function() {
        dropzone.focus();
    });
    dropzone.addEventListener('dblclick', function() {
        openReferenceViewer();
    });
    dropzone.addEventListener('keydown', function(event) {
        var preview = document.getElementById('reference-preview');
        if ((event.key === 'Delete' || event.key === 'Backspace') && preview && !preview.hidden && preview.src) {
            event.preventDefault();
            clearReferenceImage();
            return;
        }
        if (event.key === 'Enter' && preview && !preview.hidden && preview.src) {
            event.preventDefault();
            openReferenceViewer();
        }
    });
    dropzone.addEventListener('paste', handleReferencePaste);
    document.addEventListener('paste', function(event) {
        if (event.defaultPrevented) return;
        var active = document.activeElement;
        if (active !== dropzone && !(dropzone.contains(active))) return;
        handleReferencePaste(event);
    });
    dropzone.addEventListener('dragover', function(event) {
        event.preventDefault();
        setReferenceDropzoneActive(true);
    });
    dropzone.addEventListener('dragleave', function() {
        setReferenceDropzoneActive(false);
    });
    dropzone.addEventListener('drop', function(event) {
        event.preventDefault();
        setReferenceDropzoneActive(false);
        var file = getImageFileFromItems(event.dataTransfer && event.dataTransfer.items);
        if (!file && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length) {
            file = event.dataTransfer.files[0];
        }
        if (!file) {
            setReferenceStatus('请拖入图片文件。', true);
            return;
        }
        loadReferenceImageFile(file);
    });
}

function setupReferenceViewer() {
    var viewer = document.getElementById('reference-viewer');
    var closeButton = document.getElementById('reference-viewer-close');
    var panel = viewer ? viewer.querySelector('.reference-viewer__panel') : null;
    var viewport = document.getElementById('reference-viewer-viewport');
    var viewerImage = document.getElementById('reference-viewer-image');
    if (!viewer || !closeButton || !panel || !viewport || !viewerImage) return;
    if (viewer.parentNode !== document.body) {
        document.body.appendChild(viewer);
    }
    closeButton.addEventListener('click', closeReferenceViewer);
    viewer.addEventListener('click', function(event) {
        if (event.target === viewer) closeReferenceViewer();
    });
    panel.addEventListener('click', function(event) {
        event.stopPropagation();
    });
    viewport.addEventListener('wheel', function(event) {
        event.preventDefault();
        zoomReferenceView(event.deltaY < 0 ? 1.14 : 1 / 1.14, event.clientX, event.clientY);
    }, { passive: false });
    viewport.addEventListener('pointerdown', function(event) {
        if (event.button !== 0) return;
        referenceViewState.dragging = true;
        referenceViewState.startX = event.clientX;
        referenceViewState.startY = event.clientY;
        referenceViewState.startScrollLeft = viewport.scrollLeft;
        referenceViewState.startScrollTop = viewport.scrollTop;
        viewport.classList.add('is-dragging');
        if (viewport.setPointerCapture) viewport.setPointerCapture(event.pointerId);
        event.preventDefault();
    });
    viewport.addEventListener('pointermove', function(event) {
        if (!referenceViewState.dragging) return;
        viewport.scrollLeft = referenceViewState.startScrollLeft - (event.clientX - referenceViewState.startX);
        viewport.scrollTop = referenceViewState.startScrollTop - (event.clientY - referenceViewState.startY);
    });
    function stopReferenceViewDrag(event) {
        if (!referenceViewState.dragging) return;
        referenceViewState.dragging = false;
        viewport.classList.remove('is-dragging');
        if (event && viewport.releasePointerCapture) {
            try { viewport.releasePointerCapture(event.pointerId); } catch (error) {}
        }
    }
    viewport.addEventListener('pointerup', stopReferenceViewDrag);
    viewport.addEventListener('pointercancel', stopReferenceViewDrag);
    viewport.addEventListener('pointerleave', function(event) {
        if (!referenceViewState.dragging) return;
        stopReferenceViewDrag(event);
    });
    viewerImage.addEventListener('load', function() {
        if (viewer.hidden) return;
        syncReferenceViewerDock();
        resetReferenceViewTransform();
    });
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') closeReferenceViewer();
    });
    window.addEventListener('resize', function() {
        if (viewer.hidden) return;
        syncReferenceViewerDock();
        applyReferenceViewLayout();
    });
}

function canvasToPngBlob(canvas) {
    return new Promise(function(resolve, reject) {
        if (canvas.toBlob) {
            canvas.toBlob(function(blob) {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('PNG_BLOB_EMPTY'));
                }
            }, 'image/png');
            return;
        }
        try {
            fetch(canvas.toDataURL('image/png')).then(function(response) {
                return response.blob();
            }).then(resolve).catch(reject);
        } catch (error) {
            reject(error);
        }
    });
}

function copyPngBlobToClipboard(blob) {
    if (navigator.clipboard && window.ClipboardItem && navigator.clipboard.write) {
        return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    }
    return new Promise(function(resolve, reject) {
        if (!(document.queryCommandSupported && document.queryCommandSupported('copy'))) {
            reject(new Error('CLIPBOARD_IMAGE_UNSUPPORTED'));
            return;
        }
        var file = new File([blob], 'diagram.png', { type: 'image/png' });
        function onCopy(event) {
            document.removeEventListener('copy', onCopy);
            try {
                if (!event.clipboardData || !event.clipboardData.items || !event.clipboardData.items.add) {
                    throw new Error('CLIPBOARD_IMAGE_UNSUPPORTED');
                }
                event.clipboardData.items.add(file);
                event.preventDefault();
                resolve();
            } catch (error) {
                reject(error);
            }
        }
        document.addEventListener('copy', onCopy);
        var copied = document.execCommand('copy');
        if (!copied) {
            document.removeEventListener('copy', onCopy);
            reject(new Error('CLIPBOARD_COPY_REJECTED'));
        }
    });
}

function setSnapshotEditorStatus(message, state) {
    var status = document.getElementById('snapshot-editor-status');
    if (!status) return;
    status.textContent = message || '';
    var className = 'snapshot-editor__status';
    if (message) {
        if (state === true || state === 'error') {
            className += ' error';
        } else if (state === 'success') {
            className += ' success';
        }
    }
    status.className = className;
}

function cloneSnapshotEditorShapes(shapes) {
    return (shapes || []).map(function(shape) {
        return JSON.parse(JSON.stringify(shape));
    });
}

function commitSnapshotEditorHistory() {
    var snapshot = cloneSnapshotEditorShapes(snapshotEditorState.shapes);
    if (snapshotEditorState.historyIndex >= 0) {
        var current = JSON.stringify(snapshotEditorState.history[snapshotEditorState.historyIndex] || []);
        if (current === JSON.stringify(snapshot)) {
            return;
        }
    }
    snapshotEditorState.history = snapshotEditorState.history.slice(0, snapshotEditorState.historyIndex + 1);
    snapshotEditorState.history.push(snapshot);
    snapshotEditorState.historyIndex = snapshotEditorState.history.length - 1;
}

function getSnapshotEditorShapeById(shapeId) {
    for (var i = 0; i < snapshotEditorState.shapes.length; i += 1) {
        if (String(snapshotEditorState.shapes[i].id) === String(shapeId)) {
            return snapshotEditorState.shapes[i];
        }
    }
    return null;
}

function setSelectedSnapshotEditorShape(shapeId) {
    snapshotEditorState.selectedShapeId = shapeId === null || typeof shapeId === 'undefined' ? null : String(shapeId);
    var selectedShape = getSnapshotEditorShapeById(snapshotEditorState.selectedShapeId);
    if (selectedShape && selectedShape.color) {
        snapshotEditorState.color = selectedShape.color;
        syncSnapshotEditorColorButtons();
    }
    if (selectedShape && selectedShape.type === 'arrow' && Number.isFinite(selectedShape.lineWidth)) {
        snapshotEditorState.arrowLineWidth = getSnapshotEditorArrowDisplayWidth(selectedShape);
    }
    syncSnapshotEditorArrowWidthControl();
    renderSnapshotEditorCanvas();
}

function syncSnapshotEditorToolButtons() {
    ['rect', 'arrow', 'text'].forEach(function(tool) {
        var button = document.getElementById('snapshot-tool-' + tool);
        if (button) {
            button.classList.toggle('is-active', snapshotEditorState.tool === tool);
        }
    });
}

function syncSnapshotEditorColorButtons() {
    ['#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#111827'].forEach(function(color, index) {
        var button = document.getElementById('snapshot-color-' + index);
        if (button) {
            button.classList.toggle('is-active', snapshotEditorState.color === color);
        }
    });
}

function setSnapshotEditorColor(color) {
    snapshotEditorState.color = color || '#2563eb';
    syncSnapshotEditorColorButtons();
    var selectedShape = getSnapshotEditorShapeById(snapshotEditorState.selectedShapeId);
    if (selectedShape) {
        selectedShape.color = snapshotEditorState.color;
        commitSnapshotEditorHistory();
        renderSnapshotEditorCanvas();
    }
}

function getSnapshotEditorArrowRenderScale() {
    return Math.max(
        snapshotEditorState.viewScale || 0,
        snapshotEditorState.fitScale || 0,
        0.12
    );
}

function getDefaultSnapshotEditorArrowWidth() {
    var viewport = getSnapshotEditorViewport();
    var baseSize = viewport ? Math.min(viewport.clientWidth || 0, viewport.clientHeight || 0) : 720;
    return Math.max(14, Math.min(28, Math.round(Math.max(baseSize, 480) * 0.03)));
}

function getSnapshotEditorArrowCanvasWidth(displayWidth) {
    return Math.max(6, Math.min(320, Number(displayWidth || 18) / getSnapshotEditorArrowRenderScale()));
}

function getSnapshotEditorArrowDisplayWidth(shape) {
    return Math.max(8, Math.min(72, Math.round((shape && Number.isFinite(shape.lineWidth) ? shape.lineWidth : 0) * getSnapshotEditorArrowRenderScale())));
}

function syncSnapshotEditorArrowWidthControl() {
    var group = document.getElementById('snapshot-arrow-group');
    var input = document.getElementById('snapshot-arrow-width');
    var label = document.getElementById('snapshot-arrow-width-value');
    if (!group || !input || !label) return;
    var selectedShape = getSnapshotEditorShapeById(snapshotEditorState.selectedShapeId);
    var shouldShow = snapshotEditorState.tool === 'arrow' || (selectedShape && selectedShape.type === 'arrow');
    group.hidden = !shouldShow;
    var widthValue = shouldShow
        ? Math.max(8, Math.min(72, Math.round(selectedShape && selectedShape.type === 'arrow' && Number.isFinite(selectedShape.lineWidth)
            ? getSnapshotEditorArrowDisplayWidth(selectedShape)
            : snapshotEditorState.arrowLineWidth)))
        : Math.max(8, Math.min(72, Math.round(snapshotEditorState.arrowLineWidth)));
    input.value = String(widthValue);
    label.textContent = widthValue;
}

function setSnapshotEditorArrowWidth(value) {
    var nextWidth = Math.max(8, Math.min(72, Math.round(Number(value) || snapshotEditorState.arrowLineWidth || 18)));
    snapshotEditorState.arrowLineWidth = nextWidth;
    var selectedShape = getSnapshotEditorShapeById(snapshotEditorState.selectedShapeId);
    if (selectedShape && selectedShape.type === 'arrow') {
        selectedShape.lineWidth = getSnapshotEditorArrowCanvasWidth(nextWidth);
        commitSnapshotEditorHistory();
        renderSnapshotEditorCanvas();
    }
    syncSnapshotEditorArrowWidthControl();
}

function getSnapshotEditorArrowGeometry(shape, lineWidth) {
    var dx = shape.x2 - shape.x1;
    var dy = shape.y2 - shape.y1;
    var length = Math.hypot(dx, dy) || 1;
    var unitX = dx / length;
    var unitY = dy / length;
    var perpX = -unitY;
    var perpY = unitX;
    var bodyHalfWidth = Math.max(0.9, lineWidth * 0.11);
    var headHalfWidth = Math.max(bodyHalfWidth + 4, lineWidth * 0.52);
    var tailLength = Math.min(Math.max(lineWidth * 1.8, 12), length * 0.18);
    var headLength = Math.min(Math.max(lineWidth * 2.9, 22), length * 0.3);
    var specialLength = tailLength + headLength;
    if (specialLength > length * 0.82) {
        var shrink = (length * 0.82) / specialLength;
        tailLength *= shrink;
        headLength *= shrink;
    }
    var shaftStartX = shape.x1 + unitX * tailLength;
    var shaftStartY = shape.y1 + unitY * tailLength;
    var headBaseX = shape.x2 - unitX * headLength;
    var headBaseY = shape.y2 - unitY * headLength;
    return {
        tip: { x: shape.x2, y: shape.y2 },
        shaftUpperStart: {
            x: shaftStartX + perpX * bodyHalfWidth,
            y: shaftStartY + perpY * bodyHalfWidth
        },
        shaftLowerStart: {
            x: shaftStartX - perpX * bodyHalfWidth,
            y: shaftStartY - perpY * bodyHalfWidth
        },
        shaftUpperEnd: {
            x: headBaseX + perpX * bodyHalfWidth,
            y: headBaseY + perpY * bodyHalfWidth
        },
        shaftLowerEnd: {
            x: headBaseX - perpX * bodyHalfWidth,
            y: headBaseY - perpY * bodyHalfWidth
        },
        headUpper: {
            x: headBaseX + perpX * headHalfWidth,
            y: headBaseY + perpY * headHalfWidth
        },
        headLower: {
            x: headBaseX - perpX * headHalfWidth,
            y: headBaseY - perpY * headHalfWidth
        }
    };
}

function drawArrowStroke(ctx, shape, strokeStyle, lineWidth) {
    var arrow = getSnapshotEditorArrowGeometry(shape, lineWidth);
    ctx.save();
    ctx.fillStyle = strokeStyle;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(shape.x1, shape.y1);
    ctx.lineTo(arrow.shaftUpperStart.x, arrow.shaftUpperStart.y);
    ctx.lineTo(arrow.shaftUpperEnd.x, arrow.shaftUpperEnd.y);
    ctx.lineTo(arrow.headUpper.x, arrow.headUpper.y);
    ctx.lineTo(arrow.tip.x, arrow.tip.y);
    ctx.lineTo(arrow.headLower.x, arrow.headLower.y);
    ctx.lineTo(arrow.shaftLowerEnd.x, arrow.shaftLowerEnd.y);
    ctx.lineTo(arrow.shaftLowerStart.x, arrow.shaftLowerStart.y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawSnapshotEditorArrow(ctx, shape) {
    drawArrowStroke(ctx, shape, shape.color, shape.lineWidth);
}

function drawSnapshotEditorText(ctx, shape) {
    ctx.font = '700 ' + shape.fontSize + 'px "Microsoft YaHei UI","Segoe UI",sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = Math.max(4, shape.fontSize * 0.18);
    ctx.strokeText(shape.text, shape.x, shape.y);
    ctx.fillStyle = shape.color;
    ctx.fillText(shape.text, shape.x, shape.y);
}

function getSnapshotEditorTextBounds(ctx, shape) {
    ctx.save();
    ctx.font = '700 ' + shape.fontSize + 'px "Microsoft YaHei UI","Segoe UI",sans-serif';
    var metrics = ctx.measureText(shape.text || '');
    var width = Math.max(metrics.width, shape.fontSize * 0.9);
    ctx.restore();
    return {
        x: shape.x,
        y: shape.y,
        width: width,
        height: shape.fontSize * 1.15
    };
}

function getSnapshotEditorTextSelectionMetrics(ctx, shape) {
    var textBounds = getSnapshotEditorTextBounds(ctx, shape);
    var paddingX = Math.max(6, shape.fontSize * 0.16);
    var paddingY = Math.max(5, shape.fontSize * 0.14);
    return {
        x: textBounds.x - paddingX,
        y: textBounds.y - paddingY,
        width: textBounds.width + paddingX * 2,
        height: textBounds.height + paddingY * 2,
        handleX: textBounds.x + textBounds.width + paddingX,
        handleY: textBounds.y + textBounds.height + paddingY
    };
}

function getSnapshotEditorTextResizeTarget(point) {
    if (!point || snapshotEditorState.selectedShapeId === null) return null;
    var canvas = document.getElementById('snapshot-editor-canvas');
    var selectedShape = getSnapshotEditorShapeById(snapshotEditorState.selectedShapeId);
    if (!canvas || !selectedShape || selectedShape.type !== 'text') return null;
    var ctx = canvas.getContext('2d');
    var metrics = getSnapshotEditorTextSelectionMetrics(ctx, selectedShape);
    return Math.hypot(point.x - metrics.handleX, point.y - metrics.handleY) <= 10 ? selectedShape : null;
}

function drawSnapshotEditorArrowSelection(ctx, shape) {
    ctx.save();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(37, 99, 235, 0.82)';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(shape.x1, shape.y1);
    ctx.lineTo(shape.x2, shape.y2);
    ctx.stroke();
    [
        { x: shape.x1, y: shape.y1 },
        { x: shape.x2, y: shape.y2 }
    ].forEach(function(point) {
        ctx.beginPath();
        ctx.fillStyle = '#ffffff';
        ctx.arc(point.x, point.y, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(37, 99, 235, 0.95)';
        ctx.lineWidth = 2;
        ctx.stroke();
    });
    ctx.restore();
}

function drawSnapshotEditorSelectionHandle(ctx, x, y) {
    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(37, 99, 235, 0.95)';
    ctx.lineWidth = 2;
    ctx.stroke();
}

function drawSnapshotEditorRectSelection(ctx, shape) {
    ctx.save();
    ctx.setLineDash([]);
    [
        { x: shape.x, y: shape.y },
        { x: shape.x + shape.width, y: shape.y },
        { x: shape.x + shape.width, y: shape.y + shape.height },
        { x: shape.x, y: shape.y + shape.height }
    ].forEach(function(point) {
        drawSnapshotEditorSelectionHandle(ctx, point.x, point.y);
    });
    ctx.restore();
}

function drawSnapshotEditorTextSelection(ctx, shape) {
    var metrics = getSnapshotEditorTextSelectionMetrics(ctx, shape);
    ctx.save();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(37, 99, 235, 0.85)';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.strokeRect(metrics.x, metrics.y, metrics.width, metrics.height);
    drawSnapshotEditorSelectionHandle(ctx, metrics.handleX, metrics.handleY);
    ctx.restore();
}

function drawSnapshotEditorSelection(ctx, shape) {
    if (!shape) return;
    if (shape.type === 'rect') {
        drawSnapshotEditorRectSelection(ctx, shape);
    } else if (shape.type === 'arrow') {
        drawSnapshotEditorArrowSelection(ctx, shape);
    } else if (shape.type === 'text') {
        drawSnapshotEditorTextSelection(ctx, shape);
    }
}

function renderSnapshotEditorCanvas() {
    var canvas = document.getElementById('snapshot-editor-canvas');
    if (!canvas || !snapshotEditorState.baseImage) return;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(snapshotEditorState.baseImage, 0, 0, canvas.width, canvas.height);

    snapshotEditorState.shapes.forEach(function(shape) {
        if (shape.type === 'rect') {
            ctx.strokeStyle = shape.color;
            ctx.lineWidth = shape.lineWidth;
            ctx.lineJoin = 'round';
            ctx.setLineDash([]);
            ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
        } else if (shape.type === 'arrow') {
            drawSnapshotEditorArrow(ctx, shape);
        } else if (shape.type === 'text') {
            drawSnapshotEditorText(ctx, shape);
        }
        if (snapshotEditorState.selectedShapeId !== null && String(shape.id) === String(snapshotEditorState.selectedShapeId)) {
            drawSnapshotEditorSelection(ctx, shape);
        }
    });

    if (snapshotEditorState.draftShape) {
        var draft = snapshotEditorState.draftShape;
        ctx.save();
        ctx.globalAlpha = 0.92;
        if (draft.type === 'rect') {
            ctx.strokeStyle = draft.color;
            ctx.lineWidth = draft.lineWidth;
            ctx.strokeRect(draft.x, draft.y, draft.width, draft.height);
        } else if (draft.type === 'arrow') {
            drawSnapshotEditorArrow(ctx, draft);
        }
        ctx.restore();
    }
}

function getSnapshotEditorViewport() {
    return document.getElementById('snapshot-editor-viewport');
}

function syncSnapshotEditorZoomLabel() {
    var label = document.getElementById('snapshot-editor-zoom-value');
    if (!label) return;
    var scale = snapshotEditorState.viewScale > 0 ? snapshotEditorState.viewScale : 1;
    label.textContent = Math.round(scale * 100) + '%';
}

function centerSnapshotEditorViewport() {
    var canvas = document.getElementById('snapshot-editor-canvas');
    var viewport = getSnapshotEditorViewport();
    if (!canvas || !viewport) return;
    var displayWidth = parseFloat(canvas.style.width) || canvas.clientWidth || canvas.width;
    var displayHeight = parseFloat(canvas.style.height) || canvas.clientHeight || canvas.height;
    viewport.scrollLeft = Math.max(0, Math.round((displayWidth - viewport.clientWidth) / 2));
    viewport.scrollTop = Math.max(0, Math.round((displayHeight - viewport.clientHeight) / 2));
}

function getDefaultSnapshotEditorViewScale(fitScale) {
    if (!(fitScale > 0)) return 1;
    return Math.min(1, fitScale);
}

function applySnapshotEditorCanvasLayout() {
    var canvas = document.getElementById('snapshot-editor-canvas');
    var viewport = getSnapshotEditorViewport();
    if (!canvas || !viewport || !(canvas.width > 0) || !(canvas.height > 0)) return;
    var maxWidth = Math.max(viewport.clientWidth - 8, 1);
    var maxHeight = Math.max(viewport.clientHeight - 8, 1);
    var fitScale = Math.min(maxWidth / canvas.width, maxHeight / canvas.height, 1);
    snapshotEditorState.fitScale = fitScale;
    if (!(snapshotEditorState.viewScale > 0)) {
        snapshotEditorState.viewScale = getDefaultSnapshotEditorViewScale(fitScale);
    }
    var appliedScale = Math.max(0.2, Math.min(snapshotEditorState.viewScale, 4));
    snapshotEditorState.viewScale = appliedScale;
    canvas.style.width = Math.max(1, Math.round(canvas.width * appliedScale)) + 'px';
    canvas.style.height = Math.max(1, Math.round(canvas.height * appliedScale)) + 'px';
    syncSnapshotEditorZoomLabel();
}

function setSnapshotEditorZoom(nextScale) {
    var canvas = document.getElementById('snapshot-editor-canvas');
    var viewport = getSnapshotEditorViewport();
    if (!canvas || !viewport || !(canvas.width > 0) || !(canvas.height > 0)) return;
    var oldDisplayWidth = parseFloat(canvas.style.width) || canvas.clientWidth || canvas.width;
    var oldDisplayHeight = parseFloat(canvas.style.height) || canvas.clientHeight || canvas.height;
    var anchorRatioX = oldDisplayWidth > 0 ? (viewport.scrollLeft + viewport.clientWidth / 2) / oldDisplayWidth : 0.5;
    var anchorRatioY = oldDisplayHeight > 0 ? (viewport.scrollTop + viewport.clientHeight / 2) / oldDisplayHeight : 0.5;
    var minScale = Math.max(0.2, Math.min(snapshotEditorState.fitScale * 0.72, 1));
    snapshotEditorState.viewScale = Math.max(minScale, Math.min(nextScale, 4));
    applySnapshotEditorCanvasLayout();
    var newDisplayWidth = parseFloat(canvas.style.width) || canvas.clientWidth || canvas.width;
    var newDisplayHeight = parseFloat(canvas.style.height) || canvas.clientHeight || canvas.height;
    viewport.scrollLeft = Math.max(0, newDisplayWidth * anchorRatioX - viewport.clientWidth / 2);
    viewport.scrollTop = Math.max(0, newDisplayHeight * anchorRatioY - viewport.clientHeight / 2);
}

function adjustSnapshotEditorZoom(factor) {
    if (!(factor > 0)) return;
    setSnapshotEditorZoom((snapshotEditorState.viewScale || 1) * factor);
}

function resetSnapshotEditorZoom() {
    setSnapshotEditorZoom(getDefaultSnapshotEditorViewScale(snapshotEditorState.fitScale || 1));
    centerSnapshotEditorViewport();
}

function getSnapshotEditorShapeAtPoint(point) {
    var canvas = document.getElementById('snapshot-editor-canvas');
    if (!canvas || !point) return null;
    var ctx = canvas.getContext('2d');
    for (var i = snapshotEditorState.shapes.length - 1; i >= 0; i -= 1) {
        var shape = snapshotEditorState.shapes[i];
        if (shape.type === 'rect') {
            var withinRect = point.x >= shape.x - 8 && point.x <= shape.x + shape.width + 8 &&
                point.y >= shape.y - 8 && point.y <= shape.y + shape.height + 8;
            if (withinRect) return shape;
            continue;
        }
        if (shape.type === 'text') {
            var textBounds = getSnapshotEditorTextBounds(ctx, shape);
            if (
                point.x >= textBounds.x - 8 &&
                point.x <= textBounds.x + textBounds.width + 8 &&
                point.y >= textBounds.y - 8 &&
                point.y <= textBounds.y + textBounds.height + 8
            ) {
                return shape;
            }
            continue;
        }
        if (shape.type === 'arrow') {
            var lineLen = Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1) || 1;
            var projection = ((point.x - shape.x1) * (shape.x2 - shape.x1) + (point.y - shape.y1) * (shape.y2 - shape.y1)) / (lineLen * lineLen);
            var clampedProjection = Math.max(0, Math.min(1, projection));
            var closestX = shape.x1 + (shape.x2 - shape.x1) * clampedProjection;
            var closestY = shape.y1 + (shape.y2 - shape.y1) * clampedProjection;
            if (Math.hypot(point.x - closestX, point.y - closestY) <= Math.max(10, shape.lineWidth + 6)) {
                return shape;
            }
        }
    }
    return null;
}

function clearSnapshotEditorDragTimer() {
    if (snapshotEditorState.dragLongPressTimer) {
        clearTimeout(snapshotEditorState.dragLongPressTimer);
        snapshotEditorState.dragLongPressTimer = null;
    }
}

function startSnapshotEditorViewportPan(event) {
    var viewport = getSnapshotEditorViewport();
    if (!viewport) return;
    snapshotEditorState.viewportPanPointerId = event.pointerId;
    snapshotEditorState.viewportPanCaptureTarget = event.currentTarget && typeof event.currentTarget.setPointerCapture === 'function'
        ? event.currentTarget
        : viewport;
    snapshotEditorState.viewportPanStartClient = { x: event.clientX, y: event.clientY };
    snapshotEditorState.viewportPanStartScroll = { left: viewport.scrollLeft, top: viewport.scrollTop };
    snapshotEditorState.viewportPanning = true;
    viewport.classList.add('is-panning');
    if (snapshotEditorState.viewportPanCaptureTarget && snapshotEditorState.viewportPanCaptureTarget.setPointerCapture) {
        try { snapshotEditorState.viewportPanCaptureTarget.setPointerCapture(event.pointerId); } catch (error) {}
    }
}

function moveSnapshotEditorViewportPan(event) {
    var viewport = getSnapshotEditorViewport();
    if (!viewport || !snapshotEditorState.viewportPanning || snapshotEditorState.viewportPanPointerId !== event.pointerId || !snapshotEditorState.viewportPanStartClient || !snapshotEditorState.viewportPanStartScroll) {
        return;
    }
    viewport.scrollLeft = snapshotEditorState.viewportPanStartScroll.left - (event.clientX - snapshotEditorState.viewportPanStartClient.x);
    viewport.scrollTop = snapshotEditorState.viewportPanStartScroll.top - (event.clientY - snapshotEditorState.viewportPanStartClient.y);
}

function endSnapshotEditorViewportPan(event) {
    var viewport = getSnapshotEditorViewport();
    if (!viewport || !snapshotEditorState.viewportPanning || (event && snapshotEditorState.viewportPanPointerId !== event.pointerId)) {
        return;
    }
    if (event && snapshotEditorState.viewportPanCaptureTarget && snapshotEditorState.viewportPanCaptureTarget.releasePointerCapture) {
        try { snapshotEditorState.viewportPanCaptureTarget.releasePointerCapture(event.pointerId); } catch (error) {}
    }
    snapshotEditorState.viewportPanPointerId = null;
    snapshotEditorState.viewportPanCaptureTarget = null;
    snapshotEditorState.viewportPanStartClient = null;
    snapshotEditorState.viewportPanStartScroll = null;
    snapshotEditorState.viewportPanning = false;
    viewport.classList.remove('is-panning');
}

function createSnapshotEditorShape(type, point) {
    var canvas = document.getElementById('snapshot-editor-canvas');
    var canvasWidth = canvas && canvas.width ? canvas.width : 1600;
    var baseLineWidth = Math.max(4, Math.round(canvasWidth * 0.0022));
    var arrowLineWidth = getSnapshotEditorArrowCanvasWidth(snapshotEditorState.arrowLineWidth || getDefaultSnapshotEditorArrowWidth());
    if (type === 'arrow') {
        return {
            id: String(snapshotEditorState.nextShapeId++),
            type: 'arrow',
            x1: point.x,
            y1: point.y,
            x2: point.x,
            y2: point.y,
            color: snapshotEditorState.color,
            lineWidth: arrowLineWidth
        };
    }
    if (type === 'text') {
        return {
            id: String(snapshotEditorState.nextShapeId++),
            type: 'text',
            text: '',
            x: point.x,
            y: point.y,
            color: snapshotEditorState.color,
            fontSize: Math.max(26, Math.round(canvasWidth * 0.016))
        };
    }
    return {
        id: String(snapshotEditorState.nextShapeId++),
        type: 'rect',
        x: point.x,
        y: point.y,
        width: 0,
        height: 0,
        color: snapshotEditorState.color,
        lineWidth: baseLineWidth
    };
}

function getSnapshotEditorCanvasPoint(event) {
    var canvas = document.getElementById('snapshot-editor-canvas');
    if (!canvas) return null;
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
        x: (event.clientX - rect.left) * (canvas.width / rect.width),
        y: (event.clientY - rect.top) * (canvas.height / rect.height)
    };
}

function normalizeSnapshotDraftShape(shape) {
    if (!shape || shape.type !== 'rect') return shape;
    var normalized = {
        id: shape.id,
        type: 'rect',
        color: shape.color,
        lineWidth: shape.lineWidth,
        x: shape.x,
        y: shape.y,
        width: shape.width,
        height: shape.height
    };
    if (normalized.width < 0) {
        normalized.x += normalized.width;
        normalized.width = Math.abs(normalized.width);
    }
    if (normalized.height < 0) {
        normalized.y += normalized.height;
        normalized.height = Math.abs(normalized.height);
    }
    return normalized;
}

function setSnapshotEditorTool(tool) {
    snapshotEditorState.tool = tool === 'arrow' || tool === 'text' ? tool : 'rect';
    snapshotEditorState.draftShape = null;
    syncSnapshotEditorToolButtons();
    syncSnapshotEditorArrowWidthControl();
    setSnapshotEditorStatus(snapshotEditorState.tool === 'text' ? '点击图片可添加字段，长按字段可拖动，拖右下角缩放点可放大缩小。' : '按下并拖动可绘制标注。', false);
    renderSnapshotEditorCanvas();
}

function undoSnapshotEditor() {
    if (snapshotEditorState.historyIndex <= 0) return;
    snapshotEditorState.historyIndex -= 1;
    snapshotEditorState.shapes = cloneSnapshotEditorShapes(snapshotEditorState.history[snapshotEditorState.historyIndex]);
    snapshotEditorState.selectedShapeId = null;
    syncSnapshotEditorArrowWidthControl();
    setSnapshotEditorStatus('已撤销上一步。', false);
    renderSnapshotEditorCanvas();
}

function deleteSelectedSnapshotEditorShape() {
    if (snapshotEditorState.selectedShapeId === null) return;
    snapshotEditorState.shapes = snapshotEditorState.shapes.filter(function(shape) {
        return String(shape.id) !== String(snapshotEditorState.selectedShapeId);
    });
    snapshotEditorState.selectedShapeId = null;
    commitSnapshotEditorHistory();
    syncSnapshotEditorArrowWidthControl();
    setSnapshotEditorStatus('已删除当前标注。', false);
    renderSnapshotEditorCanvas();
}

function clearSnapshotEditorShapes() {
    if (!snapshotEditorState.shapes.length) return;
    snapshotEditorState.shapes = [];
    snapshotEditorState.draftShape = null;
    snapshotEditorState.selectedShapeId = null;
    commitSnapshotEditorHistory();
    syncSnapshotEditorArrowWidthControl();
    setSnapshotEditorStatus('已清空当前标注。', false);
    renderSnapshotEditorCanvas();
}

function closeSnapshotEditor() {
    var editor = document.getElementById('snapshot-editor');
    var viewport = getSnapshotEditorViewport();
    if (editor) editor.hidden = true;
    endSnapshotEditorViewportPan();
    if (viewport) {
        viewport.scrollLeft = 0;
        viewport.scrollTop = 0;
        viewport.classList.remove('is-panning');
    }
    if (snapshotEditorState.objectUrl) {
        URL.revokeObjectURL(snapshotEditorState.objectUrl);
    }
    snapshotEditorState.objectUrl = '';
    snapshotEditorState.baseImage = null;
    snapshotEditorState.shapes = [];
    snapshotEditorState.draftShape = null;
    snapshotEditorState.pointerId = null;
    snapshotEditorState.startPoint = null;
    snapshotEditorState.tool = 'rect';
    snapshotEditorState.selectedShapeId = null;
    snapshotEditorState.dragShapeId = null;
    snapshotEditorState.dragStartPoint = null;
    snapshotEditorState.dragStartShape = null;
    snapshotEditorState.viewScale = 1;
    snapshotEditorState.fitScale = 1;
    snapshotEditorState.arrowLineWidth = 18;
    snapshotEditorState.resizeShapeId = null;
    snapshotEditorState.resizeStartPoint = null;
    snapshotEditorState.resizeStartShape = null;
    snapshotEditorState.spacePressed = false;
    snapshotEditorState.history = [];
    snapshotEditorState.historyIndex = -1;
    clearSnapshotEditorDragTimer();
    snapshotEditorState.open = false;
    syncSnapshotEditorToolButtons();
    syncSnapshotEditorColorButtons();
    syncSnapshotEditorArrowWidthControl();
    setSnapshotEditorStatus('请选择工具后在图片上操作。', false);
}

function copySnapshotEditorImage() {
    var canvas = document.getElementById('snapshot-editor-canvas');
    if (!canvas || !snapshotEditorState.baseImage) return;
    canvasToPngBlob(canvas).then(function(blob) {
        return copyPngBlobToClipboard(blob);
    }).then(function() {
        setSnapshotEditorStatus('已复制图片进剪切板。', 'success');
    }).catch(function() {
        setSnapshotEditorStatus('当前环境不支持图片写入剪贴板，请在 Edge/Chrome 中重试。', true);
    });
}

function moveSnapshotEditorShape(shape, deltaX, deltaY) {
    if (!shape || !snapshotEditorState.dragStartShape) return;
    if (shape.type === 'text' || shape.type === 'rect') {
        shape.x = snapshotEditorState.dragStartShape.x + deltaX;
        shape.y = snapshotEditorState.dragStartShape.y + deltaY;
        return;
    }
    if (shape.type === 'arrow') {
        shape.x1 = snapshotEditorState.dragStartShape.x1 + deltaX;
        shape.y1 = snapshotEditorState.dragStartShape.y1 + deltaY;
        shape.x2 = snapshotEditorState.dragStartShape.x2 + deltaX;
        shape.y2 = snapshotEditorState.dragStartShape.y2 + deltaY;
    }
}

function resizeSnapshotEditorTextShape(shape, point) {
    if (!shape || !point || !snapshotEditorState.resizeStartShape) return;
    var canvas = document.getElementById('snapshot-editor-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var startMetrics = getSnapshotEditorTextSelectionMetrics(ctx, snapshotEditorState.resizeStartShape);
    var widthScale = (point.x - startMetrics.x) / Math.max(startMetrics.width, 1);
    var heightScale = (point.y - startMetrics.y) / Math.max(startMetrics.height, 1);
    var nextScale = Math.max(0.4, Math.max(widthScale, heightScale));
    shape.fontSize = Math.max(14, Math.min(180, Math.round(snapshotEditorState.resizeStartShape.fontSize * nextScale)));
}

function setupSnapshotEditor() {
    var editor = document.getElementById('snapshot-editor');
    var panel = editor ? editor.querySelector('.snapshot-editor__panel') : null;
    var canvas = document.getElementById('snapshot-editor-canvas');
    var viewport = getSnapshotEditorViewport();
    if (!editor || !panel || !canvas || !viewport) return;

    if (editor.parentNode !== document.body) {
        document.body.appendChild(editor);
    }

    editor.addEventListener('click', function(event) {
        if (event.target === editor) {
            closeSnapshotEditor();
        }
    });
    panel.addEventListener('click', function(event) {
        event.stopPropagation();
    });
    viewport.addEventListener('pointerdown', function(event) {
        if (!snapshotEditorState.open || event.button !== 1) return;
        event.preventDefault();
        startSnapshotEditorViewportPan(event);
    });
    viewport.addEventListener('pointermove', function(event) {
        if (!snapshotEditorState.open) return;
        moveSnapshotEditorViewportPan(event);
    });
    viewport.addEventListener('pointerup', endSnapshotEditorViewportPan);
    viewport.addEventListener('pointercancel', endSnapshotEditorViewportPan);
    viewport.addEventListener('wheel', function(event) {
        if (!snapshotEditorState.open || !(event.ctrlKey || event.metaKey)) return;
        event.preventDefault();
        adjustSnapshotEditorZoom(event.deltaY < 0 ? 1.12 : (1 / 1.12));
    }, { passive: false });
    canvas.addEventListener('pointerdown', function(event) {
        if (!snapshotEditorState.open) return;
        if (event.button === 1 || (event.button === 0 && snapshotEditorState.spacePressed)) {
            event.preventDefault();
            clearSnapshotEditorDragTimer();
            startSnapshotEditorViewportPan(event);
            return;
        }
        if (event.button !== 0) return;
        var point = getSnapshotEditorCanvasPoint(event);
        if (!point) return;

        clearSnapshotEditorDragTimer();
        var textResizeShape = getSnapshotEditorTextResizeTarget(point);
        if (textResizeShape) {
            setSelectedSnapshotEditorShape(textResizeShape.id);
            snapshotEditorState.pointerId = event.pointerId;
            snapshotEditorState.startPoint = point;
            snapshotEditorState.resizeShapeId = String(textResizeShape.id);
            snapshotEditorState.resizeStartPoint = point;
            snapshotEditorState.resizeStartShape = JSON.parse(JSON.stringify(textResizeShape));
            if (canvas.setPointerCapture) {
                try { canvas.setPointerCapture(event.pointerId); } catch (error) {}
            }
            setSnapshotEditorStatus('拖动文字右下角可缩放。', false);
            return;
        }
        var hitShape = getSnapshotEditorShapeAtPoint(point);
        if (hitShape) {
            setSelectedSnapshotEditorShape(hitShape.id);
            if (hitShape.type === 'text') {
                snapshotEditorState.pointerId = event.pointerId;
                snapshotEditorState.startPoint = point;
                snapshotEditorState.dragStartPoint = point;
                snapshotEditorState.dragStartShape = JSON.parse(JSON.stringify(hitShape));
                snapshotEditorState.dragLongPressTimer = setTimeout(function() {
                    snapshotEditorState.dragShapeId = String(hitShape.id);
                    if (canvas.setPointerCapture) {
                        try { canvas.setPointerCapture(event.pointerId); } catch (error) {}
                    }
                    setSnapshotEditorStatus('拖动字段位置中。', false);
                }, 220);
            }
            return;
        }

        setSelectedSnapshotEditorShape(null);
        if (snapshotEditorState.tool === 'text') {
            var text = window.prompt('输入字段内容', '请确认尺寸');
            if (text === null) return;
            text = String(text || '').trim();
            if (!text) return;
            var textShape = createSnapshotEditorShape('text', point);
            textShape.text = text;
            snapshotEditorState.shapes.push(textShape);
            snapshotEditorState.selectedShapeId = textShape.id;
            commitSnapshotEditorHistory();
            setSnapshotEditorStatus('已添加字段。', false);
            renderSnapshotEditorCanvas();
            return;
        }

        snapshotEditorState.pointerId = event.pointerId;
        snapshotEditorState.startPoint = point;
        snapshotEditorState.draftShape = createSnapshotEditorShape(snapshotEditorState.tool, point);
        if (canvas.setPointerCapture) {
            try { canvas.setPointerCapture(event.pointerId); } catch (error) {}
        }
        renderSnapshotEditorCanvas();
    });
    canvas.addEventListener('pointermove', function(event) {
        if (!snapshotEditorState.open) return;
        if (snapshotEditorState.viewportPanning) {
            moveSnapshotEditorViewportPan(event);
            return;
        }
        if (snapshotEditorState.pointerId !== event.pointerId) return;
        var point = getSnapshotEditorCanvasPoint(event);
        if (!point) return;

        if (snapshotEditorState.dragLongPressTimer && snapshotEditorState.dragShapeId === null && snapshotEditorState.startPoint) {
            if (Math.hypot(point.x - snapshotEditorState.startPoint.x, point.y - snapshotEditorState.startPoint.y) > 8) {
                clearSnapshotEditorDragTimer();
            }
        }

        if (snapshotEditorState.resizeShapeId !== null) {
            var resizeShape = getSnapshotEditorShapeById(snapshotEditorState.resizeShapeId);
            if (!resizeShape) return;
            resizeSnapshotEditorTextShape(resizeShape, point);
            renderSnapshotEditorCanvas();
            return;
        }

        if (snapshotEditorState.dragShapeId !== null) {
            var dragShape = getSnapshotEditorShapeById(snapshotEditorState.dragShapeId);
            if (!dragShape || !snapshotEditorState.dragStartPoint) return;
            moveSnapshotEditorShape(
                dragShape,
                point.x - snapshotEditorState.dragStartPoint.x,
                point.y - snapshotEditorState.dragStartPoint.y
            );
            renderSnapshotEditorCanvas();
            return;
        }

        if (!snapshotEditorState.draftShape || !snapshotEditorState.startPoint) return;
        if (snapshotEditorState.draftShape.type === 'arrow') {
            snapshotEditorState.draftShape.x2 = point.x;
            snapshotEditorState.draftShape.y2 = point.y;
        } else {
            snapshotEditorState.draftShape.width = point.x - snapshotEditorState.startPoint.x;
            snapshotEditorState.draftShape.height = point.y - snapshotEditorState.startPoint.y;
        }
        renderSnapshotEditorCanvas();
    });
    function finishSnapshotEditorPointer(event) {
        if (!snapshotEditorState.open) return;
        if (snapshotEditorState.viewportPanning && snapshotEditorState.viewportPanPointerId === event.pointerId) {
            endSnapshotEditorViewportPan(event);
            return;
        }
        if (snapshotEditorState.pointerId !== event.pointerId) return;
        clearSnapshotEditorDragTimer();
        if (canvas.releasePointerCapture) {
            try { canvas.releasePointerCapture(event.pointerId); } catch (error) {}
        }

        if (snapshotEditorState.resizeShapeId !== null) {
            snapshotEditorState.resizeShapeId = null;
            snapshotEditorState.pointerId = null;
            snapshotEditorState.startPoint = null;
            snapshotEditorState.resizeStartPoint = null;
            snapshotEditorState.resizeStartShape = null;
            commitSnapshotEditorHistory();
            renderSnapshotEditorCanvas();
            return;
        }

        if (snapshotEditorState.dragShapeId !== null) {
            snapshotEditorState.dragShapeId = null;
            snapshotEditorState.pointerId = null;
            snapshotEditorState.startPoint = null;
            snapshotEditorState.dragStartPoint = null;
            snapshotEditorState.dragStartShape = null;
            commitSnapshotEditorHistory();
            renderSnapshotEditorCanvas();
            return;
        }

        if (!snapshotEditorState.draftShape) {
            snapshotEditorState.pointerId = null;
            snapshotEditorState.startPoint = null;
            snapshotEditorState.dragStartPoint = null;
            snapshotEditorState.dragStartShape = null;
            return;
        }

        var finalShape = snapshotEditorState.draftShape.type === 'rect'
            ? normalizeSnapshotDraftShape(snapshotEditorState.draftShape)
            : snapshotEditorState.draftShape;
        snapshotEditorState.pointerId = null;
        snapshotEditorState.startPoint = null;
        snapshotEditorState.dragStartPoint = null;
        snapshotEditorState.dragStartShape = null;
        snapshotEditorState.draftShape = null;

        if (finalShape.type === 'rect' && (!(finalShape.width > 4) || !(finalShape.height > 4))) {
            renderSnapshotEditorCanvas();
            return;
        }
        if (finalShape.type === 'arrow' && Math.hypot(finalShape.x2 - finalShape.x1, finalShape.y2 - finalShape.y1) < 8) {
            renderSnapshotEditorCanvas();
            return;
        }
        snapshotEditorState.shapes.push(finalShape);
        snapshotEditorState.selectedShapeId = finalShape.id;
        commitSnapshotEditorHistory();
        renderSnapshotEditorCanvas();
    }
    canvas.addEventListener('pointerup', finishSnapshotEditorPointer);
    canvas.addEventListener('pointercancel', finishSnapshotEditorPointer);
    document.addEventListener('keydown', function(event) {
        if (!snapshotEditorState.open) return;
        if (!isEditableTarget(event.target) && (event.code === 'Space' || event.key === ' ')) {
            snapshotEditorState.spacePressed = true;
            event.preventDefault();
        }
        if (event.key === 'Escape') {
            closeSnapshotEditor();
            return;
        }
        if (isEditableTarget(event.target)) return;
        if ((event.ctrlKey || event.metaKey) && !event.shiftKey && String(event.key).toLowerCase() === 'z') {
            event.preventDefault();
            undoSnapshotEditor();
            return;
        }
        if ((event.key === 'Delete' || event.key === 'Backspace') && snapshotEditorState.selectedShapeId !== null) {
            event.preventDefault();
            deleteSelectedSnapshotEditorShape();
        }
    });
    document.addEventListener('keyup', function(event) {
        if (!snapshotEditorState.open) return;
        if (event.code === 'Space' || event.key === ' ') {
            snapshotEditorState.spacePressed = false;
        }
    });
    window.addEventListener('resize', function() {
        if (!snapshotEditorState.open) return;
        applySnapshotEditorCanvasLayout();
        centerSnapshotEditorViewport();
    });
}

function openSnapshotEditorWithBlob(blob) {
    return new Promise(function(resolve, reject) {
        var canvas = document.getElementById('snapshot-editor-canvas');
        var editor = document.getElementById('snapshot-editor');
        var viewport = getSnapshotEditorViewport();
        if (!canvas || !editor || !viewport) {
            reject(new Error('SNAPSHOT_EDITOR_UNAVAILABLE'));
            return;
        }
        if (snapshotEditorState.objectUrl) {
            URL.revokeObjectURL(snapshotEditorState.objectUrl);
        }
        snapshotEditorState.objectUrl = URL.createObjectURL(blob);
        var image = new Image();
        image.onload = function() {
            snapshotEditorState.baseImage = image;
            snapshotEditorState.tool = 'rect';
            snapshotEditorState.shapes = [];
            snapshotEditorState.draftShape = null;
            snapshotEditorState.pointerId = null;
            snapshotEditorState.startPoint = null;
            snapshotEditorState.selectedShapeId = null;
            snapshotEditorState.dragShapeId = null;
            snapshotEditorState.dragStartPoint = null;
            snapshotEditorState.dragStartShape = null;
            snapshotEditorState.resizeShapeId = null;
            snapshotEditorState.resizeStartPoint = null;
            snapshotEditorState.resizeStartShape = null;
            snapshotEditorState.viewScale = 0;
            snapshotEditorState.fitScale = 1;
            snapshotEditorState.arrowLineWidth = getDefaultSnapshotEditorArrowWidth();
            snapshotEditorState.spacePressed = false;
            snapshotEditorState.viewportPanPointerId = null;
            snapshotEditorState.viewportPanCaptureTarget = null;
            snapshotEditorState.viewportPanStartClient = null;
            snapshotEditorState.viewportPanStartScroll = null;
            snapshotEditorState.viewportPanning = false;
            snapshotEditorState.nextShapeId = 1;
            snapshotEditorState.history = [[]];
            snapshotEditorState.historyIndex = 0;
            snapshotEditorState.open = true;
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            editor.hidden = false;
            viewport.classList.remove('is-panning');
            syncSnapshotEditorToolButtons();
            syncSnapshotEditorColorButtons();
            syncSnapshotEditorArrowWidthControl();
            applySnapshotEditorCanvasLayout();
            centerSnapshotEditorViewport();
            setSnapshotEditorStatus('请选择工具后在图片上操作。支持 Ctrl+滚轮缩放、空格拖拽视角、Ctrl+Z 撤销，Delete 删除。', false);
            renderSnapshotEditorCanvas();
            resolve();
        };
        image.onerror = function() {
            reject(new Error('SNAPSHOT_IMAGE_LOAD_FAILED'));
        };
        image.src = snapshotEditorState.objectUrl;
    });
}

function openSnapshotEditor() {
    setCaptureBusy(true);
    setCaptureStatus('正在生成编辑图...', false);
    buildSnapshotBlob().then(function(blob) {
        return openSnapshotEditorWithBlob(blob);
    }).then(function() {
        setCaptureBusy(false);
        setCaptureStatus('已打开截图编辑器。', false);
    }).catch(function(error) {
        setCaptureBusy(false);
        if (error && error.message === 'INVALID_DIAGRAM') {
            setCaptureStatus('请先生成有效矢量图。', true);
            alert('请先生成有效矢量图');
            return;
        }
        setCaptureStatus('编辑图生成失败，请稍后重试。', true);
        alert('编辑图生成失败，请稍后重试');
    });
}

function exportDiagramSnapshot() {
    setCaptureBusy(true);
    setCaptureStatus('正在复制截图...', false);
    buildSnapshotBlob().then(function(blob) {
        return copyPngBlobToClipboard(blob);
    }).then(function() {
        setCaptureBusy(false);
        setCaptureStatus('已复制到剪切板', false);
    }).catch(function(error) {
        setCaptureBusy(false);
        if (error && error.message === 'INVALID_DIAGRAM') {
            setCaptureStatus('请先生成有效矢量图。', true);
            alert('请先生成有效矢量图');
            return;
        }
        setCaptureStatus('当前环境不支持图片写入剪贴板，请在 Edge/Chrome 中重试。', true);
        alert('当前环境不支持图片写入剪贴板，请在 Edge/Chrome 中重试');
    });
}

function isEditableTarget(target) {
    if (!target) return false;
    var tagName = (target.tagName || '').toUpperCase();
    if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
    if (target.isContentEditable) return true;
    return false;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    setupReferencePanel();
    setupReferenceViewer();
    setupSnapshotEditor();
    
    // Wire up event listeners
    document.getElementById('reference-dropzone').querySelector('.reference-btn:first-of-type').addEventListener('click', pasteReferenceImage);
    document.getElementById('reference-dropzone').querySelector('.reference-btn:last-of-type').addEventListener('click', clearReferenceImage);
    document.getElementById('capture-edit-btn').addEventListener('click', openSnapshotEditor);
    document.getElementById('capture-btn').addEventListener('click', exportDiagramSnapshot);
    document.querySelectorAll('.snapshot-editor__action').forEach(function(btn, idx) {
        if (idx === 0) btn.addEventListener('click', undoSnapshotEditor);
        if (idx === 1) btn.addEventListener('click', clearSnapshotEditorShapes);
        if (idx === 2) btn.addEventListener('click', copySnapshotEditorImage);
        if (idx === 3) btn.addEventListener('click', closeSnapshotEditor);
    });
    document.querySelectorAll('.snapshot-editor__tool').forEach(function(btn) {
        btn.addEventListener('click', function() {
            setSnapshotEditorTool(btn.id.replace('snapshot-tool-', ''));
        });
    });
    document.querySelectorAll('.snapshot-editor__color').forEach(function(btn, idx) {
        var colors = ['#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#111827'];
        btn.addEventListener('click', function() {
            setSnapshotEditorColor(colors[idx]);
        });
    });
    document.querySelectorAll('.snapshot-editor__zoom button').forEach(function(btn, idx) {
        if (idx === 0) btn.addEventListener('click', function() { adjustSnapshotEditorZoom(1/1.15); });
        if (idx === 2) btn.addEventListener('click', function() { adjustSnapshotEditorZoom(1.15); });
        if (idx === 3) btn.addEventListener('click', resetSnapshotEditorZoom);
    });
    document.getElementById('snapshot-arrow-width').addEventListener('input', function() {
        setSnapshotEditorArrowWidth(this.value);
    });
});
```

