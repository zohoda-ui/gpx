let map, chart, elevationMarker;
let gpxPoints = [], gpxDistances = [], gpxElevations = [];
const parser = new gpxParser();

/* ── Chart.js 수직선 커스텀 플러그인 ── */
const crosshairPlugin = {
    id: 'crosshair',
    afterDraw(chartInstance) {
        if (chartInstance._hoverIndex == null) return;
        const meta = chartInstance.getDatasetMeta(0);
        const pt   = meta.data[chartInstance._hoverIndex];
        if (!pt) return;
        const ctx = chartInstance.ctx;
        const { top, bottom } = chartInstance.chartArea;
        ctx.save();
        // 수직 점선
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(59,130,246,0.7)';
        ctx.lineWidth = 1.5;
        ctx.moveTo(pt.x, top);
        ctx.lineTo(pt.x, bottom);
        ctx.stroke();
        // 포인트 원
        ctx.beginPath();
        ctx.setLineDash([]);
        ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#3b82f6';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
};

/* ── info-panel 업데이트 ── */
function updateInfoPanel(dist, ele) {
    const distEl = document.getElementById('hover-dist');
    const eleEl  = document.getElementById('hover-ele');
    if (!distEl || !eleEl) return;

    if (dist == null) {
        distEl.textContent = '—';
        eleEl.textContent  = '—';
        distEl.classList.remove('active');
        eleEl.classList.remove('active');
    } else {
        distEl.textContent = dist + ' km';
        eleEl.textContent  = ele  + ' m';
        distEl.classList.add('active');
        eleEl.classList.add('active');
    }
}

/* ── 마우스에 가장 가까운 GPX 포인트 인덱스 반환 ── */
function findNearestIndex(latlng) {
    let minDist = Infinity, idx = 0;
    for (let i = 0; i < gpxPoints.length; i++) {
        const d = map.latLngToLayerPoint(L.latLng(gpxPoints[i]))
                     .distanceTo(map.latLngToLayerPoint(latlng));
        if (d < minDist) { minDist = d; idx = i; }
    }
    return idx;
}

/* ── 지도 초기화 ── */
function initMap() {
    map = L.map('map', { scrollWheelZoom: false })
            .setView([37.5665, 126.9780], 13);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a>'
    }).addTo(map);

    elevationMarker = L.circleMarker([0, 0], {
        radius: 8,
        fillColor: '#3b82f6',
        color: '#fff',
        weight: 2,
        fillOpacity: 1
    }).addTo(map);
    elevationMarker.setOpacity(0);

    // ── 지도 전체 mousemove: 경로 근처(30px)면 툴팁 표시 ──
    const mapTooltip = document.getElementById('map-tooltip');

    map.on('mousemove', function(e) {
        if (!gpxPoints.length) return;

        const idx         = findNearestIndex(e.latlng);
        const nearestPx   = map.latLngToLayerPoint(L.latLng(gpxPoints[idx]));
        const mousePx     = map.latLngToLayerPoint(e.latlng);
        const pixelDist   = nearestPx.distanceTo(mousePx);

        if (pixelDist > 30) {
            // 경로에서 멀면 숨김
            elevationMarker.setOpacity(0);
            mapTooltip.style.display = 'none';
            if (chart) { chart._hoverIndex = null; chart.update('none'); }
            updateInfoPanel(null);
            return;
        }

        const dist = gpxDistances[idx].toFixed(2);
        const ele  = gpxElevations[idx].toFixed(0);

        // 지도 마커
        elevationMarker.setLatLng(gpxPoints[idx]);
        elevationMarker.setOpacity(1);

        // 지도 위 툴팁
        mapTooltip.innerHTML =
            `<span style="color:#93c5fd">📍 거리</span> <b>${dist} km</b><br>` +
            `<span style="color:#6ee7b7">⛰️ 고도</span> <b>${ele} m</b>`;
        mapTooltip.style.display = 'block';
        mapTooltip.style.left = (e.originalEvent.clientX + 14) + 'px';
        mapTooltip.style.top  = (e.originalEvent.clientY - 10) + 'px';

        // 고도차트 수직선 연동
        if (chart) {
            chart._hoverIndex = idx;
            chart.update('none');
        }

        // info-panel 숫자 업데이트
        updateInfoPanel(dist, ele);
    });

    map.on('mouseout', function() {
        elevationMarker.setOpacity(0);
        mapTooltip.style.display = 'none';
        if (chart) { chart._hoverIndex = null; chart.update('none'); }
        updateInfoPanel(null);
    });
}

/* ── GPX 파싱 및 렌더링 ── */
function processGPX(xml) {
    parser.parse(xml);
    const track     = parser.tracks[0];
    const points    = track.points.map(p => [p.lat, p.lon]);
    const elevations = track.points.map(p => p.ele);
    const distances = calculateDistances(track.points);

    gpxPoints    = points;
    gpxDistances = distances;
    gpxElevations = elevations;

    const polyline = L.polyline(points, { color: '#3b82f6', weight: 5, opacity: 0.8 }).addTo(map);
    map.fitBounds(polyline.getBounds());

    L.marker(points[0]).addTo(map).bindPopup('출발');
    L.marker(points[points.length - 1]).addTo(map).bindPopup('도착');

    updateStats(track, distances);
    renderChart(distances, elevations, points);
}

/* ── 거리 계산 ── */
function calculateDistances(points) {
    let dist = 0;
    const distances = [0];
    for (let i = 1; i < points.length; i++) {
        const p1 = L.latLng(points[i - 1].lat, points[i - 1].lon);
        const p2 = L.latLng(points[i].lat, points[i].lon);
        dist += p1.distanceTo(p2) / 1000;
        distances.push(parseFloat(dist.toFixed(2)));
    }
    return distances;
}

/* ── 통계 카드 업데이트 ── */
function updateStats(track, distances) {
    const totalDist  = distances[distances.length - 1].toFixed(2);
    const elevations = track.points.map(p => p.ele);
    let gain = 0;
    for (let i = 1; i < elevations.length; i++) {
        const diff = elevations[i] - elevations[i - 1];
        if (diff > 0) gain += diff;
    }
    document.getElementById('dist').innerText = `${totalDist} km`;
    document.getElementById('gain').innerText = `${gain.toFixed(0)} m`;
}

/* ── 고도 차트 렌더링 ── */
function renderChart(distances, elevations, points) {
    const ctx = document.getElementById('elevationChart').getContext('2d');
    if (chart) chart.destroy();

    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.4)');
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');

    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: distances,
            datasets: [{
                label: 'Elevation',
                data: elevations,
                borderColor: '#3b82f6',
                borderWidth: 2,
                fill: true,
                backgroundColor: gradient,
                tension: 0.4,
                pointRadius: 0,
                pointHitRadius: 20
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: true,
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: (ctx) => `고도: ${ctx.parsed.y} m`,
                        title: (ctx) => `거리: ${ctx[0].label} km`
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    grid: { display: false },
                    ticks: { color: '#6b7280', maxRotation: 0, autoSkip: true, maxTicksLimit: 10 }
                },
                y: {
                    display: true,
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: { color: '#6b7280' }
                }
            },
            onHover: (event, activeElements) => {
                if (activeElements.length > 0) {
                    const index = activeElements[0].index;
                    elevationMarker.setLatLng(points[index]);
                    elevationMarker.setOpacity(1);

                    // 차트 호버 시에도 info-panel 업데이트
                    const dist = gpxDistances[index].toFixed(2);
                    const ele  = gpxElevations[index].toFixed(0);
                    updateInfoPanel(dist, ele);
                } else {
                    elevationMarker.setOpacity(0);
                    updateInfoPanel(null);
                }
            }
        }
    });
}

/* ── 파일 업로드 이벤트 ── */
document.getElementById('fileInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) { processGPX(ev.target.result); };
    reader.readAsText(file);
});

/* ── 앱 초기화 ── */
window.onload = () => {
    // Chart.js 플러그인 등록 (Chart가 로드된 후)
    Chart.register(crosshairPlugin);

    initMap();
    setTimeout(() => map.invalidateSize(), 100);

    fetch('sample.gpx')
        .then(r => r.text())
        .then(xml => processGPX(xml))
        .catch(() => console.log('No default file found.'));
};
