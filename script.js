let inventoryData = [];
let filteredData = [];
let charts = {};
let quickFilter = 'all';

const currencyFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

const runBtn = document.getElementById('runBtn');
const exportBtn = document.getElementById('exportBtn');
const feedbackBanner = document.getElementById('feedbackBanner');
const dashboard = document.getElementById('dashboard');
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const classFilter = document.getElementById('classFilter');
const sortSelect = document.getElementById('sortSelect');
const quickFilters = document.getElementById('quickFilters');
const fileInputs = ['file1', 'file2', 'file3'].map(id => document.getElementById(id));

fileInputs.forEach(input => {
    input.addEventListener('change', () => {
        const wrapper = input.closest('.file-input-wrapper');
        const meta = wrapper.querySelector('.file-meta');
        if (input.files[0]) {
            wrapper.classList.add('is-loaded');
            meta.textContent = input.files[0].name;
        } else {
            wrapper.classList.remove('is-loaded');
            meta.textContent = 'Sin archivo seleccionado';
        }
    });
});

runBtn.addEventListener('click', handleRun);
exportBtn.addEventListener('click', exportCurrentView);
searchInput.addEventListener('input', applyFilters);
statusFilter.addEventListener('change', applyFilters);
classFilter.addEventListener('change', applyFilters);
sortSelect.addEventListener('change', applyFilters);
quickFilters.addEventListener('click', event => {
    const button = event.target.closest('[data-quick-filter]');
    if (!button) return;
    quickFilter = button.dataset.quickFilter;
    [...quickFilters.querySelectorAll('.chip')].forEach(chip => chip.classList.toggle('active', chip === button));
    applyFilters();
});

async function handleRun() {
    const files = fileInputs.map(input => input.files[0]).filter(Boolean);
    if (!files.length) {
        showFeedback('error', 'Subí al menos un reporte para ejecutar el diagnóstico.');
        return;
    }

    try {
        runBtn.disabled = true;
        showFeedback('info', 'Procesando reportes y consolidando inventario...');

        const db = {};
        for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
            const rows = await parseFile(files[fileIndex]);
            rows.forEach(row => {
                const normalized = normalizeRow(row);
                const sku = String(normalized.sku || '').trim();
                if (!sku) return;

                if (!db[sku]) {
                    db[sku] = {
                        sku,
                        product: normalized.product || `SKU ${sku}`,
                        sales: 0,
                        revenue: 0,
                        stock: 0,
                        margin: normalized.margin || 0,
                    };
                }

                db[sku].product = normalized.product || db[sku].product;
                db[sku].sales += normalized.sales;
                db[sku].revenue += normalized.revenue;
                db[sku].margin = normalized.margin || db[sku].margin;

                if (fileIndex === files.length - 1) {
                    db[sku].stock = normalized.stock;
                }
            });
        }

        runDiagnostic(db, files.length);
        showFeedback('success', `Diagnóstico listo: ${inventoryData.length} SKUs consolidados.`);
    } catch (error) {
        console.error(error);
        showFeedback('error', 'No pude procesar los archivos. Revisá formato, columnas y volvé a intentar.');
    } finally {
        runBtn.disabled = false;
    }
}

async function parseFile(file) {
    const data = await file.arrayBuffer();

    if (/\.csv$/i.test(file.name)) {
        const workbook = XLSX.read(data, { type: 'array' });
        return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
    }

    const workbook = XLSX.read(data, { type: 'array' });
    return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
}

function normalizeRow(row) {
    const byKey = {};
    Object.keys(row).forEach(key => {
        byKey[normalizeHeader(key)] = row[key];
    });

    return {
        sku: firstValue(byKey, ['sku', 'codigo', 'codigo_sku', 'codigo_interno']),
        product: firstValue(byKey, ['producto', 'descripcion', 'titulo', 'detalle']),
        sales: toNumber(firstValue(byKey, ['ventas', 'cantidad_vendida', 'unidades', 'qty', 'cantidad'])),
        revenue: toNumber(firstValue(byKey, ['facturacion_total', 'facturacion', 'revenue', 'venta_total', 'importe_total'])),
        stock: toNumber(firstValue(byKey, ['stock', 'stock_actual', 'inventario', 'disponible'])),
        margin: toNumber(firstValue(byKey, ['margen', 'margin'])),
    };
}

function normalizeHeader(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function firstValue(source, keys) {
    for (const key of keys) {
        if (source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
    }
    return '';
}

function toNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const parsed = String(value || '0')
        .replace(/\./g, '')
        .replace(/,/g, '.')
        .replace(/[^0-9.-]/g, '');
    const num = parseFloat(parsed);
    return Number.isFinite(num) ? num : 0;
}

function runDiagnostic(db, months) {
    const items = Object.values(db).filter(item => item.sku);
    const totalRevenue = items.reduce((sum, item) => sum + item.revenue, 0);
    const sortedByRevenue = [...items].sort((a, b) => b.revenue - a.revenue);

    let accRevenue = 0;
    let deadStockValue = 0;
    let lostRevenue = 0;

    inventoryData = sortedByRevenue.map(item => {
        accRevenue += item.revenue;
        const forecast30 = months > 0 ? item.sales / months : 0;
        const avgPrice = item.sales > 0 ? item.revenue / item.sales : 0;
        const coverageDays = forecast30 > 0 ? Math.round((item.stock / forecast30) * 30) : (item.stock > 0 ? 999 : 0);
        const moi = forecast30 > 0 ? item.stock / forecast30 : (item.stock > 0 ? 99 : 0);
        const share = totalRevenue > 0 ? accRevenue / totalRevenue : 0;
        const clase = share <= 0.8 ? 'A' : (share <= 0.95 ? 'B' : 'C');

        let status = 'SALUDABLE';
        if (item.stock === 0) status = 'QUIEBRE';
        else if (coverageDays > 180) status = 'SOBRE STOCK';

        const stagnant = item.stock > 0 && item.sales === 0;
        const overstock = item.stock > 0 && (coverageDays > 180 || stagnant);
        const riskA = clase === 'A' && item.stock > 0 && coverageDays > 0 && coverageDays < 20;
        const opportunity = item.stock > 0 && forecast30 > 0 && coverageDays >= 30 && coverageDays <= 90 && ['A', 'B'].includes(clase);
        const deadCapital = overstock ? ((avgPrice || 45000) * item.stock) : 0;

        if (deadCapital > 0) deadStockValue += deadCapital;
        if (clase === 'A' && item.stock === 0) lostRevenue += forecast30 * (avgPrice || 0);

        return {
            ...item,
            forecast30,
            coverageDays,
            moi,
            clase,
            status,
            stagnant,
            overstock,
            riskA,
            opportunity,
            deadCapital,
            avgPrice,
        };
    });

    renderSummary(totalRevenue, lostRevenue, deadStockValue);
    renderActionCenter(deadStockValue);
    renderInsights();
    applyFilters();
    initCharts();
    dashboard.classList.remove('hidden');
}

function renderSummary(totalRevenue, lostRevenue, deadStockValue) {
    setText('kpi-rev', currency(totalRevenue));
    setText('kpi-loss', currency(lostRevenue));
    setText('kpi-dead', currency(deadStockValue));
    setText('kpi-skus', `${inventoryData.length}`);

    const quiebres = inventoryData.filter(item => item.status === 'QUIEBRE').length;
    const riskA = inventoryData.filter(item => item.riskA).length;
    const overstock = inventoryData.filter(item => item.overstock).length;
    const stagnant = inventoryData.filter(item => item.stagnant).length;
    const opportunity = inventoryData.filter(item => item.opportunity).length;

    setText('sum-quiebres', `${quiebres}`);
    setText('sum-risk-a', `${riskA}`);
    setText('sum-overstock', `${overstock}`);
    setText('sum-stagnant', `${stagnant}`);
    setText('sum-opportunity', `${opportunity}`);
}

function renderActionCenter(deadStockValue) {
    const criticalA = inventoryData.filter(item => item.clase === 'A' && item.stock === 0).length;
    const overstockCount = inventoryData.filter(item => item.overstock).length;
    const rationalCount = inventoryData.filter(item => item.stagnant).length;
    const riskCount = inventoryData.filter(item => item.riskA).length;
    const opportunityCount = inventoryData.filter(item => item.opportunity).length;
    const focusCount = criticalA + overstockCount + rationalCount + riskCount;

    setText('focusPill', `${focusCount} focos detectados`);
    setText('action-replenish-count', `${criticalA} SKUs`);
    setText('action-overstock-count', `${overstockCount} SKUs`);
    setText('action-rational-count', `${rationalCount} SKUs`);
    setText('action-risk-count', `${riskCount} SKUs`);
    setText('action-dead-capital', currency(deadStockValue));
    setText('action-opportunity-count', `${opportunityCount} SKUs`);
}

function renderInsights() {
    const criticalA = inventoryData
        .filter(item => item.clase === 'A' && item.stock === 0)
        .sort((a, b) => b.forecast30 - a.forecast30)
        .slice(0, 4);

    const riskA = inventoryData
        .filter(item => item.riskA)
        .sort((a, b) => a.coverageDays - b.coverageDays || b.forecast30 - a.forecast30)
        .slice(0, 3);

    const freeze = inventoryData
        .filter(item => item.overstock)
        .sort((a, b) => b.deadCapital - a.deadCapital)
        .slice(0, 3);

    document.getElementById('top-quiebres').innerHTML = renderList(criticalA, item => ({
        badge: 'REPOSICIÓN PRIORITARIA',
        title: item.product,
        meta: `SKU ${item.sku}`,
        metric: `${Math.round(item.forecast30)} u/mes potenciales`,
        extra: item.coverageDays === 0 ? '0 días de cobertura' : `${item.coverageDays} días de cobertura`,
        tone: 'danger-item',
    }), 'Sin quiebres clase A en esta corrida.');

    document.getElementById('top-risk').innerHTML = renderList(riskA, item => ({
        badge: 'BLINDAR CLASE A',
        title: item.product,
        meta: `SKU ${item.sku}`,
        metric: `${item.coverageDays} días de cobertura`,
        extra: `${Math.round(item.forecast30)} u/mes esperadas`,
        tone: 'warning-item',
    }), 'No hay SKUs clase A en zona de riesgo.');

    document.getElementById('top-overstock').innerHTML = renderList(freeze, item => ({
        badge: 'CONGELAR COMPRA',
        title: item.product,
        meta: `SKU ${item.sku}`,
        metric: item.stagnant ? 'Sin ventas recientes' : `${item.coverageDays} días de cobertura`,
        extra: currency(item.deadCapital),
        tone: 'neutral-item',
    }), 'No se detectó sobre stock para congelar.');
}

function renderList(items, mapper, emptyMessage) {
    if (!items.length) {
        return `
            <article class="list-item empty-item">
                <strong>Sin alertas</strong>
                <span>${emptyMessage}</span>
            </article>
        `;
    }

    return items.map(item => {
        const data = mapper(item);
        return `
            <article class="list-item ${data.tone}">
                <strong>${escapeHtml(data.badge)}</strong>
                <span>${escapeHtml(truncate(data.title, 62))}</span>
                <small>${escapeHtml(data.meta)}</small>
                <div class="metric">${escapeHtml(data.metric)}</div>
                <small>${escapeHtml(data.extra)}</small>
            </article>
        `;
    }).join('');
}

function applyFilters() {
    const statusValue = statusFilter.value;
    const classValue = classFilter.value;
    const searchValue = normalizeText(searchInput.value);

    filteredData = inventoryData.filter(item => {
        const matchesStatus = statusValue === 'all' || item.status === statusValue;
        const matchesClass = classValue === 'all' || item.clase === classValue;
        const matchesSearch = !searchValue || normalizeText(`${item.sku} ${item.product}`).includes(searchValue);
        const matchesQuick = quickFilterMatch(item);
        return matchesStatus && matchesClass && matchesSearch && matchesQuick;
    });

    filteredData.sort(sortComparator(sortSelect.value));
    renderTable();
    setText('resultsCounter', `${filteredData.length} resultados`);
}

function quickFilterMatch(item) {
    if (quickFilter === 'all') return true;
    if (quickFilter === 'criticalA') return item.clase === 'A' && item.stock === 0;
    if (quickFilter === 'riskA') return item.riskA;
    if (quickFilter === 'overstock') return item.overstock;
    if (quickFilter === 'stagnant') return item.stagnant;
    return true;
}

function sortComparator(sortValue) {
    const sorters = {
        revenue_desc: (a, b) => b.revenue - a.revenue,
        forecast_desc: (a, b) => b.forecast30 - a.forecast30,
        coverage_asc: (a, b) => a.coverageDays - b.coverageDays,
        coverage_desc: (a, b) => b.coverageDays - a.coverageDays,
        stock_desc: (a, b) => b.stock - a.stock,
        name_asc: (a, b) => a.product.localeCompare(b.product, 'es'),
    };
    return sorters[sortValue] || sorters.revenue_desc;
}

function renderTable() {
    const tbody = document.getElementById('tableBody');
    const emptyState = document.getElementById('emptyState');

    if (!filteredData.length) {
        tbody.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    tbody.innerHTML = filteredData.map(item => `
        <tr>
            <td class="sku-cell">${escapeHtml(item.sku)}</td>
            <td class="product-cell">${escapeHtml(item.product)}</td>
            <td><strong>${item.forecast30.toFixed(1)} u/mes</strong></td>
            <td>${item.stock.toLocaleString('es-AR')}</td>
            <td>${item.coverageDays} días</td>
            <td>${statusTag(item.status)}</td>
            <td><span class="class-pill ${item.clase.toLowerCase()}">${item.clase}</span></td>
        </tr>
    `).join('');
}

function statusTag(status) {
    if (status === 'QUIEBRE') return '<span class="status-tag tag-quiebre">QUIEBRE</span>';
    if (status === 'SOBRE STOCK') return '<span class="status-tag tag-sobre">SOBRE STOCK</span>';
    return '<span class="status-tag tag-ok">SALUDABLE</span>';
}

function initCharts() {
    if (charts.pareto) charts.pareto.destroy();
    if (charts.coverage) charts.coverage.destroy();

    const paretoCtx = document.getElementById('paretoChart').getContext('2d');
    charts.pareto = new Chart(paretoCtx, {
        type: 'doughnut',
        data: {
            labels: ['Clase A', 'Clase B', 'Clase C'],
            datasets: [{
                data: [
                    inventoryData.filter(item => item.clase === 'A').length,
                    inventoryData.filter(item => item.clase === 'B').length,
                    inventoryData.filter(item => item.clase === 'C').length,
                ],
                backgroundColor: ['#0b7bdc', '#f59e0b', '#8b5cf6'],
                borderWidth: 0,
            }],
        },
        options: {
            plugins: { legend: { position: 'bottom', labels: { usePointStyle: true } } },
            cutout: '58%',
        },
    });

    const buckets = {
        '0 días': inventoryData.filter(item => item.stock === 0).length,
        '1-20 días': inventoryData.filter(item => item.stock > 0 && item.coverageDays < 20).length,
        '21-90 días': inventoryData.filter(item => item.coverageDays >= 20 && item.coverageDays <= 90).length,
        '91-180 días': inventoryData.filter(item => item.coverageDays > 90 && item.coverageDays <= 180).length,
        '+180 días': inventoryData.filter(item => item.coverageDays > 180).length,
    };

    const coverageCtx = document.getElementById('coverageChart').getContext('2d');
    charts.coverage = new Chart(coverageCtx, {
        type: 'bar',
        data: {
            labels: Object.keys(buckets),
            datasets: [{
                label: 'SKUs',
                data: Object.values(buckets),
                backgroundColor: ['#ef4444', '#fb7185', '#10b981', '#f59e0b', '#8b5cf6'],
                borderRadius: 8,
                maxBarThickness: 42,
            }],
        },
        options: {
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { precision: 0 } },
                x: { grid: { display: false } },
            },
        },
    });
}

function exportCurrentView() {
    if (!filteredData.length) {
        showFeedback('error', 'No hay filas filtradas para exportar.');
        return;
    }

    const rows = filteredData.map(item => ({
        SKU: item.sku,
        Producto: item.product,
        Forecast30d: item.forecast30.toFixed(1),
        Stock: item.stock,
        CoberturaDias: item.coverageDays,
        Estado: item.status,
        Clase: item.clase,
        Facturacion: Math.round(item.revenue),
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Vista filtrada');
    XLSX.writeFile(workbook, 'gapAR_vista_filtrada.xlsx');
}

function showFeedback(type, message) {
    feedbackBanner.className = `feedback-banner ${type}`;
    feedbackBanner.textContent = message;
    feedbackBanner.classList.remove('hidden');
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

function currency(value) {
    return `$ ${currencyFormatter.format(Math.round(value || 0))}`;
}

function normalizeText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function truncate(value, max) {
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
