document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('gac30_breadcrumb-container');
  if (!container) return;

  // Obtener segmentos de la URL ignorando valores vacíos
  const pathSegments = window.location.pathname
    .split('/')
    .filter(segment => segment.length > 0);

  let html = '<ul class="gac30_breadcrumb">';
  
  // 1. Enlace fijo de Inicio
  html += '<li class="gac30_breadcrumb-item"><a href="/index.html" class="gac30_breadcrumb-link">Inicio</a></li>';

  let accumulatedPath = '';

  // 2. Recorrer la ruta actual
  pathSegments.forEach((segment, index) => {
    // Ignorar si el segmento es solo index.html
    if (segment.toLowerCase() === 'index.html') return;

    accumulatedPath += `/${segment}`;
    const isLast = index === pathSegments.length - 1;

    // Limpiar texto: quitar .html y convertir guiones en espacios
    let cleanText = segment.replace('.html', '').replace(/[-_]/g, ' ');
    cleanText = cleanText.charAt(0).toUpperCase() + cleanText.slice(1);

    if (isLast) {
      html += `<li class="gac30_breadcrumb-item gac30_active">${cleanText}</li>`;
    } else {
      html += `<li class="gac30_breadcrumb-item"><a href="${accumulatedPath}/" class="gac30_breadcrumb-link">${cleanText}</a></li>`;
    }
  });

  html += '</ul>';
  container.innerHTML = html;
});