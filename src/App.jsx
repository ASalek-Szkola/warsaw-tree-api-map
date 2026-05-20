import React, { useState, useEffect, useCallback, useRef } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import { buildApiUrl, fetchPagedRecords, fetchSinglePage } from "./api";

const WARSAW_CENTER = [52.2297, 21.0122];

// Component to handle map bounds when records change
function MapBoundsSetter({ records }) {
  const map = useMap();

  useEffect(() => {
    if (!records || records.length === 0) {
      map.setView(WARSAW_CENTER, 11);
      return;
    }

    const points = records
      .filter((t) => t.lat !== null && t.lon !== null)
      .map((t) => [t.lat, t.lon]);

    if (points.length > 0) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds.pad(0.14), { maxZoom: 16 });
    } else {
      map.setView(WARSAW_CENTER, 11);
    }
  }, [records, map]);

  return null;
}

function App() {
  const [district, setDistrict] = useState("");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(50);
  const [noLimit, setNoLimit] = useState(false);
  const [records, setRecords] = useState([]);
  const [status, setStatus] = useState("Gotowe do pobrania danych.");
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [endpointUrl, setEndpointUrl] = useState("");

  const normalizeTree = (record) => {
    const lon = Number(record.x_wgs84 ?? record.lon ?? record.longitude);
    const lat = Number(record.y_wgs84 ?? record.lat ?? record.latitude);

    const pick = (rec, keys) => {
      for (const key of keys) {
        const value = rec[key];
        if (value !== undefined && value !== null && String(value).trim() !== "") {
          return String(value);
        }
      }
      return "-";
    };

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
  };

  const loadTrees = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setIsError(false);
    setRecords([]);

    const params = {
      district: district.trim(),
      query: query.trim(),
      limit: noLimit ? undefined : Math.min(Math.max(limit, 1), 500),
    };

    const previewUrl = buildApiUrl(params);
    setEndpointUrl(new URL(previewUrl, window.location.origin).toString());

    try {
      let rawRecords = [];
      if (noLimit) {
        rawRecords = await fetchPagedRecords({ 
          district: params.district, 
          query: params.query,
          onProgress: ({ offset, total, url }) => {
            setEndpointUrl(url);
            setStatus(
              total === null
                ? `Pobieram dane (offset ${offset})...`
                : `Pobieram dane (${Math.min(offset + 1000, total)} / ${total})...`
            );
          }
        });
      } else {
        setStatus("Pobieram dane z API UM Warszawa...");
        rawRecords = await fetchSinglePage(previewUrl);
      }

      const normalized = rawRecords.map(normalizeTree);
      setRecords(normalized);
      setStatus(`Pobrano ${normalized.length} rekordow.`);
    } catch (error) {
      console.error(error);
      setStatus(`Nie udalo sie pobrac danych: ${error.message}`);
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadGeoJson = () => {
    const geojson = {
      type: "FeatureCollection",
      features: records
        .filter((t) => t.lat !== null && t.lon !== null)
        .map((t) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [t.lon, t.lat] },
          properties: {
            gatunek: t.species,
            dzielnica: t.district,
            adres: t.address,
            wysokosc: t.height,
            stan_zdrowia: t.health,
            source: t.raw,
          },
        })),
    };

    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "warszawa-drzewa.geojson";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="app-shell">
      <section className="control-panel">
        <div className="title-block">
          <p className="eyebrow">API UM Warszawa</p>
          <h1>Drzewa w Warszawie</h1>
          <p className="lead">Testowy podglad danych z endpointu <code>datastore_search</code>.</p>
        </div>

        <form className="filters" onSubmit={loadTrees}>
          <label>
            Dzielnica
            <input value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="np. Wola" />
          </label>
          <label>
            Gatunek lub tekst
            <input value={query} onChange={(e) => setQuery(e.target.value)} type="search" placeholder="np. dab, lipa" />
          </label>
          <label>
            Limit
            <input type="number" value={limit} onChange={(e) => setLimit(parseInt(e.target.value))} disabled={noLimit} min="1" max="500" />
          </label>
          <label className="nolimit">
            <input type="checkbox" checked={noLimit} onChange={(e) => setNoLimit(e.target.checked)} />
            Bez limitu (pobierz wszystko)
          </label>

          <div className="actions">
            <button type="submit" disabled={isLoading}>Pobierz drzewa</button>
            <button type="button" className="secondary" disabled={records.length === 0} onClick={downloadGeoJson}>GeoJSON</button>
          </div>
        </form>

        <div className={`status-row ${isError ? "error" : ""}`}>
          <strong>{status}</strong>
          <span id="endpoint-preview">{endpointUrl}</span>
        </div>
      </section>

      <section className="map-panel">
        <MapContainer center={WARSAW_CENTER} zoom={11} style={{ height: "100%", width: "100%" }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>' />
          <MapBoundsSetter records={records} />
          {records.filter(t => t.lat !== null && t.lon !== null).map((t, idx) => (
            <CircleMarker key={idx} center={[t.lat, t.lon]} radius={6} color="#184b34" weight={2} fillColor="#36a46c" fillOpacity={0.78}>
              <Popup>
                <div className="popup-title">{t.species}</div>
                <div className="popup-meta">
                  {t.district}<br />
                  {t.address}<br />
                  Wysokosc: {t.height}<br />
                  Stan: {t.health}
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </section>

      <section className="results-panel">
        <div className="results-header">
          <h2>Wyniki</h2>
          <span>{records.length} rekordow</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Gatunek</th>
                <th>Dzielnica</th>
                <th>Adres / lokalizacja</th>
                <th>Wysokosc</th>
                <th>Stan</th>
                <th>WGS84</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr><td colSpan="6" className="empty">Wybierz parametry i pobierz dane.</td></tr>
              ) : (
                records.map((t, idx) => (
                  <tr key={idx}>
                    <td>{t.species}</td>
                    <td>{t.district}</td>
                    <td>{t.address}</td>
                    <td>{t.height}</td>
                    <td>{t.health}</td>
                    <td>{t.lat !== null && t.lon !== null ? `${t.lat.toFixed(6)}, ${t.lon.toFixed(6)}` : "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

export default App;
