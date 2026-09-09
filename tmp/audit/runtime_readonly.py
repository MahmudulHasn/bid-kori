"""Read-only HTTP checks of the isolated, already-built frontend."""
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import requests

root = Path(__file__).resolve().parents[2]
app = root / 'bidkori-frontend/src/app'
routes = []
for page in app.rglob('page.tsx'):
    route = '/' + page.parent.relative_to(app).as_posix()
    route = route.replace('/.', '/')
    route = route.replace('[id]', '10' if '/auctions/' in route else '1')
    routes.append(route)

def check(route):
    try:
        response = requests.get('http://127.0.0.1:3001' + route, timeout=10, allow_redirects=False)
        return {'path': route, 'status': response.status_code, 'location': response.headers.get('Location'), 'bytes': len(response.content)}
    except requests.RequestException as exc:
        return {'path': route, 'error': type(exc).__name__}

with ThreadPoolExecutor(max_workers=4) as pool:
    results = list(pool.map(check, sorted(routes)))
(root / 'tmp/audit/http-production-frontend-smoke.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
print(json.dumps(results))
