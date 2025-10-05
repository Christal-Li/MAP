// Global variables
let currentUser = null;
let selectedPark = null;
let userLocation = null;
let allParks = [];
let currentFilters = {};
let map = null;
let markers = [];
let infoWindow = null;
let geocoder = null;
let directionsService = null;
let directionsRenderer = null;

// API URLs
const PARK_LOCATIONS_API = 'https://data.brisbane.qld.gov.au/api/explore/v2.1/catalog/datasets/park-locations/records?limit=100';
const OFF_LEASH_API = 'https://data.brisbane.qld.gov.au/api/explore/v2.1/catalog/datasets/park-dog-off-leash-areas/records?limit=100';
// New: Water fountain/tap locations (used to tag parks as having Water Fountain)
const WATER_FOUNTAIN_API = 'https://data.brisbane.qld.gov.au/api/explore/v2.1/catalog/datasets/park-drinking-fountain-tap-locations/records?limit=200';

// Brisbane bounds
const BRISBANE_BOUNDS = {
  south: -27.7,
  north: -27.2,
  west: 152.8,
  east: 153.3
};

// Initialize the application
document.addEventListener('DOMContentLoaded', initializeApp);

// Google Maps callback function
window.initGoogleMaps = function() {
  console.log('Google Maps API loaded');
  if (document.getElementById('mapPage').classList.contains('active')) {
    initializeMap();
  }
};

function initializeApp() {
  getUserLocation();
  loadParkData();
  checkLoginStatus();
  setupEventListeners();
  // Sync top filter button active states on load
  syncTopFilterButtons();
}

function setupEventListeners() {
  document.getElementById('addressSearch').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') searchLocation();
  });
  
  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal')) {
      closeModal(e.target.id);
    }
  });
}

// Location functions
function getUserLocation() {
  if (!navigator.geolocation) {
    userLocation = { lat: -27.4698, lng: 153.0251 };
    showNotification('Geolocation not supported, using Brisbane city center');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    function(position) {
      userLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };
      showNotification('Location detected successfully!');
    },
    function(error) {
      userLocation = { lat: -27.4698, lng: 153.0251 };
      showNotification('Using Brisbane city center as default location');
    }
  );
}

function useCurrentLocation() {
  const btn = document.querySelector('.current-location-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Getting Location...';
  
  if (!navigator.geolocation) {
    handleLocationError('Geolocation not supported. Using Brisbane city center.');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    function(position) {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      
      if (isWithinBrisbane(lat, lng)) {
        userLocation = { lat, lng };
        updateLocationAndNavigate('Current location detected in Brisbane!');
      } else {
        handleLocationError('You appear to be outside Brisbane area. Using Brisbane city center.');
      }
      
      resetLocationButton(btn);
    },
    function(error) {
      handleLocationError('Unable to get current location. Using Brisbane city center.');
      resetLocationButton(btn);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
  );

  function handleLocationError(message) {
    showNotification(message);
    userLocation = { lat: -27.4698, lng: 153.0251 };
    showMapView();
  }

  function resetLocationButton(btn) {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-crosshairs"></i> Use Current Location';
  }
}

function updateLocationAndNavigate(message) {
  console.log('Updating location and navigating:', userLocation);
  
  if (geocoder) {
    geocoder.geocode({ location: userLocation }, function(results, status) {
      if (status === 'OK' && results[0]) {
        document.getElementById('addressSearch').value = results[0].formatted_address;
        console.log('Updated search box with:', results[0].formatted_address);
      }
    });
  }
  
  showNotification(message);
  showMapView();
  
  setTimeout(() => {
    if (map) {
      console.log('Updating map center to:', userLocation);
      
      // Clear existing markers
      clearUserLocationMarkers();
      
      // Set map center and zoom
      map.setCenter(new google.maps.LatLng(userLocation.lat, userLocation.lng));
      map.setZoom(15);
      
      // Add user location marker
      addUserLocationMarker();
      
      // Update park markers
      displayParksOnMap();
      
      console.log('Location and navigation updated');
    }
  }, 800);
}

function searchLocation() {
  const address = document.getElementById('addressSearch').value.trim();
  if (!address) {
    showNotification('Please enter an address to search');
    return;
  }
  
  console.log('Starting search for:', address);
  
  // Show loading state
  const searchBtn = document.querySelector('.search-btn');
  const originalText = searchBtn.innerHTML;
  searchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  searchBtn.disabled = true;
  
  // First, navigate to map view
  showMapView();
  
  // Wait for map to initialize, then perform search
  setTimeout(() => {
    performGeocodingSearch(address, searchBtn, originalText);
  }, 1000);
}

function performGeocodingSearch(address, searchBtn, originalText) {
  // Initialize geocoder if needed
  if (!geocoder && window.google) {
    geocoder = new google.maps.Geocoder();
  }
  
  if (!geocoder) {
    showNotification('Map services not ready. Please try again.');
    searchBtn.innerHTML = originalText;
    searchBtn.disabled = false;
    return;
  }
  
  // Prepare search query with more specific Brisbane targeting
  let brisbaneQuery;
  if (address.toLowerCase().includes('brisbane') || address.toLowerCase().includes('qld')) {
    brisbaneQuery = address;
  } else {
    brisbaneQuery = `${address}, Brisbane, Queensland, Australia`;
  }
  
  console.log('Geocoding query:', brisbaneQuery);
  
  // Create Brisbane bounds for more accurate results
  const brisbaneBounds = new google.maps.LatLngBounds(
    new google.maps.LatLng(-27.7, 152.8),
    new google.maps.LatLng(-27.2, 153.3)
  );
  
  // Perform geocoding with Brisbane-specific parameters
  geocoder.geocode({ 
    address: brisbaneQuery,
    bounds: brisbaneBounds,
    componentRestrictions: { 
      country: 'AU', 
      administrativeArea: 'Queensland',
      locality: 'Brisbane'
    },
    region: 'AU'
  }, function(results, status) {
    // Reset button state
    searchBtn.innerHTML = originalText;
    searchBtn.disabled = false;
    
    console.log('Geocoding status:', status);
    console.log('Geocoding results:', results);
    
    if (status === 'OK' && results && results.length > 0) {
      // Find the best result within Brisbane bounds
      let bestResult = null;
      
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const location = result.geometry.location;
        const lat = location.lat();
        const lng = location.lng();
        
        console.log(`Result ${i}:`, {
          address: result.formatted_address,
          coordinates: { lat, lng },
          types: result.types
        });
        
        // Check if this result is within Brisbane bounds
        if (isWithinBrisbane(lat, lng)) {
          bestResult = result;
          console.log(`Selected result ${i} as it's within Brisbane bounds`);
          break;
        }
      }
      
      if (bestResult) {
        const location = bestResult.geometry.location;
        const lat = location.lat();
        const lng = location.lng();
        
        console.log('Final selected coordinates:', { lat, lng });
        console.log('Final selected address:', bestResult.formatted_address);
        
        // Update user location
        userLocation = { lat, lng };
        
        // Update search box with the exact found address
        document.getElementById('addressSearch').value = bestResult.formatted_address;
        
        // Show success notification
        showNotification(`Found: ${bestResult.formatted_address}`);
        
        // Apply current filters and update displays
        applyFiltersAndUpdateLocation(lat, lng);
        
      } else {
        console.log('No results found within Brisbane bounds');
        showNotification('No results found within Brisbane area. Please try a more specific address.');
      }
      
    } else {
      console.log('Geocoding failed:', status);
      let errorMessage = 'Location not found. Please try a different address.';
      
      if (status === 'ZERO_RESULTS') {
        errorMessage = 'No results found for this address in Brisbane.';
      } else if (status === 'OVER_QUERY_LIMIT') {
        errorMessage = 'Too many requests. Please try again later.';
      }
      
      showNotification(errorMessage);
    }
  });
}

function applyFiltersAndUpdateLocation(lat, lng) {
  // Update map location first
  if (map) {
    updateMapLocation(lat, lng);
  } else {
    console.log('Map not ready, waiting...');
    setTimeout(() => {
      if (map) {
        updateMapLocation(lat, lng);
      }
    }, 1000);
  }
  
  // Check if any filters are currently active
  const hasActiveFilters = !!(currentFilters.nightLighting ||
                          currentFilters.fenced ||
                          currentFilters.offLeash ||
                          currentFilters.smallDogEnclosure ||
                          currentFilters.agility ||
                          currentFilters.waterFountain);
  
  if (hasActiveFilters) {
    console.log('Active filters detected, applying conditional search');
    showNotification('Searching for parks matching your criteria...');
    
    // Small delay to let the map update, then show filtered results
    setTimeout(() => {
      displayFilteredParksNearLocation(lat, lng);
    }, 500);
  } else {
    console.log('No active filters, showing all nearby parks');
  }
}

function displayFilteredParksNearLocation(lat, lng) {
  if (!allParks.length) {
    showNotification('No park data available');
    return;
  }
  
  // Get parks that match current filters
  const filteredParks = getFilteredParks();
  
  if (filteredParks.length === 0) {
    showNotification('No parks found matching your criteria near this location');
    return;
  }
  
  // Calculate distances from the searched location
  const parksWithDistance = filteredParks.map(park => {
    const parkLocation = { lat: park.coordinates[1], lng: park.coordinates[0] };
    const distance = calculateDistance({ lat, lng }, parkLocation);
    return { ...park, distance: parseFloat(distance) };
  });
  
  // Sort by distance and get nearest 20
  const nearestFilteredParks = parksWithDistance
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 20);
  
  console.log(`Found ${nearestFilteredParks.length} parks matching criteria near searched location`);
  
  // Show notification about filtered results
  const filterNames = [];
  if (currentFilters.nightLighting) filterNames.push('night lighting');
  if (currentFilters.fenced) filterNames.push('fencing');
  if (currentFilters.offLeash) filterNames.push('off-leash');
  if (currentFilters.smallDogEnclosure) filterNames.push('small dog enclosure');
  if (currentFilters.agility) filterNames.push('dog agility equipment');
  if (currentFilters.waterFountain) filterNames.push('water fountains');
  
  const filterText = filterNames.join(', ');
  showNotification(`Found ${nearestFilteredParks.length} parks with ${filterText} nearby`);
  
  // Update map markers to show only filtered results
  displaySpecificParksOnMap(nearestFilteredParks);
}

function displaySpecificParksOnMap(parksToShow) {
  if (!map) return;
  
  // Clear existing markers
  markers.forEach(marker => marker.setMap(null));
  markers = [];
  
  parksToShow.forEach((park, index) => {
    const lat = park.coordinates[1];
    const lng = park.coordinates[0];
    
    const marker = new google.maps.Marker({
      position: { lat, lng },
      map: map,
      title: park.name,
      icon: {
        url: park.isOffLeash ? 
          'https://maps.google.com/mapfiles/ms/icons/green-dot.png' : 
          'https://maps.google.com/mapfiles/ms/icons/red-dot.png'
      }
    });
    
    const distance = park.distance !== undefined ? park.distance.toFixed(1) : 'N/A';
    const infoContent = createInfoWindowContent(park, distance, lat, lng, index);
    
    marker.addListener('click', function() {
      infoWindow.setContent(infoContent);
      infoWindow.open(map, marker);
      selectedPark = { name: park.name, lat, lng };
      document.getElementById('navigationBtn').classList.remove('hidden');
    });
    
    markers.push(marker);
  });
  
  console.log(`Displayed ${markers.length} filtered park markers on map`);
}

function updateMapLocation(lat, lng) {
  console.log('Updating map location to:', { lat, lng });
  
  try {
    // Validate coordinates
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
      console.error('Invalid coordinates provided:', { lat, lng });
      showNotification('Invalid location coordinates');
      return;
    }
    
    // Ensure coordinates are within reasonable bounds
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      console.error('Coordinates out of valid range:', { lat, lng });
      showNotification('Location coordinates out of valid range');
      return;
    }
    
    // Clear existing user marker
    if (userLocationMarker) {
      userLocationMarker.setMap(null);
      userLocationMarker = null;
    }
    
    // Create exact position object with validated coordinates
    const exactLat = parseFloat(lat);
    const exactLng = parseFloat(lng);
    const position = new google.maps.LatLng(exactLat, exactLng);
    
    console.log('Setting map center to exact position:', { lat: exactLat, lng: exactLng });
    
    // Set map center with exact coordinates
    map.setCenter(position);
    
    // Set appropriate zoom level for the area
    map.setZoom(16);
    
    // Add user location marker at exact position
    userLocationMarker = new google.maps.Marker({
      position: position,
      map: map,
      title: 'Your Searched Location',
      icon: { 
        url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
        scaledSize: new google.maps.Size(40, 40)
      },
      zIndex: 1000,
      animation: google.maps.Animation.DROP
    });
    
    // Update park markers based on current filters
    displayParksOnMap();
    
    console.log('Map location updated successfully');
    
    // Verify the update worked after a short delay
    setTimeout(() => {
      const center = map.getCenter();
      const actualLat = center.lat();
      const actualLng = center.lng();
      
      console.log('Verified map center after update:', { 
        lat: actualLat, 
        lng: actualLng 
      });
      
      // Check if the map actually moved to the right location
      const latDiff = Math.abs(actualLat - exactLat);
      const lngDiff = Math.abs(actualLng - exactLng);
      
      if (latDiff > 0.01 || lngDiff > 0.01) {
        console.warn('Map center differs significantly from target:', {
          target: { lat: exactLat, lng: exactLng },
          actual: { lat: actualLat, lng: actualLng },
          difference: { lat: latDiff, lng: lngDiff }
        });
        
        // Try to set the center again
        map.setCenter(new google.maps.LatLng(exactLat, exactLng));
      }
    }, 1000);
    
  } catch (error) {
    console.error('Error updating map location:', error);
    showNotification('Error updating map location');
  }
}

function updateMapToLocation(lat, lng) {
  if (!map) {
    console.log('Map not ready for location update');
    return;
  }
  
  try {
    console.log('Updating map to exact coordinates:', { lat, lng });
    
    // Update user location
    userLocation = { lat, lng };
    
    // Clear existing user marker
    if (userLocationMarker) {
      userLocationMarker.setMap(null);
      userLocationMarker = null;
    }
    
    // Create exact position
    const exactPosition = new google.maps.LatLng(lat, lng);
    
    // Set map center with exact coordinates
    map.setCenter(exactPosition);
    map.setZoom(16);
    
    // Add user location marker at exact position
    userLocationMarker = new google.maps.Marker({
      position: exactPosition,
      map: map,
      title: 'Your Searched Location',
      icon: { 
        url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
        scaledSize: new google.maps.Size(32, 32)
      },
      zIndex: 1000
    });
    
    // Update park markers
    displayParksOnMap();
    
    // Verify map center
    setTimeout(() => {
      const currentCenter = map.getCenter();
      console.log('Map center after update:', { 
        lat: currentCenter.lat(), 
        lng: currentCenter.lng() 
      });
    }, 100);
    
    console.log('Map location updated successfully');
    
  } catch (error) {
    console.error('Error updating map location:', error);
    showNotification('Error updating map location');
  }
}

function isWithinBrisbane(lat, lng) {
  return lat >= BRISBANE_BOUNDS.south && lat <= BRISBANE_BOUNDS.north && 
         lng >= BRISBANE_BOUNDS.west && lng <= BRISBANE_BOUNDS.east;
}

// Store user location marker globally to manage it
let userLocationMarker = null;

function addUserLocationMarker() {
  if (userLocation && map) {
    console.log('Adding user location marker at:', userLocation);
    
    // Remove existing user location marker if it exists
    if (userLocationMarker) {
      userLocationMarker.setMap(null);
    }
    
    // Create new user location marker
    userLocationMarker = new google.maps.Marker({
      position: userLocation,
      map: map,
      title: 'Your Location',
      icon: { 
        url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
        scaledSize: new google.maps.Size(32, 32)
      },
      zIndex: 1000
    });
    
    console.log('User location marker added');
  }
}

function clearUserLocationMarkers() {
  if (userLocationMarker) {
    userLocationMarker.setMap(null);
    userLocationMarker = null;
    console.log('Cleared existing user location marker');
  }
}

// Data loading functions
async function loadParkData() {
  try {
    console.log('Starting Brisbane park data loading...');
    showNotification('Loading Brisbane park data...');
    
    console.log('API URLs:');
    console.log('Parks:', PARK_LOCATIONS_API);
    console.log('Off-leash:', OFF_LEASH_API);
    console.log('Water fountains:', WATER_FOUNTAIN_API);
    
    const [parkData, offLeashData, waterFountainData] = await Promise.all([
      fetchAPIData(PARK_LOCATIONS_API, 'park locations'),
      fetchAPIData(OFF_LEASH_API, 'off-leash areas'),
      fetchAPIData(WATER_FOUNTAIN_API, 'water fountains')
    ]);
    
  console.log('API Results Summary:');
    console.log(`Park locations fetched: ${parkData.length}`);
    console.log(`Off-leash areas fetched: ${offLeashData.length}`);
  console.log(`Water fountain locations fetched: ${waterFountainData.length}`);
    
  processParkData(parkData, offLeashData, waterFountainData);
    
    console.log('Final Results:');
    console.log(`Total parks processed: ${allParks.length}`);
    console.log(`Regular parks: ${allParks.filter(p => !p.isOffLeash).length}`);
    console.log(`Off-leash areas: ${allParks.filter(p => p.isOffLeash).length}`);
    
    if (allParks.length > 0) {
      showNotification(`Successfully loaded ${allParks.length} parks from Brisbane APIs!`);
      console.log('Brisbane API data loaded successfully');
    } else {
      console.log('No parks processed from APIs, loading sample data');
      showNotification('APIs returned no usable data. Loading sample Brisbane parks...');
      loadSampleData();
    }
    
  } catch (error) {
    console.error('Error loading park data:', error);
    showNotification('Error accessing Brisbane APIs. Loading sample data...');
    loadSampleData();
  }
}

async function fetchAPIData(url, type) {
  try {
    console.log(`\n=== Fetching ${type} ===`);
    console.log(`URL: ${url}`);
    
    const response = await fetch(url);
    console.log(`Response status: ${response.status}`);
    console.log(`Response ok: ${response.ok}`);
    
    if (!response.ok) {
      throw new Error(`${type} API HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`Raw API response for ${type}:`, data);
    console.log(`Response keys:`, Object.keys(data));
    
    // Try different possible data structures
    let records = [];
    if (data.records) {
      records = data.records;
      console.log(`Found data.records with ${records.length} items`);
    } else if (data.results) {
      records = data.results;
      console.log(`Found data.results with ${records.length} items`);
    } else if (data.data) {
      records = data.data;
      console.log(`Found data.data with ${records.length} items`);
    } else if (Array.isArray(data)) {
      records = data;
      console.log(`Data is direct array with ${records.length} items`);
    } else {
      console.log(`No recognized data structure found in response`);
      console.log(`Available keys:`, Object.keys(data));
    }
    
    console.log(`Sample record for ${type}:`, records[0]);
    return records;
    
  } catch (error) {
    console.error(`Error loading ${type}:`, error);
    return [];
  }
}

function processParkData(parks, offLeashAreas, waterFountains) {
  // Helper to normalize park names for robust matching
  function normalizeParkName(name) {
    if (!name || typeof name !== 'string') return '';
    let s = name.toLowerCase();
    // Remove common off-leash suffixes/terms and punctuation
    s = s.replace(/off[- ]?leash/g, '');
    s = s.replace(/dog[- ]?off[- ]?leash/g, '');
    s = s.replace(/\barea\b/g, '');
    s = s.replace(/\bpark\b/g, '');
    s = s.replace(/\breserve\b/g, '');
    s = s.replace(/[.,/#!$%\^&*;:{}=_'`~()]/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }

  allParks = [];
  console.log('Processing Brisbane park data...');
  const wfCount = Array.isArray(waterFountains) ? waterFountains.length : 0;
  console.log(`Input: ${parks.length} parks, ${offLeashAreas.length} off-leash areas, ${wfCount} water fountains`);
  
  let regularParksProcessed = 0;
  let offLeashAreasProcessed = 0;
  
  // Build a membership set of park names that have drinking fountains (from dataset)
  const fountainParkNames = new Set();
  if (Array.isArray(waterFountains)) {
    waterFountains.forEach((item) => {
      const fields = (item.record && item.record.fields) ? item.record.fields : (item.fields || item);
      const rawName = fields.park_name || fields.name || fields.site_name || fields.facility_name || fields.title;
      const norm = normalizeParkName(rawName);
      if (norm) {
        fountainParkNames.add(norm);
      }
    });
  }

  // Process regular parks
  console.log('Processing Regular Parks');
  parks.forEach((park, index) => {
    const parkData = extractParkData(park, index, 'regular', false);
    if (parkData) {
      // Tag water fountain by dataset membership (name-based)
      const nameKey = normalizeParkName(parkData.name || '');
      if (nameKey && fountainParkNames.has(nameKey) && !parkData.facilities.includes('Water Fountain')) {
        parkData.facilities.push('Water Fountain');
      }
      allParks.push(parkData);
      regularParksProcessed++;
    }
  });
  
  // Process off-leash areas
  console.log('Processing Off-Leash Areas');
  offLeashAreas.forEach((area, index) => {
    const areaData = extractParkData(area, index, 'off-leash', true);
    if (areaData) {
      // Tag water fountain by dataset membership (name-based)
      const nameKey = normalizeParkName(areaData.name || '');
      if (nameKey && fountainParkNames.has(nameKey) && !areaData.facilities.includes('Water Fountain')) {
        areaData.facilities.push('Water Fountain');
      }
      allParks.push(areaData);
      offLeashAreasProcessed++;
    }
  });
  
  console.log('Processing Summary:');
  console.log(`Regular parks processed: ${regularParksProcessed}/${parks.length}`);
  console.log(`Off-leash areas processed: ${offLeashAreasProcessed}/${offLeashAreas.length}`);
  console.log(`Total parks in allParks: ${allParks.length}`);
  
  if (allParks.length > 0) {
    console.log('Sample processed parks:');
    allParks.slice(0, 3).forEach((park, i) => {
      console.log(`${i + 1}. ${park.name} at [${park.coordinates[0]}, ${park.coordinates[1]}]`);
    });
  }
}

function extractParkData(item, index, type, isOffLeash) {
  console.log(`Processing ${type} item ${index}`);
  
  // Try multiple data structure patterns
  let fields = null;
  
  if (item.record && item.record.fields) {
    fields = item.record.fields;
    console.log(`Using item.record.fields pattern`);
  } else if (item.fields) {
    fields = item.fields;
    console.log(`Using item.fields pattern`);
  } else {
    fields = item;
    console.log(`Using direct item pattern`);
  }
  
  console.log(`Extracted fields:`, fields);
  console.log(`Fields keys:`, Object.keys(fields || {}));
  
  const coordinates = extractCoordinates(fields);
  console.log(`Extracted coordinates:`, coordinates);
  
  if (!coordinates) {
    console.log(`Skipping ${type} ${index} - no coordinates found`);
    return null;
  }
  
  const lng = parseFloat(coordinates[0]);
  const lat = parseFloat(coordinates[1]);
  
  console.log(`Parsed coordinates: lng=${lng}, lat=${lat}`);
  
  if (!isWithinBrisbane(lat, lng)) {
    console.log(`Skipping ${type} ${index} - outside Brisbane bounds`);
    return null;
  }
  
  const name = fields.park_name || fields.name || fields.facility_name || 
               fields.site_name || fields.title || `${type} ${index + 1}`;
  
  console.log(`Extracted name: ${name}`);
  
  const parkData = {
    ...item,
    type,
    isOffLeash,
    name,
    coordinates: [lng, lat],
    suburb: fields.suburb || fields.locality || fields.district || '',
    address: fields.address || fields.street_address || fields.full_address || '',
    facilities: extractFacilities(fields),
    restrictions: fields.restrictions || fields.rules || '',
    hours: fields.hours || fields.opening_hours || fields.operating_hours || '',
    area: fields.area || '',
    description: fields.description || ''
  };

  // Augment facilities based on specific off-leash fields mapping (exact keys from dataset)
  const f = fields || {};
  const isYes = (v) => {
    if (v === true || v === 1) return true;
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase();
      return s === 'y' || s === 'yes' || s === 'true' || s === '1';
    }
    return false;
  };
  // According to requirement mapping:
  // LIGHTING -> Night Lighting
  if (isYes(f.LIGHTING) || isYes(f.lighting)) parkData.facilities.push('Night Lighting');
  // FENCING -> Fencing ONLY when value equals 'FULLY FENCED'
  const fencingVal = (f.FENCING !== undefined ? f.FENCING : f.fencing);
  if (typeof fencingVal === 'string' && fencingVal.trim().toLowerCase() === 'fully fenced') {
    parkData.facilities.push('Fencing');
  }
  // SMALL_DOG_ENCLOSURE -> SMALL DOG ENCLOSURE
  if (isYes(f.SMALL_DOG_ENCLOSURE) || isYes(f.small_dog_enclosure)) parkData.facilities.push('SMALL DOG ENCLOSURE');
  // DOG_AGILITY_EQUIPMENT -> DOG AGILITY EQUIPMENT
  if (isYes(f.DOG_AGILITY_EQUIPMENT) || isYes(f.dog_agility_equipment)) parkData.facilities.push('DOG AGILITY EQUIPMENT');
  
  console.log(`Successfully processed ${type}: ${name}`);
  return parkData;
}

function extractCoordinates(fields) {
  if (!fields) {
    console.log(`No fields provided for coordinate extraction`);
    return null;
  }
  
  console.log(`Attempting coordinate extraction from fields:`, Object.keys(fields));
  
  // Try geopoint field (Brisbane API specific)
  if (fields.geopoint) {
    console.log(`Found geopoint field:`, fields.geopoint);
    if (Array.isArray(fields.geopoint) && fields.geopoint.length >= 2) {
      // Brisbane geopoint format is [lat, lng]
      const coords = [parseFloat(fields.geopoint[1]), parseFloat(fields.geopoint[0])]; // Convert to [lng, lat]
      console.log(`Extracted from geopoint [lat, lng] -> [lng, lat]:`, coords);
      return coords;
    }
  }
  
  // Try geo_shape field (Brisbane API alternative)
  if (fields.geo_shape) {
    console.log(`Found geo_shape field:`, fields.geo_shape);
    if (fields.geo_shape.type === 'Point' && fields.geo_shape.coordinates) {
      console.log(`Extracted from geo_shape.coordinates:`, fields.geo_shape.coordinates);
      return fields.geo_shape.coordinates;
    }
  }
  
  // Try geometry field (GeoJSON format)
  if (fields.geometry) {
    console.log(`Found geometry field:`, fields.geometry);
    if (fields.geometry.type === 'Point' && fields.geometry.coordinates) {
      console.log(`Extracted from geometry.coordinates:`, fields.geometry.coordinates);
      return fields.geometry.coordinates;
    }
  }
  
  // Try location field
  if (fields.location) {
    console.log(`Found location field:`, fields.location);
    if (fields.location.coordinates) {
      console.log(`Extracted from location.coordinates:`, fields.location.coordinates);
      return fields.location.coordinates;
    }
  }
  
  // Try lat/lng fields from Brisbane API
  if (fields.lat && fields.long) {
    const coords = [parseFloat(fields.long), parseFloat(fields.lat)];
    console.log(`Extracted from lat/long fields:`, coords);
    return coords;
  }
  
  // Try direct lat/lng fields
  if (fields.latitude && fields.longitude) {
    const coords = [parseFloat(fields.longitude), parseFloat(fields.latitude)];
    console.log(`Extracted from latitude/longitude fields:`, coords);
    return coords;
  }
  
  if (fields.lat && fields.lng) {
    const coords = [parseFloat(fields.lng), parseFloat(fields.lat)];
    console.log(`Extracted from lat/lng fields:`, coords);
    return coords;
  }
  
  // Try other possible coordinate field names
  const possibleCoordFields = ['coordinates', 'coord', 'position', 'geo', 'point'];
  for (const fieldName of possibleCoordFields) {
    if (fields[fieldName]) {
      console.log(`Found potential coordinate field '${fieldName}':`, fields[fieldName]);
      if (Array.isArray(fields[fieldName]) && fields[fieldName].length >= 2) {
        console.log(`Extracted from ${fieldName}:`, fields[fieldName]);
        return fields[fieldName];
      }
    }
  }
  
  console.log(`No coordinates found in fields`);
  console.log(`Available field names:`, Object.keys(fields));
  return null;
}

function extractFacilities(fields) {
  if (!fields || typeof fields !== 'object') return [];
  
  const facilities = [];
  // Note: Park Size related tags removed per new requirements
  
  // Add some default facilities based on park type
  facilities.push('Dog Friendly');
  
  // Check for specific facility indicators in field names and values
  const fieldKeys = Object.keys(fields);
  
  const facilityMappings = {
    'toilet': 'Toilets',
    'parking': 'Parking', 
    'playground': 'Playground',
    'bbq': 'BBQ',
    'shelter': 'Shelter',
    'seating': 'Seating',
    'water': 'Water Fountain',
    'lighting': 'Night Lighting',
    'exercise': 'Exercise Equipment',
    'path': 'Walking Paths',
    'picnic': 'Picnic Area',
    'sport': 'Sports Facilities'
  };
  
  fieldKeys.forEach(key => {
    const value = fields[key];
    const lowerKey = key.toLowerCase();
    const lowerValue = typeof value === 'string' ? value.toLowerCase() : '';
    
    // Check if field name or value indicates a facility
    Object.entries(facilityMappings).forEach(([keyword, facility]) => {
      if (lowerKey.includes(keyword) || lowerValue.includes(keyword)) {
        const isPositive = value === 'yes' || value === 'true' || value === '1' || 
                          value === true || value === 1 || lowerValue.includes('yes') ||
                          lowerKey.includes(keyword); // If field name contains keyword, assume it exists
        
        if (isPositive) {
          facilities.push(facility);
        }
      }
    });
  });
  
  // Check text descriptions and lists
  const textFields = ['description', 'facilities', 'amenities', 'features', 'park_name_list'];
  textFields.forEach(fieldName => {
    if (fields[fieldName]) {
      let text = '';
      if (typeof fields[fieldName] === 'string') {
        text = fields[fieldName].toLowerCase();
      } else if (Array.isArray(fields[fieldName])) {
        text = fields[fieldName].join(' ').toLowerCase();
      }
      
      if (text) {
        Object.entries(facilityMappings).forEach(([keyword, facility]) => {
          if (text.includes(keyword)) facilities.push(facility);
        });
      }
    }
  });
  
  // Remove duplicates and return
  return [...new Set(facilities)];
}

// Top filter bar: toggle and apply immediately, and sync button active style
function toggleTopFilter(key, btn) {
  // Initialize expected filter keys if not present
  currentFilters = {
    nightLighting: !!currentFilters.nightLighting,
    fenced: !!currentFilters.fenced,
    offLeash: !!currentFilters.offLeash,
    smallDogEnclosure: !!currentFilters.smallDogEnclosure,
    agility: !!currentFilters.agility,
    waterFountain: !!currentFilters.waterFountain
  };

  currentFilters[key] = !currentFilters[key];

  // Update button visual state
  if (btn) {
    btn.classList.toggle('active', currentFilters[key]);
  }

  // When any button is toggled, immediately re-render list/map
  updateDisplays();
}

// Expose for inline onclick handlers
window.toggleTopFilter = toggleTopFilter;

function loadSampleData() {
  allParks = [
    {
      type: 'regular', isOffLeash: false, name: 'South Bank Parklands',
      coordinates: [153.0251, -27.4748], suburb: 'South Brisbane',
      address: 'Grey Street, South Brisbane QLD 4101',
      facilities: ['Toilets', 'Parking', 'Water Fountain', 'Seating']
    },
    {
      type: 'off-leash', isOffLeash: true, name: 'New Farm Park Off-Leash Area',
      coordinates: [153.0515, -27.4689], suburb: 'New Farm',
      address: 'Brunswick Street, New Farm QLD 4005',
      facilities: ['Toilets', 'Parking', 'Water Fountain']
    },
    {
      type: 'regular', isOffLeash: false, name: 'Roma Street Parkland',
      coordinates: [153.0186, -27.4634], suburb: 'Brisbane City',
      address: '1 Parkland Boulevard, Brisbane City QLD 4000',
      facilities: ['Toilets', 'Parking', 'Playground', 'BBQ']
    },
    {
      type: 'off-leash', isOffLeash: true, name: 'Kangaroo Point Cliffs Park',
      coordinates: [153.0351, -27.4798], suburb: 'Kangaroo Point',
      address: 'River Terrace, Kangaroo Point QLD 4169',
      facilities: ['Parking', 'Seating']
    },
    {
      type: 'regular', isOffLeash: false, name: 'City Botanic Gardens',
      coordinates: [153.0298, -27.4738], suburb: 'Brisbane City',
      address: 'Alice Street, Brisbane City QLD 4000',
      facilities: ['Toilets', 'Water Fountain', 'Seating']
    }
  ];
  
  console.log('Sample data loaded:', allParks.length, 'parks');
  showNotification(`Loaded ${allParks.length} sample Brisbane parks`);
  
  if (document.getElementById('mapPage').classList.contains('active') && map) {
    displayParksOnMap();
  }
  if (document.getElementById('listPage').classList.contains('active')) {
    loadParksList();
  }
}

// Navigation functions
function showHomePage() {
  showPage('homePage');
}

function showMapView() {
  showPage('mapPage');
  setTimeout(() => {
    if (window.google) {
      initializeMap();
    }
  }, 100);
}

function showListView() {
  showPage('listPage');
  loadParksList();
}

function showPage(pageId) {
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });
  document.getElementById(pageId).classList.add('active');
}

// Map functions
function initializeMap() {
  if (!window.google) {
    console.log('Google Maps API not loaded yet');
    return;
  }
  
  const defaultLocation = userLocation || { lat: -27.4698, lng: 153.0251 };
  console.log('Initializing map with center:', defaultLocation);
  
  map = new google.maps.Map(document.getElementById('map'), {
    zoom: userLocation ? 15 : 12,
    center: defaultLocation,
    mapTypeControl: true,
    streetViewControl: true,
    fullscreenControl: true,
    styles: [{
      featureType: 'poi.park',
      elementType: 'geometry.fill',
      stylers: [{ color: '#a5d6a7' }]
    }]
  });
  
  // Initialize services
  infoWindow = new google.maps.InfoWindow();
  geocoder = new google.maps.Geocoder();
  directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer();
  directionsRenderer.setMap(map);
  
  // Add map event listeners for debugging
  map.addListener('center_changed', function() {
    const center = map.getCenter();
    console.log('Map center changed to:', { lat: center.lat(), lng: center.lng() });
  });
  
  map.addListener('zoom_changed', function() {
    console.log('Map zoom changed to:', map.getZoom());
  });
  
  addUserLocationMarker();
  displayParksOnMap();
  
  console.log('Map initialized successfully');
}

function displayParksOnMap() {
  if (!map || allParks.length === 0) return;
  
  const filteredParks = getFilteredParks();
  const nearestParks = getNearestParks(filteredParks, 20);
  
  // Clear existing markers
  markers.forEach(marker => marker.setMap(null));
  markers = [];
  
  nearestParks.forEach((park, index) => {
    const lat = park.coordinates[1];
    const lng = park.coordinates[0];
    
    const marker = new google.maps.Marker({
      position: { lat, lng },
      map: map,
      title: park.name,
      icon: {
        url: park.isOffLeash ? 
          'https://maps.google.com/mapfiles/ms/icons/green-dot.png' : 
          'https://maps.google.com/mapfiles/ms/icons/red-dot.png'
      }
    });
    
    const distance = userLocation ? calculateDistance(userLocation, { lat, lng }) : 'N/A';
    const infoContent = createInfoWindowContent(park, distance, lat, lng, index);
    
    marker.addListener('click', function() {
      infoWindow.setContent(infoContent);
      infoWindow.open(map, marker);
      selectedPark = { name: park.name, lat, lng };
      document.getElementById('navigationBtn').classList.remove('hidden');
    });
    
    markers.push(marker);
  });
}

function createInfoWindowContent(park, distance, lat, lng, index) {
  const facilitiesHTML = park.facilities.map(facility => 
    `<span style="background: #e3f2fd; color: #1976d2; padding: 2px 8px; border-radius: 10px; font-size: 11px; margin-right: 4px; margin-bottom: 4px; display: inline-block;">${facility}</span>`
  ).join('');
  
  const offLeashBadge = park.isOffLeash ? 
    '<span style="background: #e8f5e8; color: #2e7d32; padding: 2px 8px; border-radius: 10px; font-size: 11px; margin-right: 4px;">Off-Leash</span>' : '';
  
  return `
    <div style="max-width: 280px;">
      <h3 style="margin: 0 0 10px 0; color: #333;">${park.name}</h3>
      <p style="margin: 0 0 8px 0; color: #666; font-size: 12px;">
        ${park.suburb ? park.suburb + ' • ' : ''}${distance !== 'N/A' ? distance + ' km away' : ''}
      </p>
      <div style="margin-bottom: 10px;">
        ${facilitiesHTML}${offLeashBadge}
      </div>
      <div style="margin-top: 15px;">
        <button onclick="showParkDetailsFromMap('${park.name.replace(/'/g, "\\'")}', ${lat}, ${lng}, ${index})" 
                style="background: #4a90e2; color: white; border: none; padding: 8px 15px; border-radius: 5px; cursor: pointer; margin-right: 10px; font-size: 12px;">
          Details
        </button>
        <button onclick="getDirectionsFromMap(${lat}, ${lng}, '${park.name.replace(/'/g, "\\'")}')" 
                style="background: #28a745; color: white; border: none; padding: 8px 15px; border-radius: 5px; cursor: pointer; font-size: 12px;">
          Directions
        </button>
      </div>
    </div>
  `;
}

// Filter functions
function toggleFloatingFilter() {
  const panel = document.querySelector('.floating-filter-content');
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) {
    // When opening, sync button states to currentFilters
    syncTopFilterButtons();
  }
}

function applyFilters() {
  // Deprecated path: keep for compatibility, but just re-render with current state
  console.log('applyFilters called (no-op, using instant buttons now). Current:', currentFilters);
  updateDisplays();
}

function getFilteredParks() {
  if (!allParks.length) return [];
  
  return allParks.filter(park => {
    // Night Lighting
    if (currentFilters.nightLighting && !park.facilities.includes('Night Lighting')) return false;

    // Fenced
    if (currentFilters.fenced && !park.facilities.includes('Fencing')) return false;

    // Off-Leash (positive filter): if ON, include only off-leash areas
    if (currentFilters.offLeash === true && !park.isOffLeash) return false;

    // Small Dog Enclosure
    if (currentFilters.smallDogEnclosure && !park.facilities.includes('SMALL DOG ENCLOSURE')) return false;

    // Dog Agility Equipment
    if (currentFilters.agility && !park.facilities.includes('DOG AGILITY EQUIPMENT')) return false;

    // Water Fountain
    if (currentFilters.waterFountain && !park.facilities.includes('Water Fountain')) return false;

    return true;
  });
}

function getNearestParks(parks, limit = 20) {
  if (!userLocation || !parks.length) {
    return parks.slice(0, limit);
  }
  
  const parksWithDistance = parks.map(park => {
    const parkLocation = { lat: park.coordinates[1], lng: park.coordinates[0] };
    const distance = calculateDistance(userLocation, parkLocation);
    return { ...park, distance: parseFloat(distance) };
  });
  
  return parksWithDistance
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

function calculateDistance(pos1, pos2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (pos2.lat - pos1.lat) * Math.PI / 180;
  const dLng = (pos2.lng - pos1.lng) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(pos1.lat * Math.PI / 180) * Math.cos(pos2.lat * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return (R * c).toFixed(1);
}

// List view functions
function loadParksList() {
  const parksList = document.getElementById('parksList');
  
  if (allParks.length === 0) {
    parksList.innerHTML = createLoadingHTML();
    return;
  }
  
  const filteredParks = getFilteredParks();
  const nearestParks = getNearestParks(filteredParks, 20);
  
  if (nearestParks.length === 0) {
    parksList.innerHTML = createNoResultsHTML();
    return;
  }
  
  const html = nearestParks.map((park, index) => createParkCardHTML(park, index)).join('');
  parksList.innerHTML = html;
}

function createLoadingHTML() {
  return `
    <div style="text-align: center; padding: 50px; color: #666;">
      <i class="fas fa-tree" style="font-size: 48px; margin-bottom: 20px;"></i>
      <h3>Loading Parks...</h3>
      <p>Please wait while we load nearby dog-friendly parks</p>
    </div>
  `;
}

function createNoResultsHTML() {
  return `
    <div style="text-align: center; padding: 50px; color: #666;">
      <i class="fas fa-search" style="font-size: 48px; margin-bottom: 20px;"></i>
      <h3>No Parks Found</h3>
      <p>Try adjusting your filters or search location</p>
    </div>
  `;
}

function createParkCardHTML(park, index) {
  const distance = park.distance !== undefined ? park.distance.toFixed(1) : 'N/A';
  const facilitiesHTML = park.facilities.map(facility => 
    `<span class="feature-tag">${facility}</span>`
  ).join('');
  const offLeashHTML = park.isOffLeash ? '<span class="feature-tag off-leash">Off-Leash Area</span>' : '';
  
  return `
    <div class="park-card">
      <h3>${park.name}</h3>
      <div class="park-distance">
        ${distance !== 'N/A' ? distance + ' km away' : 'Distance unknown'}
        ${park.suburb ? ' • ' + park.suburb : ''}
      </div>
      <div class="park-features">
        ${facilitiesHTML}${offLeashHTML}
      </div>
      ${park.address ? `<div class="park-address">${park.address}</div>` : ''}
      <div class="park-actions">
        <button class="view-details-btn" onclick="showParkDetailsFromList('${park.name.replace(/'/g, "\\'")}', ${index})">
          View Details
        </button>
        <button class="get-directions-btn" onclick="getDirections(${park.coordinates[1]}, ${park.coordinates[0]}, '${park.name.replace(/'/g, "\\'")}')">
          Get Directions
        </button>
      </div>
    </div>
  `;
}

// Filter popup functions
function showFilterPopup(filterType) {
  const popup = document.getElementById('filterPopup');
  const title = document.getElementById('filterTitle');
  const content = document.getElementById('filterContent');
  
  const filterConfigs = {
    lighting: {
      title: 'Night Lighting Options',
      content: `
        <div class="filter-option">
          <label><input type="checkbox" id="hasLighting"> Has night lighting</label>
        </div>
      `
    },
    leash: {
      title: 'Leash Requirements',
      content: `
        <div class="filter-option">
          <label><input type="checkbox" id="offLeashAllowed"> Off-leash allowed</label>
        </div>
      `
    },
    facilities: {
      title: 'Park Facilities',
      content: `
        <div class="filter-option">
          <label><input type="checkbox" id="waterFountains"> Water fountains</label>
        </div>
        <div class="filter-option">
          <label><input type="checkbox" id="toilets"> Toilets</label>
        </div>
        <div class="filter-option">
          <label><input type="checkbox" id="parking"> Parking available</label>
        </div>
      `
    }
  };
  
  const config = filterConfigs[filterType];
  if (config) {
    title.textContent = config.title;
    content.innerHTML = config.content;
    popup.classList.add('active');
  }
}

function applyFilter() {
  const filterContent = document.getElementById('filterContent');
  const checkboxes = filterContent.querySelectorAll('input[type="checkbox"]:checked');
  const filterTitle = document.getElementById('filterTitle').textContent;
  
  if (filterTitle.includes('Lighting')) {
    currentFilters.nightLighting = checkboxes.length > 0;
  } else if (filterTitle.includes('Leash')) {
    currentFilters.offLeash = Array.from(checkboxes).some(cb => cb.id === 'offLeashAllowed');
  } else if (filterTitle.includes('Facilities')) {
    currentFilters.waterFountain = Array.from(checkboxes).some(cb => cb.id === 'waterFountains');
  }
  
  updateDisplays();
  showNotification('Filter applied successfully');
  closeModal('filterPopup');
}

function updateDisplays() {
  if (document.getElementById('mapPage').classList.contains('active')) {
    displayParksOnMap();
  }
  if (document.getElementById('listPage').classList.contains('active')) {
    loadParksList();
  }
  // Also update top filter buttons active state if on home page
  syncTopFilterButtons();
}

// Keep top filter buttons' .active style in sync with currentFilters
function syncTopFilterButtons() {
  const buttons = document.querySelectorAll('.filter-bar .filter-btn, .floating-filter-content .filter-btn');
  buttons.forEach(btn => {
    const key = btn.getAttribute('data-filter-key');
    if (!key) return;
    const isActive = !!currentFilters[key];
    btn.classList.toggle('active', isActive);
  });
}

// Park details functions
function showParkDetailsFromMap(parkName, lat, lng, parkIndex) {
  const filteredParks = getFilteredParks();
  const nearestParks = getNearestParks(filteredParks, 20);
  showParkDetailsModal(nearestParks[parkIndex], lat, lng);
}

function showParkDetailsFromList(parkName, parkIndex) {
  const filteredParks = getFilteredParks();
  const nearestParks = getNearestParks(filteredParks, 20);
  const park = nearestParks[parkIndex];
  showParkDetailsModal(park, park.coordinates[1], park.coordinates[0]);
}

function showParkDetailsModal(park, lat, lng) {
  selectedPark = { name: park.name, lat, lng };
  
  const popup = document.getElementById('parkDetailsPopup');
  document.getElementById('parkName').textContent = park.name;
  
  // Generate random rating
  const rating = (Math.random() * 2 + 3).toFixed(1);
  const stars = Math.floor(rating);
  document.getElementById('parkStars').innerHTML = '★'.repeat(stars) + '☆'.repeat(5 - stars);
  document.getElementById('parkRating').textContent = rating;
  
  // Display facilities
  const allFeatures = [...park.facilities];
  if (park.isOffLeash) allFeatures.push('Off-Leash Area');
  document.getElementById('parkFeatures').innerHTML = allFeatures.map(feature => 
    `<span class="feature-tag">${feature}</span>`
  ).join('');
  
  // Generate description
  const distance = userLocation ? calculateDistance(userLocation, { lat, lng }) : 'N/A';
  document.getElementById('parkDescription').innerHTML = `
    <p>A ${park.isOffLeash ? 'dog off-leash' : 'dog-friendly'} area with ${park.facilities.length > 0 ? 'excellent facilities' : 'basic amenities'} for both pets and their owners.</p>
    ${park.address ? `<p><strong>Address:</strong> ${park.address}</p>` : ''}
    ${park.suburb ? `<p><strong>Suburb:</strong> ${park.suburb}</p>` : ''}
    <p><strong>Distance:</strong> ${distance !== 'N/A' ? distance + ' km away' : 'Distance unknown'}</p>
    <p><strong>Coordinates:</strong> ${lat.toFixed(6)}, ${lng.toFixed(6)}</p>
    ${park.hours ? `<p><strong>Hours:</strong> ${park.hours}</p>` : '<p><strong>Hours:</strong> Please check local signage</p>'}
    ${park.restrictions ? `<p><strong>Restrictions:</strong> ${park.restrictions}</p>` : ''}
  `;
  
  popup.classList.add('active');
}

function expandParkDetails() {
  showNotification('Full park details would open in expanded view');
  closeModal('parkDetailsPopup');
}

// Navigation functions
function openNavigation() {
  if (selectedPark && selectedPark.lat && selectedPark.lng) {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${selectedPark.lat},${selectedPark.lng}`;
    window.open(url, '_blank');
    showNotification(`Opening navigation to ${selectedPark.name}...`);
  }
}

function getDirections(lat, lng, parkName) {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  window.open(url, '_blank');
  showNotification(`Opening directions to ${parkName}...`);
}

function getDirectionsFromMap(lat, lng, parkName) {
  if (!userLocation) {
    getDirections(lat, lng, parkName);
    return;
  }
  
  if (!directionsService || !directionsRenderer) {
    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer();
    directionsRenderer.setMap(map);
  }
  
  const request = {
    origin: userLocation,
    destination: { lat, lng },
    travelMode: google.maps.TravelMode.DRIVING
  };
  
  directionsService.route(request, function(result, status) {
    if (status === 'OK') {
      directionsRenderer.setDirections(result);
      showNotification(`Directions to ${parkName} displayed on map`);
    } else {
      getDirections(lat, lng, parkName);
    }
  });
}

// User authentication functions
function showLogin() {
  document.getElementById('loginModal').classList.add('active');
}

function login() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  
  if (!email || !password) {
    showNotification('Please enter both email and password');
    return;
  }
  
  currentUser = {
    email: email,
    name: email.split('@')[0],
    avatar: 'https://via.placeholder.com/40'
  };
  
  updateLoginStatus();
  closeModal('loginModal');
  showNotification('Login successful!');
}

function logout() {
  currentUser = null;
  updateLoginStatus();
  showNotification('Logged out successfully');
}

function updateLoginStatus() {
  const loginBtn = document.querySelector('.login-btn');
  const userProfile = document.getElementById('userProfile');
  
  if (currentUser) {
    loginBtn.classList.add('hidden');
    userProfile.classList.remove('hidden');
    userProfile.querySelector('.profile-avatar').src = currentUser.avatar;
  } else {
    loginBtn.classList.remove('hidden');
    userProfile.classList.add('hidden');
  }
}

function checkLoginStatus() {
  const savedUser = localStorage.getItem('currentUser');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    updateLoginStatus();
  }
}

function showProfile() {
  window.location.href = 'profile.html';
}


// Preferences functions
function showPreferences() {
  if (!currentUser) {
    showNotification('Please login to view saved preferences');
    showLogin();
    return;
  }
  
  const modal = document.getElementById('preferencesModal');
  document.getElementById('savedPreferences').innerHTML = `
    <div style="text-align: center; padding: 20px; color: #666;">
      <i class="fas fa-heart" style="font-size: 48px; margin-bottom: 20px;"></i>
      <h3>No Saved Preferences Yet</h3>
      <p>Start using filters and save your preferences to see them here</p>
    </div>
  `;
  modal.classList.add('active');
}

// About functions
function showAbout() {
  document.getElementById('aboutModal').classList.add('active');
}

// Utility functions
function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

function showNotification(message) {
  // Remove existing notifications
  const existingNotifications = document.querySelectorAll('.notification');
  existingNotifications.forEach(n => n.remove());
  
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.style.cssText = `
    position: fixed; top: 90px; right: 20px; background: #4a90e2; color: white;
    padding: 15px 25px; border-radius: 8px; box-shadow: 0 5px 20px rgba(0,0,0,0.2);
    z-index: 3000; max-width: 300px; transform: translateX(100%); opacity: 0;
    transition: all 0.3s ease; font-size: 14px; line-height: 1.4;
  `;
  
  notification.textContent = message;
  document.body.appendChild(notification);
  
  // Trigger animation
  setTimeout(() => {
    notification.style.transform = 'translateX(0)';
    notification.style.opacity = '1';
  }, 10);
  
  // Remove notification after 4 seconds
  setTimeout(() => {
    notification.style.transform = 'translateX(100%)';
    notification.style.opacity = '0';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 4000);
}
