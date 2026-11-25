const STORAGE_KEY = 'lost-poem-reader:v1';

const DEFAULT_STATE = {
	settings: {
		mode: 'paginated',
		theme: 'paper',
		font: 'serif',
		fontSize: 18,
		lineHeight: 1.85,
		pageWidth: 680
	},
	progress: {
		chapterId: null,
		pageRatio: 0,
		scrollRatio: 0
	},
	highlights: []
};

const state = loadState();
let currentPage = 0;
let totalPages = 1;
let colStride = 680;
let pendingRange = null;
let activeHighlightId = null;
let touchStartX = null;
let touchStartY = null;

const metaEl = document.getElementById('mopress-meta');
const pageMeta = {
	bookTitle: metaEl?.dataset.bookTitle || 'Lost Poem',
	chapterTitle: metaEl?.dataset.chapterTitle || 'Lost Poem',
	currentUrl: metaEl?.dataset.current || location.pathname,
	prevUrl: metaEl?.dataset.prev || '',
	nextUrl: metaEl?.dataset.next || ''
};

// Derive stable chapter ID from current page path (e.g. "/A0.html" -> "A0")
const currentChapterId = deriveChapterId(pageMeta.currentUrl);

const el = {
	topBar: document.getElementById('top-bar'),
	bottomBar: document.getElementById('bottom-bar'),
	stage: document.getElementById('reader-stage'),
	viewport: document.getElementById('reader-viewport'),
	columns: document.getElementById('reader-columns'),
	content: document.getElementById('chapter-content'),
	pageIndicator: document.getElementById('page-indicator'),
	pageSlider: document.getElementById('page-slider'),
	btnPrevChap: document.getElementById('btn-prev-chap'),
	btnNextChap: document.getElementById('btn-next-chap'),
	zonePrev: document.getElementById('zone-prev'),
	zoneNext: document.getElementById('zone-next'),
	selToolbar: document.getElementById('selection-toolbar'),
	notePopover: document.getElementById('note-popover'),
	popoverQuote: document.getElementById('popover-quote'),
	popoverTextarea: document.getElementById('popover-textarea'),
	backdrop: document.getElementById('drawer-backdrop'),
	tocDrawer: document.getElementById('toc-drawer'),
	notesDrawer: document.getElementById('notes-drawer'),
	notesList: document.getElementById('notes-list'),
	notesBadge: document.getElementById('notes-badge'),
	settingsDrawer: document.getElementById('settings-drawer'),
	toast: document.getElementById('toast')
};

function deriveChapterId(urlPath) {
	const clean = (urlPath || '').split(/[?#]/)[0];
	const name = clean.split('/').pop() || 'index.html';
	return name.replace(/\.html$/i, '') || 'index';
}

function loadState() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return structuredClone(DEFAULT_STATE);
		const parsed = JSON.parse(raw);
		return {
			settings: { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) },
			progress: { ...DEFAULT_STATE.progress, ...(parsed.progress || {}) },
			highlights: Array.isArray(parsed.highlights) ? parsed.highlights : []
		};
	} catch {
		return structuredClone(DEFAULT_STATE);
	}
}

function saveState() {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	updateNotesBadge();
}

function showToast(msg) {
	el.toast.textContent = msg;
	el.toast.classList.remove('hidden');
	clearTimeout(showToast._timer);
	showToast._timer = setTimeout(() => el.toast.classList.add('hidden'), 2000);
}

function applySettings() {
	const s = state.settings;
	document.body.dataset.theme = s.theme;
	document.body.dataset.mode = s.mode;
	document.documentElement.style.setProperty(
		'--reader-font',
		s.font === 'sans' ? 'var(--font-sans)' : 'var(--font-serif)'
	);
	document.documentElement.style.setProperty('--reader-font-size', `${s.fontSize}px`);
	document.documentElement.style.setProperty('--reader-line-height', String(s.lineHeight));
	document.documentElement.style.setProperty('--reader-max-width', `${s.pageWidth}px`);

	document.getElementById('val-font-size').textContent = `${s.fontSize}px`;
	document.getElementById('val-line-height').textContent = s.lineHeight.toFixed(2);
	document.getElementById('val-page-width').textContent = `${s.pageWidth}px`;
	document.getElementById('range-font-size').value = String(s.fontSize);
	document.getElementById('range-line-height').value = String(s.lineHeight);
	document.getElementById('range-page-width').value = String(s.pageWidth);

	document.querySelectorAll('#seg-mode button').forEach((b) => {
		b.classList.toggle('active', b.dataset.value === s.mode);
	});
	document.querySelectorAll('#seg-font button').forEach((b) => {
		b.classList.toggle('active', b.dataset.value === s.font);
	});
	document.querySelectorAll('#theme-grid .theme-chip').forEach((b) => {
		b.classList.toggle('active', b.dataset.theme === s.theme);
	});
}

function recalcLayout(preserveRatio = true) {
	if (state.settings.mode === 'scroll') {
		el.columns.style.transform = 'none';
		updateScrollIndicator();
		return;
	}

	const prevRatio = totalPages > 1 ? currentPage / (totalPages - 1) : 0;
	const viewportWidth = Math.max(240, Math.floor(el.viewport.clientWidth));
	const gap = viewportWidth < 520 ? 32 : 64;

	document.documentElement.style.setProperty('--col-width', `${viewportWidth}px`);
	document.documentElement.style.setProperty('--col-gap', `${gap}px`);
	colStride = viewportWidth + gap;

	void el.columns.offsetWidth;
	const scrollW = el.columns.scrollWidth;
	totalPages = Math.max(1, Math.round((scrollW + gap) / colStride));

	if (preserveRatio) {
		currentPage = Math.min(totalPages - 1, Math.max(0, Math.round(prevRatio * (totalPages - 1))));
	} else {
		currentPage = Math.min(totalPages - 1, Math.max(0, currentPage));
	}

	renderPagePosition();
}

function renderPagePosition() {
	if (state.settings.mode === 'paginated') {
		el.columns.style.transform = `translateX(-${currentPage * colStride}px)`;
		el.pageIndicator.textContent = `${currentPage + 1} / ${totalPages}`;
		el.pageSlider.max = String(totalPages);
		el.pageSlider.value = String(currentPage + 1);
		state.progress.chapterId = currentChapterId;
		state.progress.chapterUrl = pageMeta.currentUrl;
		state.progress.pageRatio = totalPages > 1 ? currentPage / (totalPages - 1) : 0;
		saveState();
	}
}

function updateScrollIndicator() {
	const maxScroll = Math.max(1, el.stage.scrollHeight - el.stage.clientHeight);
	const ratio = Math.min(1, Math.max(0, el.stage.scrollTop / maxScroll));
	const pct = Math.round(ratio * 100);
	el.pageIndicator.textContent = `${pct}%`;
	el.pageSlider.max = '100';
	el.pageSlider.value = String(pct);
	state.progress.chapterId = currentChapterId;
	state.progress.chapterUrl = pageMeta.currentUrl;
	state.progress.scrollRatio = ratio;
	saveState();
}

function navigateTo(url, hash = '') {
	if (!url) return;
	window.location.href = hash ? `${url}#${hash}` : url;
}

function nextPage() {
	if (state.settings.mode !== 'paginated') return;
	if (currentPage < totalPages - 1) {
		currentPage++;
		renderPagePosition();
	} else if (pageMeta.nextUrl) {
		navigateTo(pageMeta.nextUrl);
	}
}

function prevPage() {
	if (state.settings.mode !== 'paginated') return;
	if (currentPage > 0) {
		currentPage--;
		renderPagePosition();
	} else if (pageMeta.prevUrl) {
		navigateTo(pageMeta.prevUrl, 'end');
	}
}

/* ---------- Block Indexing & Text Highlighting ---------- */
function getBlocks() {
	return Array.from(el.content.querySelectorAll('p, blockquote, h1, h2, h3, h4, h5, h6, li'));
}

function indexBlocks() {
	const blocks = getBlocks();
	blocks.forEach((b, i) => {
		b.dataset.blockIdx = String(i);
	});
}

function getOffsetInBlock(block, targetNode, targetOffset) {
	const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
	let offset = 0;
	let node;
	while ((node = walker.nextNode())) {
		if (node === targetNode) {
			return offset + targetOffset;
		}
		offset += node.textContent.length;
	}
	return offset;
}

function findBlockAncestor(node) {
	let cur = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
	while (cur && cur !== el.content) {
		if (cur.dataset && cur.dataset.blockIdx !== undefined) return cur;
		cur = cur.parentElement;
	}
	return null;
}

function serializeRange(range) {
	const startBlockEl = findBlockAncestor(range.startContainer);
	const endBlockEl = findBlockAncestor(range.endContainer);
	if (!startBlockEl || !endBlockEl) return null;

	const startBlock = Number(startBlockEl.dataset.blockIdx);
	const endBlock = Number(endBlockEl.dataset.blockIdx);
	const startOffset = getOffsetInBlock(startBlockEl, range.startContainer, range.startOffset);
	const endOffset = getOffsetInBlock(endBlockEl, range.endContainer, range.endOffset);
	const quote = range.toString().trim();
	if (!quote) return null;

	return { startBlock, startOffset, endBlock, endOffset, quote };
}

function wrapRangeInBlock(blockEl, startOff, endOff, hl) {
	const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
	const segments = [];
	let cursor = 0;
	let node;

	while ((node = walker.nextNode())) {
		const len = node.textContent.length;
		const nodeStart = cursor;
		const nodeEnd = cursor + len;
		cursor = nodeEnd;

		if (nodeEnd <= startOff || nodeStart >= endOff) continue;
		if (node.parentElement?.closest('mark.hl')) continue;

		const localStart = Math.max(0, startOff - nodeStart);
		const localEnd = Math.min(len, endOff - nodeStart);
		if (localEnd > localStart) {
			segments.push({ node, localStart, localEnd });
		}
	}

	for (const seg of segments) {
		const r = document.createRange();
		r.setStart(seg.node, seg.localStart);
		r.setEnd(seg.node, seg.localEnd);
		const mark = document.createElement('mark');
		mark.className = `hl hl-${hl.color}${hl.note ? ' has-note' : ''}`;
		mark.dataset.hlId = hl.id;
		try {
			r.surroundContents(mark);
		} catch {
			// Ignore edge cases with split inline nodes
		}
	}
}

function applyChapterHighlights() {
	el.content.querySelectorAll('mark.hl').forEach((mark) => {
		const parent = mark.parentNode;
		while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
		parent.removeChild(mark);
		parent.normalize();
	});

	const blocks = getBlocks();
	const list = state.highlights.filter((h) => h.chapterId === currentChapterId);

	for (const hl of list) {
		for (let bIdx = hl.startBlock; bIdx <= hl.endBlock; bIdx++) {
			const blockEl = blocks[bIdx];
			if (!blockEl) continue;
			const blockLen = blockEl.textContent.length;
			const s = bIdx === hl.startBlock ? hl.startOffset : 0;
			const e = bIdx === hl.endBlock ? hl.endOffset : blockLen;
			if (e > s) {
				wrapRangeInBlock(blockEl, s, e, hl);
			}
		}
	}
}

function jumpToHighlightInDom(hlId) {
	const mark = el.content.querySelector(`mark.hl[data-hl-id="${hlId}"]`);
	if (!mark) return;
	if (state.settings.mode === 'paginated') {
		const markLeft = mark.getBoundingClientRect().left - el.columns.getBoundingClientRect().left;
		currentPage = Math.max(0, Math.min(totalPages - 1, Math.floor(markLeft / colStride)));
		renderPagePosition();
	} else {
		mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}
}

function createHighlight(color, openNote = false) {
	if (!pendingRange) return;
	const serialized = serializeRange(pendingRange);
	if (!serialized) return;

	const hl = {
		id: `hl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
		chapterId: currentChapterId,
		chapterUrl: pageMeta.currentUrl,
		chapterTitle: pageMeta.chapterTitle,
		color,
		note: '',
		createdAt: new Date().toISOString(),
		...serialized
	};

	state.highlights.push(hl);
	saveState();
	applyChapterHighlights();
	hideSelectionToolbar();
	window.getSelection()?.removeAllRanges();

	if (openNote) {
		const mark = el.content.querySelector(`mark.hl[data-hl-id="${hl.id}"]`);
		if (mark) openNotePopover(hl.id, mark);
	}
}

function hideSelectionToolbar() {
	el.selToolbar.classList.add('hidden');
	pendingRange = null;
}

function positionPopup(popup, rect) {
	popup.classList.remove('hidden');
	const popRect = popup.getBoundingClientRect();
	let left = rect.left + rect.width / 2 - popRect.width / 2;
	left = Math.max(12, Math.min(window.innerWidth - popRect.width - 12, left));
	let top = rect.top - popRect.height - 10;
	if (top < 12) top = rect.bottom + 10;
	top = Math.min(window.innerHeight - popRect.height - 12, top);
	popup.style.left = `${left}px`;
	popup.style.top = `${top}px`;
}

function openNotePopover(hlId, anchorEl) {
	const hl = state.highlights.find((h) => h.id === hlId);
	if (!hl) return;
	activeHighlightId = hlId;
	el.popoverQuote.textContent = hl.quote;
	el.popoverTextarea.value = hl.note || '';
	positionPopup(el.notePopover, anchorEl.getBoundingClientRect());
}

function closeNotePopover() {
	el.notePopover.classList.add('hidden');
	activeHighlightId = null;
}

/* ---------- Drawers & Export ---------- */
function closeAllDrawers() {
	el.tocDrawer.classList.add('hidden');
	el.notesDrawer.classList.add('hidden');
	el.settingsDrawer.classList.add('hidden');
	el.backdrop.classList.add('hidden');
}

function openDrawer(drawerEl) {
	closeAllDrawers();
	drawerEl.classList.remove('hidden');
	el.backdrop.classList.remove('hidden');
}

function updateNotesBadge() {
	const count = state.highlights.length;
	el.notesBadge.textContent = String(count);
	el.notesBadge.classList.toggle('hidden', count === 0);
}

function renderNotesDrawer() {
	el.notesList.innerHTML = '';
	if (state.highlights.length === 0) {
		el.notesList.innerHTML = '<p style="color:var(--text-muted);font-size:13px;">选中正文文字即可划线或写笔记。</p>';
		return;
	}

	const sorted = [...state.highlights].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	for (const hl of sorted) {
		const card = document.createElement('div');
		card.className = 'note-card';
		card.innerHTML = `
			<div class="note-card-meta">
				<span>${escapeHtml(hl.chapterTitle || hl.chapterId)}</span>
				<span>${new Date(hl.createdAt).toLocaleDateString()}</span>
			</div>
			<blockquote class="note-card-quote">${escapeHtml(hl.quote)}</blockquote>
			${hl.note ? `<p class="note-card-body">${escapeHtml(hl.note)}</p>` : ''}
		`;
		card.addEventListener('click', () => {
			closeAllDrawers();
			if (currentChapterId !== hl.chapterId) {
				navigateTo(hl.chapterUrl || `${hl.chapterId}.html`, `hl=${hl.id}`);
			} else {
				jumpToHighlightInDom(hl.id);
			}
		});
		el.notesList.appendChild(card);
	}
}

function downloadFile(filename, content, mime) {
	const blob = new Blob([content], { type: mime });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

function escapeHtml(str) {
	return String(str)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/* ---------- Events ---------- */
function bindEvents() {
	el.stage.addEventListener('contextmenu', (e) => {
		e.preventDefault();
	});

	el.stage.addEventListener('click', (e) => {
		if (e.target.closest('mark.hl') || e.target.closest('.page-arrow') || e.target.closest('a')) return;
		const sel = window.getSelection();
		if (sel && sel.toString().trim().length > 0) return;

		closeNotePopover();
		if (state.settings.mode === 'paginated') {
			const xRatio = e.clientX / window.innerWidth;
			if (xRatio < 0.25) {
				prevPage();
				return;
			}
			if (xRatio > 0.75) {
				nextPage();
				return;
			}
		}
		document.body.classList.toggle('chrome-hidden');
	});

	el.zonePrev.addEventListener('click', (e) => {
		e.stopPropagation();
		prevPage();
	});
	el.zoneNext.addEventListener('click', (e) => {
		e.stopPropagation();
		nextPage();
	});

	el.stage.addEventListener('touchstart', (e) => {
		if (e.touches.length !== 1) return;
		touchStartX = e.touches[0].clientX;
		touchStartY = e.touches[0].clientY;
	}, { passive: true });

	el.stage.addEventListener('touchend', (e) => {
		if (touchStartX === null || state.settings.mode !== 'paginated') return;
		const sel = window.getSelection();
		if (sel && sel.toString().trim().length > 0) {
			touchStartX = null;
			return;
		}
		const dx = e.changedTouches[0].clientX - touchStartX;
		const dy = e.changedTouches[0].clientY - touchStartY;
		touchStartX = null;
		touchStartY = null;
		if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.3) {
			if (dx < 0) nextPage();
			else prevPage();
		}
	}, { passive: true });

	document.addEventListener('mouseup', () => {
		setTimeout(() => {
			const sel = window.getSelection();
			if (!sel || sel.isCollapsed || !sel.toString().trim()) {
				hideSelectionToolbar();
				return;
			}
			const range = sel.getRangeAt(0);
			if (!el.content.contains(range.commonAncestorContainer)) {
				hideSelectionToolbar();
				return;
			}
			pendingRange = range.cloneRange();
			positionPopup(el.selToolbar, range.getBoundingClientRect());
		}, 10);
	});

	el.selToolbar.querySelectorAll('.hl-dot').forEach((btn) => {
		btn.addEventListener('click', (e) => {
			e.stopPropagation();
			createHighlight(btn.dataset.color, false);
		});
	});

	document.getElementById('btn-sel-note').addEventListener('click', (e) => {
		e.stopPropagation();
		createHighlight('amber', true);
	});

	document.getElementById('btn-sel-copy').addEventListener('click', async (e) => {
		e.stopPropagation();
		if (!pendingRange) return;
		await navigator.clipboard.writeText(pendingRange.toString());
		hideSelectionToolbar();
		window.getSelection()?.removeAllRanges();
		showToast('已复制');
	});

	el.content.addEventListener('click', (e) => {
		const mark = e.target.closest('mark.hl');
		if (!mark) return;
		e.stopPropagation();
		openNotePopover(mark.dataset.hlId, mark);
	});

	el.notePopover.querySelectorAll('.hl-dot').forEach((btn) => {
		btn.addEventListener('click', () => {
			const hl = state.highlights.find((h) => h.id === activeHighlightId);
			if (!hl) return;
			hl.color = btn.dataset.color;
			saveState();
			applyChapterHighlights();
		});
	});

	document.getElementById('btn-hl-delete').addEventListener('click', () => {
		state.highlights = state.highlights.filter((h) => h.id !== activeHighlightId);
		saveState();
		applyChapterHighlights();
		closeNotePopover();
		showToast('已删除划线');
	});

	document.getElementById('btn-popover-close').addEventListener('click', closeNotePopover);
	document.getElementById('btn-popover-save').addEventListener('click', () => {
		const hl = state.highlights.find((h) => h.id === activeHighlightId);
		if (hl) {
			hl.note = el.popoverTextarea.value.trim();
			saveState();
			applyChapterHighlights();
			showToast('笔记已保存');
		}
		closeNotePopover();
	});

	document.getElementById('btn-toc').addEventListener('click', () => openDrawer(el.tocDrawer));
	document.getElementById('btn-notes').addEventListener('click', () => {
		renderNotesDrawer();
		openDrawer(el.notesDrawer);
	});
	document.getElementById('btn-settings').addEventListener('click', () => openDrawer(el.settingsDrawer));
	el.backdrop.addEventListener('click', closeAllDrawers);
	document.querySelectorAll('.drawer-close').forEach((btn) => {
		btn.addEventListener('click', closeAllDrawers);
	});

	el.btnPrevChap.addEventListener('click', () => navigateTo(pageMeta.prevUrl));
	el.btnNextChap.addEventListener('click', () => navigateTo(pageMeta.nextUrl));

	el.pageSlider.addEventListener('input', (e) => {
		const val = Number(e.target.value);
		if (state.settings.mode === 'paginated') {
			currentPage = Math.max(0, Math.min(totalPages - 1, val - 1));
			renderPagePosition();
		} else {
			const maxScroll = Math.max(0, el.stage.scrollHeight - el.stage.clientHeight);
			el.stage.scrollTop = (val / 100) * maxScroll;
		}
	});

	el.stage.addEventListener('scroll', () => {
		if (state.settings.mode === 'scroll') updateScrollIndicator();
	});

	document.querySelectorAll('#seg-mode button').forEach((btn) => {
		btn.addEventListener('click', () => {
			state.settings.mode = btn.dataset.value;
			saveState();
			applySettings();
			recalcLayout(false);
		});
	});
	document.querySelectorAll('#seg-font button').forEach((btn) => {
		btn.addEventListener('click', () => {
			state.settings.font = btn.dataset.value;
			saveState();
			applySettings();
			recalcLayout(true);
		});
	});
	document.querySelectorAll('#theme-grid .theme-chip').forEach((btn) => {
		btn.addEventListener('click', () => {
			state.settings.theme = btn.dataset.theme;
			saveState();
			applySettings();
		});
	});

	document.getElementById('range-font-size').addEventListener('input', (e) => {
		state.settings.fontSize = Number(e.target.value);
		saveState();
		applySettings();
		recalcLayout(true);
	});
	document.getElementById('range-line-height').addEventListener('input', (e) => {
		state.settings.lineHeight = Number(e.target.value);
		saveState();
		applySettings();
		recalcLayout(true);
	});
	document.getElementById('range-page-width').addEventListener('input', (e) => {
		state.settings.pageWidth = Number(e.target.value);
		saveState();
		applySettings();
		recalcLayout(true);
	});

	document.getElementById('btn-export-md').addEventListener('click', () => {
		let md = `# ${pageMeta.bookTitle} 划线与笔记\n\n`;
		for (const hl of state.highlights) {
			md += `## ${hl.chapterTitle || hl.chapterId}\n\n> ${hl.quote}\n\n`;
			if (hl.note) md += `**笔记**：${hl.note}\n\n`;
			md += `---\n\n`;
		}
		downloadFile('lost-poem-notes.md', md, 'text/markdown;charset=utf-8');
	});

	document.getElementById('btn-export-json').addEventListener('click', () => {
		downloadFile('lost-poem-notes.json', JSON.stringify(state.highlights, null, 2), 'application/json');
	});

	document.getElementById('input-import-json').addEventListener('change', async (e) => {
		const file = e.target.files?.[0];
		if (!file) return;
		try {
			const data = JSON.parse(await file.text());
			if (!Array.isArray(data)) throw new Error('Invalid format');
			const existingIds = new Set(state.highlights.map((h) => h.id));
			let added = 0;
			for (const item of data) {
				if (item.id && !existingIds.has(item.id)) {
					state.highlights.push(item);
					added++;
				}
			}
			saveState();
			applyChapterHighlights();
			renderNotesDrawer();
			showToast(`已导入 ${added} 条笔记`);
		} catch {
			showToast('导入失败：JSON 格式无效');
		}
		e.target.value = '';
	});

	document.addEventListener('keydown', (e) => {
		if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
		if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
			if (state.settings.mode === 'paginated') {
				e.preventDefault();
				nextPage();
			}
		} else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
			if (state.settings.mode === 'paginated') {
				e.preventDefault();
				prevPage();
			}
		} else if (e.key.toLowerCase() === 'm') {
			openDrawer(el.tocDrawer);
		} else if (e.key.toLowerCase() === 'n') {
			renderNotesDrawer();
			openDrawer(el.notesDrawer);
		} else if (e.key.toLowerCase() === 's') {
			openDrawer(el.settingsDrawer);
		} else if (e.key === 'Escape') {
			closeAllDrawers();
			closeNotePopover();
			hideSelectionToolbar();
		}
	});

	window.addEventListener('resize', () => {
		recalcLayout(true);
	});
}

function init() {
	// If on index cover page and user has previous progress, auto-resume
	if (currentChapterId === 'index' && state.progress.chapterUrl && state.progress.chapterId !== 'index') {
		navigateTo(state.progress.chapterUrl);
		return;
	}

	applySettings();
	updateNotesBadge();
	indexBlocks();
	applyChapterHighlights();
	bindEvents();

	const hash = location.hash.replace(/^#/, '');
	if (state.settings.mode === 'paginated') {
		recalcLayout(false);
		if (hash === 'end') {
			currentPage = totalPages - 1;
			renderPagePosition();
		} else if (hash.startsWith('hl=')) {
			jumpToHighlightInDom(hash.slice(3));
		} else if (state.progress.chapterId === currentChapterId && state.progress.pageRatio > 0) {
			currentPage = Math.min(totalPages - 1, Math.round(state.progress.pageRatio * (totalPages - 1)));
			renderPagePosition();
		}
	} else {
		if (hash.startsWith('hl=')) {
			jumpToHighlightInDom(hash.slice(3));
		} else if (state.progress.chapterId === currentChapterId && state.progress.scrollRatio > 0) {
			const maxScroll = Math.max(0, el.stage.scrollHeight - el.stage.clientHeight);
			el.stage.scrollTop = maxScroll * state.progress.scrollRatio;
		}
		updateScrollIndicator();
	}
}

init();
