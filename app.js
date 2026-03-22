// Initialize the map centered on Tunisia
//[33.8869, 9.5375] are Tunisia coordinates
//The map is initialized with a zoom level of 7
const map = L.map('map').setView([33.8869, 9.5375], 7);

// Add map background tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);


// Save selected points and markers
let selectedPoints = { A: null, B: null };
let markers = [];


// Example texts for inputs
const placeholdersA = [
  'Ex: Tunis',
  'Ex: Bab Alioua, Tunis',
  'Ex: ENICarthage, Ariana',
  'Ex: Gare de Tunis',
  'Ex: Lac 2, Tunis'
];

const placeholdersB = [
  'Ex: Sousse',
  'Ex: Sfax',
  'Ex: Redeyef, Gafsa',
  'Ex: La Marsa, Tunis',
  'Ex: Aéroport Tunis Carthage'
];

// Change placeholder text automatically
function rotatePlaceholders(inputId, placeholders) {
  let index = 0;
  setInterval(() => {
    index = (index + 1) % placeholders.length;
    const input = document.getElementById(inputId);
    if (!input.value) input.placeholder = placeholders[index];
  }, 2000);
}

rotatePlaceholders('pointA', placeholdersA);
rotatePlaceholders('pointB', placeholdersB);


// Get place suggestions from API
async function fetchSuggestions(query) {
  if (query.length < 2) return [];

  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query + ' Tunisia')}&limit=5&lang=en&bbox=7.52,30.23,11.59,37.54`;
    const response = await fetch(url);
    const data = await response.json();

    return data.features
      .map(item => ({
        name: item.properties.name,
        city: item.properties.city || item.properties.state || '',
        lat: item.geometry.coordinates[1],
        lng: item.geometry.coordinates[0]
      }))
      .filter(p => p.name);

  } catch (error) {
    console.error('Search error:', error);
    return [];
  }
}


// Show suggestions in dropdown
function showSuggestions(suggestions, listId, inputId, point) {
  const list = document.getElementById(listId);
  list.innerHTML = '';

  // Show message if no results
  if (suggestions.length === 0) {
    list.innerHTML = `
      <div class="no-result-box">
        <div class="no-result-icon"></div>
        <div class="no-result-title">No places found</div>
        <div class="no-result-hint">
          Try adding the city or neighborhood:<br/>
          <span class="hint-example">ENICarthage → <b>ENICarthage, Ariana</b></span><br/>
          <span class="hint-example">ISET → <b>ISET, Tunis</b></span>
        </div>
      </div>
    `;
    list.classList.add('active');
    return;
  }

  suggestions.forEach(place => {
    const item = document.createElement('div');
    item.classList.add('suggestion-item');

    // Show name and city
    item.innerHTML = `
      <div class="suggestion-main">${place.name}</div>
      <div class="suggestion-sub">${place.city ? place.city + ' — ' : ''}Tunisia</div>
    `;

    // When user selects a place
    item.addEventListener('click', () => {
      const displayName = place.city
        ? `${place.name}, ${place.city}`
        : place.name;

      document.getElementById(inputId).value = displayName;
      selectedPoints[point] = { lat: place.lat, lng: place.lng, name: displayName };
      list.classList.remove('active');

      // Remove old markers
      markers.forEach(m => map.removeLayer(m));
      markers = [];

      // Add marker to map
      const marker = L.marker([place.lat, place.lng])
        .addTo(map)
        .bindPopup(`<b>${point === 'A' ? ' Start' : 'End'}:</b> ${displayName}`)
        .openPopup();

      markers.push(marker);
      map.setView([place.lat, place.lng], 14);
    });

    list.appendChild(item);
  });

  // Add help hint
  const hint = document.createElement('div');
  hint.classList.add('search-hint-footer');
  hint.innerHTML = `Try: <b>"Place, City"</b>`;
  list.appendChild(hint);

  list.classList.add('active');
}

// Delay typing requests
function debounce(func, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => func(...args), delay);
  };
}

// Listen for typing in inputs
document.getElementById('pointA').addEventListener('input', debounce(async (e) => {
  const suggestions = await fetchSuggestions(e.target.value);
  showSuggestions(suggestions, 'suggestionsA', 'pointA', 'A');
}, 300));

document.getElementById('pointB').addEventListener('input', debounce(async (e) => {
  const suggestions = await fetchSuggestions(e.target.value);
  showSuggestions(suggestions, 'suggestionsB', 'pointB', 'B');
}, 300));

// Hide suggestions when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.autocomplete-container')) {
    document.querySelectorAll('.suggestions-list').forEach(list => {
      list.classList.remove('active');
    });
  }
});

// Colors for routes
const routeColors = ['#2196F3', '#FF9800', '#9C27B0'];
let routeLayers = [];
let currentRoutes = [];


// Get routes from OSRM API
async function fetchRoutes(pointA, pointB) {
  const url = `https://router.project-osrm.org/route/v1/driving/${pointA.lng},${pointA.lat};${pointB.lng},${pointB.lat}?alternatives=true&geometries=geojson&overview=full&steps=true`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.code !== 'Ok' || !data.routes) {
    alert('Could not find routes.');
    return [];
  }

  return data.routes;
}


// Draw routes on map
function drawRoutes(routes) {

  // Remove old routes
  routeLayers.forEach(layer => map.removeLayer(layer));
  routeLayers = [];

  // Remove old panel
  const existingPanel = document.getElementById('route-panel');
  if (existingPanel) existingPanel.remove();

  routes.forEach((route, index) => {
    const color = routeColors[index];
    const coordinates = route.geometry.coordinates.map(c => [c[1], c[0]]);

    // Draw line
    const polyline = L.polyline(coordinates, {
      color: color,
      weight: index === 0 ? 6 : 4,
      opacity: index === 0 ? 1 : 0.6,
      dashArray: index === 0 ? null : '8, 8'
    }).addTo(map);

    // Highlight on hover
    polyline.on('mouseover', () => {
      polyline.setStyle({ weight: 7, opacity: 1 });
    });

    polyline.on('mouseout', () => {
      polyline.setStyle({
        weight: index === 0 ? 6 : 4,
        opacity: index === 0 ? 1 : 0.6
      });
    });

    // Select route on click
    polyline.on('click', () => {
      selectRoute(index);
    });

    routeLayers.push(polyline);
  });

  // Adjust map view
  map.fitBounds(routeLayers[0].getBounds(), { padding: [40, 40] });

  showRoutePanel(routes);
}


// Format distance
function formatDistance(meters) {
  return meters >= 1000
    ? (meters / 1000).toFixed(1) + ' km'
    : Math.round(meters) + ' m';
}

// Format duration
function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  return mins >= 60
    ? Math.floor(mins / 60) + 'h ' + (mins % 60) + 'min'
    : mins + ' min';
}


// Show route info panel
function showRoutePanel(routes) {
  const panel = document.createElement('div');
  panel.id = 'route-panel';

  const routeLabels = ['Shortest', 'Alternative 1', 'Alternative 2'];

  panel.innerHTML = `
    <div class="route-panel-title"> Available Routes</div>
    ${routes.map((route, index) => `
      <div class="route-card ${index === 0 ? 'selected' : ''}"
           id="route-card-${index}"
           onclick="selectRoute(${index})">
        <div class="route-card-header">
          <span class="route-dot" style="background:${routeColors[index]}"></span>
          <span class="route-label">${routeLabels[index] || 'Alternative ' + index}</span>
          ${index === 0 ? '<span class="route-badge">Recommended</span>' : ''}
        </div>
        <div class="route-stats">
          <div class="route-stat"> <b>${formatDuration(route.duration)}</b></div>
          <div class="route-stat"> <b>${formatDistance(route.distance)}</b></div>
        </div>
      </div>
    `).join('')}
    <div class="ai-placeholder">
      🤖 AI Traffic Prediction — <i>Coming Soon</i>
    </div>
  `;

  document.getElementById('search-panel').appendChild(panel);
}


// Select a route
function selectRoute(index) {
  routeLayers.forEach((layer, i) => {
    layer.setStyle({
      weight: i === index ? 6 : 4,
      opacity: i === index ? 1 : 0.5,
      dashArray: i === index ? null : '8, 8'
    });
    if (i === index) layer.bringToFront();
  });

  document.querySelectorAll('.route-card').forEach((card, i) => {
    card.classList.toggle('selected', i === index);
  });
}


// Handle route search button
document.getElementById('findRoute').addEventListener('click', async () => {

  // Check inputs
  if (!selectedPoints.A || !selectedPoints.B) {
    alert('Please select both points');
    return;
  }

  const btn = document.getElementById('findRoute');
  btn.textContent = '⏳ Loading...';
  btn.disabled = true;

  // Remove old markers
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  // Add start marker
  const markerA = L.marker([selectedPoints.A.lat, selectedPoints.A.lng], {
    icon: L.divIcon({
      html: '<div class="custom-marker marker-a">A</div>',
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    })
  }).addTo(map).bindPopup(`Start: ${selectedPoints.A.name}`);

  // Add end marker
  const markerB = L.marker([selectedPoints.B.lat, selectedPoints.B.lng], {
    icon: L.divIcon({
      html: '<div class="custom-marker marker-b">B</div>',
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    })
  }).addTo(map).bindPopup(`End: ${selectedPoints.B.name}`);

  markers.push(markerA, markerB);

  // Get routes and draw them
  const routes = await fetchRoutes(selectedPoints.A, selectedPoints.B);
  currentRoutes = routes;

  if (routes.length > 0) drawRoutes(routes);

  btn.textContent = 'Find Routes';
  btn.disabled = false;
});

// AI TRAFFIC PREDICTION — FASTAPI INTEGRATION

const FASTAPI_URL = 'https://tunisia-ai-traffic-map.onrender.com';

// Tunisia bounding box check 
function isInTunisia(lat, lng) {
  return lat >= 30.23 && lat <= 37.54 &&
         lng >= 7.52  && lng <= 11.59;
}

// Compute time features 
function getTimeFeatures() {
  const now  = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  const day  = now.getDay() === 0 ? 6 : now.getDay() - 1; // 0=Mon, 6=Sun

  return {
    hour_sin:         Math.sin(2 * Math.PI * hour / 24),
    hour_cos:         Math.cos(2 * Math.PI * hour / 24),
    day_sin:          Math.sin(2 * Math.PI * day / 7),
    day_cos:          Math.cos(2 * Math.PI * day / 7),
    is_rush_hour:     ((hour >= 7.5 && hour <= 9.0) || (hour >= 17.0 && hour <= 19.0)) && day < 5 ? 1 : 0,
    is_weekend:       day >= 5 ? 1 : 0,
    is_friday_prayer: day === 4 && hour >= 11.5 && hour <= 13.5 ? 1 : 0,
    is_night:         hour >= 22 || hour <= 5 ? 1 : 0,
  };
}

// Road type encoding 
const highwayEncoding = {
  'motorway': 1, 'motorway_link': 2, 'trunk': 3, 'trunk_link': 4,
  'primary': 5, 'primary_link': 6, 'secondary': 7, 'secondary_link': 8,
  'tertiary': 9, 'tertiary_link': 10, 'residential': 11,
  'unclassified': 12, 'service': 13, 'living_street': 14
};

//Extract features from one OSRM route 
function extractRouteFeatures(route, pointA, pointB) {
  const tf             = getTimeFeatures();
  const distanceKm     = route.distance / 1000;
  const durationMin    = route.duration / 60;
  const avgSpeed       = distanceKm / (durationMin / 60) || 50;

  // Extract road types from steps
  const steps          = route.legs?.[0]?.steps || [];
  const roadTypes      = steps.map(s => s.extra?.classes?.[0] || 'residential');
  const encodedTypes   = roadTypes.map(t => highwayEncoding[t] || 11);
  const dominantType   = encodedTypes.length > 0
    ? encodedTypes.sort((a,b) =>
        encodedTypes.filter(v=>v===b).length - encodedTypes.filter(v=>v===a).length
      )[0]
    : 11;

  // Estimate CPI from speed and distance
  const avgCpi         = Math.min(100, Math.max(10, 100 - (avgSpeed / 130 * 100)));
  const avgRcs         = Math.min(100, (distanceKm / 50) * 100);
  const highRiskRatio  = avgCpi > 60 ? 1 : 0;

  return {
    highway_encoded:  dominantType,
    avg_cpi:          parseFloat(avgCpi.toFixed(2)),
    avg_rcs:          parseFloat(avgRcs.toFixed(2)),
    avg_speed:        parseFloat(avgSpeed.toFixed(2)),
    min_lanes:        1,
    min_width:        5.0,
    total_length_km:  parseFloat(distanceKm.toFixed(3)),
    high_risk_ratio:  highRiskRatio,
    ...tf,
    start_lat:        pointA.lat,
    start_lng:        pointA.lng,
    end_lat:          pointB.lat,
    end_lng:          pointB.lng,
  };
}

//Call FastAPI predict endpoint 
async function predictCongestion(routes, pointA, pointB) {
  try {
    const routeFeatures = routes.map(r =>
      extractRouteFeatures(r, pointA, pointB)
    );

    const response = await fetch(`${FASTAPI_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routes: routeFeatures })
    });

    return await response.json();

  } catch (error) {
    console.error('AI prediction error:', error);
    return null;
  }
}

//Update route panel with AI results 
function updatePanelWithAI(prediction) {
  // Remove old AI placeholder
  const placeholder = document.querySelector('.ai-placeholder');
  if (placeholder) placeholder.remove();

  const panel = document.getElementById('route-panel');
  if (!panel) return;

  if (!prediction || prediction.status !== 'success') {
    // Outside Tunisia or error
    const msg = prediction?.status === 'outside_tunisia'
      ? 'AI prediction only available in Tunisia'
      : 'AI prediction unavailable';

    const box = document.createElement('div');
    box.classList.add('ai-placeholder');
    box.innerHTML = msg;
    panel.appendChild(box);
    return;
  }

  // Update each route card with AI badge
  prediction.routes.forEach((result, i) => {
    const card = document.getElementById(`route-card-${i}`);
    if (!card) return;

    const statsDiv = card.querySelector('.route-stats');
    if (!statsDiv) return;

    const aiTag = document.createElement('div');
    aiTag.classList.add('route-stat');
    aiTag.innerHTML = `
      <span class="ai-label" style="
        background: ${result.color};
        color: white;
        padding: 2px 8px;
        border-radius: 10px;
        font-size: 11px;
        font-weight: bold;
      ">${result.label_name}</span>
      <span style="font-size:10px;color:#888;margin-left:4px">${result.confidence}%</span>
    `;
    statsDiv.appendChild(aiTag);
  });

  // Highlight AI recommended route card
  const recIndex = prediction.recommended_index;
  document.querySelectorAll('.route-card').forEach((card, i) => {
    const badge = card.querySelector('.route-badge');
    if (i === recIndex) {
      card.style.borderColor = prediction.recommended_color;
      card.style.background  = '#f0fff4';
      if (badge) badge.textContent = 'AI Pick';
    } else {
      if (badge) badge.style.display = 'none';
    }
  });

  // Highlight recommended route on map
  selectRoute(recIndex);

  // Add AI summary box
  const summaryBox = document.createElement('div');
  summaryBox.classList.add('ai-result-box');
  summaryBox.innerHTML = `
    <div class="ai-result-title">AI Recommendation</div>
    <div class="ai-result-body">
      Route ${recIndex + 1} is the least congested —
      <b style="color:${prediction.recommended_color}">
        ${prediction.recommended_label}
      </b>
    </div>
  `;
  panel.appendChild(summaryBox);
}

//Override drawRoutes to trigger AI after drawing 
const _originalDrawRoutes = drawRoutes;

window.drawRoutes = async function(routes) {
  _originalDrawRoutes(routes);

  if (routes.length < 1) return;

  if (!selectedPoints.A || !selectedPoints.B) return;

  // Show loading state in panel
  const placeholder = document.querySelector('.ai-placeholder');
  if (placeholder) placeholder.innerHTML = 'AI is analyzing routes...';

  const prediction = await predictCongestion(
    routes, selectedPoints.A, selectedPoints.B
  );

  updatePanelWithAI(prediction);
};