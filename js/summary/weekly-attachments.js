// ===== Weekly Report Attachments (Block XIV) =====
// Storage bucket 'weekly-attachments' (private, 20MB limit, multi-format).
// Table public.weekly_attachments — metadata з RLS (read=all auth, write=admin/editor).
// Pattern: upload via sb.storage → insert metadata; download via signed URL (5min TTL).

import { sb } from '../config.js';

const BUCKET = 'weekly-attachments';
const MAX_FILE_SIZE = 20 * 1024 * 1024;  // 20MB

/**
 * Render attachments section HTML for a given report date.
 * canEdit=true → upload form + delete buttons.
 */
export async function renderAttachments(reportDate, canEdit) {
    if (!reportDate) return '';
    const { data: files, error } = await sb
        .from('weekly_attachments')
        .select('*')
        .eq('report_date', reportDate)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Attachments load error:', error);
        return '';
    }

    let html = '<div class="ws-attachments">';
    html += '<h4 class="ws-attach-title">📎 Вкладення</h4>';

    if (files?.length) {
        html += '<div class="ws-attach-list">';
        for (const f of files) {
            const icon = getFileIcon(f.mime_type);
            const size = formatSize(f.file_size);
            const safeName = escAttr(f.file_name);
            const safePath = escAttr(f.storage_path);
            html += `
                <div class="ws-attach-item" data-id="${f.id}">
                    <span class="ws-attach-icon">${icon}</span>
                    <a class="ws-attach-name" href="#"
                       onclick="downloadAttachment('${safePath}','${safeName}'); return false;">${escHtml(f.file_name)}</a>
                    <span class="ws-attach-size">${size}</span>
                    ${canEdit ? `<button class="ws-attach-delete" onclick="deleteAttachment('${f.id}','${safePath}','${reportDate}')" title="Видалити">✕</button>` : ''}
                </div>`;
        }
        html += '</div>';
    } else {
        html += '<div class="ws-attach-empty">Немає вкладень</div>';
    }

    if (canEdit) {
        html += `
            <div class="ws-attach-upload">
                <label class="ws-attach-upload-btn">📁 Додати файл
                    <input type="file" style="display:none" multiple
                        accept=".docx,.doc,.pdf,.xlsx,.xls,.csv,.pptx,.ppt,.png,.jpg,.jpeg,.gif,.bmp,.svg,.webp,.txt,.rtf,.zip,.rar,.7z"
                        onchange="uploadAttachments(this.files,'${reportDate}'); this.value='';">
                </label>
                <span class="ws-attach-hint">Максимум 20 МБ на файл</span>
            </div>`;
    }

    html += '</div>';
    return html;
}

/**
 * Refresh attachments container in DOM (call after upload/delete).
 */
async function refreshAttachmentsDom(reportDate, canEdit) {
    const el = document.getElementById(`wsAttachments_${reportDate}`);
    if (!el) return;
    el.innerHTML = await renderAttachments(reportDate, canEdit);
}

/**
 * Upload one or more files to storage + create metadata records.
 */
export async function uploadAttachments(fileList, reportDate) {
    // Snapshot FileList → Array BEFORE any await: inline handler does
    // `this.value=''` synchronously after this call, which would otherwise
    // empty the live FileList before async upload chain processes it.
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { alert('Сесія недійсна — перезайдіть'); return; }

    let uploaded = 0;
    for (const file of files) {
        if (file.size > MAX_FILE_SIZE) {
            alert(`Файл "${file.name}" перевищує 20 МБ — пропущено`);
            continue;
        }
        // Storage path: ASCII-only (Supabase Storage rejects Cyrillic та інші
        // non-ASCII chars у object key). Preserve extension lowercase для proper
        // mime detection. Original filename зберігається у DB.file_name.
        const ext = file.name.includes('.') ? '.' + file.name.split('.').pop().toLowerCase() : '';
        const path = `${reportDate}/${crypto.randomUUID()}${ext}`;
        const { error: uploadErr } = await sb.storage
            .from(BUCKET)
            .upload(path, file, { upsert: false });
        if (uploadErr) {
            console.error('Storage upload error:', uploadErr);
            alert(`Помилка завантаження "${file.name}": ${uploadErr.message}`);
            continue;
        }
        const { error: dbErr } = await sb
            .from('weekly_attachments')
            .insert({
                report_date: reportDate,
                file_name: file.name,
                storage_path: path,
                file_size: file.size,
                mime_type: file.type || 'application/octet-stream',
                uploaded_by: user.id,
            });
        if (dbErr) {
            console.error('Attachments DB insert error:', dbErr);
            // Roll back storage object
            await sb.storage.from(BUCKET).remove([path]);
            alert(`Помилка запису метаданих для "${file.name}": ${dbErr.message}`);
            continue;
        }
        uploaded++;
    }
    if (uploaded > 0) {
        // canEdit=true since user must be editor/admin to invoke upload UI
        await refreshAttachmentsDom(reportDate, true);
    }
}

/**
 * Download file via signed URL (5 min TTL).
 */
export async function downloadAttachment(storagePath, fileName) {
    const { data, error } = await sb.storage
        .from(BUCKET)
        .createSignedUrl(storagePath, 300);
    if (error || !data?.signedUrl) {
        alert('Помилка завантаження файлу: ' + (error?.message || 'no URL'));
        return;
    }
    const a = document.createElement('a');
    a.href = data.signedUrl;
    a.download = fileName;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
}

/**
 * Delete attachment (storage object + DB metadata).
 */
export async function deleteAttachment(id, storagePath, reportDate) {
    if (!confirm('Видалити вкладення?')) return;
    const { error: storageErr } = await sb.storage.from(BUCKET).remove([storagePath]);
    if (storageErr) console.warn('Storage delete warning:', storageErr.message);
    const { error: dbErr } = await sb.from('weekly_attachments').delete().eq('id', id);
    if (dbErr) {
        alert('Помилка видалення: ' + dbErr.message);
        return;
    }
    await refreshAttachmentsDom(reportDate, true);
}

// ===== Helpers =====

function getFileIcon(mime) {
    if (!mime) return '📄';
    if (mime.includes('pdf')) return '📕';
    if (mime.includes('word') || mime.includes('document')) return '📘';
    if (mime.includes('sheet') || mime.includes('excel') || mime.includes('csv')) return '📗';
    if (mime.includes('presentation') || mime.includes('powerpoint')) return '📙';
    if (mime.startsWith('image')) return '🖼️';
    if (mime.includes('zip') || mime.includes('rar') || mime.includes('7z') || mime.includes('compressed')) return '📦';
    if (mime.startsWith('text')) return '📝';
    return '📄';
}

function formatSize(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return bytes + ' Б';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' КБ';
    return (bytes / 1048576).toFixed(1) + ' МБ';
}

function escHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
    return String(s ?? '').replace(/'/g, '&#39;').replace(/"/g, '&quot;').replace(/\\/g, '\\\\');
}
