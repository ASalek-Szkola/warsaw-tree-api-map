import urllib.request
import json

resource_ids = [
    "913856f7-f71b-4638-abe2-12df14334e1a", # Grupy Drzew
    "ed6217dd-c8d0-4f7b-8bed-3b7eb81a95ba"  # Trees?
]

for res_id in resource_ids:
    url = f"https://api.um.warszawa.pl/api/action/datastore_search?resource_id={res_id}&limit=1"
    try:
        with urllib.request.urlopen(url) as response:
            data = json.loads(response.read().decode())
            if data.get("success"):
                fields = [f["id"] for f in data["result"]["fields"]]
                print(f"Resource ID: {res_id}")
                print(f"Fields: {fields}")
                print("-" * 20)
            else:
                print(f"Resource ID: {res_id} - Failed: {data}")
    except Exception as e:
        print(f"Resource ID: {res_id} - Error: {e}")
