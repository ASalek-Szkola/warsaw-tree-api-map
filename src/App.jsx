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
  const [resourceType, setResourceType] = useState("TREES");
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
      species: pick(record, ["gatunek", "gatunek_nazwa", "rodzaj"]),
      speciesLatin: pick(record, ["gatunek_1", "nazwa_lacinska"]),
      district: pick(record, ["dzielnica", "district"]),
      address: pick(record, ["adres", "ulica", "miejsce", "adr_es"]),
      addressNumber: pick(record, ["numer_adres"]),
      location: pick(record, ["lokalizacja"]),
      height: pick(record, ["wysokosc", "wysokosc_m", "height"]),
      health: pick(record, ["stan_zdrowia", "stan", "kondycja"]),
      circumference: pick(record, ["pnie_obwod"]),
      crownDiameter: pick(record, ["srednica_k"]),
      ageDays: pick(record, ["wiek_w_dni"]),
      measurementDate: pick(record, ["data_wyk_pom"]),
      inventoryNumber: pick(record, ["numer_inw"]),
      entity: pick(record, ["jednostka"]),
      miasto: pick(record, ["miasto"]),
      x_pl2000: record.x_pl2000 || "-",
      y_pl2000: record.y_pl2000 || "-",
      id_obrysu: record.id_obrysu || null,
      type: resourceType
    };
  };

  const loadTrees = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setIsError(false);
    setRecords([]);

    const params = {
      resourceType,
      district: district.trim(),
      query: query.trim(),
      limit: noLimit ? undefined : Math.min(Math.max(limit, 1), 100000),
    };

    const previewUrl = buildApiUrl(params);
    setEndpointUrl(new URL(previewUrl, window.location.origin).toString());

    try {
      let rawRecords = [];
      if (noLimit) {
        rawRecords = await fetchPagedRecords({ 
          resourceType,
          district: params.district, 
          query: params.query,
          onProgress: ({ offset, total, url }) => {
            setEndpointUrl(url);
            setStatus(
              total === null
                ? `Pobieram dane (offset ${offset})...`
                : `Pobieram dane (${Math.min(offset + 100000, total)} / ${total})...`
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
            gatunek_lacina: t.speciesLatin,
            dzielnica: t.district,
            adres: t.address,
            nr_adres: t.addressNumber,
            lokalizacja: t.location,
            wysokosc: t.height,
            obwod: t.circumference,
            srednica_korony: t.crownDiameter,
            stan_zdrowia: t.health,
            wiek_dni: t.ageDays,
            data_pomiaru: t.measurementDate,
            nr_inw: t.inventoryNumber,
            jednostka: t.entity,
            id_obrysu: t.id_obrysu,
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
          <p className="lead">Testowy podgląd danych z endpointu <code>datastore_search</code>.</p>
          <p style={{ fontSize: '0.8rem', marginTop: '4px' }}>
            <a href="https://pl.doczz.net/doc/1897859/drzewa---api-um-warszawa" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: '500' }}>
              ↗ Zobacz dokumentację źródłową API
            </a>
          </p>
        </div>

        <form className="filters" onSubmit={loadTrees}>
          <label>
            Typ zasobu
            <select value={resourceType} onChange={(e) => setResourceType(e.target.value)} style={{ padding: '11px', borderRadius: '7px', border: '1px solid var(--line)', background: '#fbfcfb', font: 'inherit' }}>
              <option value="TREES">Pojedyncze drzewa</option>
              <option value="GROUPS">Grupy drzew</option>
            </select>
          </label>
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
            <input type="number" value={limit} onChange={(e) => setLimit(parseInt(e.target.value))} disabled={noLimit} min="1" max="100000" />
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
            <CircleMarker key={idx} center={[t.lat, t.lon]} radius={t.type === 'GROUPS' ? 10 : 6} color={t.type === 'GROUPS' ? "#2a4d69" : "#184b34"} weight={2} fillColor={t.type === 'GROUPS' ? "#4b86b4" : "#36a46c"} fillOpacity={0.78}>
              <Popup>
                <div className="popup-title">
                  {t.species} 
                  {t.speciesLatin !== '-' && <span style={{ fontStyle: 'italic', fontSize: '0.9em', opacity: 0.8 }}> ({t.speciesLatin})</span>}
                  {t.id_obrysu ? ` (Grupa: ${t.id_obrysu})` : ''}
                </div>
                <div className="popup-meta">
                  <strong>Dzielnica:</strong> {t.district}<br />
                  <strong>Adres:</strong> {t.address} {t.addressNumber !== '-' ? t.addressNumber : ''}<br />
                  {t.location !== '-' && <><strong>Lokalizacja:</strong> {t.location}<br /></>}
                  <hr style={{ margin: '8px 0', border: '0', borderTop: '1px solid #eee' }} />
                  <strong>Wysokość:</strong> {t.height} m<br />
                  <strong>Obwód pnia:</strong> {t.circumference} cm<br />
                  <strong>Średnica korony:</strong> {t.crownDiameter} m<br />
                  <strong>Stan:</strong> {t.health}<br />
                  <strong>Wiek:</strong> {t.ageDays} dni<br />
                  <small style={{ display: 'block', marginTop: '4px', opacity: 0.6 }}>Data pomiaru: {t.measurementDate}</small>
                  <small style={{ display: 'block', opacity: 0.6 }}>Nr inw: {t.inventoryNumber}</small>
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
                <th>Lokalizacja / Adres</th>
                <th>Wys. (m)</th>
                <th>Obwód (cm)</th>
                <th>Korona (m)</th>
                <th>Stan</th>
                <th>Wiek (dni)</th>
                <th>Data pomiaru</th>
                <th>Nr inw.</th>
                <th>WGS84</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr><td colSpan="10" className="empty">Wybierz parametry i pobierz dane.</td></tr>
              ) : (
                records.map((t, idx) => (
                  <tr key={idx}>
                    <td>
                      <div style={{ fontWeight: '500' }}>{t.species} {t.id_obrysu ? `(G: ${t.id_obrysu})` : ''}</div>
                      <small style={{ opacity: 0.6, fontStyle: 'italic' }}>{t.speciesLatin !== '-' ? t.speciesLatin : ''}</small>
                    </td>
                    <td>
                      <div>{t.district}</div>
                      <small style={{ opacity: 0.8 }}>{t.address} {t.addressNumber !== '-' ? t.addressNumber : ''}</small>
                      {t.location !== '-' && <div style={{ fontSize: '0.85em', color: '#666' }}>({t.location})</div>}
                    </td>
                    <td>{t.height}</td>
                    <td>{t.circumference}</td>
                    <td>{t.crownDiameter}</td>
                    <td>{t.health}</td>
                    <td>{t.ageDays}</td>
                    <td>{t.measurementDate}</td>
                    <td>{t.inventoryNumber}</td>
                    <td style={{ fontSize: '0.85em', fontFamily: 'monospace' }}>
                      {t.lat !== null && t.lon !== null ? `${t.lat.toFixed(5)}, ${t.lon.toFixed(5)}` : "-"}
                    </td>
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
