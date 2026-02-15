// ===== Chart.js Common Utilities =====
import { charts, targets } from './state.js';
import { $, fmt, themeColor } from './utils.js';

export function setupChartDefaults() {
    Chart.defaults.responsive = true;
    Chart.defaults.maintainAspectRatio = false;
    Chart.defaults.color = themeColor('--chart-text') || 'rgba(255,255,255,0.35)';
    Chart.defaults.font.family = "'Inter',system-ui,sans-serif";
    Chart.defaults.font.size = 11;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.pointStyleWidth = 8;
    Chart.defaults.plugins.legend.labels.color = themeColor('--text2') || 'rgba(255,255,255,0.5)';
    Chart.defaults.plugins.tooltip.backgroundColor = themeColor('--tooltip-bg') || 'rgba(15,15,35,0.92)';
    Chart.defaults.plugins.tooltip.borderColor = themeColor('--tooltip-border') || 'rgba(74,157,111,0.2)';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.cornerRadius = 10;
    Chart.defaults.plugins.tooltip.padding = 12;
    Chart.defaults.plugins.tooltip.titleColor = themeColor('--primary') || '#4A9D6F';
    Chart.defaults.plugins.tooltip.bodyColor = themeColor('--text') || 'rgba(255,255,255,0.8)';
    Chart.defaults.scale.grid.color = themeColor('--chart-grid') || 'rgba(255,255,255,0.04)';
}

export function kill(id) {
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

export function freshCanvas(wrapId, canvasId) {
    const wrap = $(wrapId), old = $(canvasId);
    if (old) old.remove();
    const c = document.createElement('canvas'); c.id = canvasId; wrap.appendChild(c); return c;
}

export function makeGrad(ctx, r, g, b) {
    const gr = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
    gr.addColorStop(0, `rgba(${r},${g},${b},0.2)`);
    gr.addColorStop(0.5, `rgba(${r},${g},${b},0.04)`);
    gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
    return gr;
}

export function getTargetAnnotation(key, label) {
    const val = targets[key];
    if (!val) return { annotations: {} };
    return { annotations: { target: { type: 'line', yMin: val, yMax: val, borderColor: 'rgba(231,76,60,0.5)', borderDash: [6, 3], borderWidth: 1.5, label: { content: label || 'План: ' + fmt(val), display: true, position: 'start', backgroundColor: 'rgba(231,76,60,0.15)', color: 'rgba(231,76,60,0.8)', font: { size: 10 } } } } };
}

export function drawSparkline(canvas, data, color) {
    if (!data.length) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const max = Math.max(...data), min = Math.min(...data);
    const range = max - min || 1;
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath();
    data.forEach((v, i) => {
        const x = (i / (data.length - 1)) * w;
        const y = h - ((v - min) / range) * (h - 4) - 2;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
}
