import L from "leaflet";
import "leaflet/dist/leaflet.css";

const RESOURCE_ID = "ed6217dd-c8d0-4f7b-8bed-3b7eb81a95ba";
const API_URL = "/api/warsaw/api/action/datastore_search";
const API_KEY = import.meta.env.VITE_WARSAW_API_KEY;
const WARSAW_CENTER = [52.2297, 21.0122];

const form = document.querySelector("#tree-form");
const statusBox = document.querySelector(".status-row");
const statusText = document.querySelector("#status");
const endpointPreview = document.querySelector("#endpoint-preview");
const resultsBody = document.querySelector("#results-body");
const countText = document.querySelector("#count");
const downloadButton = document.querySelector("#download-geojson");
const limitInput = document.querySelector("#limit");
const noLimitCheckbox = document.querySelector("#no-limit");

let currentRecords = [];
let map;
let markersLayer;

function initMap() {
  map = L.map("map", { zoomControl: true }).setView(WARSAW_CENTER, 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);
  markersLayer = L.layerGroup().addTo(map);
}

function buildApiUrl({ district, query, limit, offset }) {
  const params = new URLSearchParams();
  params.set("resource_id", RESOURCE_ID);
  // Only include `limit` when it's a finite number; omit when null/undefined
  if (Number.isFinite(limit)) {
    params.set("limit", String(limit));
  }
  if (Number.isFinite(offset) && offset > 0) {
    params.set("offset", String(offset));
  }
  if (API_KEY) {
    params.set("apikey", API_KEY);
  }

  if (district) {
    params.set("filters", JSON.stringify({ dzielnica: district }));
  }

  if (query) {
    params.set("q", query);
  }

  // Return a relative URL so the dev-server proxy matches the path correctly
  return `${API_URL}?${params.toString()}`;
}

async function fetchPagedRecords({ district, query }) {
  const pageLimit = 1000;
  let offset = 0;
  let allRecords = [];
  let total = null;

  while (true) {
    const url = buildApiUrl({ district, query, limit: pageLimit, offset });
    setStatus(
      total === null
        ? `Pobieram dane (offset ${offset})...`
        : `Pobieram dane (${Math.min(offset + pageLimit, total)} / ${total})...`
    );

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (payload.success === false) {
      console.error("API payload error:", payload);
      throw new Error(payload.error?.message || "API zwrocilo success=false");
    }

    const records = Array.isArray(payload.result?.records)
      ? payload.result.records
      : [];
    if (total === null && Number.isFinite(payload.result?.total)) {
      total = payload.result.total;
    }

    if (!records.length) {
      break;
    }

    allRecords = allRecords.concat(records);
    offset += pageLimit;

    if (total !== null && offset >= total) {
      break;
    }
  }

  return allRecords;
}

function normalizeTree(record) {
  const lon = Number(record.x_wgs84 ?? record.lon ?? record.longitude);
  const lat = Number(record.y_wgs84 ?? record.lat ?? record.latitude);

  return {
    raw: record,
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    species: pick(record, ["gatunek", "gatunek_nazwa", "nazwa_lacinska", "rodzaj"]),
    district: pick(record, ["dzielnica", "district"]),
    address: pick(record, ["adres", "lokalizacja", "ulica", "miejsce"]),
    height: pick(record, ["wysokosc", "wysokosc_m", "height"]),
    health: pick(record, ["stan_zdrowia", "stan", "kondycja"]),
  };
}

function pick(record, keys) {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value);
    }
  }
  return "-";
}

async function loadTrees(event) {
  event.preventDefault();

  const formData = new FormData(form);
  const omitLimit = !!(noLimitCheckbox && noLimitCheckbox.checked);
  const params = {
    district: String(formData.get("district") || "").trim(),
    query: String(formData.get("query") || "").trim(),
    limit: omitLimit ? undefined : clamp(Number(formData.get("limit")), 1, 500),
  };
  const url = buildApiUrl(params);

  setStatus("Pobieram dane z API UM Warszawa...");
  // `buildApiUrl` now returns a relative path string; show absolute preview
  endpointPreview.textContent = new URL(url, window.location.origin).toString();
  downloadButton.disabled = true;

  try {
    let records = [];
    if (omitLimit) {
      records = await fetchPagedRecords({
        district: params.district,
        query: params.query,
      });
    } else {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      if (payload.success === false) {
        console.error("API payload error:", payload);
        throw new Error(payload.error?.message || "API zwrocilo success=false");
      }

      records = Array.isArray(payload.result?.records) ? payload.result.records : [];
      if (!records.length) {
        console.warn("API payload missing records:", payload);
      }
    }

    currentRecords = records.map(normalizeTree);
    renderResults(currentRecords);
    renderMap(currentRecords);
    setStatus(`Pobrano ${currentRecords.length} rekordow.`);
    downloadButton.disabled = currentRecords.length === 0;
  } catch (error) {
    currentRecords = [];
    renderResults(currentRecords);
    renderMap(currentRecords);
    setStatus(`Nie udalo sie pobrac danych: ${error.message}`, true);
  }
}

function renderResults(records) {
  countText.textContent = `${records.length} rekordow`;

  if (records.length === 0) {
    resultsBody.innerHTML =
      '<tr><td colspan="6" class="empty">Brak danych do wyswietlenia.</td></tr>';
    return;
  }

  resultsBody.innerHTML = records
    .map((tree) => {
      const coords =
        tree.lat !== null && tree.lon !== null
          ? `${tree.lat.toFixed(6)}, ${tree.lon.toFixed(6)}`
          : "-";

      return `
        <tr>
          <td>${escapeHtml(tree.species)}</td>
          <td>${escapeHtml(tree.district)}</td>
          <td>${escapeHtml(tree.address)}</td>
          <td>${escapeHtml(tree.height)}</td>
          <td>${escapeHtml(tree.health)}</td>
          <td>${coords}</td>
        </tr>
      `;
    })
    .join("");
}

function renderMap(records) {
  if (!map || !markersLayer) {
    return;
  }

  markersLayer.clearLayers();
  const markers = records
    .filter((tree) => tree.lat !== null && tree.lon !== null)
    .map((tree) => {
      const marker = L.circleMarker([tree.lat, tree.lon], {
        radius: 6,
        color: "#184b34",
        weight: 2,
        fillColor: "#36a46c",
        fillOpacity: 0.78,
      });
      marker.bindPopup(`
        <div class="popup-title">${escapeHtml(tree.species)}</div>
        <div class="popup-meta">
          ${escapeHtml(tree.district)}<br />
          ${escapeHtml(tree.address)}<br />
          Wysokosc: ${escapeHtml(tree.height)}<br />
          Stan: ${escapeHtml(tree.health)}
        </div>
      `);
      marker.addTo(markersLayer);
      return marker;
    });

  if (markers.length > 0) {
    map.fitBounds(L.featureGroup(markers).getBounds().pad(0.14), {
      maxZoom: 16,
    });
  } else {
    map.setView(WARSAW_CENTER, 11);
  }
}

function downloadGeoJson() {
  const geojson = {
    type: "FeatureCollection",
    features: currentRecords
      .filter((tree) => tree.lat !== null && tree.lon !== null)
      .map((tree) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [tree.lon, tree.lat],
        },
        properties: {
          gatunek: tree.species,
          dzielnica: tree.district,
          adres: tree.address,
          wysokosc: tree.height,
          stan_zdrowia: tree.health,
          source: tree.raw,
        },
      })),
  };

  const blob = new Blob([JSON.stringify(geojson, null, 2)], {
    type: "application/geo+json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "warszawa-drzewa.geojson";
  link.click();
  URL.revokeObjectURL(url);
}

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusBox.classList.toggle("error", isError);
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

form.addEventListener("submit", loadTrees);
downloadButton.addEventListener("click", downloadGeoJson);
if (noLimitCheckbox && limitInput) {
  // Keep UX in sync: disable numeric input when "Bez limitu" is checked.
  // Initialize state on load in case the checkbox is pre-checked.
  limitInput.disabled = noLimitCheckbox.checked;
  noLimitCheckbox.addEventListener("change", () => {
    limitInput.disabled = noLimitCheckbox.checked;
  });
}
initMap();
