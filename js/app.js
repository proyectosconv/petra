/**
 * SISTEMA CENTRALIZADO DE REPOSITORIOS (UnADM)
 * Motor principal de búsqueda, filtrado, renderizado e indexación.
 */

function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

function normalizeFacetValue(value) {
    return String(value ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const CATALOG_YEARS = Array.from({ length: 15 }, (_, index) => String(2012 + index));
const CATALOG_THEMES = ['Educación', 'Salud', 'Tecnología', 'Medio ambiente'];
const COMMON_FORMATS = [
    'mp3', 'wav', 'aac', 'mp4', 'mov', 'avi',
    'jpg', 'jpeg', 'png', 'gif', 'webp',
    'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv'
];
const THEME_KEYWORDS = {
    'educacion': ['educacion'],
    'salud': ['salud'],
    'tecnologia': ['tecnolog'],
    'medio ambiente': ['medio ambiente', 'medioambiente', 'reforest', 'forest', 'ecolog', 'sustentab', 'biodiversidad']
};
const MIME_FORMATS = {
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/aac': 'aac',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'application/pdf': 'pdf'
};

function getRecordFormat(item) {
    const format = normalizeFacetValue(item.formato);
    if (MIME_FORMATS[format]) return MIME_FORMATS[format];

    const explicitExtension = format.match(/^(?:\.|)([a-z0-9]{2,8})$/i)?.[1];
    if (explicitExtension) return explicitExtension.toLowerCase();

    for (const value of [item.url_archivo, item.titulo]) {
        const extension = String(value ?? '').match(/\.([a-z0-9]{2,8})(?:$|[?#])/i)?.[1];
        if (extension) return extension.toLowerCase();
    }
    return '';
}

function recordMatchesTheme(item, theme) {
    const keywords = THEME_KEYWORDS[normalizeFacetValue(theme)] || [];
    const text = normalizeFacetValue([
        item.titulo,
        item.proyecto,
        item.descripcion,
        ...(Array.isArray(item.tags) ? item.tags : [])
    ].join(' '));
    return keywords.some(keyword => text.includes(normalizeFacetValue(keyword)));
}

document.addEventListener('DOMContentLoaded', () => {
    // Detección de la vista activa según el nombre del archivo en la URL
    const path = window.location.pathname;

    if (path.endsWith('/') || path.includes('index.html')) {
        // Landing inicial con la barra central de búsqueda
        initLandingPage();
    } else if (path.includes('browser.html')) {
        // Catálogo principal de resultados con tabla y filtros laterales
        initCatalogPage();
    } else if (path.includes('recurso.html') || path.includes('recurso-pdf.html')) {
        // Vistas de detalle de un recurso
        initDetailPage();
    } else if (path.includes('carga.html')) {
        // Formulario de carga e indexación
        initCargaPage();
    }
});

// =========================================================================
// 1. CARGA Y GESTIÓN DE DATOS (data.json + localStorage)
// =========================================================================
async function getRepositoryData() {
    try {
        const response = await fetch('data.json', { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const defaultData = await response.json();

        // Recuperar recursos agregados dinámicamente desde carga.html si existen
        const localData = JSON.parse(localStorage.getItem('unadm_repo_custom_data') || '[]');
        return [...defaultData, ...localData];
    } catch (error) {
        console.error('Error al cargar data.json:', error);
        return [];
    }
}

function renderFacetOptions(container, items, checkboxClass) {
    if (!container) return;

    container.replaceChildren();
    items.forEach(({ value, count }) => {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = checkboxClass;
        checkbox.value = value;
        label.append(checkbox, document.createTextNode(` ${value} `));

        const countLabel = document.createElement('span');
        countLabel.className = 'arc_facet-count';
        countLabel.textContent = `(${count})`;
        label.appendChild(countLabel);
        container.appendChild(label);
    });
}

function renderCatalogFacets(data) {
    renderFacetOptions(
        document.getElementById('yearFacetOptions'),
        CATALOG_YEARS.map(value => ({
            value,
            count: data.filter(item => String(item.anio ?? '').trim() === value).length
        })),
        'cb-year-item'
    );
    renderFacetOptions(
        document.getElementById('tagFacetOptions'),
        CATALOG_THEMES.map(value => ({
            value,
            count: data.filter(item => recordMatchesTheme(item, value)).length
        })),
        'cb-theme-item'
    );
    const formatCounts = new Map();
    data.forEach(item => {
        const format = getRecordFormat(item);
        if (format) formatCounts.set(format, (formatCounts.get(format) || 0) + 1);
    });
    const formats = [...new Set([...COMMON_FORMATS, ...formatCounts.keys()])]
        .sort((a, b) => a.localeCompare(b, 'es'));
    renderFacetOptions(
        document.getElementById('typeFacetOptions'),
        formats.map(value => ({ value, count: formatCounts.get(value) || 0 })),
        'cb-format-item'
    );
}

// =========================================================================
// 2. VISTA LANDING / INICIO (index.html)
// =========================================================================
async function initLandingPage() {
    const input = document.querySelector('.arc_search-input');
    const button = document.querySelector('.arc_search-button');
    const selects = document.querySelectorAll('.arc_filter-select');
    const data = await getRepositoryData();

    selects.forEach(select => {
        const firstOptionText = (select.options[0]?.text || '').toUpperCase();
        let values = [];
        if (firstOptionText.includes('AÑO')) values = CATALOG_YEARS;
        else if (firstOptionText.includes('TEMA')) values = CATALOG_THEMES;
        else if (firstOptionText.includes('FORMATO')) {
            const discoveredFormats = data.map(getRecordFormat).filter(Boolean);
            values = [...new Set([...COMMON_FORMATS, ...discoveredFormats])]
                .sort((a, b) => a.localeCompare(b, 'es'));
        }

        const defaultOption = select.options[0];
        select.replaceChildren(defaultOption);
        values.forEach(value => select.add(new Option(value, value)));
    });

    function executeSearch() {
        const query = input ? input.value.trim() : '';
        const params = new URLSearchParams();

        if (query) {
            params.append('q', query);
        }

        // Send only actual filter choices; "all" means no filter.
        selects.forEach(select => {
            const val = (select.value || '').trim();
            if (!val || val.toLowerCase() === 'all') return;
            const firstOptionText = (select.options[0] && select.options[0].text || '').toUpperCase();
            if (firstOptionText.includes('AÑO')) params.append('anio', val);
            if (firstOptionText.includes('TEMA')) params.append('tema', val);
            if (firstOptionText.includes('FORMATO')) params.append('formato', val);
        });

        // Debug: log selected values and params so we can trace issues
        try {
            console.log('executeSearch - query:', query);
            console.log('executeSearch - selects:', Array.from(selects).map(s => ({first: s.options[0] && s.options[0].text, value: s.value}))); 
            console.log('executeSearch - final params:', params.toString());
        } catch (err) {
            console.warn('Debug logging failed', err);
        }

        // Redirigir al catálogo pasando los datos limpios en la URL
        const queryString = params.toString();
        window.location.href = `browser.html${queryString ? `?${queryString}` : ''}`;
    }

    if (button) button.addEventListener('click', executeSearch);
    if (input) {
        input.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') executeSearch();
        });
    }
}

// =========================================================================
// 3. VISTA CATÁLOGO Y RESULTADOS (browser.html)
// =========================================================================
async function initCatalogPage() {
    const data = await getRepositoryData();

    renderCatalogFacets(data);

    // Elementos del DOM
    const searchInput = document.querySelector('.arc_search-input');
    const searchButton = document.querySelector('.arc_search-button');
    const tableBody = document.querySelector('.arc_data-table tbody');
    const resultsCount = document.querySelector('.arc_results-count');
    const sortSelect = document.querySelector('.arc_sort-select');
    const activeFacetsContainer = document.querySelector('.arc_active-facets');

    // Leer parámetros de la URL enviados desde index.html
    const urlParams = new URLSearchParams(window.location.search);
    const initialQuery = urlParams.get('q') || '';
    const initialAnio = urlParams.get('anio') || '';
    const initialTema = urlParams.get('tema') || '';
    const initialFormato = urlParams.get('formato') || '';

    console.log('initCatalogPage - URL params:', urlParams.toString());
    console.log('initCatalogPage - initialAnio,tema,formato:', initialAnio, initialTema, initialFormato);

    if (searchInput && initialQuery) {
        searchInput.value = initialQuery;
    }

    // Marcar automáticamente las casillas laterales según lo seleccionado en index.html
    syncUrlFiltersToSidebar(initialAnio, initialTema, initialFormato);

    const normalizeStr = normalizeFacetValue;

    // Función principal de filtrado y renderizado
    function filterAndRender() {
        const query = searchInput ? searchInput.value.trim() : '';
        const normalizedQuery = normalizeStr(query);

        // Obtener valores marcados actualmente en el panel lateral
        const checkedYears = document.getElementById('cbYearAll')?.checked
            ? [] : Array.from(document.querySelectorAll('.cb-year-item:checked')).map(cb => cb.value);
        const checkedThemes = document.getElementById('cbThemeAll')?.checked
            ? [] : Array.from(document.querySelectorAll('.cb-theme-item:checked')).map(cb => cb.value);
        const checkedFormats = document.getElementById('cbFormatAll')?.checked
            ? [] : Array.from(document.querySelectorAll('.cb-format-item:checked')).map(cb => cb.value);

        // Filtrado de la base de datos
        let filtered = data.filter(item => {
            const matchQuery = !normalizedQuery ||
                normalizeStr(item.titulo).includes(normalizedQuery) ||
                normalizeStr(item.id).includes(normalizedQuery) ||
                normalizeStr(item.proyecto).includes(normalizedQuery) ||
                (item.tags && item.tags.some(tag => normalizeStr(tag).includes(normalizedQuery)));

            const matchYear = checkedYears.length === 0 || checkedYears.includes(String(item.anio));

            const matchTheme = checkedThemes.length === 0 ||
                checkedThemes.some(theme => recordMatchesTheme(item, theme));

            const matchFormat = checkedFormats.length === 0 ||
                checkedFormats.includes(getRecordFormat(item));

            return matchQuery && matchYear && matchTheme && matchFormat;
        });

        // Ordenamiento de resultados
        if (sortSelect) {
            const sortVal = sortSelect.value;
            if (sortVal.includes('recientes')) {
                filtered.sort((a, b) => new Date(b.fecha_registro || 0) - new Date(a.fecha_registro || 0));
            } else if (sortVal.includes('viejos')) {
                filtered.sort((a, b) => new Date(a.fecha_registro || 0) - new Date(b.fecha_registro || 0));
            }
        }

        // Actualizar contador superior
        if (resultsCount) {
            resultsCount.innerHTML = `Mostrando <strong>${filtered.length}</strong> resultados de <strong>${data.length}</strong> archivos`;
        }

        // Dibujar filas de la tabla y chips de filtros
        renderTableRows(filtered, tableBody);
        renderActiveChips(query, checkedYears, checkedThemes, checkedFormats, activeFacetsContainer, filterAndRender);
    }

    // Escuchadores de eventos
    if (searchButton) searchButton.addEventListener('click', filterAndRender);
    if (searchInput) {
        searchInput.addEventListener('input', filterAndRender);
        searchInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') filterAndRender();
        });
    }
    if (sortSelect) sortSelect.addEventListener('change', filterAndRender);

    // Attach change listeners to all sidebar checkboxes (including years)
    document.querySelectorAll('.arc_sidebar-filters input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', filterAndRender);
    });

    // Handle "Todos los años" checkbox behavior
    const cbYearAll = document.getElementById('cbYearAll');
    const yearCheckboxes = Array.from(document.querySelectorAll('.cb-year-item'));

    if (cbYearAll) {
        cbYearAll.addEventListener('change', (e) => {
            const checked = e.target.checked;
            yearCheckboxes.forEach(ycb => ycb.checked = checked);
            filterAndRender();
        });
    }

    // When individual year boxes change, keep "Todos los años" in sync
    yearCheckboxes.forEach(ycb => {
        ycb.addEventListener('change', () => {
            if (!cbYearAll) return;
            const allSelected = yearCheckboxes.every(item => item.checked);
            cbYearAll.checked = allSelected;
            filterAndRender();
        });
    });

    // === Tema (select all) ===
    const cbThemeAll = document.getElementById('cbThemeAll');
    const themeCheckboxes = Array.from(document.querySelectorAll('.cb-theme-item'));

    if (cbThemeAll) {
        cbThemeAll.addEventListener('change', (e) => {
            const checked = e.target.checked;
            themeCheckboxes.forEach(tcb => tcb.checked = checked);
            filterAndRender();
        });
    }

    themeCheckboxes.forEach(tcb => {
        tcb.addEventListener('change', () => {
            if (!cbThemeAll) return;
            cbThemeAll.checked = themeCheckboxes.every(item => item.checked);
            filterAndRender();
        });
    });

    // === Formato (select all) ===
    const cbFormatAll = document.getElementById('cbFormatAll');
    const formatCheckboxes = Array.from(document.querySelectorAll('.cb-format-item'));

    if (cbFormatAll) {
        cbFormatAll.addEventListener('change', (e) => {
            const checked = e.target.checked;
            formatCheckboxes.forEach(fcb => fcb.checked = checked);
            filterAndRender();
        });
    }

    formatCheckboxes.forEach(fcb => {
        fcb.addEventListener('change', () => {
            if (!cbFormatAll) return;
            cbFormatAll.checked = formatCheckboxes.every(item => item.checked);
            filterAndRender();
        });
    });

    const btnClear = document.getElementById('btnClearFilters');
    if (btnClear) {
        btnClear.addEventListener('click', () => {
            document.querySelectorAll('.arc_sidebar-filters input[type="checkbox"]')
                .forEach(checkbox => checkbox.checked = false);
            if (searchInput) searchInput.value = '';
            const params = new URLSearchParams(window.location.search);
            ['q', 'anio', 'tema', 'formato'].forEach(param => params.delete(param));
            const queryString = params.toString();
            window.history.replaceState(
                {},
                '',
                `${window.location.pathname}${queryString ? `?${queryString}` : ''}${window.location.hash}`
            );
            filterAndRender();
        });
    }

    // Renderizado inicial
    filterAndRender();
}




// Sincroniza la URL inicial con las casillas del panel lateral de forma exacta
function syncUrlFiltersToSidebar(anio, tema, formato) {
    const normalize = normalizeFacetValue;
    if (anio && normalize(anio) !== 'all') {
        document.querySelectorAll('.cb-year-item').forEach(cb => {
            cb.checked = normalize(cb.value) === normalize(anio);
        });
    }
    if (tema && normalize(tema) !== 'all') {
        document.querySelectorAll('.cb-theme-item').forEach(cb => {
            cb.checked = normalize(cb.value) === normalize(tema);
        });
    }
    if (formato && normalize(formato) !== 'all') {
        document.querySelectorAll('.cb-format-item').forEach(cb => {
            cb.checked = normalize(cb.value) === normalize(formato);
        });
    }
}

// Renderiza las filas dinámicas dentro del <tbody> de la tabla
const DOCS_THUMBNAIL_FILES = {
    salud: [
        'docs/KM_porla_salud_cdmx25_TV_35.jpg',
        'docs/KM_porla_salud_cdmx25_TV_58.jpg'
    ],
    reforestacion: [
        'docs/Reforestación UnADM_5.jpg'
    ],
    convenio: [
        'docs/Firma_Convenio_con_SECTEI_01.JPG',
        'docs/Firma_Convenio_con_SECTEI_02.JPG',
        'docs/Firma_Convenio_con_SECTEI_03.JPG',
        'docs/Firma_Convenio_con_SECTEI_04.JPG',
        'docs/Firma_Convenio_con_SECTEI_05.JPG',
        'docs/Firma_Convenio_con_SECTEI_06.JPG',
        'docs/Firma_Convenio_con_SECTEI_07.JPG',
        'docs/Firma_Convenio_con_SECTEI_08.JPG',
        'docs/Firma_Convenio_con_SECTEI_09.JPG',
        'docs/Firma_Convenio_con_SECTEI_10.JPG',
        'docs/Firma_Convenio_con_SECTEI_11.JPG'
    ],
    ceremonias: [
        'docs/Ceremonia_UnADM_Julio_2025_VBM_106.jpg',
        'docs/Ceremonia_UnADM_Julio_2025_VBM_112 (1).jpg',
        'docs/Ceremonia_UnADM_Julio_2025_VBM_31.jpg',
        'docs/Ceremonia_UnADM_Julio_2025_VBM_67.jpg',
        'docs/Segunda_Ceremonia_de_egresados_Vladimir_2024_10.jpg',
        'docs/Segunda_Ceremonia_de_egresados_Vladimir_2024_12.jpg'
    ],
    reuniones: [
        'docs/Behind_Ceremonia_2022-1_01.jpg',
        'docs/Behind_Ceremonia_2022-1_02.jpg',
        'docs/Behind_Ceremonia_2022-1_03.jpg',
        'docs/Behind_Ceremonia_2022-1_04.jpg',
        'docs/Behind_Ceremonia_2022-1_05.jpg',
        'docs/Behind_Ceremonia_2022-1_06.jpg',
        'docs/Behind_Ceremonia_2022-1_07.jpg',
        'docs/Behind_Ceremonia_2022-1_08.jpg',
        'docs/Behind_Ceremonia_2022-1_09.jpg',
        'docs/Behind_Ceremonia_2022-1_10.jpg',
        'docs/Behind_Ceremonia_2022-1_11.jpg',
        'docs/Behind_Ceremonia_2022-1_12.jpg',
        'docs/Behind_Ceremonia_2022-1_13.jpg',
        'docs/Behind_Ceremonia_2022-1_14.jpg',
        'docs/Behind_Ceremonia_2022-1_15.jpg',
        'docs/Behind_Ceremonia_2022-1_16.jpg',
        'docs/Behind_Ceremonia_2022-1_17.jpg',
        'docs/Behind_Ceremonia_2022-1_18.jpg',
        'docs/Behind_Ceremonia_2022-1_19.jpg',
        'docs/Behind_Ceremonia_2022-1_20.jpg',
        'docs/Behind_Ceremonia_2022-1_21.jpg',
        'docs/Behind_Ceremonia_2022-1_22.jpg',
        'docs/Behind_Ceremonia_2022-1_23.jpg',
        'docs/Behind_Ceremonia_2022-1_24.jpg',
        'docs/Behind_Ceremonia_2022-1_25.jpg',
        'docs/Behind_Ceremonia_2022-1_26.jpg',
        'docs/Behind_Ceremonia_2022-1_27.jpg',
        'docs/Behind_Ceremonia_2022-1_28.jpg',
        'docs/Behind_Ceremonia_2022-1_29.jpg'
    ],
    capacitacion: [
        'docs/Capacitación_INAI_2022_TaniaVelasco_01.JPG',
        'docs/Capacitación_INAI_2022_TaniaVelasco_02.JPG',
        'docs/Capacitación_INAI_2022_TaniaVelasco_03.JPG',
        'docs/Capacitación_INAI_2022_TaniaVelasco_04.JPG',
        'docs/Capacitación_INAI_2022_TaniaVelasco_05.JPG',
        'docs/Capacitación_INAI_2022_TaniaVelasco_06.JPG',
        'docs/Capacitación_INAI_2022_TaniaVelasco_07.JPG',
        'docs/Capacitación_INAI_2022_TaniaVelasco_08.JPG',
        'docs/Capacitación_INAI_2022_TaniaVelasco_09.JPG',
        'docs/Capacitación_INAI_2022_TaniaVelasco_10.JPG',
        'docs/Capacitación_INAI_2022_TaniaVelasco_11.JPG',
        'docs/Capacitación_INAI_2022_TaniaVelasco_12.JPG',
        'docs/Capacitación_INAI_2022_TaniaVelasco_13.JPG'
    ],
    educacion: [
        'docs/Día01_JornadadeEducación_01.JPG',
        'docs/Día01_JornadadeEducación_02.JPG',
        'docs/Día01_JornadadeEducación_03.JPG',
        'docs/Día01_JornadadeEducación_04.JPG',
        'docs/Día02_JornadadeEducación_01.JPG',
        'docs/Día02_JornadadeEducación_02.JPG',
        'docs/Día02_JornadadeEducación_03.JPG',
        'docs/Día02_JornadadeEducación_04.JPG',
        'docs/Día03_JornadadeEducación_01.JPG',
        'docs/Día03_JornadadeEducación_02.JPG',
        'docs/Día03_JornadadeEducación_03.JPG',
        'docs/Día03_JornadadeEducación_04.JPG',
        'docs/Día04_JornadadeEducación_01.JPG',
        'docs/Día04_JornadadeEducación_02.JPG',
        'docs/Día04_JornadadeEducación_03.JPG'
    ]
};

function pickDocsThumb(item, paths) {
    if (!paths || paths.length === 0) return null;
    const source = String(item?.id || item?.titulo || item?.proyecto || '')
        .replace(/\D/g, '');
    const numericPart = Number(source) || 0;
    return encodeURI(paths[numericPart % paths.length]);
}

function getThumbForItem(item) {
    const combinedText = `${item?.titulo || ''} ${item?.proyecto || ''} ${item?.tipo || ''} ${(item?.tags || []).join(' ')}`.toLowerCase();

    if (item?.url_archivo) {
        return encodeURI(item.url_archivo);
    }

    if (/(kilometros|kilometro|salud|deporte)/.test(combinedText)) {
        return pickDocsThumb(item, DOCS_THUMBNAIL_FILES.salud);
    }

    if (/(reforest|forestacion|forestación)/.test(combinedText)) {
        return pickDocsThumb(item, DOCS_THUMBNAIL_FILES.reforestacion);
    }

    if (/(firma|convenio|sectei|ilce)/.test(combinedText)) {
        return pickDocsThumb(item, DOCS_THUMBNAIL_FILES.convenio);
    }

    if (/(capacitaci|inai|rectora|podium|auditorio|conferencia)/.test(combinedText)) {
        return pickDocsThumb(item, DOCS_THUMBNAIL_FILES.capacitacion);
    }

    if (/(jornada|educacion|educación|dia|día)/.test(combinedText)) {
        return pickDocsThumb(item, DOCS_THUMBNAIL_FILES.educacion);
    }

    if (/(consejo|universitario|mesa de trabajo|junta|reunion|reunión|trabajo)/.test(combinedText)) {
        return pickDocsThumb(item, DOCS_THUMBNAIL_FILES.reuniones);
    }

    if (/(ceremonia|aniversario|egresado|evento|reconocimiento|conocer|entrega de reconocimientos)/.test(combinedText)) {
        return pickDocsThumb(item, DOCS_THUMBNAIL_FILES.ceremonias);
    }

    return null;
}

function renderTableRows(items, container) {
    if (!container) return;

    if (items.length === 0) {
        container.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 32px; color: var(--text-secondary);">No se encontraron recursos que coincidan con los filtros seleccionados.</td></tr>`;
        return;
    }

    container.innerHTML = items.map(item => {
        const detailPage = (item.tipo === 'documento' || item.formato === 'pdf')
            ? 'recurso-pdf.html' : 'recurso.html';
        const detailUrl = `${detailPage}?id=${encodeURIComponent(String(item.id ?? ''))}`;
        const tagsHtml = (item.tags || []).map(t => {
            const tag = String(t);
            const tagSearchUrl = `browser.html?q=${encodeURIComponent(tag)}`;
            return `<a class="arc_tag arc_tag-link" href="${escapeHTML(tagSearchUrl)}" aria-label="Buscar por etiqueta ${escapeHTML(tag)}">#${escapeHTML(tag)}</a>`;
        }).join('');
        const badgeClass = `arc_${escapeHTML(String(item.formato || 'pdf').toLowerCase())}`;
        const thumbUrl = getThumbForItem(item);
        const thumbMarkup = thumbUrl
            ? `<img src="${escapeHTML(thumbUrl)}" alt="Miniatura del archivo" class="arc_thumb">`
            : `<span class="arc_thumb-placeholder">no encontrado</span>`;

        return `
            <tr>
                <td class="arc_td-thumb">${thumbMarkup}</td>
                <td class="arc_td-id">${escapeHTML(item.id)}</td>
                <td>
                    <div class="arc_td-title">
                        <a href="${escapeHTML(detailUrl)}" style="text-decoration:none; color:inherit;">${escapeHTML(item.titulo)}</a>
                    </div>
                    ${tagsHtml}
                </td>
                <td class="arc_td-project">${escapeHTML(item.proyecto)}</td>
                <td class="arc_td-year">${escapeHTML(item.anio)}</td>
                <td><span class="arc_badge-fmt ${badgeClass}">${escapeHTML(String(item.formato || 'PDF').toUpperCase())}</span></td>
            </tr>
        `;
    }).join('');
}

// Renderiza los chips de filtros activos y permite removerlos al hacer clic en '✕'
function renderActiveChips(query, years, themes, formats, container, triggerRefreshCallback) {
    if (!container) return;

    let html = `<span class="arc_facet-label">Filtros aplicados:</span>`;
    let count = 0;

    if (query) {
        html += `<div class="arc_chip" data-type="query" style="cursor:pointer;">Texto: "${escapeHTML(query)}" <span class="arc_remove-chip">✕</span></div>`;
        count++;
    }
    years.forEach(y => {
        html += `<div class="arc_chip" data-type="year" data-val="${escapeHTML(y)}" style="cursor:pointer;">Año: ${escapeHTML(y)} <span class="arc_remove-chip">✕</span></div>`;
        count++;
    });
    themes.forEach(t => {
        html += `<div class="arc_chip" data-type="theme" data-val="${escapeHTML(t)}" style="cursor:pointer;">Tema: ${escapeHTML(t)} <span class="arc_remove-chip">✕</span></div>`;
        count++;
    });
    formats.forEach(f => {
        html += `<div class="arc_chip" data-type="format" data-val="${escapeHTML(f)}" style="cursor:pointer;">Tipo: ${escapeHTML(f)} <span class="arc_remove-chip">✕</span></div>`;
        count++;
    });

    if (count === 0) {
        container.innerHTML = `<span class="arc_facet-label">Sin filtros activos</span>`;
    } else {
        container.innerHTML = html;

        // Asignar escuchador de eventos a cada chip para desmarcarlo
        container.querySelectorAll('.arc_chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const type = chip.getAttribute('data-type');
                const val = chip.getAttribute('data-val');

                if (type === 'query') {
                    const searchInput = document.querySelector('.arc_search-input');
                    if (searchInput) searchInput.value = '';
                } else if (type === 'year') {
                    uncheckSidebarOption(1, val);
                } else if (type === 'theme') {
                    uncheckSidebarOption(2, val);
                } else if (type === 'format') {
                    uncheckSidebarOption(3, val);
                }

                // Disparar la actualización del listado
                if (triggerRefreshCallback) triggerRefreshCallback();
            });
        });
    }
}

// Desmarca la opción correspondiente en el panel lateral por sección y texto
function uncheckSidebarOption(sectionIndex, value) {
    document.querySelectorAll(`.arc_sidebar-filters .arc_filter-section:nth-child(${sectionIndex}) input`).forEach(cb => {
        if (normalizeFacetValue(cb.value).includes(normalizeFacetValue(value))) {
            cb.checked = false;
        }
    });
}

// =========================================================================
// 4. VISTA DE DETALLE DEL RECURSO (recurso.html y recurso-pdf.html)
// =========================================================================
async function initDetailPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const resourceId = urlParams.get('id');

    if (!resourceId) return;

    const data = await getRepositoryData();
    const item = data.find(r => r.id === resourceId);

    if (!item) {
        console.warn(`Recurso con ID ${resourceId} no fue encontrado.`);
        return;
    }

    // Inyección de títulos e información general
    const titleEl = document.querySelector('.arc_resource-info h1');
    const descEl = document.querySelector('.arc_resource-description');
    const idEl = document.querySelector('.arc_meta-group:nth-child(1) .arc_meta-value');
    const projectEl = document.querySelector('.arc_meta-group:nth-child(2) .arc_meta-value');
    const weightEl = document.querySelector('.arc_meta-group:nth-child(4) .arc_meta-value');
    const dateEl = document.querySelector('.arc_meta-group:nth-child(5) .arc_meta-value');
    const tagsContainer = document.querySelector('.arc_tag-container');
    const downloadBtn = document.querySelector('.arc_btn-primary');

    if (titleEl) titleEl.textContent = item.titulo;
    if (descEl) descEl.textContent = item.descripcion;
    if (idEl) idEl.textContent = item.id;
    if (projectEl) projectEl.textContent = item.proyecto;
    if (weightEl) weightEl.textContent = item.peso || 'N/A';
    if (dateEl) dateEl.textContent = item.fecha_registro || item.anio;

    if (downloadBtn && item.url_archivo) {
        downloadBtn.setAttribute('href', item.url_archivo);
    }

    if (tagsContainer && item.tags) {
        tagsContainer.innerHTML = item.tags.map(t => {
            const tag = String(t);
            const tagSearchUrl = `browser.html?q=${encodeURIComponent(tag)}`;
            return `<a class="arc_tag arc_tag-link" href="${escapeHTML(tagSearchUrl)}" aria-label="Buscar por etiqueta ${escapeHTML(tag)}">#${escapeHTML(tag)}</a>`;
        }).join(' ');
    }

    // Configuración del reproductor de audio o visor PDF
    const audioElement = document.querySelector('.arc_audio-player');
    const pdfIframe = document.querySelector('.arc_pdf-iframe');

    if (audioElement && item.url_archivo) {
        audioElement.src = item.url_archivo;
    }

    if (pdfIframe && item.url_archivo) {
        pdfIframe.src = `${item.url_archivo}#toolbar=1&navpanes=0`;
    }
}

// =========================================================================
// 5. VISTA DE CARGA E INDEXACIÓN (carga.html)
// =========================================================================
function initCargaPage() {
    const btnSubmit = document.getElementById('btnSubmit');

    if (!btnSubmit) return;

    btnSubmit.addEventListener('click', (e) => {
        e.preventDefault();

        const titleInput = document.getElementById('resourceTitle');
        const descInput = document.getElementById('resourceDesc');
        const projectSelect = document.getElementById('selectProject');
        const tagsInput = document.getElementById('inputTags');
        const fileInput = document.getElementById('fileInput');

        if (!titleInput || !titleInput.value.trim()) {
            alert('Por favor ingresa un título para el recurso.');
            return;
        }

        const title = titleInput.value.trim();
        const desc = descInput ? descInput.value.trim() : '';
        const project = (projectSelect && projectSelect.selectedIndex > 0)
            ? projectSelect.options[projectSelect.selectedIndex].text
            : 'General';

        const rawTags = tagsInput ? tagsInput.value : '';
        const tagsArray = rawTags
            ? rawTags.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean)
            : ['Nuevo'];

        const fileName = (fileInput && fileInput.files.length > 0)
            ? fileInput.files[0].name
            : 'archivo_subido.pdf';

        const extension = fileName.split('.').pop().toLowerCase();

        // Determinar tipo de archivo
        let tipo = 'documento';
        if (['mp3', 'wav', 'aac'].includes(extension)) tipo = 'audio';
        if (['mp4', 'mov', 'avi'].includes(extension)) tipo = 'video';

        // Generar ID único
        const newId = `UNA_${new Date().getFullYear()}_${Math.floor(1000 + Math.random() * 9000)}`;

        const newResource = {
            id: newId,
            titulo: title,
            descripcion: desc,
            proyecto: project,
            anio: new Date().getFullYear(),
            formato: extension,
            tipo: tipo,
            url_archivo: `docs/${fileName}`,
            tags: tagsArray,
            peso: '4.5 MB',
            fecha_registro: new Date().toISOString().replace('T', ' ').substring(0, 19)
        };

        // Guardar localmente en el navegador
        const existingCustom = JSON.parse(localStorage.getItem('unadm_repo_custom_data') || '[]');
        existingCustom.push(newResource);
        localStorage.setItem('unadm_repo_custom_data', JSON.stringify(existingCustom));

        alert(`¡Recurso "${title}" (${newId}) indexado con éxito!`);

        // Redirigir al catálogo de resultados
        window.location.href = 'browser.html';
    });
}
