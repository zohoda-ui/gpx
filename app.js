let map, chart, elevationMarker;
const parser = new gpxParser();

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

    // Update Map
    const polyline = L.polyline(points, { color: '#3b82f6', weight: 5, opacity: 0.8 }).addTo(map);
    map.fitBounds(polyline.getBounds());

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
