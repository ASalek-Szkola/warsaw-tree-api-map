const RESOURCES = {
  TREES: "ed6217dd-c8d0-4f7b-8bed-3b7eb81a95ba",
  GROUPS: "913856f7-f71b-4638-abe2-12df14334e1a"
};
const API_URL = "/api/warsaw/api/action/datastore_search";

export const buildApiUrl = ({ resourceType, district, query, limit, offset }) => {
  const params = new URLSearchParams();
  params.set("resource_id", RESOURCES[resourceType] || RESOURCES.TREES);
  if (Number.isFinite(limit)) params.set("limit", String(limit));
  if (Number.isFinite(offset) && offset > 0) params.set("offset", String(offset));
  if (district) params.set("filters", JSON.stringify({ dzielnica: district }));
  if (query) params.set("q", query);

  return `${API_URL}?${params.toString()}`;
};

export const fetchPagedRecords = async ({ resourceType, district, query, onProgress }) => {
  const pageLimit = 100000; // API Warszawy obsługuje bardzo duże limity w jednym żądaniu
  let offset = 0;
  let allRecords = [];
  let total = null;

  while (true) {
    const urlPart = buildApiUrl({ resourceType, district, query, limit: pageLimit, offset });
    
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
    offset += records.length;

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
