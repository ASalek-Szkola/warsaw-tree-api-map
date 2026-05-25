import React, { useState, useEffect } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import { buildApiUrl, fetchPagedRecords, fetchSinglePage } from "./api";

const WARSAW_CENTER = [52.2297, 21.0122];

const VIEW_CONFIG = {
  TREES: {
    label: "Mapa drzew",
    title: "Drzewa w Warszawie",
    description: "Podglad danych drzew i grup drzew z endpointu",
    resourceOptions: [
      { value: "TREES", label: "Pojedyncze drzewa" },
      { value: "GROUPS", label: "Grupy drzew" },
    ],
  },
  SHRUBS: {
    label: "Mapa krzewow",
    title: "Krzewy w Warszawie",
    description: "Podglad danych krzewow z endpointu",
    resourceOptions: [{ value: "SHRUBS", label: "Krzewy" }],
  },
  FORESTS: {
    label: "Mapa lasow",
    title: "Lasy w Warszawie",
    description: "Podglad wydzielen lesnych z endpointu",
    resourceOptions: [{ value: "FORESTS", label: "Lasy" }],
  },
};

function pick(rec, keys) {
  for (const key of keys) {
    const value = rec[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value);
    }
  }
  return "-";
}

function normalizeRecord(record, resourceType) {
  const lon = Number(record.x_wgs84 ?? record.lon ?? record.longitude);
  const lat = Number(record.y_wgs84 ?? record.lat ?? record.latitude);

  if (resourceType === "FORESTS") {
    return {
      raw: record,
      lat: Number.isFinite(lat) ? lat : null,
      lon: Number.isFinite(lon) ? lon : null,
      district: pick(record, ["dzielnica"]),
      forestArea: pick(record, ["obwod", "obw\u00f3d"]),
      settlement: pick(record, ["osiedle"]),
      divisionNo: pick(record, ["nr_oddz"]),
      subDivision: pick(record, ["poddz"]),
      area: pick(record, ["powierzchnia"]),
      habitatType: pick(record, ["stl"]),
      layer: pick(record, ["powierzchnia1"]),
      dominantSpecies: pick(record, ["gat_panujacy"]),
      speciesShare: pick(record, ["udzial", "udzia\u0142"]),
      ageYears: pick(record, ["wiek"]),
      bonitation: pick(record, ["bonitacja"]),
      afforestation: pick(record, ["zadrzewienie"]),
      canopyClosure: pick(record, ["zwarcie"]),
      mixing: pick(record, ["zmieszanie"]),
      undergrowth: pick(record, ["podrost"]),
      understory: pick(record, ["podszyt"]),
      planType: pick(record, ["typ_planu"]),
      plan: pick(record, ["planu"]),
      planValidity: pick(record, ["obowiazywanie", "obowi\u0105zywanie"]),
      x: pick(record, ["x_pl2000"]),
      y: pick(record, ["y_pl2000"]),
      type: resourceType,
    };
  }

  return {
    raw: record,
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    species: pick(record, ["gatunek", "gatunek_nazwa", "rodzaj"]),
    speciesLatin: pick(record, ["gatunek1", "gatunek_1", "nazwa_lacinska"]),
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
    city: pick(record, ["miasto"]),
    x: pick(record, ["x", "x_pl2000"]),
    y: pick(record, ["y", "y_pl2000"]),
    outlineId: pick(record, ["id_obrysu"]),
    type: resourceType,
  };
}

function MapBoundsSetter({ records }) {
  const map = useMap();

  useEffect(() => {
    if (!records || records.length === 0) {
      map.setView(WARSAW_CENTER, 11);
      return;
    }

    const points = records
      .filter((record) => record.lat !== null && record.lon !== null)
      .map((record) => [record.lat, record.lon]);

    if (points.length > 0) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds.pad(0.14), { maxZoom: 16 });
      return;
    }

    map.setView(WARSAW_CENTER, 11);
  }, [records, map]);

  return null;
}

function App() {
  const [activeView, setActiveView] = useState("TREES");
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

  const currentView = VIEW_CONFIG[activeView];
  const currentResourceType = activeView === "TREES" ? resourceType : activeView;
  const itemLabel = activeView === "SHRUBS" ? "krzewy" : activeView === "FORESTS" ? "lasy" : "drzewa";

  useEffect(() => {
    setRecords([]);
    setStatus(`Gotowe do pobrania danych dla widoku: ${currentView.label.toLowerCase()}.`);
    setIsError(false);
    setEndpointUrl("");

    if (activeView !== "TREES") {
      setResourceType(activeView);
    } else if (resourceType === "SHRUBS" || resourceType === "FORESTS") {
      setResourceType("TREES");
    }
  }, [activeView]);

  const loadRecords = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setIsError(false);
    setRecords([]);

    const params = {
      resourceType: currentResourceType,
      district: district.trim(),
      query: query.trim(),
      limit: noLimit ? undefined : Math.min(Math.max(limit || 1, 1), 100000),
    };

    const previewUrl = buildApiUrl(params);
    setEndpointUrl(new URL(previewUrl, window.location.origin).toString());

    try {
      let rawRecords = [];

      if (noLimit) {
        rawRecords = await fetchPagedRecords({
          resourceType: currentResourceType,
          district: params.district,
          query: params.query,
          onProgress: ({ offset, total, url }) => {
            setEndpointUrl(url);
            setStatus(
              total === null
                ? `Pobieram dane (offset ${offset})...`
                : `Pobieram dane (${Math.min(offset + 100000, total)} / ${total})...`
            );
          },
        });
      } else {
        setStatus("Pobieram dane z API UM Warszawa...");
        rawRecords = await fetchSinglePage(previewUrl);
      }

      const normalized = rawRecords.map((record) => normalizeRecord(record, currentResourceType));
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
        .filter((record) => record.lat !== null && record.lon !== null)
        .map((record) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [record.lon, record.lat] },
          properties: {
            gatunek: record.species,
            gatunek_lacina: record.speciesLatin,
            dzielnica: record.district,
            adres: record.address,
            nr_adres: record.addressNumber,
            lokalizacja: record.location,
            wysokosc: record.height,
            obwod: record.circumference,
            srednica_korony: record.crownDiameter,
            stan_zdrowia: record.health,
            wiek_dni: record.ageDays,
            data_pomiaru: record.measurementDate,
            nr_inw: record.inventoryNumber,
            jednostka: record.entity,
            id_obrysu: record.outlineId,
            source: record.raw,
          },
        })),
    };

    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download =
      activeView === "SHRUBS"
        ? "warszawa-krzewy.geojson"
        : activeView === "FORESTS"
          ? "warszawa-lasy.geojson"
          : "warszawa-drzewa.geojson";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="eyebrow">API UM Warszawa</span>
          <strong>Mapa zieleni</strong>
        </div>
        <nav className="topbar-tabs" aria-label="Widoki mapy">
          {Object.entries(VIEW_CONFIG).map(([key, view]) => (
            <button
              key={key}
              type="button"
              className={`tab-button ${activeView === key ? "active" : ""}`}
              onClick={() => setActiveView(key)}
            >
              {view.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="app-shell">
        <section className="control-panel">
          <div className="title-block">
            {activeView === "TREES" ? (
              <>
                <p className="eyebrow">API UM Warszawa</p>
                <h1>Drzewa w Warszawie</h1>
                <p className="lead">
                  Testowy podglad danych z endpointu <code>datastore_search</code>.
                </p>
                <p className="source-link">
                  <a
                    href="https://pl.doczz.net/doc/1897859/drzewa---api-um-warszawa"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    ↗ Zobacz dokumentacje zrodlowa API
                  </a>
                </p>
              </>
            ) : (
              <>
                <p className="eyebrow">CKAN datastore_search</p>
                <h1>{currentView.title}</h1>
                <p className="lead">
                  {currentView.description} <code>datastore_search</code>.
                </p>
                <p className="source-link">
                  <a
                    href="https://api.um.warszawa.pl/api/action/datastore_search"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Otworz endpoint API
                  </a>
                </p>
              </>
            )}
          </div>

          <form className="filters" onSubmit={loadRecords}>
            {activeView === "TREES" ? (
              <label>
                Typ zasobu
                <select value={resourceType} onChange={(event) => setResourceType(event.target.value)}>
                  {currentView.resourceOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                Typ zasobu
                <input value={activeView === "FORESTS" ? "Lasy" : "Krzewy"} disabled readOnly />
              </label>
            )}

            <label>
              Dzielnica
              <input value={district} onChange={(event) => setDistrict(event.target.value)} placeholder="np. Wola" />
            </label>

            <label>
              Gatunek lub tekst
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                type="search"
                placeholder="np. tawula, zylistek"
              />
            </label>

            <label>
              Limit
              <input
                type="number"
                value={limit}
                onChange={(event) => setLimit(parseInt(event.target.value, 10) || 1)}
                disabled={noLimit}
                min="1"
                max="100000"
              />
            </label>

            <label className="nolimit">
              <input type="checkbox" checked={noLimit} onChange={(event) => setNoLimit(event.target.checked)} />
              Bez limitu (pobierz wszystko)
            </label>

            <div className="actions">
              <button type="submit" disabled={isLoading}>
                {isLoading ? "Pobieranie..." : `Pobierz ${itemLabel}`}
              </button>
              <button type="button" className="secondary" disabled={records.length === 0} onClick={downloadGeoJson}>
                GeoJSON
              </button>
            </div>
          </form>

          <div className={`status-row ${isError ? "error" : ""}`}>
            <strong>{status}</strong>
            <span id="endpoint-preview">{endpointUrl}</span>
          </div>
        </section>

        <section className="map-panel">
          <MapContainer center={WARSAW_CENTER} zoom={11} style={{ height: "100%", width: "100%" }}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>'
            />
            <MapBoundsSetter records={records} />
            {records
              .filter((record) => record.lat !== null && record.lon !== null)
              .map((record, idx) => {
                const isGroup = record.type === "GROUPS";
                const isShrub = record.type === "SHRUBS";
                const isForest = record.type === "FORESTS";

                return (
                  <CircleMarker
                    key={idx}
                    center={[record.lat, record.lon]}
                    radius={isGroup ? 10 : isForest ? 7 : isShrub ? 5 : 6}
                    color={isGroup ? "#2a4d69" : isForest ? "#2f2d1f" : isShrub ? "#7a4f1d" : "#184b34"}
                    weight={2}
                    fillColor={isGroup ? "#4b86b4" : isForest ? "#6b7a2b" : isShrub ? "#c8893f" : "#36a46c"}
                    fillOpacity={0.78}
                  >
                    <Popup>
                      {record.type === "FORESTS" ? (
                        <>
                          <div className="popup-title">{record.forestArea}</div>
                          <div className="popup-meta">
                            <strong>Dzielnica:</strong> {record.district}
                            <br />
                            <strong>Osiedle:</strong> {record.settlement}
                            <br />
                            <strong>Oddzial:</strong> {record.divisionNo}
                            {record.subDivision !== "-" ? ` / ${record.subDivision}` : ""}
                            <br />
                            <hr />
                            <strong>Gatunek panujacy:</strong> {record.dominantSpecies}
                            <br />
                            <strong>Wiek:</strong> {record.ageYears} {record.ageYears !== "-" ? "lat" : ""}
                            <br />
                            <strong>Typ siedliskowy:</strong> {record.habitatType}
                            <br />
                            <small>Plan: {record.planValidity}</small>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="popup-title">
                            {record.species}
                            {record.speciesLatin !== "-" && (
                              <span className="popup-latin"> ({record.speciesLatin})</span>
                            )}
                            {record.outlineId !== "-" ? ` (Grupa: ${record.outlineId})` : ""}
                          </div>
                          <div className="popup-meta">
                            <strong>Dzielnica:</strong> {record.district}
                            <br />
                            <strong>Adres:</strong> {record.address}{" "}
                            {record.addressNumber !== "-" ? record.addressNumber : ""}
                            <br />
                            {record.location !== "-" && (
                              <>
                                <strong>Lokalizacja:</strong> {record.location}
                                <br />
                              </>
                            )}
                            <hr />
                            <strong>Wysokosc:</strong> {record.height} {record.height !== "-" ? "m" : ""}
                            <br />
                            <strong>Obwod pnia:</strong> {record.circumference}{" "}
                            {record.circumference !== "-" ? "cm" : ""}
                            <br />
                            <strong>Srednica korony:</strong> {record.crownDiameter}{" "}
                            {record.crownDiameter !== "-" ? "m" : ""}
                            <br />
                            <strong>Stan:</strong> {record.health}
                            <br />
                            <strong>Wiek:</strong> {record.ageDays} {record.ageDays !== "-" ? "dni" : ""}
                            <br />
                            <small>Data pomiaru: {record.measurementDate}</small>
                            <small>Nr inw: {record.inventoryNumber}</small>
                          </div>
                        </>
                      )}
                    </Popup>
                  </CircleMarker>
                );
              })}
          </MapContainer>
        </section>

        <section className="results-panel">
          <div className="results-header">
            <h2>Wyniki</h2>
            <span>{records.length} rekordow</span>
          </div>
          <div className="table-wrap">
            {activeView === "FORESTS" ? (
              <table>
                <thead>
                  <tr>
                    <th>Obwod</th>
                    <th>Dzielnica / Osiedle</th>
                    <th>Oddzial</th>
                    <th>Pow. (ha)</th>
                    <th>STL</th>
                    <th>Gatunek panujacy</th>
                    <th>Wiek (lata)</th>
                    <th>Plan</th>
                    <th>WGS84</th>
                  </tr>
                </thead>
                <tbody>
                  {records.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="empty">
                        Wybierz parametry i pobierz dane.
                      </td>
                    </tr>
                  ) : (
                    records.map((record, idx) => (
                      <tr key={idx}>
                        <td>
                          <div className="species-cell">{record.forestArea}</div>
                        </td>
                        <td>
                          <div>{record.district}</div>
                          <small className="address-cell">{record.settlement}</small>
                        </td>
                        <td>
                          {record.divisionNo}
                          {record.subDivision !== "-" ? `/${record.subDivision}` : ""}
                        </td>
                        <td>{record.area}</td>
                        <td>{record.habitatType}</td>
                        <td>{record.dominantSpecies}</td>
                        <td>{record.ageYears}</td>
                        <td>{record.planValidity}</td>
                        <td className="coords-cell">
                          {record.lat !== null && record.lon !== null
                            ? `${record.lat.toFixed(5)}, ${record.lon.toFixed(5)}`
                            : "-"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Gatunek</th>
                    <th>Lokalizacja / Adres</th>
                    <th>Wys. (m)</th>
                    <th>Obwod (cm)</th>
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
                    <tr>
                      <td colSpan="10" className="empty">
                        Wybierz parametry i pobierz dane.
                      </td>
                    </tr>
                  ) : (
                    records.map((record, idx) => (
                      <tr key={idx}>
                        <td>
                          <div className="species-cell">
                            {record.species} {record.outlineId !== "-" ? `(G: ${record.outlineId})` : ""}
                          </div>
                          <small className="latin-cell">
                            {record.speciesLatin !== "-" ? record.speciesLatin : ""}
                          </small>
                        </td>
                        <td>
                          <div>{record.district}</div>
                          <small className="address-cell">
                            {record.address} {record.addressNumber !== "-" ? record.addressNumber : ""}
                          </small>
                          {record.location !== "-" && <div className="location-cell">({record.location})</div>}
                        </td>
                        <td>{record.height}</td>
                        <td>{record.circumference}</td>
                        <td>{record.crownDiameter}</td>
                        <td>{record.health}</td>
                        <td>{record.ageDays}</td>
                        <td>{record.measurementDate}</td>
                        <td>{record.inventoryNumber}</td>
                        <td className="coords-cell">
                          {record.lat !== null && record.lon !== null
                            ? `${record.lat.toFixed(5)}, ${record.lon.toFixed(5)}`
                            : "-"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
