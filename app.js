let map, chart, elevationMarker;
let gpxPoints = [], gpxDistances = [], gpxElevations = [];
const parser = new gpxParser();

/* ── Chart.js 수직선 커스텀 플러그인 ── */
const crosshairPlugin = {
    id: 'crosshair',
    afterDraw(chartInstance) {
        if (chartInstance._hoverIndex == null) return;
        const ctx  = chartInstance.ctx;
        const meta = chartInstance.getDatasetMeta(0);
        const pt   = meta.data[chartInstance._hoverIndex];
        if (!pt) return;
        const { top, bottom } = chartInstance.chartArea;
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(59,130,246,0.7)';
        ctx.lineWidth = 1.5;
        ctx.moveTo(pt.x, top);
        ctx.lineTo(pt.x, bottom);
        ctx.stroke();
        // 점 하이라이트
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
Chart.register(crosshairPlugin);

/* ── info-panel 업데이트 ── */
function updateInfoPanel(dist, ele) {
    const distEl = document.getElementById('hover-dist');
    const eleEl  = document.getElementById('hover-ele');
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

// 지도 위 커스텀 툴팁 생성
const mapTooltip = document.createElement('div');
mapTooltip.id = 'map-tooltip';
mapTooltip.style.cssText = [
    'position:fixed',
    'background:rgba(15,23,42,0.88)',
    'color:#fff',
    'padding:8px 13px',
    'border-radius:10px',
    'font-size:0.82rem',
    'font-family:Inter,sans-serif',
    'pointer-events:none',
    'display:none',
    'z-index:9999',
    'white-space:nowrap',
    'box-shadow:0 4px 16px rgba(0,0,0,0.25)',
    'border:1px solid rgba(59,130,246,0.4)',
    'line-height:1.7'
].join(';');
document.body.appendChild(mapTooltip);

// 마우스에 가장 가까운 GPX 포인트 인덱스 반환
function findNearestIndex(latlng) {
    let minDist = Infinity, idx = 0;
    for (let i = 0; i < gpxPoints.length; i++) {
        const d = map.latLngToLayerPoint(L.latLng(gpxPoints[i])).distanceTo(
                  map.latLngToLayerPoint(latlng));
        if (d < minDist) { minDist = d; idx = i; }
    }
    return idx;
}

function initMap() {
    map = L.map('map', {
        scrollWheelZoom: false
    }).setView([37.5665, 126.9780], 13);
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
}

function processGPX(xml) {
    parser.parse(xml);
    const track = parser.tracks[0];
    const points = track.points.map(p => [p.lat, p.lon]);
    const elevations = track.points.map(p => p.ele);
    const distances = calculateDistances(track.points);

    // 전역에 저장 (툴팁 참조용)
    gpxPoints = points;
    gpxDistances = distances;
    gpxElevations = elevations;

    // Update Map
    const polyline = L.polyline(points, { color: '#3b82f6', weight: 5, opacity: 0.8 }).addTo(map);
    map.fitBounds(polyline.getBounds());

    // 경로 위 마우스 이벤트 → 커스텀 툴팁
    polyline.on('mousemove', function(e) {
        const idx  = findNearestIndex(e.latlng);
        const dist = gpxDistances[idx].toFixed(2);
        const ele  = gpxElevations[idx].toFixed(0);

        // 지도 마커 이동
        elevationMarker.setLatLng(gpxPoints[idx]);
        elevationMarker.setOpacity(1);

        // 툴팁 내용 및 위치
        mapTooltip.innerHTML =
            `<span style="color:#93c5fd">📍 거리</span> <b>${dist} km</b><br>` +
            `<span style="color:#6ee7b7">⛰️ 고도</span> <b>${ele} m</b>`;
        mapTooltip.style.display = 'block';
        mapTooltip.style.left = (e.originalEvent.clientX + 14) + 'px';
        mapTooltip.style.top  = (e.originalEvent.clientY - 10) + 'px';

        // 고도 차트 수직선 연동
        if (chart) {
            chart._hoverIndex = idx;
            chart.update('none');   // 애니메이션 없이 수직선만 직접 내로
        }

        // info-panel 업데이트
        updateInfoPanel(dist, ele);
    });

    polyline.on('mouseout', function() {
        elevationMarker.setOpacity(0);
        mapTooltip.style.display = 'none';
        if (chart) {
            chart._hoverIndex = null;
            chart.update('none');
        }
        updateInfoPanel(null);
    });

    // Add Start/End Markers
    L.marker(points[0]).addTo(map).bindPopup('Start');
    L.marker(points[points.length - 1]).addTo(map).bindPopup('End');

    // Update Stats
    updateStats(track, distances);

    // Update Chart
    renderChart(distances, elevations, points);
}

function calculateDistances(points) {
    let dist = 0;
    const distances = [0];
    for (let i = 1; i < points.length; i++) {
        const p1 = L.latLng(points[i - 1].lat, points[i - 1].lon);
        const p2 = L.latLng(points[i].lat, points[i].lon);
        dist += p1.distanceTo(p2) / 1000; // km
        distances.push(parseFloat(dist.toFixed(2)));
    }
    return distances;
}

function updateStats(track, distances) {
    const totalDist = distances[distances.length - 1].toFixed(2);
    const elevations = track.points.map(p => p.ele);
    const maxEle = Math.max(...elevations).toFixed(0);
    const minEle = Math.min(...elevations).toFixed(0);
    
    let gain = 0;
    for (let i = 1; i < elevations.length; i++) {
        const diff = elevations[i] - elevations[i - 1];
        if (diff > 0) gain += diff;
    }

    document.getElementById('dist').innerText = `${totalDist} km`;
    document.getElementById('gain').innerText = `${gain.toFixed(0)} m`;
}

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
                        label: (context) => `Elevation: ${context.parsed.y}m`,
                        title: (context) => `Distance: ${context[0].label}km`
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
                    grid: { color: 'rgba(0, 0, 0, 0.05)' },
                    ticks: { color: '#6b7280' }
                }
            },
            onHover: (event, activeElements) => {
                if (activeElements.length > 0) {
                    const index = activeElements[0].index;
                    const pos = points[index];
                    elevationMarker.setLatLng(pos);
                    elevationMarker.setOpacity(1);
                } else {
                    elevationMarker.setOpacity(0);
                }
            }
        }
    });
}

document.getElementById('fileInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        processGPX(e.target.result);
    };
    reader.readAsText(file);
});

// For Tistory, we might want to load a file via URL if provided in a data attribute
window.onload = () => {
    initMap();
    // flex 레이아웃 내에서 지도 크기를 올바르게 재계산
    setTimeout(() => map.invalidateSize(), 100);
    // Check if there is a sample file or initial file to load
    fetch('sample.gpx')
        .then(response => response.text())
        .then(xml => processGPX(xml))
        .catch(err => console.log('No default file found.'));
};
