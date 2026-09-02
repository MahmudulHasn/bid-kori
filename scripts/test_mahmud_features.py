"""
Mahmud feature check - image uploads + auto-close expired auctions.

Prerequisites:
  1. Backend running at http://127.0.0.1:8000 (runserver or Docker)
  2. This script and the server must share the same database:
       - Local runserver: default SQLite is fine
       - Docker Compose API: pass --docker (uses Postgres on localhost:5432)
  3. Pillow + requests installed in the environment

Usage (Windows):
  .\\venv\\Scripts\\python.exe scripts\\test_mahmud_features.py
  .\\venv\\Scripts\\python.exe scripts\\test_mahmud_features.py --docker
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

DOCKER_DATABASE_URL = os.getenv(
    'DATABASE_URL',
    '',
)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description='Verify Mahmud image upload + auto-close features',
    )
    parser.add_argument(
        '--base-url',
        default='http://127.0.0.1:8000',
        help='API base URL (default: http://127.0.0.1:8000)',
    )
    parser.add_argument(
        '--docker',
        action='store_true',
        help=(
            'Use Docker Compose Postgres (DATABASE_URL from environment/.env) '
            'so ORM/call_command match the containerized API.'
        ),
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    if args.docker:
        database_url = os.getenv('DATABASE_URL', '').strip()
        if not database_url:
            print(
                '[FAIL] --docker requires DATABASE_URL in the environment '
                '(see .env.example). Do not hardcode credentials.'
            )
            return 1
        os.environ['DATABASE_URL'] = database_url

    # Ensure local scripts can load settings when .env provides SECRET_KEY.
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

    try:
        import django

        django.setup()
    except Exception as exc:  # noqa: BLE001
        print(f'[FAIL] Django setup failed: {exc}')
        return 1

    try:
        import requests
        from PIL import Image
    except ImportError as exc:
        print(f'[FAIL] Missing dependency: {exc}')
        print('       .\\venv\\Scripts\\python.exe -m pip install requests Pillow')
        return 1

    from django.core.management import call_command
    from django.utils import timezone as dj_timezone

    from auctions.models import Auction

    base_url = args.base_url.rstrip('/')
    timeout = 20
    seller_username = 'seller_demo'
    seller_password = 'password123'
    seller_email = 'seller@bidkori.com'

    def ok(message: str) -> None:
        print(f'[OK] {message}')

    def fail(message: str) -> None:
        print(f'[FAIL] {message}')

    def section(title: str) -> None:
        print()
        print('=' * 64)
        print(f' {title}')
        print('=' * 64)

    def ensure_token() -> str:
        login_resp = requests.post(
            f'{base_url}/api/users/login/',
            json={'username': seller_username, 'password': seller_password},
            timeout=timeout,
        )
        if login_resp.status_code == 200 and login_resp.json().get('token'):
            return login_resp.json()['token']

        register_resp = requests.post(
            f'{base_url}/api/users/register/',
            json={
                'username': seller_username,
                'email': seller_email,
                'password': seller_password,
                'confirm_password': seller_password,
            },
            timeout=timeout,
        )
        if register_resp.status_code == 201 and register_resp.json().get('token'):
            return register_resp.json()['token']

        login_resp = requests.post(
            f'{base_url}/api/users/login/',
            json={'username': seller_username, 'password': seller_password},
            timeout=timeout,
        )
        if login_resp.status_code == 200 and login_resp.json().get('token'):
            return login_resp.json()['token']

        raise RuntimeError(
            f'Auth failed. login={login_resp.status_code} '
            f'register={register_resp.status_code} body={login_resp.text[:200]}'
        )

    def make_dummy_png() -> BytesIO:
        buffer = BytesIO()
        Image.new('RGB', (64, 64), color=(220, 40, 40)).save(buffer, format='PNG')
        buffer.seek(0)
        return buffer

    def create_auction(token: str) -> int:
        now = datetime.now(timezone.utc)
        stamp = now.strftime('%Y%m%d%H%M%S')
        payload = {
            'product': {
                'title': f'Mahmud Media Auction {stamp}',
                'description': 'Integration fixture for image upload + auto-close.',
                'condition': 'NEW',
            },
            'starting_bid': '500.00',
            'min_increment': '10.00',
            'start_time': now.isoformat(),
            'end_time': (now + timedelta(days=3)).isoformat(),
            'is_featured': False,
        }
        response = requests.post(
            f'{base_url}/api/auctions/',
            headers={
                'Authorization': f'Token {token}',
                'Content-Type': 'application/json',
            },
            json=payload,
            timeout=timeout,
        )
        if response.status_code != 201:
            raise RuntimeError(
                f'Auction create failed: {response.status_code} {response.text[:300]}'
            )
        auction_id = response.json().get('id')
        if not auction_id:
            raise RuntimeError('Auction create response missing id.')
        return int(auction_id)

    def upload_image(token: str, auction_id: int) -> str:
        png = make_dummy_png()
        response = requests.post(
            f'{base_url}/api/auctions/{auction_id}/images/',
            headers={'Authorization': f'Token {token}'},
            files={'images': ('mahmud_test.png', png, 'image/png')},
            timeout=timeout,
        )
        if response.status_code != 201:
            raise RuntimeError(
                f'Image upload failed: {response.status_code} {response.text[:300]}'
            )

        payload = response.json()
        if isinstance(payload, list):
            if not payload:
                raise RuntimeError('Image upload returned an empty list.')
            image_path = payload[0].get('image')
        else:
            image_path = payload.get('image')

        if not image_path:
            raise RuntimeError(f'No image URL in response: {payload}')

        if image_path.startswith('http://') or image_path.startswith('https://'):
            return image_path
        return f'{base_url}{image_path}'

    def force_expire_auction(auction_id: int) -> None:
        past = dj_timezone.now() - timedelta(minutes=5)
        updated = Auction.objects.filter(pk=auction_id).update(
            end_time=past,
            status=Auction.Status.ACTIVE,
        )
        if updated != 1:
            raise RuntimeError(
                f'Could not force-expire auction {auction_id} in this DB. '
                'If the API runs in Docker, re-run with --docker.'
            )

    print('Mahmud Feature Integration Check')
    print(f'Target: {base_url}')
    print(f'Docker DB bridge: {"yes" if args.docker else "no"}')
    print(f'Started: {datetime.now().isoformat(timespec="seconds")}')

    section('0. Backend Health')
    try:
        health = requests.get(f'{base_url}/', timeout=5)
        health.raise_for_status()
        ok(f'Server reachable ({health.status_code})')
    except requests.exceptions.RequestException as exc:
        fail(f'Server not reachable at {base_url}: {exc}')
        return 1

    section('1. Auth')
    try:
        token = ensure_token()
        ok(f'Logged in as {seller_username} (token={token[:12]}...)')
    except Exception as exc:  # noqa: BLE001
        fail(f'Auth failed: {exc}')
        return 1

    section('2. Image Upload (multipart/form-data)')
    try:
        auction_id = create_auction(token)
        ok(f'Auction created (id={auction_id})')

        image_url = upload_image(token, auction_id)
        ok(f'Upload returned HTTP 201 (url={image_url})')

        image_resp = requests.get(image_url, timeout=timeout)
        if image_resp.status_code != 200:
            fail(f'Image URL not accessible: status={image_resp.status_code}')
            return 1
        if not image_resp.content:
            fail('Image URL returned empty body')
            return 1

        print('[OK] Image Upload Verified')
    except Exception as exc:  # noqa: BLE001
        fail(f'Image upload flow failed: {exc}')
        return 1

    section('3. Auto-Close Expired Auctions')
    try:
        force_expire_auction(auction_id)
        ok(f'Forced auction {auction_id} end_time into the past')

        call_command('close_expired_auctions')
        ok("Triggered call_command('close_expired_auctions')")

        detail = requests.get(
            f'{base_url}/api/auctions/{auction_id}/',
            headers={'Authorization': f'Token {token}'},
            timeout=timeout,
        )
        if detail.status_code != 200:
            fail(
                f'GET auction failed: status={detail.status_code} '
                f'body={detail.text[:200]}'
            )
            return 1

        status_value = detail.json().get('status')
        if status_value != 'CLOSED':
            fail(f'Expected status CLOSED, got {status_value!r}')
            return 1

        print('[OK] Auto-Close Task Verified')
    except Exception as exc:  # noqa: BLE001
        fail(f'Auto-close flow failed: {exc}')
        return 1

    print()
    print('-' * 64)
    print('[OK] Mahmud feature checks PASSED')
    print('-' * 64)
    return 0


if __name__ == '__main__':
    sys.exit(main())
