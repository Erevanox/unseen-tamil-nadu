// ============================================================================
// UNSEEN TAMIL NADU — APPLICATION CONTROLLER
// Interactive Map, Dynamic Ranking Engine, Recalculator & Hackathon Demo Flow
// ============================================================================

import { 
  DESTINATIONS, 
  DISCOVERIES, 
  ROUTE_MATRIX, 
  INTEREST_OPTIONS, 
  TIME_OPTIONS, 
  BUDGET_OPTIONS, 
  TRANSPORT_OPTIONS, 
  TIME_OF_DAY_OPTIONS 
} from './data.js';

import { TAMIL_NADU_BORDER_COORDINATES } from './geo_boundary.js';

// ============================================================================
// APPLICATION STATE
// ============================================================================
const state = {
  startingPoint: "chennai", // Trip origin
  selectedDestinations: [], // Subsequent destinations in order
  selectedInterests: new Set(["Food", "Culture", "History"]),
  availableExtraTime: TIME_OPTIONS[2], // Default 2 hours
  extraBudget: BUDGET_OPTIONS[2], // Default ₹500–₹1,000
  transportMode: "car",
  vehicleMileage: 18,
  fuelPrice: 105,
  publicTransportRatePerKm: 1.85, // ₹1.85 / km estimated public transit fare
  timeOfDay: "Evening",
  userTotalBudget: 10000,
  currentDiscoveries: [], // Exactly 7 ranked discoveries
  selectedDiscoveries: new Set(), // IDs of added discoveries
  activeModalDiscovery: null
};

// Map instances
let map = null;
let destinationMarkers = {};
let discoveryMarkers = {};
let routePolyline = null;
let borderPolygon = null;

// ============================================================================
// INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  initStartingPointSelector();
  initMap();
  renderWizardOptions();
  setupEventListeners();
  updateTransportAssumptionsUI();
  updateJourneyUI();
});

// ============================================================================
// STARTING POINT SELECTOR INITIALIZATION
// ============================================================================
function initStartingPointSelector() {
  const select = document.getElementById('select-starting-point');
  if (!select) return;

  select.innerHTML = DESTINATIONS.map(d => 
    `<option value="${d.id}" ${d.id === state.startingPoint ? 'selected' : ''}>${d.name} (${d.tamilName})</option>`
  ).join('');

  select.addEventListener('change', (e) => {
    state.startingPoint = e.target.value;
    
    // Remove starting point from destinations if already present to avoid duplicate immediate stop
    const idx = state.selectedDestinations.indexOf(state.startingPoint);
    if (idx > -1) {
      state.selectedDestinations.splice(idx, 1);
    }

    // Refresh markers & route on map
    DESTINATIONS.forEach(dest => renderDestinationMarker(dest));
    updateMapRouteLine();
    updateJourneyUI();

    // Re-rank discoveries if already generated
    if (state.currentDiscoveries.length > 0) {
      rankAndRenderDiscoveries(false);
    }
  });
}

// Get the complete main route from Starting Point through all selected destinations
function getFullMainRoute() {
  const startId = state.startingPoint || 'chennai';
  const otherDests = state.selectedDestinations.filter(id => id !== startId);
  return [startId, ...otherDests];
}

// ============================================================================
// MAP INITIALIZATION & RENDERING (AUTHENTIC TAMIL NADU)
// ============================================================================
function initMap() {
  const mapContainer = document.getElementById('tamil-nadu-map');
  if (!mapContainer || typeof L === 'undefined') {
    console.warn("Leaflet not available or container missing.");
    return;
  }

  // Exact geographic center of Tamil Nadu
  const TN_CENTER = [11.1271, 78.6569];
  
  map = L.map('tamil-nadu-map', {
    center: TN_CENTER,
    zoom: 7,
    minZoom: 6,
    maxZoom: 14,
    scrollWheelZoom: false,
    zoomControl: true
  });

  // Standard OpenStreetMap tile layer
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map);

  // Clean map watermark / attribution
  if (map.attributionControl) {
    map.attributionControl.setPrefix(false);
  }

  // Render authentic Tamil Nadu state boundary overlay with glowing orange border
  if (TAMIL_NADU_BORDER_COORDINATES && TAMIL_NADU_BORDER_COORDINATES.length > 0) {
    borderPolygon = L.polygon(TAMIL_NADU_BORDER_COORDINATES, {
      color: '#ff6b35',
      weight: 2.2,
      opacity: 0.65,
      dashArray: '6, 6',
      fillColor: '#ff6b35',
      fillOpacity: 0.03
    }).addTo(map);
  }

  // Render all 20 authentic Tamil Nadu destinations
  DESTINATIONS.forEach((dest, index) => {
    renderDestinationMarker(dest, index);
  });
}

function renderDestinationMarker(dest) {
  const isStartingPoint = dest.id === state.startingPoint;
  const isSelected = state.selectedDestinations.includes(dest.id);
  const selectedIndex = state.selectedDestinations.indexOf(dest.id);

  let badgeText = dest.name.slice(0, 2).toUpperCase();
  let pinClass = '';

  if (isStartingPoint) {
    badgeText = 'START';
    pinClass = 'starting-origin';
  } else if (isSelected) {
    badgeText = String(selectedIndex + 1).padStart(2, '0');
    pinClass = 'selected';
  }

  const customIcon = L.divIcon({
    className: 'custom-leaflet-div-icon',
    html: `<div class="custom-pin-dest ${pinClass}" id="marker-${dest.id}">${badgeText}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18]
  });

  let marker = destinationMarkers[dest.id];
  if (!marker) {
    marker = L.marker(dest.coordinates, { icon: customIcon }).addTo(map);
    destinationMarkers[dest.id] = marker;
  } else {
    marker.setIcon(customIcon);
  }

  // Create popup content with Tamil script, details, and action buttons
  const popupHtml = `
    <div class="map-popup-inner">
      <div class="popup-tag">${isStartingPoint ? 'TRIP STARTING POINT' : dest.category}</div>
      <h4 class="popup-title">${dest.name} <span style="font-size: 0.85rem; color: #ff8a5c; font-weight: normal;">(${dest.tamilName})</span></h4>
      <p class="popup-desc">${dest.tagline}</p>
      ${isStartingPoint ? `
        <div style="font-size: 0.82rem; color: #34d399; font-weight: 700; padding: 6px 0;">
          🚩 Currently Selected as Starting Point
        </div>
      ` : `
        <div style="display: flex; gap: 8px; margin-top: 6px;">
          <button class="btn-popup-add ${isSelected ? 'already-added' : ''}" onclick="window.toggleDestinationFromMap('${dest.id}')">
            ${isSelected ? '✓ In Journey' : '+ Add Stop'}
          </button>
          <button class="btn-popup-add" style="background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; color: #34d399;" onclick="window.setAsStartingPointFromMap('${dest.id}')">
            Set Start
          </button>
        </div>
      `}
    </div>
  `;

  marker.bindPopup(popupHtml);
}

// Global hook for popup clicks
window.toggleDestinationFromMap = function(destId) {
  toggleDestination(destId);
  if (destinationMarkers[destId]) {
    destinationMarkers[destId].closePopup();
  }
};

window.setAsStartingPointFromMap = function(destId) {
  state.startingPoint = destId;
  const select = document.getElementById('select-starting-point');
  if (select) select.value = destId;

  // Remove from destination list if present
  const idx = state.selectedDestinations.indexOf(destId);
  if (idx > -1) state.selectedDestinations.splice(idx, 1);

  DESTINATIONS.forEach(dest => renderDestinationMarker(dest));
  updateMapRouteLine();
  updateJourneyUI();
  if (state.currentDiscoveries.length > 0) rankAndRenderDiscoveries(false);
  if (destinationMarkers[destId]) destinationMarkers[destId].closePopup();
};

// ============================================================================
// JOURNEY SELECTION & ROUTE MANAGEMENT
// ============================================================================
function toggleDestination(destId) {
  // If destination is currently the starting point, keep it as starting point
  if (destId === state.startingPoint) {
    return;
  }

  const index = state.selectedDestinations.indexOf(destId);
  if (index > -1) {
    state.selectedDestinations.splice(index, 1);
  } else {
    state.selectedDestinations.push(destId);
  }

  // Refresh destination markers on the map
  DESTINATIONS.forEach(dest => renderDestinationMarker(dest));
  
  // Re-draw route polylines from starting point through all destinations
  updateMapRouteLine();
  
  // Update UI tray and breakdown
  updateJourneyUI();

  // If discoveries were already generated, re-rank to match updated journey
  if (state.currentDiscoveries.length > 0) {
    rankAndRenderDiscoveries(false);
  }
}

function updateMapRouteLine() {
  if (!map) return;

  if (routePolyline) {
    map.removeLayer(routePolyline);
    routePolyline = null;
  }

  const fullRoute = getFullMainRoute();
  if (fullRoute.length < 2) return;

  const latlngs = fullRoute.map(id => {
    const d = DESTINATIONS.find(x => x.id === id);
    return d ? d.coordinates : null;
  }).filter(Boolean);

  routePolyline = L.polyline(latlngs, {
    color: '#ff6b35',
    weight: 3.5,
    opacity: 0.85,
    dashArray: '8, 8',
    lineCap: 'round',
    lineJoin: 'round'
  }).addTo(map);

  // Subtle camera pan to encompass route
  if (latlngs.length > 0) {
    map.flyToBounds(L.latLngBounds(latlngs), { padding: [40, 40], duration: 0.8 });
  }
}

// ============================================================================
// ROUTE BREAKDOWN & TRAVEL DISTANCE CALCULATIONS
// ============================================================================
function calculateLegMetrics(destAId, destBId) {
  const key1 = `${destAId}-${destBId}`;
  const key2 = `${destBId}-${destAId}`;

  if (ROUTE_MATRIX[key1]) return ROUTE_MATRIX[key1];
  if (ROUTE_MATRIX[key2]) return ROUTE_MATRIX[key2];

  // Realistic Haversine fallback with highway curve factor (1.32x)
  const a = DESTINATIONS.find(d => d.id === destAId);
  const b = DESTINATIONS.find(d => d.id === destBId);
  if (!a || !b) return { distanceKm: 80, travelTimeMinutes: 90, tollCost: 60 };

  const R = 6371; // Earth radius in km
  const dLat = (b.coordinates[0] - a.coordinates[0]) * Math.PI / 180;
  const dLon = (b.coordinates[1] - a.coordinates[1]) * Math.PI / 180;
  const lat1 = a.coordinates[0] * Math.PI / 180;
  const lat2 = b.coordinates[0] * Math.PI / 180;

  const haversine = Math.sin(dLat/2) * Math.sin(dLat/2) +
                    Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1-haversine));
  const rawDist = R * c;
  const roadDist = Math.round(rawDist * 1.32); // Authentic Indian highway detour factor
  const roadTime = Math.round((roadDist / 55) * 60); // Average 55 km/h driving speed
  const toll = Math.round((roadDist / 70) * 55);

  return { distanceKm: roadDist, travelTimeMinutes: roadTime, tollCost: toll };
}

// Calculate the full main route from Starting Point → all destinations
function calculateBaseRouteTotals() {
  const fullRoute = getFullMainRoute();
  if (fullRoute.length < 2) {
    return { 
      totalDistanceKm: 0, 
      totalTravelTimeMinutes: 0, 
      totalTollCost: 0, 
      mainTripCost: 0,
      legs: []
    };
  }

  let totalDist = 0;
  let totalTime = 0;
  let totalToll = 0;
  const legs = [];

  for (let i = 0; i < fullRoute.length - 1; i++) {
    const fromId = fullRoute[i];
    const toId = fullRoute[i+1];
    const leg = calculateLegMetrics(fromId, toId);
    totalDist += leg.distanceKm;
    totalTime += leg.travelTimeMinutes;
    totalToll += leg.tollCost;
    legs.push({
      fromId,
      toId,
      distanceKm: leg.distanceKm,
      travelTimeMinutes: leg.travelTimeMinutes,
      tollCost: leg.tollCost
    });
  }

  const mileage = Math.max(state.vehicleMileage, 5);
  const fuelPrice = state.fuelPrice;
  const transitRate = state.publicTransportRatePerKm || 1.85;

  let mainCost = 0;
  if (state.transportMode === 'car') {
    // Formula: (Distance ÷ Mileage) × Fuel Price + Tolls
    const fuelCost = Math.round((totalDist / mileage) * fuelPrice);
    mainCost = fuelCost + totalToll;
  } else if (state.transportMode === 'bike') {
    // Formula: (Distance ÷ Mileage) × Fuel Price (no tolls for bikes)
    mainCost = Math.round((totalDist / mileage) * fuelPrice);
  } else if (state.transportMode === 'public') {
    // Formula: Distance × estimated public transit fare (₹1.85/km)
    mainCost = Math.round(totalDist * transitRate);
  } else if (state.transportMode === 'mixed') {
    // Blended: 50% public transit (bus/rail) + 50% private car
    const publicShare = Math.round(0.5 * totalDist * transitRate);
    const carShare = Math.round(((0.5 * totalDist) / mileage) * fuelPrice) + Math.round(0.5 * totalToll);
    mainCost = publicShare + carShare;
  }

  return {
    totalDistanceKm: totalDist,
    totalTravelTimeMinutes: totalTime,
    totalTollCost: totalToll,
    mainTripCost: mainCost,
    legs
  };
}

// ============================================================================
// TRANSPORT ASSUMPTIONS UI (HANDLES PUBLIC TRANSIT / CAR / BIKE / MIXED)
// ============================================================================
function updateTransportAssumptionsUI() {
  const vehicleRow = document.getElementById('vehicle-inputs-row');
  const publicRow = document.getElementById('public-transit-fare-row');
  const headingText = document.getElementById('assumption-heading-text');
  const subText = document.getElementById('assumption-sub-text');

  if (state.transportMode === 'public') {
    // For Public Transport: DO NOT show mileage or fuel-price fields!
    if (vehicleRow) vehicleRow.style.display = 'none';
    if (publicRow) publicRow.style.display = 'flex';
    if (headingText) headingText.textContent = 'Public Transport Fare Assumptions';
    if (subText) subText.textContent = 'Calculated using standard intercity bus & rail fare averages in Tamil Nadu (₹1.85 / km) [Estimated]';
  } else if (state.transportMode === 'mixed') {
    if (vehicleRow) vehicleRow.style.display = 'flex';
    if (publicRow) publicRow.style.display = 'flex';
    if (headingText) headingText.textContent = 'Mixed Mobility Cost Assumptions';
    if (subText) subText.textContent = 'Blended model: 50% Public Transit (₹1.85/km) + 50% Private Vehicle (Mileage & Fuel) [Estimated]';
  } else {
    // Car or Bike
    if (vehicleRow) vehicleRow.style.display = 'flex';
    if (publicRow) publicRow.style.display = 'none';
    const isCar = state.transportMode === 'car';
    if (headingText) headingText.textContent = isCar ? 'Car Cost Assumptions' : 'Bike Cost Assumptions';
    if (subText) subText.textContent = isCar 
      ? 'Formula: (Distance ÷ Mileage) × Fuel Price + Tolls [Estimated]'
      : 'Formula: (Distance ÷ Mileage) × Fuel Price [Estimated]';
  }
}

// ============================================================================
// JOURNEY TRAY UI UPDATES
// ============================================================================
function updateJourneyUI() {
  const trayList = document.getElementById('journey-stops-list');
  const countSpan = document.getElementById('journey-dest-count');
  const continueBtn = document.getElementById('btn-continue-to-limits');
  const breakdownBox = document.getElementById('route-breakdown-box');
  const breakdownTbody = document.getElementById('route-breakdown-tbody');
  const statusPill = document.getElementById('map-status-pill');

  const startDest = DESTINATIONS.find(d => d.id === state.startingPoint) || DESTINATIONS[0];
  const count = state.selectedDestinations.length;
  countSpan.textContent = `Origin: ${startDest.name} + ${count} destination${count === 1 ? '' : 's'}`;

  continueBtn.disabled = count === 0;
  statusPill.textContent = count > 0 ? `Origin: ${startDest.name} → ${count} stop${count > 1 ? 's' : ''}` : `Origin: ${startDest.name} (Pick next destination)`;

  // Render list of stops starting with the Starting Point
  let html = `
    <div class="journey-stop-item" style="border-color: rgba(16, 185, 129, 0.45); background: rgba(16, 185, 129, 0.08);">
      <div class="stop-info">
        <div class="stop-number-badge" style="background: rgba(16, 185, 129, 0.25); color: #34d399; font-weight: 800;">🚩</div>
        <div class="stop-details">
          <h4>${startDest.name} (${startDest.tamilName})</h4>
          <span style="color: #34d399; font-weight: 600;">Trip Starting Point (Origin)</span>
        </div>
      </div>
      <span style="font-size: 0.72rem; color: #a7f3d0; padding: 4px 10px; background: rgba(16, 185, 129, 0.2); border-radius: 4px; font-weight: 700;">START</span>
    </div>
  `;

  if (count === 0) {
    html += `
      <div class="empty-tray-state" id="empty-tray-msg" style="padding: 20px 10px;">
        <p style="color: #cbd5e1;">Next: Select destinations on the map to build your route from <strong>${startDest.name}</strong>.</p>
        <p style="margin-top: 6px; font-size: 0.8rem; color: #ff6b35;">Or click "Try Example" below.</p>
      </div>
    `;
  } else {
    state.selectedDestinations.forEach((destId, i) => {
      const dest = DESTINATIONS.find(d => d.id === destId);
      if (!dest) return;
      html += `
        <div class="journey-stop-item" data-id="${dest.id}">
          <div class="stop-info">
            <div class="stop-number-badge">${String(i + 1).padStart(2, '0')}</div>
            <div class="stop-details">
              <h4>${dest.name}</h4>
              <span>${dest.category}</span>
            </div>
          </div>
          <button class="btn-remove-stop" onclick="window.removeDestination('${dest.id}')" title="Remove stop">✕</button>
        </div>
      `;
    });
  }

  trayList.innerHTML = html;

  // Render leg breakdown table from Starting Point → destinations
  const baseMetrics = calculateBaseRouteTotals();
  if (baseMetrics.legs && baseMetrics.legs.length > 0) {
    breakdownBox.style.display = 'block';
    let tbHtml = '';
    baseMetrics.legs.forEach(leg => {
      const a = DESTINATIONS.find(d => d.id === leg.fromId);
      const b = DESTINATIONS.find(d => d.id === leg.toId);
      const hrs = Math.floor(leg.travelTimeMinutes / 60);
      const mins = leg.travelTimeMinutes % 60;
      const timeStr = hrs > 0 ? `${hrs}h ${mins.toString().padStart(2, '0')}m` : `${mins}m`;

      tbHtml += `
        <tr>
          <td><strong>${a.name}</strong> → <strong>${b.name}</strong></td>
          <td>${leg.distanceKm} km</td>
          <td>${timeStr}</td>
        </tr>
      `;
    });
    breakdownTbody.innerHTML = tbHtml;
  } else {
    breakdownBox.style.display = 'none';
  }

  // Update dynamic recalculator
  updateRecalculatorTotals();
}

window.removeDestination = function(destId) {
  toggleDestination(destId);
};

// ============================================================================
// RENDER WIZARD OPTIONS (STEPS 2 - 6)
// ============================================================================
function renderWizardOptions() {
  // Step 2: Interests
  const interestsGrid = document.getElementById('interests-grid');
  interestsGrid.innerHTML = INTEREST_OPTIONS.map(opt => {
    const isSelected = state.selectedInterests.has(opt.id);
    return `
      <div class="interest-card ${isSelected ? 'selected' : ''}" data-interest="${opt.id}">
        <div class="interest-top-row">
          <span class="interest-icon">${opt.icon}</span>
          <span class="interest-check">✓</span>
        </div>
        <div class="interest-title">${opt.label}</div>
        <div class="interest-desc">${opt.desc}</div>
      </div>
    `;
  }).join('');

  // Step 3: Extra Time
  const timeGrid = document.getElementById('time-options-grid');
  timeGrid.innerHTML = TIME_OPTIONS.map(opt => {
    const isSelected = state.availableExtraTime.id === opt.id;
    return `
      <div class="option-pill-card ${isSelected ? 'selected' : ''}" data-time-id="${opt.id}">
        <div class="pill-card-title">${opt.label}</div>
        <div class="pill-card-sub">${opt.maxMinutes < 900 ? `Max +${opt.maxMinutes}m detour` : 'No hard limit'}</div>
      </div>
    `;
  }).join('');

  // Step 4: Extra Budget
  const budgetGrid = document.getElementById('budget-options-grid');
  budgetGrid.innerHTML = BUDGET_OPTIONS.map(opt => {
    const isSelected = state.extraBudget.id === opt.id;
    return `
      <div class="option-pill-card ${isSelected ? 'selected' : ''}" data-budget-id="${opt.id}">
        <div class="pill-card-title">${opt.label}</div>
        <div class="pill-card-sub">Added spend</div>
      </div>
    `;
  }).join('');

  // Step 5: Transport
  const transportGrid = document.getElementById('transport-grid');
  transportGrid.innerHTML = TRANSPORT_OPTIONS.map(opt => {
    const isSelected = state.transportMode === opt.id;
    return `
      <div class="transport-card ${isSelected ? 'selected' : ''}" data-transport-id="${opt.id}">
        <div class="transport-icon">${opt.icon}</div>
        <div class="transport-name">${opt.label}</div>
      </div>
    `;
  }).join('');

  // Step 6: Time of Day
  const timeOfDayGrid = document.getElementById('time-of-day-grid');
  timeOfDayGrid.innerHTML = TIME_OF_DAY_OPTIONS.map(opt => {
    const isSelected = state.timeOfDay === opt.id;
    return `
      <div class="time-slot-card ${isSelected ? 'selected' : ''}" data-tod="${opt.id}">
        <div class="time-slot-icon">${opt.icon}</div>
        <div class="time-slot-title">${opt.label}</div>
        <div class="time-slot-period">${opt.period}</div>
      </div>
    `;
  }).join('');
}

// ============================================================================
// DYNAMIC RECOMMENDATION SCORING ENGINE (SECTIONS 14, 15, 16, 32)
// Transparent 7-Signal Algorithm
// ============================================================================
function computeDiscoveryScore(disc) {
  const fullRouteIds = getFullMainRoute();
  
  // 1. Distance proximity to ANY point along user's chosen route
  const isDirectlyAdjacent = fullRouteIds.includes(disc.destinationId);
  const distanceScore = isDirectlyAdjacent 
    ? Math.max(0, 1 - (disc.distanceKm / 45))
    : 0.35; // Lower score if further away

  // 2. Interest Match (25% Weight)
  let interestMatchCount = 0;
  disc.interestTags.forEach(tag => {
    if (state.selectedInterests.has(tag)) interestMatchCount++;
  });
  const interestScore = state.selectedInterests.size > 0 
    ? Math.min(1, interestMatchCount / Math.min(3, state.selectedInterests.size))
    : 0.5;

  // 3. Time Compatibility (20% Weight)
  const totalDiscTime = disc.travelTimeMinutes + disc.visitDurationMinutes + disc.returnTravelTimeMinutes;
  let timeScore = 1.0;
  if (state.availableExtraTime.maxMinutes < 900) {
    if (totalDiscTime <= state.availableExtraTime.maxMinutes) {
      timeScore = 1.0;
    } else {
      const overMinutes = totalDiscTime - state.availableExtraTime.maxMinutes;
      timeScore = Math.max(0.1, 1 - (overMinutes / 60)); // Penalize excess
    }
  }

  // 4. Experience Uniqueness (15% Weight)
  const uniquenessScore = (disc.rating - 4.0) / 1.0; 

  // 5. Less-Obvious Signal (10% Weight)
  const lessObviousScore = disc.popularity === "Low" ? 1.0 : (disc.popularity === "Medium-Low" ? 0.8 : 0.6);

  // 6. Time of Day Compatibility (10% Weight)
  let todScore = 0.5;
  if (disc.suitableTimes.includes(state.timeOfDay)) {
    todScore = (disc.bestTime === state.timeOfDay) ? 1.0 : 0.85;
  } else {
    todScore = 0.15; // Strongly penalized if closed or unsuitable
  }

  // 7. Cost Compatibility (5% Weight)
  const totalCost = disc.entryCost + disc.foodCost + disc.localTransportCost + disc.parkingCost + disc.otherCost;
  let costScore = 1.0;
  if (state.extraBudget.maxCost < 90000) {
    if (totalCost <= state.extraBudget.maxCost) {
      costScore = 1.0;
    } else {
      costScore = Math.max(0.2, 1 - ((totalCost - state.extraBudget.maxCost) / 1000));
    }
  }

  // Final Composite Weighted Score
  const totalWeightedScore = 
    (interestScore * 0.25) +
    (timeScore * 0.20) +
    (distanceScore * 0.15) +
    (uniquenessScore * 0.15) +
    (lessObviousScore * 0.10) +
    (todScore * 0.10) +
    (costScore * 0.05);

  // Qualitative Human-Readable Indicators (Section 32)
  const timeFitLabel = totalDiscTime <= (state.availableExtraTime.maxMinutes || 999) 
    ? (totalDiscTime <= 45 ? "Time fit: Excellent" : "Time fit: Good") 
    : "Time fit: Tight (+min)";

  const budgetFitLabel = totalCost <= (state.extraBudget.maxCost || 99999)
    ? "Budget fit: Excellent"
    : "Budget fit: Moderate";

  const interestFitLabel = interestMatchCount >= 2 
    ? "Interest match: Strong" 
    : (interestMatchCount === 1 ? "Interest match: Good" : "Interest match: General");

  return {
    score: totalWeightedScore,
    totalCost,
    totalDiscTime,
    timeFitLabel,
    budgetFitLabel,
    interestFitLabel
  };
}

// ============================================================================
// RANK & RENDER EXACTLY 7 DISCOVERIES (SECTION 17)
// ============================================================================
function rankAndRenderDiscoveries(shouldScroll = true) {
  const fullRouteIds = getFullMainRoute();

  // Filter discoveries associated with or nearby starting point and selected destinations
  const candidatePool = DISCOVERIES.map(disc => {
    const meta = computeDiscoveryScore(disc);
    return { ...disc, ...meta };
  });

  // Sort candidate pool descending by score
  candidatePool.sort((a, b) => {
    // Primary sort: is along chosen full route
    const aNear = fullRouteIds.includes(a.destinationId) ? 1 : 0;
    const bNear = fullRouteIds.includes(b.destinationId) ? 1 : 0;
    if (aNear !== bNear) return bNear - aNear;
    return b.score - a.score;
  });

  // Pick EXACTLY 7 discoveries
  state.currentDiscoveries = candidatePool.slice(0, 7);

  // Render cards in the grid
  renderDiscoveryCards();

  // Render markers on the map
  renderDiscoveryMapMarkers();

  // Update recalculator
  updateRecalculatorTotals();

  // Make results visible
  const resultsSec = document.getElementById('results-section');
  resultsSec.style.display = 'block';

  const destContext = document.getElementById('results-dest-context');
  const cityNames = fullRouteIds.map(id => {
    const d = DESTINATIONS.find(x => x.id === id);
    return d ? d.name : id;
  });
  destContext.textContent = `Route: ${cityNames.slice(0, 3).join(' → ')}${cityNames.length > 3 ? ` +${cityNames.length - 3} more` : ''}`;

  if (shouldScroll) {
    resultsSec.scrollIntoView({ behavior: 'smooth' });
  }
}

function renderDiscoveryCards() {
  const grid = document.getElementById('discoveries-grid');
  grid.innerHTML = state.currentDiscoveries.map((disc) => {
    const isInJourney = state.selectedDiscoveries.has(disc.id);
    const nearDest = DESTINATIONS.find(d => d.id === disc.destinationId);
    
    const hrs = Math.floor(disc.totalDiscTime / 60);
    const mins = disc.totalDiscTime % 60;
    const totalTimeFormatted = hrs > 0 ? `+${hrs}h ${mins > 0 ? `${mins}m` : ''}` : `+${mins}m`;

    return `
      <div class="discovery-card ${isInJourney ? 'in-journey' : ''}" id="disc-card-${disc.id}">
        <div class="discovery-img-wrapper">
          <img src="${disc.image}" alt="${disc.name}" class="discovery-img" loading="lazy">
          <div class="discovery-badge-overlay">
            <span class="badge-pill-category">${disc.category}</span>
            <span class="badge-pill-signal">${disc.discoveryLabel}</span>
          </div>
        </div>

        <div class="discovery-body">
          <div class="discovery-near-row">
            <span>Near <strong class="near-dest-name">${nearDest ? nearDest.name : 'Route'}</strong></span>
            <span>★ ${disc.rating} (${disc.reviewCount} local notes)</span>
          </div>

          <h3 class="discovery-name">${disc.name}</h3>
          <p class="discovery-experience-desc">${disc.experienceDescription}</p>

          <!-- Trade-off Metrics Box -->
          <div class="trade-off-metrics-card">
            <div class="metrics-row-top">
              <div class="metric-col-item">
                <span>Detour Dist</span>
                <strong>+${disc.distanceKm} km</strong>
              </div>
              <div class="metric-col-item">
                <span>Extra Time</span>
                <strong>${totalTimeFormatted}</strong>
              </div>
              <div class="metric-col-item cost">
                <span>Est. Added Cost</span>
                <strong>+₹${disc.totalCost}</strong>
              </div>
            </div>

            <div class="metrics-row-bottom">
              <span class="timing-badge">🕒 Best: <strong>${disc.bestTime}</strong> (${disc.openingHours})</span>
              <span style="color: #64748b;">${disc.interestTags.slice(0, 2).join(' · ')}</span>
            </div>
          </div>

          <!-- Match Indicators (Section 32) -->
          <div class="match-indicators-bar">
            <span class="match-chip ${disc.timeFitLabel.includes('Tight') ? 'warn' : 'good'}">${disc.timeFitLabel}</span>
            <span class="match-chip good">${disc.budgetFitLabel}</span>
            <span class="match-chip good">${disc.interestFitLabel}</span>
          </div>

          <!-- Actions -->
          <div class="discovery-card-actions">
            <button class="btn-card-details" onclick="window.openDiscoveryModal('${disc.id}')">
              View Details
            </button>
            <button class="btn-card-toggle ${isInJourney ? 'in-journey' : ''}" onclick="window.toggleDiscoveryInJourney('${disc.id}')">
              ${isInJourney ? '✓ In Journey' : '+ Add to Journey'}
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Render Discovery markers on the Map
function renderDiscoveryMapMarkers() {
  if (!map) return;

  // Clear previous discovery markers
  Object.values(discoveryMarkers).forEach(m => map.removeLayer(m));
  discoveryMarkers = {};

  state.currentDiscoveries.forEach(disc => {
    const isAdded = state.selectedDiscoveries.has(disc.id);
    const iconHtml = `<div class="custom-pin-discovery ${isAdded ? 'added-discovery' : ''}" title="${disc.name}">✦</div>`;

    const icon = L.divIcon({
      className: 'custom-leaflet-disc-icon',
      html: iconHtml,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -14]
    });

    const marker = L.marker(disc.coordinates, { icon }).addTo(map);
    discoveryMarkers[disc.id] = marker;

    const popupContent = `
      <div class="map-popup-inner">
        <div class="popup-tag">${disc.category}</div>
        <h4 class="popup-title">${disc.name}</h4>
        <div style="font-size: 0.8rem; color: #ff8c42; margin-bottom: 6px; font-weight: 700;">
          +${disc.distanceKm} km · +${disc.totalDiscTime}m · +₹${disc.totalCost}
        </div>
        <p class="popup-desc">${disc.description}</p>
        <button class="btn-popup-add ${isAdded ? 'already-added' : ''}" onclick="window.toggleDiscoveryInJourney('${disc.id}')">
          ${isAdded ? '✓ Remove from Journey' : '+ Add to Journey'}
        </button>
      </div>
    `;
    marker.bindPopup(popupContent);
  });
}

// ============================================================================
// DYNAMIC ROUTE RECALCULATOR & COST SEPARATION ENGINE
// Main Trip Cost + Additional Discovery Cost = Total Trip Cost
// ============================================================================
function updateRecalculatorTotals() {
  const base = calculateBaseRouteTotals();

  // Added discoveries sum
  let addedDetourDist = 0;
  let addedTimeMinutes = 0;
  let addedDiscoveryActivityCosts = 0;

  state.selectedDiscoveries.forEach(id => {
    const d = DISCOVERIES.find(x => x.id === id);
    if (d) {
      addedDetourDist += d.distanceKm * 0.75; // Detour distance
      addedTimeMinutes += (d.travelTimeMinutes + d.visitDurationMinutes);
      const activityCost = d.entryCost + d.foodCost + d.localTransportCost + d.parkingCost + d.otherCost;
      addedDiscoveryActivityCosts += activityCost;
    }
  });

  const mileage = Math.max(state.vehicleMileage, 5);
  const fuelPrice = state.fuelPrice;
  const transitRate = state.publicTransportRatePerKm || 1.85;

  // Calculate detour travel/fuel cost for added discoveries
  let detourTravelCost = 0;
  if (state.transportMode === 'car' || state.transportMode === 'bike') {
    detourTravelCost = Math.round((addedDetourDist / mileage) * fuelPrice);
  } else if (state.transportMode === 'public') {
    detourTravelCost = Math.round(addedDetourDist * transitRate);
  } else if (state.transportMode === 'mixed') {
    const pubPart = Math.round(0.5 * addedDetourDist * transitRate);
    const carPart = Math.round(((0.5 * addedDetourDist) / mileage) * fuelPrice);
    detourTravelCost = pubPart + carPart;
  }

  // 1. Main Trip Cost = cost of travelling the full main route
  const mainTripCost = base.mainTripCost;

  // 2. Additional Discovery Cost = extra cost caused by added discoveries (activities + detour transit/fuel)
  const additionalDiscoveryCost = addedDiscoveryActivityCosts + detourTravelCost;

  // 3. Total Trip Cost = Main Trip Cost + Additional Discovery Cost
  const totalTripCost = mainTripCost + additionalDiscoveryCost;

  const beforeDist = base.totalDistanceKm;
  const beforeTime = base.totalTravelTimeMinutes;

  const afterDist = Math.round(beforeDist + addedDetourDist);
  const afterTime = beforeTime + addedTimeMinutes;

  const changeDist = afterDist - beforeDist;
  const changeTime = afterTime - beforeTime;

  // Format Helper
  const fmtTime = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m.toString().padStart(2, '0')}m`;
  };

  // Update comparison grid numbers
  const bDistEl = document.getElementById('cmp-before-dist');
  const bTimeEl = document.getElementById('cmp-before-time');
  const bCostEl = document.getElementById('cmp-before-cost');

  const aDistEl = document.getElementById('cmp-after-dist');
  const aTimeEl = document.getElementById('cmp-after-time');
  const aCostEl = document.getElementById('cmp-after-cost');

  const cDistEl = document.getElementById('cmp-change-dist');
  const cTimeEl = document.getElementById('cmp-change-time');
  const cCostEl = document.getElementById('cmp-change-cost');

  if (bDistEl) bDistEl.textContent = `${beforeDist} km`;
  if (bTimeEl) bTimeEl.textContent = fmtTime(beforeTime);
  if (bCostEl) bCostEl.textContent = `₹${mainTripCost.toLocaleString('en-IN')}`;

  if (aDistEl) aDistEl.textContent = `${afterDist} km`;
  if (aTimeEl) aTimeEl.textContent = fmtTime(afterTime);
  if (aCostEl) aCostEl.textContent = `₹${totalTripCost.toLocaleString('en-IN')}`;

  if (cDistEl) cDistEl.textContent = `+${Math.round(changeDist)} km`;
  if (cTimeEl) cTimeEl.textContent = `+${fmtTime(changeTime)}`;
  if (cCostEl) cCostEl.textContent = `+₹${additionalDiscoveryCost.toLocaleString('en-IN')}`;

  // Update Explicit Cost Separation Banner
  const sepMain = document.getElementById('cost-sep-main');
  const sepDisc = document.getElementById('cost-sep-discovery');
  const sepTotal = document.getElementById('cost-sep-total');
  const formulaBadge = document.getElementById('cost-formula-badge');

  if (sepMain) sepMain.textContent = `₹${mainTripCost.toLocaleString('en-IN')}`;
  if (sepDisc) sepDisc.textContent = `+₹${additionalDiscoveryCost.toLocaleString('en-IN')}`;
  if (sepTotal) sepTotal.textContent = `₹${totalTripCost.toLocaleString('en-IN')}`;

  if (formulaBadge) {
    if (state.transportMode === 'car') {
      formulaBadge.textContent = 'Formula: Car (Distance ÷ Mileage) × Fuel Price + Tolls';
    } else if (state.transportMode === 'bike') {
      formulaBadge.textContent = 'Formula: Bike (Distance ÷ Mileage) × Fuel Price (No tolls)';
    } else if (state.transportMode === 'public') {
      formulaBadge.textContent = 'Formula: Public Transit Distance × ₹1.85/km estimated fare';
    } else if (state.transportMode === 'mixed') {
      formulaBadge.textContent = 'Formula: Mixed 50% Public Rail/Bus (₹1.85/km) + 50% Car Fuel';
    }
  }

  // Update Budget Tracker
  const budgetSpentEl = document.getElementById('budget-stat-spent');
  const budgetRemEl = document.getElementById('budget-stat-remaining');
  const budgetBar = document.getElementById('budget-progress-bar');
  const budgetAlert = document.getElementById('budget-alert');
  const budgetOverVal = document.getElementById('budget-over-val');

  if (budgetSpentEl && budgetRemEl) {
    budgetSpentEl.textContent = `₹${totalTripCost.toLocaleString('en-IN')}`;
    const userBudget = state.userTotalBudget || 10000;
    const remainingBudget = userBudget - totalTripCost;

    if (remainingBudget >= 0) {
      budgetRemEl.textContent = `₹${remainingBudget.toLocaleString('en-IN')}`;
      budgetRemEl.style.color = '#34d399';
      if (budgetAlert) budgetAlert.style.display = 'none';
      if (budgetBar) {
        budgetBar.classList.remove('exceeded');
        const pct = Math.min(100, Math.round((totalTripCost / userBudget) * 100));
        budgetBar.style.width = `${pct}%`;
      }
    } else {
      budgetRemEl.textContent = `-₹${Math.abs(remainingBudget).toLocaleString('en-IN')}`;
      budgetRemEl.style.color = '#ef4444';
      if (budgetAlert) {
        budgetAlert.style.display = 'flex';
        budgetOverVal.textContent = Math.abs(remainingBudget).toLocaleString('en-IN');
      }
      if (budgetBar) {
        budgetBar.classList.add('exceeded');
        budgetBar.style.width = '100%';
      }
    }
  }

  // Update Extra-Time Tracker
  const timeUsedEl = document.getElementById('time-stat-used');
  const timeRemEl = document.getElementById('time-stat-remaining');
  const timeBar = document.getElementById('time-progress-bar');
  const timeAlert = document.getElementById('time-alert');
  const timeOverVal = document.getElementById('time-over-val');
  const timeLimitLabel = document.getElementById('tracker-available-time-label');

  if (timeUsedEl && timeRemEl) {
    const availMinutes = state.availableExtraTime.maxMinutes || 120;
    if (timeLimitLabel) timeLimitLabel.textContent = `Limit: ${state.availableExtraTime.label}`;
    timeUsedEl.textContent = fmtTime(addedTimeMinutes);

    if (availMinutes >= 900) {
      timeRemEl.textContent = 'Flexible';
      if (timeAlert) timeAlert.style.display = 'none';
      if (timeBar) timeBar.style.width = '30%';
    } else {
      const remainingTimeMins = availMinutes - addedTimeMinutes;
      if (remainingTimeMins >= 0) {
        timeRemEl.textContent = fmtTime(remainingTimeMins);
        timeRemEl.style.color = '#34d399';
        if (timeAlert) timeAlert.style.display = 'none';
        if (timeBar) {
          timeBar.classList.remove('exceeded');
          const pct = Math.min(100, Math.round((addedTimeMinutes / availMinutes) * 100));
          timeBar.style.width = `${pct}%`;
        }
      } else {
        timeRemEl.textContent = `+${Math.abs(remainingTimeMins)}m over`;
        timeRemEl.style.color = '#ef4444';
        if (timeAlert) {
          timeAlert.style.display = 'flex';
          timeOverVal.textContent = `${Math.abs(remainingTimeMins)}m`;
        }
        if (timeBar) {
          timeBar.classList.add('exceeded');
          timeBar.style.width = '100%';
        }
      }
    }
  }

  // Update Final Itinerary Timeline
  updateFinalItineraryTimeline();
}

// ============================================================================
// FINAL ITINERARY TIMELINE (SECTION 30)
// ============================================================================
function updateFinalItineraryTimeline() {
  const listEl = document.getElementById('timeline-flow-list');
  if (!listEl) return;

  const fullRoute = getFullMainRoute();
  const startDest = DESTINATIONS.find(d => d.id === state.startingPoint) || DESTINATIONS[0];

  let html = `
    <div class="timeline-node-item" style="border-left: 2px solid #10b981;">
      <div class="timeline-node-marker" style="background: #10b981; box-shadow: 0 0 12px rgba(16, 185, 129, 0.8);">
        <span style="font-size: 10px; font-weight: 800; color: #fff;">🚩</span>
      </div>
      <div class="timeline-node-content" style="border-color: rgba(16, 185, 129, 0.35); background: rgba(16, 185, 129, 0.05);">
        <div class="timeline-node-header">
          <h4 class="tn-title">Origin: ${startDest.name} (${startDest.tamilName})</h4>
          <span class="tn-tag" style="background: rgba(16, 185, 129, 0.2); color: #34d399;">STARTING POINT</span>
        </div>
        <p class="tn-desc">${startDest.tagline} — Departure point for your Tamil Nadu journey.</p>
      </div>
    </div>
  `;

  // Filter out starting point from subsequent stops
  const subsequentDests = state.selectedDestinations.filter(id => id !== state.startingPoint);

  if (subsequentDests.length === 0) {
    html += `<div style="color: #64748b; font-size: 0.88rem; padding: 12px 0;">Select destinations on the map to expand your travel itinerary from ${startDest.name}.</div>`;
    listEl.innerHTML = html;
    return;
  }

  subsequentDests.forEach((destId, i) => {
    const dest = DESTINATIONS.find(d => d.id === destId);
    if (!dest) return;

    html += `
      <div class="timeline-node-item">
        <div class="timeline-node-marker">
          <span style="font-size: 10px; font-weight: 800; color: #fff;">${i+1}</span>
        </div>
        <div class="timeline-node-content">
          <div class="timeline-node-header">
            <h4 class="tn-title">${dest.name} (${dest.tamilName})</h4>
            <span class="tn-tag">DESTINATION ${i+1}</span>
          </div>
          <p class="tn-desc">${dest.description}</p>
        </div>
      </div>
    `;

    // Find any added discoveries associated with this destination or starting point
    state.selectedDiscoveries.forEach(discId => {
      const disc = DISCOVERIES.find(d => d.id === discId && d.destinationId === destId);
      if (disc) {
        html += `
          <div class="timeline-node-item is-discovery">
            <div class="timeline-node-marker">✦</div>
            <div class="timeline-node-content">
              <div class="timeline-node-header">
                <h4 class="tn-title">Discovery: ${disc.name}</h4>
                <span class="tn-tag">ADDED EXPERIENCE</span>
              </div>
              <p class="tn-desc">${disc.experienceDescription}</p>
              <div style="font-size: 0.78rem; color: #34d399; margin-top: 6px; font-weight: 700;">
                +${disc.distanceKm} km detour · +${disc.travelTimeMinutes + disc.visitDurationMinutes} min · +₹${disc.entryCost + disc.foodCost + disc.localTransportCost + disc.parkingCost}
              </div>
            </div>
          </div>
        `;
      }
    });
  });

  listEl.innerHTML = html;
}

// Global hook to toggle discovery addition
window.toggleDiscoveryInJourney = function(discId) {
  if (state.selectedDiscoveries.has(discId)) {
    state.selectedDiscoveries.delete(discId);
  } else {
    state.selectedDiscoveries.add(discId);
  }

  // Update Cards in DOM
  renderDiscoveryCards();

  // Update Map Markers
  renderDiscoveryMapMarkers();

  // Update Dynamic Recalculator
  updateRecalculatorTotals();

  // If modal is currently open for this discovery, update modal button
  if (state.activeModalDiscovery && state.activeModalDiscovery.id === discId) {
    updateModalActionButton(discId);
  }
};

// ============================================================================
// DISCOVERY DETAILS MODAL (SECTION 28)
// ============================================================================
window.openDiscoveryModal = function(discId) {
  const disc = DISCOVERIES.find(d => d.id === discId);
  if (!disc) return;

  state.activeModalDiscovery = disc;
  const meta = computeDiscoveryScore(disc);

  // Fill in modal details
  document.getElementById('modal-img').src = disc.image;
  document.getElementById('modal-category').textContent = disc.category;
  document.getElementById('modal-label').textContent = disc.discoveryLabel;
  document.getElementById('modal-title').textContent = disc.name;
  document.getElementById('modal-experience-desc').textContent = disc.description;

  const totalTimeMins = disc.travelTimeMinutes + disc.visitDurationMinutes + disc.returnTravelTimeMinutes;
  const hrs = Math.floor(totalTimeMins / 60);
  const mins = totalTimeMins % 60;
  const timeFormatted = hrs > 0 ? `+${hrs}h ${mins}m` : `+${mins}m`;

  document.getElementById('modal-tradeoff-metrics').textContent = 
    `+${disc.distanceKm} km · ${timeFormatted} · +₹${meta.totalCost}`;
  
  document.getElementById('modal-experience-gained').textContent = disc.experienceGained;
  document.getElementById('modal-why-worth').textContent = disc.whyWorthIt;

  // Cost table
  document.getElementById('modal-cost-entry').textContent = `₹${disc.entryCost}`;
  document.getElementById('modal-cost-food').textContent = `₹${disc.foodCost}`;
  document.getElementById('modal-cost-transport').textContent = `₹${disc.localTransportCost}`;
  document.getElementById('modal-cost-parking').textContent = `₹${disc.parkingCost}`;
  document.getElementById('modal-cost-total').textContent = `+₹${meta.totalCost}`;

  // Time table
  document.getElementById('modal-time-travel').textContent = `+${disc.travelTimeMinutes} min`;
  document.getElementById('modal-time-visit').textContent = `+${disc.visitDurationMinutes} min`;
  document.getElementById('modal-time-return').textContent = `+${disc.returnTravelTimeMinutes} min`;
  document.getElementById('modal-best-time').textContent = `${disc.bestTime} (${disc.openingHours})`;
  document.getElementById('modal-time-total').textContent = timeFormatted;

  updateModalActionButton(discId);

  // Open modal
  const modal = document.getElementById('discovery-modal');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
};

function updateModalActionButton(discId) {
  const btn = document.getElementById('btn-modal-toggle-journey');
  if (!btn) return;
  const isAdded = state.selectedDiscoveries.has(discId);
  btn.className = `btn-card-toggle ${isAdded ? 'in-journey' : ''}`;
  btn.innerHTML = `<span>${isAdded ? '✓ Added to Journey' : '+ Add to Journey'}</span>`;
  btn.onclick = () => window.toggleDiscoveryInJourney(discId);
}

function closeDiscoveryModal() {
  const modal = document.getElementById('discovery-modal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  state.activeModalDiscovery = null;
}

// ============================================================================
// HACKATHON DEMO PRESET ("TRY AN EXAMPLE" - SECTIONS 7 & 37)
// ============================================================================
function triggerDemoPreset() {
  // Step 1: Starting point Chennai → Mahabalipuram → Thanjavur → Madurai
  state.startingPoint = "chennai";
  state.selectedDestinations = ["mahabalipuram", "thanjavur", "madurai"];

  const startSelect = document.getElementById('select-starting-point');
  if (startSelect) startSelect.value = "chennai";

  // Step 2: Set Preferences
  state.selectedInterests = new Set(["Food", "Culture", "History"]);
  state.availableExtraTime = TIME_OPTIONS[2]; // 2 hours
  state.extraBudget = BUDGET_OPTIONS[2]; // ₹500–₹1,000
  state.transportMode = "car";
  state.vehicleMileage = 18;
  state.fuelPrice = 105;
  state.timeOfDay = "Evening";

  // Re-render markers, transport UI, journey tray, and wizard options
  DESTINATIONS.forEach(dest => renderDestinationMarker(dest));
  updateMapRouteLine();
  updateTransportAssumptionsUI();
  updateJourneyUI();
  renderWizardOptions();

  // Run the animated search sequence
  executeAnimatedSearch();
}

// ============================================================================
// ANIMATED SEARCH EXPERIENCE (SECTION 13)
// ============================================================================
function executeAnimatedSearch() {
  const overlay = document.getElementById('loading-overlay');
  overlay.classList.add('active');

  const steps = [
    document.getElementById('step-0'),
    document.getElementById('step-1'),
    document.getElementById('step-2'),
    document.getElementById('step-3'),
    document.getElementById('step-4'),
    document.getElementById('step-5'),
    document.getElementById('step-6')
  ];

  // Reset steps
  steps.forEach(s => {
    s.className = 'loading-step-row';
    s.querySelector('.loading-step-icon').textContent = '○';
  });

  let currentStep = 0;
  const stepInterval = setInterval(() => {
    if (currentStep > 0) {
      steps[currentStep - 1].className = 'loading-step-row completed';
      steps[currentStep - 1].querySelector('.loading-step-icon').textContent = '✓';
    }

    if (currentStep < steps.length) {
      steps[currentStep].className = 'loading-step-row current';
      steps[currentStep].querySelector('.loading-step-icon').textContent = '●';
      currentStep++;
    } else {
      clearInterval(stepInterval);
      setTimeout(() => {
        overlay.classList.remove('active');
        rankAndRenderDiscoveries(true);
      }, 350);
    }
  }, 220);
}

// ============================================================================
// EVENT LISTENERS SETUP
// ============================================================================
function setupEventListeners() {
  // Demo Triggers
  document.getElementById('btn-demo-header')?.addEventListener('click', triggerDemoPreset);
  document.getElementById('btn-hero-demo')?.addEventListener('click', triggerDemoPreset);
  document.getElementById('btn-try-example-tray')?.addEventListener('click', triggerDemoPreset);

  // Clear Journey (keeps starting point, clears subsequent stops)
  document.getElementById('btn-clear-journey')?.addEventListener('click', () => {
    state.selectedDestinations = [];
    state.selectedDiscoveries.clear();
    DESTINATIONS.forEach(dest => renderDestinationMarker(dest));
    updateMapRouteLine();
    updateJourneyUI();
    if (state.currentDiscoveries.length > 0) {
      rankAndRenderDiscoveries(false);
    }
  });

  // Continue to Preferences
  document.getElementById('btn-continue-to-limits')?.addEventListener('click', () => {
    document.getElementById('preferences-section').scrollIntoView({ behavior: 'smooth' });
  });

  // Find What I'm Missing button
  document.getElementById('btn-find-missing')?.addEventListener('click', () => {
    if (state.selectedDestinations.length === 0) {
      triggerDemoPreset();
      return;
    }
    executeAnimatedSearch();
  });

  // Wizard Clicks: Interests (Multi-select)
  document.getElementById('interests-grid')?.addEventListener('click', (e) => {
    const card = e.target.closest('.interest-card');
    if (!card) return;
    const interest = card.dataset.interest;
    if (state.selectedInterests.has(interest)) {
      if (state.selectedInterests.size > 1) {
        state.selectedInterests.delete(interest);
      }
    } else {
      state.selectedInterests.add(interest);
    }
    renderWizardOptions();
  });

  // Wizard Clicks: Time Options
  document.getElementById('time-options-grid')?.addEventListener('click', (e) => {
    const card = e.target.closest('.option-pill-card');
    if (!card) return;
    const timeId = parseInt(card.dataset.timeId, 10);
    const opt = TIME_OPTIONS.find(t => t.id === timeId);
    if (opt) {
      state.availableExtraTime = opt;
      renderWizardOptions();
      if (state.currentDiscoveries.length > 0) updateRecalculatorTotals();
    }
  });

  // Wizard Clicks: Budget Options
  document.getElementById('budget-options-grid')?.addEventListener('click', (e) => {
    const card = e.target.closest('.option-pill-card');
    if (!card) return;
    const budgetId = parseInt(card.dataset.budgetId, 10);
    const opt = BUDGET_OPTIONS.find(b => b.id === budgetId);
    if (opt) {
      state.extraBudget = opt;
      renderWizardOptions();
      if (state.currentDiscoveries.length > 0) updateRecalculatorTotals();
    }
  });

  // Wizard Clicks: Transport Mode
  document.getElementById('transport-grid')?.addEventListener('click', (e) => {
    const card = e.target.closest('.transport-card');
    if (!card) return;
    state.transportMode = card.dataset.transportId;
    const opt = TRANSPORT_OPTIONS.find(t => t.id === state.transportMode);
    if (opt && opt.defaultMileage > 0) {
      state.vehicleMileage = opt.defaultMileage;
      const mInput = document.getElementById('input-mileage');
      if (mInput) mInput.value = opt.defaultMileage;
    }
    renderWizardOptions();
    updateTransportAssumptionsUI();
    updateRecalculatorTotals();
  });

  // Vehicle Assumptions inputs
  document.getElementById('input-mileage')?.addEventListener('input', (e) => {
    state.vehicleMileage = parseFloat(e.target.value) || 18;
    updateRecalculatorTotals();
  });

  document.getElementById('input-fuel-price')?.addEventListener('input', (e) => {
    state.fuelPrice = parseFloat(e.target.value) || 105;
    updateRecalculatorTotals();
  });

  // Wizard Clicks: Time of Day
  document.getElementById('time-of-day-grid')?.addEventListener('click', (e) => {
    const card = e.target.closest('.time-slot-card');
    if (!card) return;
    state.timeOfDay = card.dataset.tod;
    renderWizardOptions();
  });

  // Budget Tracker editable input
  document.getElementById('input-user-budget')?.addEventListener('input', (e) => {
    state.userTotalBudget = parseFloat(e.target.value) || 10000;
    updateRecalculatorTotals();
  });

  // Modal Close Listeners
  document.getElementById('btn-close-modal')?.addEventListener('click', closeDiscoveryModal);
  document.getElementById('btn-modal-close-action')?.addEventListener('click', closeDiscoveryModal);
  document.getElementById('discovery-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'discovery-modal') closeDiscoveryModal();
  });

  // Escape key to close modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDiscoveryModal();
  });

  // Shorter Alternatives Shortcut button in Tracker
  document.getElementById('btn-find-shorter')?.addEventListener('click', () => {
    state.availableExtraTime = TIME_OPTIONS[1]; // 1 hour
    renderWizardOptions();
    rankAndRenderDiscoveries(true);
  });

  // Export / Print Itinerary
  document.getElementById('btn-print-itinerary')?.addEventListener('click', () => {
    window.print();
  });
}
