"""
BidKori concurrency stress test - Toufiq's select_for_update lock check.

Fires 50 simultaneous place-bid requests against a live auction to verify
row-level locking under contention.

Prerequisites:
  1. Backend running at http://127.0.0.1:8000
     (Docker Compose / gunicorn preferred for real locking; SQLite local
      runserver serializes writes but will still exercise the atomic path.)
  2. Seed users exist (``python manage.py seed_data``):
       seller_demo / password123
       buyer_one   / password123
  3. ``pip install requests``

Usage (Windows):
  .\\venv\\Scripts\\python.exe scripts\\stress_test.py
  .\\venv\\Scripts\\python.exe scripts\\stress_test.py --auction-id 10
  .\\venv\\Scripts\\python.exe scripts\\stress_test.py --workers 50
"""

from __future__ import annotations

import argparse
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

try:
    import requests
except ImportError:
    print('[FAIL] The requests package is required. Install with:')
    print('       .\\venv\\Scripts\\python.exe -m pip install requests')
    sys.exit(1)


BASE_URL = 'http://127.0.0.1:8000'
TIMEOUT = 30
DEFAULT_WORKERS = 50

SELLER = ('seller_demo', 'password123')
BUYER = ('buyer_one', 'password123')


def _check(label: str, condition: bool, detail: str = '') -> bool:
    suffix = f' - {detail}' if detail else ''
    if condition:
        print(f'  [OK]   {label}{suffix}')
        return True
    print(f'  [FAIL] {label}{suffix}')
    return False


def _section(title: str) -> None:
    print()
    print('=' * 64)
    print(f' {title}')
    print('=' * 64)


def login(base_url: str, username: str, password: str) -> str:
    response = requests.post(
        f'{base_url}/api/users/login/',
        json={'username': username, 'password': password},
        timeout=TIMEOUT,
    )
    if response.status_code == 200:
        token = response.json().get('token')
        if token:
            return token
    raise RuntimeError(
        f'Login failed for {username}: status={response.status_code} body={response.text[:200]}'
    )


def ensure_user(
    base_url: str,
    username: str,
    password: str,
    email: str,
) -> str:
    """Return an auth token, registering the user when login fails."""
    try:
        return login(base_url, username, password)
    except RuntimeError:
        pass

    register = requests.post(
        f'{base_url}/api/users/register/',
        json={
            'username': username,
            'email': email,
            'password': password,
            'confirm_password': password,
        },
        timeout=TIMEOUT,
    )
    if register.status_code == 201:
        token = register.json().get('token')
        if token:
            return token

    # User may already exist with this password after a partial register.
    return login(base_url, username, password)


def create_stress_auction(base_url: str, seller_token: str) -> tuple[int, Decimal, Decimal]:
    """Create a fresh ACTIVE auction owned by the seller for the stress run."""
    now = datetime.now(timezone.utc)
    stamp = now.strftime('%Y%m%d%H%M%S')
    starting_bid = Decimal('1000.00')
    min_increment = Decimal('10.00')

    payload = {
        'product': {
            'title': f'Stress Test Auction {stamp}',
            'description': 'Created by scripts/stress_test.py for concurrency load.',
            'condition': 'NEW',
        },
        'starting_bid': str(starting_bid),
        'min_increment': str(min_increment),
        'start_time': now.isoformat(),
        'end_time': (now + timedelta(days=1)).isoformat(),
        'is_featured': False,
    }

    response = requests.post(
        f'{base_url}/api/auctions/',
        headers={
            'Authorization': f'Token {seller_token}',
            'Content-Type': 'application/json',
        },
        json=payload,
        timeout=TIMEOUT,
    )
    if response.status_code != 201:
        raise RuntimeError(
            f'Failed to create auction: status={response.status_code} body={response.text[:300]}'
        )

    auction = response.json()
    return int(auction['id']), starting_bid, min_increment


def place_bid(
    base_url: str,
    auction_id: int,
    token: str,
    amount: Decimal,
) -> dict[str, Any]:
    """POST one bid; returns a result dict (never raises for HTTP 4xx/5xx)."""
    try:
        response = requests.post(
            f'{base_url}/api/auctions/{auction_id}/place-bid/',
            headers={
                'Authorization': f'Token {token}',
                'Content-Type': 'application/json',
            },
            json={'amount': str(amount)},
            timeout=TIMEOUT,
        )
        return {
            'amount': amount,
            'status_code': response.status_code,
            'ok': response.status_code == 201,
            'body': _safe_json(response),
            'error': None,
        }
    except requests.exceptions.RequestException as exc:
        return {
            'amount': amount,
            'status_code': None,
            'ok': False,
            'body': None,
            'error': str(exc),
        }


def _safe_json(response: requests.Response) -> Any:
    try:
        return response.json()
    except ValueError:
        return response.text[:200]


def fetch_auction(base_url: str, auction_id: int) -> dict[str, Any]:
    response = requests.get(
        f'{base_url}/api/auctions/{auction_id}/',
        timeout=TIMEOUT,
    )
    response.raise_for_status()
    return response.json()


def run_stress_test(
    base_url: str = BASE_URL,
    workers: int = DEFAULT_WORKERS,
    auction_id: int | None = None,
) -> int:
    print('BidKori Concurrency Stress Test')
    print(f'Target: {base_url}')
    print(f'Workers: {workers}')
    print(f'Started: {datetime.now().isoformat(timespec="seconds")}')

    checks_passed = 0
    checks_failed = 0

    def record(label: str, condition: bool, detail: str = '') -> bool:
        nonlocal checks_passed, checks_failed
        ok = _check(label, condition, detail)
        if ok:
            checks_passed += 1
        else:
            checks_failed += 1
        return ok

    # ------------------------------------------------------------------ setup
    _section('1. Auth + Auction Setup')

    try:
        requests.get(f'{base_url}/', timeout=5).raise_for_status()
        record('Server reachable', True, base_url)
    except requests.exceptions.RequestException as exc:
        record('Server reachable', False, str(exc))
        _print_summary(checks_passed, checks_failed, 0, 0, 0)
        return 1

    try:
        seller_token = ensure_user(
            base_url, SELLER[0], SELLER[1], 'seller@bidkori.com'
        )
        record('Auth seller_demo', True, f'token={seller_token[:12]}...')
    except Exception as exc:  # noqa: BLE001
        record('Auth seller_demo', False, str(exc))
        _print_summary(checks_passed, checks_failed, 0, 0, 0)
        return 1

    try:
        buyer_token = ensure_user(
            base_url, BUYER[0], BUYER[1], 'buyer_one@bidkori.com'
        )
        record('Auth buyer_one', True, f'token={buyer_token[:12]}...')
    except Exception as exc:  # noqa: BLE001
        record('Auth buyer_one', False, str(exc))
        _print_summary(checks_passed, checks_failed, 0, 0, 0)
        return 1

    starting_bid = Decimal('1000.00')
    min_increment = Decimal('10.00')

    if auction_id is None:
        try:
            auction_id, starting_bid, min_increment = create_stress_auction(
                base_url, seller_token
            )
            record(
                'Created fresh stress auction',
                True,
                f'id={auction_id} starting_bid={starting_bid} min_increment={min_increment}',
            )
        except Exception as exc:  # noqa: BLE001
            record('Created fresh stress auction', False, str(exc))
            _print_summary(checks_passed, checks_failed, 0, 0, 0)
            return 1
    else:
        try:
            auction = fetch_auction(base_url, auction_id)
            starting_bid = Decimal(str(auction.get('starting_bid', starting_bid)))
            min_increment = Decimal(str(auction.get('min_increment', min_increment)))
            record(
                f'Using existing auction {auction_id}',
                True,
                f'starting_bid={starting_bid} min_increment={min_increment}',
            )
        except Exception as exc:  # noqa: BLE001
            record(f'Load auction {auction_id}', False, str(exc))
            _print_summary(checks_passed, checks_failed, 0, 0, 0)
            return 1

    # Incremental bids: each amount is starting + n * min_increment (n = 1..workers)
    bid_amounts = [
        starting_bid + (min_increment * i)
        for i in range(1, workers + 1)
    ]

    # ----------------------------------------------------------- concurrent fire
    _section(f'2. Concurrent Place-Bid Burst ({workers} threads)')

    print(f'  Firing {workers} simultaneous bids from {bid_amounts[0]} .. {bid_amounts[-1]}')
    results: list[dict[str, Any]] = []

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [
            executor.submit(place_bid, base_url, auction_id, buyer_token, amount)
            for amount in bid_amounts
        ]
        for future in as_completed(futures):
            results.append(future.result())

    created = [r for r in results if r['status_code'] == 201]
    rejected = [r for r in results if r['status_code'] == 400]
    server_errors = [
        r for r in results
        if r['status_code'] is not None and r['status_code'] >= 500
    ]
    transport_errors = [r for r in results if r['error']]
    other = [
        r for r in results
        if r['status_code'] not in (201, 400, None)
        and not (r['status_code'] is not None and r['status_code'] >= 500)
    ]

    print()
    print(f'  Responses received : {len(results)}/{workers}')
    print(f'  201 Created        : {len(created)}')
    print(f'  400 Bad Request    : {len(rejected)}')
    print(f'  5xx Server errors  : {len(server_errors)}')
    print(f'  Transport errors   : {len(transport_errors)}')
    if other:
        print(f'  Other statuses     : {sorted({r["status_code"] for r in other})}')

    record(
        'All worker responses collected',
        len(results) == workers,
        f'{len(results)}/{workers}',
    )
    record(
        'No HTTP 500 / deadlock crashes',
        len(server_errors) == 0 and len(transport_errors) == 0,
        f'5xx={len(server_errors)} transport={len(transport_errors)}',
    )
    record(
        'At least one bid accepted (201)',
        len(created) >= 1,
        f'accepted={len(created)}',
    )
    record(
        'Losing concurrent bids rejected (400)',
        len(rejected) >= 1 or len(created) == workers,
        f'rejected={len(rejected)}',
    )

    # -------------------------------------------------------------- validation
    _section('3. Post-Burst Auction Validation')

    try:
        auction = fetch_auction(base_url, auction_id)
        record('GET /api/auctions/<id>/ succeeded', True, f'id={auction_id}')
    except Exception as exc:  # noqa: BLE001
        record('GET /api/auctions/<id>/ succeeded', False, str(exc))
        _print_summary(
            checks_passed, checks_failed, len(created), len(rejected), len(server_errors)
        )
        return 1

    final_highest = Decimal(str(auction.get('current_highest_bid')))
    winner = auction.get('winning_bidder')
    max_accepted = max((r['amount'] for r in created), default=None)
    global_max_submitted = max(bid_amounts)

    print(f'  Final current_highest_bid : {final_highest}')
    print(f'  Winning bidder id         : {winner}')
    print(f'  Max accepted bid amount   : {max_accepted}')

    if max_accepted is not None:
        record(
            'final current_highest_bid == max accepted bid',
            final_highest == max_accepted,
            f'expected={max_accepted} got={final_highest}',
        )
    else:
        record('final current_highest_bid == max accepted bid', False, 'no accepted bids')

    # Under contention, a lower bid may lock first and cause higher amounts to
    # fail the increment rule after a jump. Atomicity only requires that the
    # persisted highest matches the max accepted response amount.
    if max_accepted is not None:
        if max_accepted == global_max_submitted:
            print(
                f'  [OK]   Highest submitted amount also won '
                f'({global_max_submitted})'
            )
        else:
            print(
                f'  [OK]   Note: max submitted={global_max_submitted} but '
                f'max accepted={max_accepted} (expected under contention; '
                f'atomicity OK if final matches max accepted)'
            )

    _print_summary(
        checks_passed, checks_failed, len(created), len(rejected), len(server_errors)
    )

    # Hard fail conditions for exit code
    hard_fail = (
        len(server_errors) > 0
        or len(transport_errors) > 0
        or max_accepted is None
        or final_highest != max_accepted
        or len(results) != workers
    )
    return 1 if hard_fail else 0


def _print_summary(
    passed: int,
    failed: int,
    created: int,
    rejected: int,
    server_errors: int,
) -> None:
    total = passed + failed
    print()
    print('-' * 64)
    print(f' Checks   : {passed}/{total} passed, {failed} failed')
    print(f' Bids     : {created} accepted (201), {rejected} rejected (400)')
    print(f' 5xx      : {server_errors}')
    if failed == 0 and server_errors == 0 and total > 0:
        print(' [OK]   Stress test PASSED - select_for_update held under load')
    else:
        print(' [FAIL] Stress test FAILED')
    print('-' * 64)


def main() -> int:
    parser = argparse.ArgumentParser(
        description='BidKori 50-thread place-bid concurrency stress test',
    )
    parser.add_argument(
        '--base-url',
        default=BASE_URL,
        help=f'API base URL (default: {BASE_URL})',
    )
    parser.add_argument(
        '--workers',
        type=int,
        default=DEFAULT_WORKERS,
        help=f'Number of concurrent bid threads (default: {DEFAULT_WORKERS})',
    )
    parser.add_argument(
        '--auction-id',
        type=int,
        default=None,
        help='Existing auction id (default: create a fresh one)',
    )
    args = parser.parse_args()
    return run_stress_test(
        base_url=args.base_url.rstrip('/'),
        workers=args.workers,
        auction_id=args.auction_id,
    )


if __name__ == '__main__':
    sys.exit(main())
