// ===== Phase 2.5 G.3c-2: TOTP MFA enrollment + disable =====
// Modal-based UI. SDK flow: enroll → (display QR) → challenge + verify.
// Cancel/close під час enrollment cleanup via unenroll() щоб не залишати
// unverified factors у auth.mfa_factors.
//
// Public exports (window-exposed via app.js):
//   openSecurityModal()   — opens #securityModal + renders state
//   closeSecurityModal()  — cleanup + close

import { sb } from './config.js';
import { toast } from './utils.js';

let currentEnrollment = null;  // { factorId, qr_code, secret }
let enrollmentStep = 'idle';   // idle | qr | verifying | done

const $sm = (id) => document.getElementById(id);
const modalEl = () => $sm('securityModal');
const bodyEl = () => $sm('securityModalBody');

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
        ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

export async function openSecurityModal() {
    const m = modalEl();
    if (!m) return;
    m.classList.add('on');
    bodyEl().innerHTML = '<p style="color:var(--text2);font-size:12px">Завантаження...</p>';
    await renderIdleState();
}

export async function closeSecurityModal() {
    // Cleanup unverified factor якщо user closes modal посеред QR step
    if (enrollmentStep === 'qr' && currentEnrollment) {
        try { await sb.auth.mfa.unenroll({ factorId: currentEnrollment.factorId }); }
        catch (e) { /* swallow — best-effort cleanup */ }
    }
    currentEnrollment = null;
    enrollmentStep = 'idle';
    const m = modalEl();
    if (m) m.classList.remove('on');
}

async function renderIdleState() {
    enrollmentStep = 'idle';
    currentEnrollment = null;
    const body = bodyEl();
    const { data, error } = await sb.auth.mfa.listFactors();
    if (error) {
        body.innerHTML = `<p style="color:var(--rose)">Помилка: ${esc(error.message)}</p>`;
        return;
    }
    const verified = (data?.totp || []).filter(f => f.status === 'verified');
    if (verified.length > 0) {
        const f = verified[0];
        const created = f.created_at ? new Date(f.created_at).toLocaleDateString('uk') : '—';
        body.innerHTML = `
            <p style="color:var(--green);margin:0 0 8px">✅ MFA увімкнено</p>
            <p style="font-size:12px;color:var(--text2);margin:0 0 12px;line-height:1.4">
                Активований ${esc(created)}.<br>
                Вхід вимагатиме 6-значний код з застосунку.
            </p>
            <button id="btnDisableMfa" class="btn btn-sm">Вимкнути MFA</button>
        `;
        $sm('btnDisableMfa').onclick = () => handleDisableMFA(f.id);
    } else {
        body.innerHTML = `
            <p style="color:var(--text2);margin:0 0 8px">MFA не налаштовано.</p>
            <p style="font-size:12px;color:var(--text2);margin:0 0 12px;line-height:1.4">
                Двофакторна автентифікація додає 6-значний код з застосунку
                (Google Authenticator, Authy, 1Password) до пароля.
            </p>
            <button id="btnStartEnroll" class="btn">Налаштувати MFA</button>
        `;
        $sm('btnStartEnroll').onclick = handleStartEnroll;
    }
}

async function handleStartEnroll() {
    const body = bodyEl();
    body.innerHTML = '<p style="color:var(--text2);font-size:12px">Створення QR-коду...</p>';
    const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp' });
    if (error || !data) {
        body.innerHTML = `
            <p style="color:var(--rose)">Помилка: ${esc(error?.message || 'unknown')}</p>
            <button class="btn btn-sm" onclick="openSecurityModal()">Назад</button>
        `;
        return;
    }
    currentEnrollment = {
        factorId: data.id,
        qr_code: data.totp.qr_code,
        secret: data.totp.secret,
    };
    enrollmentStep = 'qr';
    body.innerHTML = `
        <p style="font-size:12px;color:var(--text2);margin:0 0 6px">
            1. Відскануйте QR-код у застосунку:
        </p>
        <div style="background:#fff;padding:12px;border-radius:6px;text-align:center;margin-bottom:6px">
            ${data.totp.qr_code}
        </div>
        <p style="font-size:11px;color:var(--text3);margin:0 0 12px">
            Або введіть ключ вручну:
            <code style="user-select:all;background:var(--surface2);padding:2px 6px;border-radius:3px">${esc(data.totp.secret)}</code>
        </p>
        <p style="font-size:12px;color:var(--text2);margin:0 0 6px">
            2. Введіть 6-значний код з застосунку:
        </p>
        <input type="text" id="mfaVerifyCode" class="de-input"
               maxlength="6" pattern="[0-9]{6}" inputmode="numeric" autocomplete="one-time-code"
               placeholder="123456"
               style="width:100%;font-family:monospace;font-size:16px;letter-spacing:4px;text-align:center">
        <div id="mfaVerifyStatus" style="margin-top:6px;font-size:11px;min-height:14px"></div>
        <div style="display:flex;gap:6px;margin-top:8px">
            <button id="btnVerifyEnroll" class="btn" style="flex:1">Підтвердити</button>
            <button id="btnCancelEnroll" class="btn btn-sm">Скасувати</button>
        </div>
    `;
    $sm('btnVerifyEnroll').onclick = handleVerifyEnroll;
    $sm('btnCancelEnroll').onclick = handleCancelEnroll;
    const codeInput = $sm('mfaVerifyCode');
    codeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); handleVerifyEnroll(); }
    });
    setTimeout(() => codeInput?.focus(), 100);
}

async function handleVerifyEnroll() {
    if (!currentEnrollment) return;
    const codeEl = $sm('mfaVerifyCode');
    const statusEl = $sm('mfaVerifyStatus');
    const btn = $sm('btnVerifyEnroll');
    const code = (codeEl?.value || '').trim();
    if (!/^\d{6}$/.test(code)) {
        statusEl.innerHTML = '<span style="color:var(--rose)">Введіть рівно 6 цифр</span>';
        return;
    }
    btn.disabled = true;
    btn.textContent = 'Перевірка...';
    statusEl.innerHTML = '';
    enrollmentStep = 'verifying';
    try {
        const { data: ch, error: chErr } = await sb.auth.mfa.challenge({
            factorId: currentEnrollment.factorId,
        });
        if (chErr) throw chErr;
        const { error: vErr } = await sb.auth.mfa.verify({
            factorId: currentEnrollment.factorId,
            challengeId: ch.id,
            code,
        });
        if (vErr) throw vErr;
        enrollmentStep = 'done';
        currentEnrollment = null;
        toast('MFA успішно налаштовано');
        await renderIdleState();
    } catch (e) {
        btn.disabled = false;
        btn.textContent = 'Підтвердити';
        statusEl.innerHTML = '<span style="color:var(--rose)">Невірний код. Спробуйте ще раз.</span>';
        enrollmentStep = 'qr';
        if (codeEl) { codeEl.value = ''; codeEl.focus(); }
    }
}

async function handleCancelEnroll() {
    if (currentEnrollment) {
        try { await sb.auth.mfa.unenroll({ factorId: currentEnrollment.factorId }); }
        catch (e) { /* best-effort */ }
    }
    await renderIdleState();
}

async function handleDisableMFA(factorId) {
    if (!confirm('Вимкнути двофакторну автентифікацію?\n\nПісля цього вхід буде тільки за паролем.')) return;
    const { error } = await sb.auth.mfa.unenroll({ factorId });
    if (error) {
        toast('Помилка: ' + error.message, true);
        return;
    }
    toast('MFA вимкнено');
    await renderIdleState();
}
