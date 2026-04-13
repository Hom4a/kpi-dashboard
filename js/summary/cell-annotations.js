// ===== Cell Annotations — shared between weekly & monthly =====
import { summaryBlockComments } from './state-summary.js';
import { saveBlockComment, deleteBlockComment } from './db-summary.js';

const ANNO_COLORS = [
    { key: 'green', color: '#4A9D6F', label: 'OK' },
    { key: 'yellow', color: '#E6A817', label: 'Увага' },
    { key: 'red', color: '#E74C3C', label: 'Проблема' },
    { key: 'blue', color: '#3498DB', label: 'Інфо' }
];

function annoKey(section, indicator) { return `cell|${section}|${indicator}`; }

// Find annotation dot by dataset (avoids CSS selector issues with quotes in indicator names)
function findDot(container, section, indicator) {
    for (const dot of container.querySelectorAll('.cell-anno-dot')) {
        if (dot.dataset.indicator === indicator && (!section || dot.dataset.section === section)) return dot;
    }
    return null;
}

/**
 * Initialize cell annotations on a container.
 * @param {HTMLElement} container — the container with .clickable-row elements
 * @param {string} reportType — 'weekly' or 'monthly'
 * @param {string} reportDate — ISO date string
 * @param {object} [opts] — optional { year, month } for monthly save
 */
export function initCellAnnotations(container, reportType, reportDate, opts) {
    // Apply existing annotation dots
    const annos = summaryBlockComments.filter(c =>
        c.report_type === reportType && c.report_date === reportDate && c.block_id?.startsWith('cell|'));
    // Find dots by dataset (avoids CSS selector issues with quotes in names)
    const allDots = container.querySelectorAll('.cell-anno-dot');
    for (const a of annos) {
        const parts = a.block_id.split('|');
        const sec = parts[1] || '';
        const ind = parts[2] || '';
        for (const dot of allDots) {
            if (dot.dataset.indicator === ind && (!sec || dot.dataset.section === sec)) {
                applyDot(dot, a.content);
                break;
            }
        }
    }

    // Right-click on row → annotation popup (event delegation)
    container.addEventListener('contextmenu', e => {
        const row = e.target.closest('.clickable-row');
        if (!row) return;
        e.preventDefault();
        e.stopPropagation();
        const section = row.dataset.section || '';
        const indicator = row.dataset.indicator;
        if (!indicator) return;
        showAnnoPopup(e.clientX, e.clientY, section, indicator, reportType, reportDate, container, opts);
    });
}

function applyDot(dot, content) {
    const clr = content?.match(/^#(\w+)\|/) ? content.match(/^#(\w+)\|/)[1] : 'blue';
    const text = content?.replace(/^#\w+\|/, '') || content;
    dot.style.background = (ANNO_COLORS.find(c => c.key === clr) || ANNO_COLORS[3]).color;
    dot.classList.add('has-anno');
    dot.title = text;
}

function showAnnoPopup(x, y, section, indicator, reportType, reportDate, container, opts) {
    let popup = document.querySelector('.cell-anno-popup');
    if (popup) popup.remove();

    const key = annoKey(section, indicator);
    const existing = summaryBlockComments.find(c =>
        c.report_type === reportType && c.report_date === reportDate && c.block_id === key);
    const existColor = existing?.content?.match(/^#(\w+)\|/) ? existing.content.match(/^#(\w+)\|/)[1] : '';
    const existText = existing ? (existing.content?.replace(/^#\w+\|/, '') || existing.content) : '';

    popup = document.createElement('div');
    popup.className = 'cell-anno-popup';
    popup.innerHTML = `
        <div class="anno-popup-title">${indicator}</div>
        <div class="anno-color-row">${ANNO_COLORS.map(c =>
            `<button class="anno-color-btn${c.key === existColor ? ' active' : ''}" data-color="${c.key}" style="background:${c.color}" title="${c.label}"></button>`
        ).join('')}</div>
        <textarea class="anno-text" placeholder="Коментар..." rows="2">${existText}</textarea>
        <div class="anno-actions">
            <button class="anno-save btn-sm">Зберегти</button>
            ${existing ? '<button class="anno-remove btn-sm">Видалити</button>' : ''}
        </div>`;

    popup.style.left = Math.min(x, window.innerWidth - 280) + 'px';
    popup.style.top = Math.min(y, window.innerHeight - 200) + 'px';
    document.body.appendChild(popup);

    let selectedColor = existColor || '';

    popup.querySelectorAll('.anno-color-btn').forEach(btn => {
        btn.onclick = () => {
            popup.querySelectorAll('.anno-color-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedColor = btn.dataset.color;
        };
    });

    popup.querySelector('.anno-save').onclick = async () => {
        const text = popup.querySelector('.anno-text').value.trim();
        if (!text && !selectedColor) { popup.remove(); return; }
        const content = selectedColor ? `#${selectedColor}|${text}` : text;
        try {
            const saveArgs = { reportType, reportDate, blockId: key, content };
            if (opts?.year) saveArgs.reportYear = opts.year;
            if (opts?.month) saveArgs.reportMonth = opts.month;
            await saveBlockComment(saveArgs);
            const idx = summaryBlockComments.findIndex(c => c.report_type === reportType && c.report_date === reportDate && c.block_id === key);
            const entry = { report_type: reportType, report_date: reportDate, block_id: key, content };
            if (idx >= 0) summaryBlockComments[idx] = { ...summaryBlockComments[idx], ...entry };
            else summaryBlockComments.push(entry);
            const dot = findDot(container, section, indicator);
            if (dot) applyDot(dot, content);
        } catch (e) { console.error('Annotation save error:', e); }
        popup.remove();
    };

    const removeBtn = popup.querySelector('.anno-remove');
    if (removeBtn) {
        removeBtn.onclick = async () => {
            try {
                if (existing?.id) await deleteBlockComment(existing.id);
                const idx = summaryBlockComments.findIndex(c => c.block_id === key && c.report_date === reportDate);
                if (idx >= 0) summaryBlockComments.splice(idx, 1);
                const dot = container.querySelector(
                    section
                        ? `.cell-anno-dot[data-section="${section}"][data-indicator="${indicator}"]`
                        : `.cell-anno-dot[data-indicator="${indicator}"]`
                );
                if (dot) { dot.style.background = ''; dot.classList.remove('has-anno'); dot.title = ''; }
            } catch (e) { console.error('Annotation delete error:', e); }
            popup.remove();
        };
    }

    setTimeout(() => {
        const close = ev => { if (!popup.contains(ev.target)) { popup.remove(); document.removeEventListener('mousedown', close); } };
        document.addEventListener('mousedown', close);
    }, 0);
}
