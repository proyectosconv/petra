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
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg',
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
    'image/svg+xml': 'svg',
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

const FORMAT_MIME_TYPES = {
    aac: 'audio/aac',
    avi: 'video/x-msvideo',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    gif: 'image/gif',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    pdf: 'application/pdf',
    png: 'image/png',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    svg: 'image/svg+xml',
    wav: 'audio/wav',
    webp: 'image/webp',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

function recordMatchesTheme(item, theme) {
    const text = normalizeFacetValue([
        item.titulo,
        item.proyecto,
        item.descripcion,
        ...(Array.isArray(item.tags) ? item.tags : [])
    ].join(' '));
    const keywords = THEME_KEYWORDS[normalizeFacetValue(theme)] || [];
    return keywords.some(keyword => text.includes(normalizeFacetValue(keyword)));
}

document.addEventListener('DOMContentLoaded', () => {
    // Detección de la vista activa según el nombre del archivo en la URL
    const path = window.location.pathname;

    if (path.endsWith('/') || path.includes('index.html') || path.includes('index-alternativo.html')) {
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
    const input = document.querySelector('.arc_search-input, .strm_arc_search-input');
    const button = document.querySelector('.arc_search-button, .strm_arc_search-button');
    const selects = document.querySelectorAll('.arc_filter-select, .strm_arc_filter-select');
    const filterOptionGroups = document.querySelectorAll('.strm_filter-options');
    const filtersToggle = document.querySelector('.strm_filters-toggle');
    const filtersPanel = document.getElementById('strm-search-filters');

    if (filtersToggle && filtersPanel) {
        filtersToggle.addEventListener('click', () => {
            const isExpanded = filtersToggle.getAttribute('aria-expanded') === 'true';
            filtersToggle.setAttribute('aria-expanded', String(!isExpanded));
            filtersPanel.hidden = isExpanded;
            filtersToggle.textContent = isExpanded ? '+ Agregar filtros' : '− Ocultar filtros';
        });
    }

    const data = await getRepositoryData();

    selects.forEach(select => {
        const firstOptionText = (select.options[0]?.text || '').toUpperCase();
        const filterType = (select.dataset.filterType || firstOptionText).toUpperCase();
        let values = [];
        if (filterType.includes('ANIO') || filterType.includes('AÑO')) values = CATALOG_YEARS;
        else if (filterType.includes('TEMA')) values = CATALOG_THEMES;
        else if (filterType.includes('FORMATO')) {
            const discoveredFormats = data.map(getRecordFormat).filter(Boolean);
            values = [...new Set([...COMMON_FORMATS, ...discoveredFormats])]
                .sort((a, b) => a.localeCompare(b, 'es'));
        }

        const defaultOption = select.options[0];
        select.replaceChildren(defaultOption);
        values.forEach(value => select.add(new Option(value, value)));
    });

    filterOptionGroups.forEach(group => {
        const filterType = group.dataset.filterType;
        let values = [];
        if (filterType === 'anio') values = CATALOG_YEARS;
        else if (filterType === 'tema') values = CATALOG_THEMES;
        else if (filterType === 'formato') {
            const discoveredFormats = data.map(getRecordFormat).filter(Boolean);
            values = [...new Set([...COMMON_FORMATS, ...discoveredFormats])]
                .sort((a, b) => a.localeCompare(b, 'es'));
        }

        const options = ['all', ...values];
        group.replaceChildren();
        options.forEach(value => {
            const label = document.createElement('label');
            label.className = 'strm_filter-option';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = value;
            checkbox.checked = value === 'all';
            checkbox.setAttribute('aria-label', value === 'all' ? 'Todos' : value);

            const text = document.createElement('span');
            text.textContent = value === 'all' ? 'Todos' : value;
            label.append(checkbox, text);
            group.appendChild(label);

            checkbox.addEventListener('change', () => {
                const groupCheckboxes = Array.from(group.querySelectorAll('input[type="checkbox"]'));
                const allCheckbox = groupCheckboxes[0];
                if (checkbox === allCheckbox && checkbox.checked) {
                    groupCheckboxes.slice(1).forEach(option => { option.checked = false; });
                } else {
                    allCheckbox.checked = false;
                    if (!groupCheckboxes.slice(1).some(option => option.checked)) {
                        allCheckbox.checked = true;
                    }
                }
            });
        });
    });

    function executeSearch() {
        const query = input ? input.value.trim() : '';
        const params = new URLSearchParams();

        if (query) {
            params.append('q', query);
        }

        // Keep "all" explicit so the catalog can reflect the landing-page selection.
        selects.forEach(select => {
            const val = (select.value || '').trim();
            const firstOptionText = (select.options[0] && select.options[0].text || '').toUpperCase();
            const filterType = (select.dataset.filterType || firstOptionText).toUpperCase();
            if (!val) return;
            if (filterType.includes('ANIO') || filterType.includes('AÑO')) params.set('anio', val);
            if (filterType.includes('TEMA')) params.set('tema', val);
            if (filterType.includes('FORMATO')) params.set('formato', val);
        });

        filterOptionGroups.forEach(group => {
            const param = group.dataset.filterType;
            const selectedValues = Array.from(group.querySelectorAll('input[type="checkbox"]:checked'))
                .map(checkbox => checkbox.value);
            selectedValues.forEach(value => params.append(param, value));
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
    const pagination = document.querySelector('.arc_pagination');
    const paginationStatus = document.querySelector('.arc_pagination-status');
    const previousPageButton = document.querySelector('.arc_pagination-previous');
    const nextPageButton = document.querySelector('.arc_pagination-next');
    const pageSize = 50;
    let currentPage = 1;
    let searchDebounce;
    const normalizeStr = normalizeFacetValue;
    const catalogRecords = data.map(item => ({
        item,
        searchFields: [
            item.titulo,
            item.id,
            item.proyecto,
            ...(Array.isArray(item.tags) ? item.tags : [])
        ].map(normalizeStr),
        themeText: normalizeStr([
            item.titulo,
            item.proyecto,
            item.descripcion,
            ...(Array.isArray(item.tags) ? item.tags : [])
        ].join(' ')),
        year: String(item.anio ?? ''),
        format: getRecordFormat(item),
        registeredAt: new Date(item.fecha_registro || 0).getTime()
    }));

    if (tableBody) {
        tableBody.addEventListener('click', event => {
            if (event.target.closest('a, button, input')) return;
            const row = event.target.closest('tr[data-resource-url]');
            if (row) window.location.href = row.dataset.resourceUrl;
        });
        tableBody.addEventListener('keydown', event => {
            if (event.key !== 'Enter' || event.target.tagName !== 'TR') return;
            const row = event.target.closest('tr[data-resource-url]');
            if (row) window.location.href = row.dataset.resourceUrl;
        });
    }

    // Leer parámetros de la URL enviados desde index.html
    const urlParams = new URLSearchParams(window.location.search);
    const initialQuery = urlParams.get('q') || '';
    const initialAnio = urlParams.getAll('anio');
    const initialTema = urlParams.getAll('tema');
    const initialFormato = urlParams.getAll('formato');

    console.log('initCatalogPage - URL params:', urlParams.toString());
    console.log('initCatalogPage - initialAnio,tema,formato:', initialAnio, initialTema, initialFormato);

    if (searchInput && initialQuery) {
        searchInput.value = initialQuery;
    }

    // Marcar automáticamente las casillas laterales según lo seleccionado en index.html
    syncUrlFiltersToSidebar(initialAnio, initialTema, initialFormato);

    // Función principal de filtrado y renderizado
    function filterAndRender(resetPage = true) {
        clearTimeout(searchDebounce);
        searchDebounce = undefined;
        if (resetPage) currentPage = 1;

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
        let filtered = catalogRecords.filter(record => {
            const matchQuery = !normalizedQuery ||
                record.searchFields.some(field => field.includes(normalizedQuery));

            const matchYear = checkedYears.length === 0 || checkedYears.includes(record.year);

            const matchTheme = checkedThemes.length === 0 ||
                checkedThemes.some(theme => {
                    const keywords = THEME_KEYWORDS[normalizeStr(theme)] || [];
                    return keywords.some(keyword => record.themeText.includes(normalizeStr(keyword)));
                });

            const matchFormat = checkedFormats.length === 0 ||
                checkedFormats.includes(record.format);

            return matchQuery && matchYear && matchTheme && matchFormat;
        });

        // Ordenamiento de resultados
        if (sortSelect) {
            const sortVal = sortSelect.value;
            if (sortVal.includes('recientes')) {
                filtered.sort((a, b) => b.registeredAt - a.registeredAt);
            } else if (sortVal.includes('viejos')) {
                filtered.sort((a, b) => a.registeredAt - b.registeredAt);
            }
        }

        const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
        currentPage = Math.min(currentPage, pageCount);
        const startIndex = (currentPage - 1) * pageSize;
        const pageResults = filtered.slice(startIndex, startIndex + pageSize);
        const firstResult = filtered.length === 0 ? 0 : startIndex + 1;
        const lastResult = Math.min(startIndex + pageSize, filtered.length);

        // Actualizar contador y controles de página
        if (resultsCount) {
            resultsCount.innerHTML = filtered.length
                ? `Mostrando <strong>${firstResult} - ${lastResult}</strong> de <strong>${filtered.length}</strong> resultados (${data.length} archivos en el catálogo)`
                : `Mostrando <strong>0</strong> resultados (${data.length} archivos en el catálogo)`;
        }
        if (pagination) pagination.hidden = filtered.length <= pageSize;
        if (paginationStatus) paginationStatus.textContent = `Página ${currentPage} de ${pageCount}`;
        if (previousPageButton) previousPageButton.disabled = currentPage <= 1;
        if (nextPageButton) nextPageButton.disabled = currentPage >= pageCount;

        // Dibujar únicamente la página actual para evitar crear cientos de filas a la vez.
        renderTableRows(pageResults.map(record => record.item), tableBody);
        renderActiveChips(query, checkedYears, checkedThemes, checkedFormats, activeFacetsContainer, filterAndRender);
    }

    // Escuchadores de eventos
    if (searchButton) searchButton.addEventListener('click', filterAndRender);
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            clearTimeout(searchDebounce);
            searchDebounce = setTimeout(() => filterAndRender(), 180);
        });
        searchInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') filterAndRender();
        });
    }
    if (sortSelect) sortSelect.addEventListener('change', filterAndRender);
    if (previousPageButton) {
        previousPageButton.addEventListener('click', () => {
            currentPage--;
            filterAndRender(false);
        });
    }
    if (nextPageButton) {
        nextPageButton.addEventListener('click', () => {
            currentPage++;
            filterAndRender(false);
        });
    }

    function bindSelectAll(masterId, optionSelector) {
        const master = document.getElementById(masterId);
        const options = Array.from(document.querySelectorAll(optionSelector));

        master?.addEventListener('change', () => {
            options.forEach(option => {
                option.checked = master.checked;
            });
            filterAndRender();
        });

        options.forEach(option => {
            option.addEventListener('change', () => {
                if (master) {
                    master.checked = options.length > 0 && options.every(item => item.checked);
                }
                filterAndRender();
            });
        });
    }

    bindSelectAll('cbYearAll', '.cb-year-item');
    bindSelectAll('cbThemeAll', '.cb-theme-item');
    bindSelectAll('cbFormatAll', '.cb-format-item');

    const btnClear = document.getElementById('btnClearFilters');
    if (btnClear) {
        btnClear.addEventListener('click', () => {
            clearTimeout(searchDebounce);
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
    [
        { value: anio, masterId: 'cbYearAll', selector: '.cb-year-item' },
        { value: tema, masterId: 'cbThemeAll', selector: '.cb-theme-item' },
        { value: formato, masterId: 'cbFormatAll', selector: '.cb-format-item' }
    ].forEach(({ value, masterId, selector }) => {
        const values = (Array.isArray(value) ? value : [value]).filter(Boolean);
        if (values.length === 0) return;

        const isAll = values.some(item => normalize(item) === 'all');
        const master = document.getElementById(masterId);
        const options = document.querySelectorAll(selector);
        options.forEach(option => {
            option.checked = isAll || values.some(item => normalize(option.value) === normalize(item));
        });
        if (master) master.checked = isAll;
    });
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
        const detailUrl = `recurso.html?id=${encodeURIComponent(String(item.id ?? ''))}`;
        const tagsHtml = (item.tags || []).map(t => {
            const tag = String(t);
            const tagSearchUrl = `browser.html?q=${encodeURIComponent(tag)}`;
            return `<a class="arc_tag arc_tag-link" href="${escapeHTML(tagSearchUrl)}" aria-label="Buscar por etiqueta ${escapeHTML(tag)}">#${escapeHTML(tag)}</a>`;
        }).join('');
        const badgeClass = `arc_${escapeHTML(String(item.formato || 'pdf').toLowerCase())}`;
        const thumbUrl = getThumbForItem(item);
        const thumbMarkup = thumbUrl
            ? `<img src="${escapeHTML(thumbUrl)}" alt="Miniatura del archivo" class="arc_thumb" loading="lazy" decoding="async">`
            : `<span class="arc_thumb-placeholder">no encontrado</span>`;

        return `
            <tr data-resource-url="${escapeHTML(detailUrl)}" tabindex="0" role="link" aria-label="Ver recurso: ${escapeHTML(item.titulo)}">
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
    const data = await getRepositoryData();
    const item = data.find(record => String(record.id) === resourceId);
    const preview = document.getElementById('resourcePreview');

    if (!item) {
        if (preview) {
            preview.textContent = resourceId
                ? 'No se encontró el recurso solicitado.'
                : 'Selecciona un recurso desde el catálogo para consultar sus detalles.';
            preview.classList.add('arc_preview-message');
        }
        return;
    }

    const titleEl = document.querySelector('.arc_resource-info h1');
    const descEl = document.querySelector('.arc_resource-description');
    const idEl = document.getElementById('resourceId');
    const projectEl = document.getElementById('resourceProject');
    const mimeEl = document.getElementById('resourceMime');
    const weightEl = document.getElementById('resourceWeight');
    const dateEl = document.getElementById('resourceDate');
    const typeEl = document.getElementById('resourceType');
    const tagsContainer = document.querySelector('.arc_tag-container');
    const downloadBtn = document.querySelector('.arc_btn-primary');
    const format = getRecordFormat(item);
    const normalizedFormat = normalizeFacetValue(item.formato);
    const mimeType = MIME_FORMATS[normalizedFormat]
        ? normalizedFormat
        : FORMAT_MIME_TYPES[format] || String(item.formato || 'Formato desconocido');
    const resourceUrl = String(item.url_archivo || '').trim();
    const imageFormats = ['gif', 'jpeg', 'jpg', 'png', 'svg', 'webp'];
    const downloadUrl = resourceUrl || (imageFormats.includes(format) ? getThumbForItem(item) : '');

    if (titleEl) titleEl.textContent = item.titulo || item.id || 'Recurso sin título';
    if (descEl) descEl.textContent = item.descripcion || 'Sin descripción disponible.';
    if (idEl) idEl.textContent = item.id || 'N/A';
    if (projectEl) projectEl.textContent = item.proyecto || 'N/A';
    if (mimeEl) mimeEl.textContent = mimeType;
    if (weightEl) weightEl.textContent = item.peso || 'N/A';
    if (dateEl) dateEl.textContent = item.fecha_registro || item.anio || 'N/A';
    if (typeEl) typeEl.textContent = item.tipo || 'N/A';
    document.title = `${item.titulo || item.id} — Repositorio Digital`;

    if (preview) {
        preview.replaceChildren(createResourcePreview(item, format, resourceUrl));
    }

    if (downloadBtn) {
        downloadBtn.hidden = !downloadUrl;
        if (downloadUrl) {
            downloadBtn.href = downloadUrl;
            downloadBtn.download = `${item.titulo || item.id || 'recurso'}.${format}`;
        }
    }

    if (tagsContainer) {
        tagsContainer.replaceChildren(...(Array.isArray(item.tags) ? item.tags : []).map(t => {
            const tag = String(t);
            const tagSearchUrl = `browser.html?q=${encodeURIComponent(tag)}`;
            const link = document.createElement('a');
            link.className = 'arc_tag arc_tag-link';
            link.href = tagSearchUrl;
            link.setAttribute('aria-label', `Buscar por etiqueta ${tag}`);
            link.textContent = `#${tag}`;
            return link;
        }));
    }
}

function createResourcePreview(item, format, resourceUrl) {
    const imageFormats = ['gif', 'jpeg', 'jpg', 'png', 'svg', 'webp'];
    const imageUrl = resourceUrl || (imageFormats.includes(format) ? getThumbForItem(item) : '');

    if (imageFormats.includes(format) && imageUrl) {
        const image = document.createElement('img');
        image.className = 'arc_resource-image';
        image.src = imageUrl;
        image.alt = item.titulo || 'Vista previa del recurso';
        return image;
    } else if (format === 'pdf' && resourceUrl) {
        const iframe = document.createElement('iframe');
        iframe.className = 'arc_pdf-iframe';
        iframe.src = `${resourceUrl}#toolbar=1&navpanes=0`;
        iframe.title = `Vista previa de ${item.titulo || 'documento PDF'}`;
        return iframe;
    } else if (['mp3', 'wav', 'aac'].includes(format) && resourceUrl) {
        const audio = document.createElement('audio');
        audio.className = 'arc_audio-player';
        audio.controls = true;
        audio.src = resourceUrl;
        audio.append('Tu navegador no soporta la reproducción de audio.');
        return audio;
    } else if (['avi', 'mov', 'mp4'].includes(format) && resourceUrl) {
        const video = document.createElement('video');
        video.className = 'arc_resource-video';
        video.controls = true;
        video.src = resourceUrl;
        video.append('Tu navegador no soporta la reproducción de video.');
        return video;
    }

    const message = document.createElement('p');
    message.className = 'arc_preview-message';
    message.textContent = resourceUrl
        ? `La vista previa para ${format || 'este formato'} no está disponible.`
        : 'No hay un archivo asociado para mostrar una vista previa.';
    return message;
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
