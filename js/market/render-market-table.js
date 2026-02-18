// ===== Market Dashboard — Table =====
import { $, fmt } from '../utils.js';
import { filteredMarketPrices, marketUaDetail, marketMeta, marketFilterState, allPeriods } from './state-market.js';

let _tableMode = 'countries'; // 'countries' | 'sources' | 'exchanges'

export function setMarketTableMode(m) { _tableMode = m; }
export function getMarketTableMode() { return _tableMode; }

export function renderMarketTable() {
    const tbody = $('tblBodyMarket');
    const thead = $('tblHeadMarket');
    if (!tbody) return;

    if (_tableMode === 'exchanges') {
        renderExchangeTable(thead, tbody);
    } else {
        renderPricesTable(thead, tbody);
    }
}

function renderPricesTable(thead, tbody) {
    const showSources = _tableMode === 'sources';
    const rows = showSources
        ? filteredMarketPrices.filter(r => r.row_type !== 'average')
        : filteredMarketPrices.filter(r => r.row_type === 'country' || r.row_type === 'average');

    if (thead) {
        thead.innerHTML = `<tr>
            <th>Назва</th><th>Сосна</th><th>Ялина</th><th>Вільха</th>
            <th>Береза</th><th>Дуб</th><th>Сосна (др.)</th><th>Ялина (др.)</th>
            <th>Береза (др.)</th><th>Сер.</th>
        </tr>`;
    }

    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--text3)">Немає даних</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map(r => {
        const isAvg = r.row_type === 'average';
        const isSource = r.row_type === 'source';
        const name = isSource ? `&nbsp;&nbsp;↳ ${esc(r.source_name || r.country)}` : esc(r.country);
        const style = isAvg ? 'font-weight:700;background:var(--glass2)' : (isSource ? 'font-size:11px;color:var(--text2)' : '');
        return `<tr style="${style}">
            <td>${name}</td>
            <td>${fmtEur(r.pine_business)}</td>
            <td>${fmtEur(r.spruce_business)}</td>
            <td>${fmtEur(r.alder_business)}</td>
            <td>${fmtEur(r.birch_business)}</td>
            <td>${fmtEur(r.oak_business)}</td>
            <td>${fmtEur(r.pine_firewood)}</td>
            <td>${fmtEur(r.spruce_firewood)}</td>
            <td>${fmtEur(r.birch_firewood)}</td>
            <td style="font-weight:600">${fmtEur(r.avg_price)}</td>
        </tr>`;
    }).join('');
}

function renderExchangeTable(thead, tbody) {
    const exchanges = ['УЕБ', 'УУБ', 'УРБ'];
    const activePeriod = marketFilterState.period || allPeriods[0] || '';
    const periodUa = activePeriod ? marketUaDetail.filter(r => r.period === activePeriod) : marketUaDetail;
    const data = periodUa.filter(r => exchanges.includes(r.exchange));

    if (thead) {
        thead.innerHTML = `<tr>
            <th>Біржа</th><th>Порода</th><th>Обсяг м³</th>
            <th>Сума грн</th><th>Ціна грн/м³</th><th>Ціна EUR</th>
        </tr>`;
    }

    if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text3)">Немає даних</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(r => `<tr>
        <td><span class="role-badge" style="font-size:10px;padding:1px 6px">${esc(r.exchange)}</span></td>
        <td>${esc(r.species)}</td>
        <td>${r.volume_m3 != null ? fmt(r.volume_m3, 1) : '—'}</td>
        <td>${r.total_uah != null ? fmt(r.total_uah, 0) : '—'}</td>
        <td style="font-weight:600">${r.avg_price_uah != null ? fmt(r.avg_price_uah, 0) : '—'}</td>
        <td>€${r.avg_price_eur != null ? fmt(r.avg_price_eur, 2) : '—'}</td>
    </tr>`).join('');
}

function fmtEur(v) {
    if (v == null || v === 0) return '<span style="color:var(--text3)">—</span>';
    return '€' + fmt(v, 2);
}

function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
