// ===== Executive PDF Report Generator =====
// Uses html2canvas + jsPDF to capture dashboard as PDF
import { computeExecMetrics, execCharts } from './state-executive.js';
import { toast } from '../utils.js';

export async function generateExecutiveReport() {
    const m = await computeExecMetrics();
    if (!m.hasData) {
        toast('Немає даних для звіту', true);
        return;
    }

    toast('Генерація PDF звіту...');

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const pageW = 297, pageH = 210;
        const margin = 10;
        const contentW = pageW - margin * 2;

        // ===== Page 1: Title + KPI Cards =====
        addHeader(doc, margin, 'Звіт керівника — ДП Ліси України');

        // Capture KPI grid
        const kpiGrid = document.getElementById('kpiGridExec');
        if (kpiGrid) {
            const kpiImg = await captureElement(kpiGrid);
            const kpiH = calcHeight(kpiGrid, contentW);
            doc.addImage(kpiImg, 'PNG', margin, 30, contentW, Math.min(kpiH, 80));
        }

        // Capture Scorecard table
        const scorecard = document.getElementById('execScorecardCard');
        if (scorecard) {
            const scImg = await captureElement(scorecard);
            const scH = calcHeight(scorecard, contentW);
            const yPos = kpiGrid ? Math.min(calcHeight(kpiGrid, contentW), 80) + 35 : 35;
            if (yPos + scH > pageH - margin) {
                doc.addPage();
                addHeader(doc, margin, 'Scorecard регіонів');
                doc.addImage(scImg, 'PNG', margin, 30, contentW, Math.min(scH, 160));
            } else {
                doc.addImage(scImg, 'PNG', margin, yPos, contentW, Math.min(scH, pageH - yPos - margin));
            }
        }

        // ===== Page 2+: Charts =====
        const chartPairs = [
            [execCharts.cExecCum, 'Реалізація vs План', execCharts.cExecCash, 'Грошові надходження'],
            [execCharts.cExecMarket, 'Ринкові ціни: UA vs EU', execCharts.cExecBubble, 'Регіони: план × факт'],
            [execCharts.cExecStacked, 'Продукція по регіонах', null, null]
        ];

        for (const [chart1, label1, chart2, label2] of chartPairs) {
            if (!chart1 && !chart2) continue;
            doc.addPage();

            let y = margin;
            if (chart1) {
                const img1 = chart1.toBase64Image('image/png', 1);
                doc.setFontSize(11);
                doc.setTextColor(100);
                doc.text(label1, margin, y + 5);
                doc.addImage(img1, 'PNG', margin, y + 8, contentW / 2 - 5, 80);
            }
            if (chart2) {
                const img2 = chart2.toBase64Image('image/png', 1);
                doc.setFontSize(11);
                doc.setTextColor(100);
                doc.text(label2, pageW / 2 + 5, y + 5);
                doc.addImage(img2, 'PNG', pageW / 2 + 5, y + 8, contentW / 2 - 5, 80);
            }
        }

        // ===== Page: Alerts summary =====
        const alertsEl = document.getElementById('execAlerts');
        if (alertsEl && alertsEl.children.length > 0) {
            doc.addPage();
            addHeader(doc, margin, 'Операційні алерти');
            const alertImg = await captureElement(alertsEl);
            const alertH = calcHeight(alertsEl, contentW);
            doc.addImage(alertImg, 'PNG', margin, 30, contentW, Math.min(alertH, 160));
        }

        // Add footer to all pages
        const totalPages = doc.internal.getNumberOfPages();
        const now = new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`KPI Dashboard — ${now} — Сторінка ${i}/${totalPages}`, margin, pageH - 5);
        }

        doc.save(`KPI_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
        toast('PDF звіт завантажено');
    } catch (err) {
        console.error('PDF generation error:', err);
        toast('Помилка генерації PDF: ' + err.message, true);
    }
}

function addHeader(doc, margin, title) {
    doc.setFontSize(16);
    doc.setTextColor(74, 157, 111);
    doc.text(title, margin, margin + 8);
    doc.setFontSize(9);
    doc.setTextColor(150);
    doc.text(new Date().toLocaleDateString('uk-UA'), margin, margin + 15);
    doc.setDrawColor(74, 157, 111);
    doc.setLineWidth(0.3);
    doc.line(margin, margin + 18, 297 - margin, margin + 18);
}

async function captureElement(el) {
    const canvas = await html2canvas(el, {
        backgroundColor: '#0F1419',
        scale: 2,
        useCORS: true,
        logging: false
    });
    return canvas.toDataURL('image/png');
}

function calcHeight(el, targetW) {
    const ratio = el.offsetHeight / el.offsetWidth;
    return targetW * ratio;
}
