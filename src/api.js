const RESOURCE_ID = "ed6217dd-c8d0-4f7b-8bed-3b7eb81a95ba";
const API_URL = "/api/warsaw/api/action/datastore_search";

export const buildApiUrl = ({ district, query, limit, offset }) => {
  const params = new URLSearchParams();
  params.set("resource_id", RESOURCE_ID);
  if (Number.isFinite(limit)) params.set("limit", String(limit));
  if (Number.isFinite(offset) && offset > 0) params.set("offset", String(offset));
  if (district) params.set("filters", JSON.stringify({ dzielnica: district }));
  if (query) params.set("q", query);

  return `${API_URL}?${params.toString()}`;
};

export const fetchPagedRecords = async ({ district, query, onProgress }) => {
  const pageLimit = 1000;
  let offset = 0;
  let allRecords = [];
  let total = null;

  while (true) {
    const urlPart = buildApiUrl({ district, query, limit: pageLimit, offset });
    
    if (onProgress) {
        onProgress({
            offset,
            total,
            url: new URL(urlPart, window.location.origin).toString()
        });
    }

    const response = await fetch(urlPart);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload = await response.json();
    if (payload.success === false) throw new Error(payload.error?.message || "API zwrocilo success=false");

    const records = payload.result?.records || [];
    if (total === null) total = payload.result?.total ?? null;

    if (!records.length) break;
    allRecords = allRecords.concat(records);
    offset += pageLimit;

    if (total !== null && offset >= total) break;
  }
  return allRecords;
};

export const fetchSinglePage = async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.success === false) throw new Error(payload.error?.message || "API zwrocilo success=false");
    return payload.result?.records || [];
};
