let map, chart, elevationMarker;
let gpxPoints = [], gpxDistances = [], gpxElevations = [];
const parser = new gpxParser();

/* ── 지도 초기화 ── */
function initMap() {
    map = L.map('map', { scrollWheelZoom: false })
           .setView([37.5665, 126.9780], 13);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a>'
    }).addTo(map);

    elevationMarker = L.circleMarker([0, 0], {
        radius: 8, fillColor: '#3b82f6',
        color: '#fff', weight: 2, fillOpacity: 1
    }).addTo(map);
    elevationMarker.setOpacity(0);

    /* ── rAF 스로틀링 적용 mousemove ── */
    let rafId = null;
    const tooltip  = document.getElementById('map-tooltip');
    const hoverDist = document.getElementById('hover-dist');
    const hoverEle  = document.getElementById('hover-ele');
    const crosshair = document.getElementById('chart-crosshair');

    map.on('mousemove', function(e) {
        if (rafId) return;           // 이전 프레임 처리 중이면 스킵
        rafId = requestAnimationFrame(() => {
            rafId = null;
            if (!gpxPoints.length) return;

            /* 가장 가까운 포인트 탐색 */
            let minD = Infinity, idx = 0;
            const mp = map.latLngToLayerPoint(e.latlng);
            for (let i = 0; i < gpxPoints.length; i++) {
                const d = map.latLngToLayerPoint(
                    L.latLng(gpxPoints[i][0], gpxPoints[i][1])
                ).distanceTo(mp);
                if (d < minD) { minD = d; idx = i; }
            }

            /* 경로에서 60px 초과 시 숨김 */
            if (minD > 60) {
                elevationMarker.setOpacity(0);
                tooltip.style.display = 'none';
                if (crosshair) crosshair.style.display = 'none';
                if (hoverDist) hoverDist.textContent = '—';
                if (hoverEle)  hoverEle.textContent  = '—';
                if (hoverDist) hoverDist.classList.remove('active');
                if (hoverEle)  hoverEle.classList.remove('active');
                return;
            }

            const dist = gpxDistances[idx].toFixed(2);
            const ele  = gpxElevations[idx].toFixed(0);

            /* 지도 마커 */
            elevationMarker.setLatLng([gpxPoints[idx][0], gpxPoints[idx][1]]);
            elevationMarker.setOpacity(1);

            /* 지도 위 팝업 툴팁 */
            tooltip.innerHTML =
                `<span style="color:#93c5fd">📍 거리</span> <b>${dist} km</b><br>` +
                `<span style="color:#6ee7b7">⛰️ 고도</span> <b>${ele} m</b>`;
            tooltip.style.display = 'block';
            tooltip.style.left = (e.originalEvent.clientX + 16) + 'px';
            tooltip.style.top  = (e.originalEvent.clientY - 14) + 'px';

            /* info-panel 숫자 */
            if (hoverDist) { hoverDist.textContent = dist + ' km'; hoverDist.classList.add('active'); }
            if (hoverEle)  { hoverEle.textContent  = ele  + ' m';  hoverEle.classList.add('active'); }

            /* 차트 수직선 (chart.update 없이 CSS div 이동) */
            if (chart && crosshair) {
                const meta = chart.getDatasetMeta(0);
                const pt   = meta.data[idx];
                if (pt) {
                    const canvasRect = document.getElementById('elevationChart').getBoundingClientRect();
                    const containerRect = document.querySelector('.chart-container').getBoundingClientRect();
                    // 캔버스 왼쪽 기준 pt.x → 컨테이너 기준 left 계산
                    crosshair.style.left    = (canvasRect.left - containerRect.left + pt.x) + 'px';
                    crosshair.style.top     = (canvasRect.top  - containerRect.top  + chart.chartArea.top) + 'px';
                    crosshair.style.height  = (chart.chartArea.bottom - chart.chartArea.top) + 'px';
                    crosshair.style.display = 'block';
                }
            }
        });
    });

    map.on('mouseout', function() {
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        elevationMarker.setOpacity(0);
        const tooltip   = document.getElementById('map-tooltip');
        const crosshair = document.getElementById('chart-crosshair');
        const hoverDist = document.getElementById('hover-dist');
        const hoverEle  = document.getElementById('hover-ele');
        if (tooltip)   tooltip.style.display   = 'none';
        if (crosshair) crosshair.style.display = 'none';
        if (hoverDist) { hoverDist.textContent = '—'; hoverDist.classList.remove('active'); }
        if (hoverEle)  { hoverEle.textContent  = '—'; hoverEle.classList.remove('active'); }
    });
}

/* ── GPX 파싱 ── */
function processGPX(xml) {
    parser.parse(xml);
    const track      = parser.tracks[0];
    const points     = track.points.map(p => [p.lat, p.lon]);
    const elevations = track.points.map(p => p.ele);
    const distances  = calculateDistances(track.points);

    gpxPoints     = points;
    gpxDistances  = distances;
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
            animation: false,
            interaction: {
                mode: 'index',        // x축 기준으로 가장 가까운 데이터 인덱스
                intersect: false      // 선 위가 아니어도 감지
            },
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }   // 기본 툴팁 OFF → info-panel + crosshair 사용
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
            /* 차트 호버 → info-panel + crosshair + 지도마커 연동 */
            onHover: (event, activeElements) => {
                const hoverDist = document.getElementById('hover-dist');
                const hoverEle  = document.getElementById('hover-ele');
                const crosshair = document.getElementById('chart-crosshair');

                if (activeElements.length > 0) {
                    const i    = activeElements[0].index;
                    const meta = chart.getDatasetMeta(0);
                    const pt   = meta.data[i];

                    // 지도 마커 이동
                    elevationMarker.setLatLng(points[i]);
                    elevationMarker.setOpacity(1);

                    // info-panel 숫자 업데이트
                    if (hoverDist) { hoverDist.textContent = gpxDistances[i].toFixed(2) + ' km'; hoverDist.classList.add('active'); }
                    if (hoverEle)  { hoverEle.textContent  = gpxElevations[i].toFixed(0) + ' m';  hoverEle.classList.add('active'); }

                    // crosshair div 이동
                    if (crosshair && pt) {
                        const canvasRect    = document.getElementById('elevationChart').getBoundingClientRect();
                        const containerRect = document.querySelector('.chart-container').getBoundingClientRect();
                        crosshair.style.left    = (canvasRect.left - containerRect.left + pt.x) + 'px';
                        crosshair.style.top     = (canvasRect.top  - containerRect.top  + chart.chartArea.top) + 'px';
                        crosshair.style.height  = (chart.chartArea.bottom - chart.chartArea.top) + 'px';
                        crosshair.style.display = 'block';
                    }
                } else {
                    elevationMarker.setOpacity(0);
                    if (hoverDist) { hoverDist.textContent = '—'; hoverDist.classList.remove('active'); }
                    if (hoverEle)  { hoverEle.textContent  = '—'; hoverEle.classList.remove('active'); }
                    if (crosshair) crosshair.style.display = 'none';
                }
            }
        }

    });
}

/* ── 파일 업로드 ── */
document.getElementById('fileInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) { processGPX(ev.target.result); };
    reader.readAsText(file);
});

/* ── 앱 초기화 ── */
window.onload = () => {
    initMap();
    setTimeout(() => map.invalidateSize(), 100);
    fetch('sample.gpx')
        .then(r => r.text())
        .then(xml => processGPX(xml))
        .catch(() => console.log('No default file.'));
};
