"""
BidKori integration test - Toufiq's bidding lifecycle.

Runs against a live backend at http://127.0.0.1:8000.

Prerequisites:
  1. ``python manage.py runserver`` is running
  2. Seed users exist (``python manage.py seed_data``):
       seller_demo / password123
       buyer_one   / password123
       buyer_two   / password123
  3. ``pip install requests`` (already in the project venv if you used it)

Usage (Windows):
  .\\venv\\Scripts\\python.exe scripts\\integration_test.py
"""

from __future__ import annotations

import sys
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
TIMEOUT = 10

USERS = {
    'seller_demo': 'password123',
    'buyer_one': 'password123',
    'buyer_two': 'password123',
}


class IntegrationTestRunner:
    """Execute the full BidKori bidding lifecycle against the live API."""

    def __init__(self, base_url: str = BASE_URL) -> None:
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
        self.tokens: dict[str, str] = {}
        self.passed = 0
        self.failed = 0
        self.product_id: int | None = None
        self.auction_id: int | None = None
        self.starting_bid = Decimal('1000.00')
        self.min_increment = Decimal('10.00')
        self.buyer_one_bid = Decimal('1010.00')
        self.buyer_two_bid = Decimal('1035.00')

    # ------------------------------------------------------------------ helpers
    def _url(self, path: str) -> str:
        return f'{self.base_url}{path}'

    def _auth_headers(self, username: str) -> dict[str, str]:
        token = self.tokens[username]
        return {
            'Authorization': f'Token {token}',
            'Content-Type': 'application/json',
        }

    def _check(self, label: str, condition: bool, detail: str = '') -> bool:
        if condition:
            self.passed += 1
            suffix = f' - {detail}' if detail else ''
            print(f'  [OK]   {label}{suffix}')
            return True
        self.failed += 1
        suffix = f' - {detail}' if detail else ''
        print(f'  [FAIL] {label}{suffix}')
        return False

    def _section(self, title: str) -> None:
        print()
        print('=' * 64)
        print(f' {title}')
        print('=' * 64)

    def _find_active_auction(self, auction_id: int) -> dict[str, Any] | None:
        response = self.session.get(
            self._url('/api/auctions/active/'),
            timeout=TIMEOUT,
        )
        if response.status_code != 200:
            return None
        for item in response.json():
            if item.get('id') == auction_id:
                return item
        return None

    # --------------------------------------------------------------- test stages
    def stage_health_check(self) -> bool:
        self._section('0. Backend Health Check')
        try:
            response = self.session.get(self._url('/'), timeout=TIMEOUT)
        except requests.exceptions.ConnectionError:
            self._check(
                'Server reachable',
                False,
                f'Cannot connect to {self.base_url}. Is runserver up?',
            )
            return False

        ok = self._check(
            'Server reachable',
            response.status_code == 200,
            f'status={response.status_code}',
        )
        return ok

    def stage_auth_flow(self) -> bool:
        self._section('1. Auth Flow - retrieve DRF tokens')
        all_ok = True

        for username, password in USERS.items():
            response = self.session.post(
                self._url('/api/users/login/'),
                json={'username': username, 'password': password},
                timeout=TIMEOUT,
            )
            token = None
            if response.status_code == 200:
                token = response.json().get('token')

            stage_ok = self._check(
                f'Login as {username}',
                response.status_code == 200 and bool(token),
                f'status={response.status_code}',
            )
            if stage_ok and token:
                self.tokens[username] = token
                print(f'         token={token[:12]}...')
            else:
                all_ok = False
                print(f'         body={response.text[:200]}')

        return all_ok

    def stage_catalog_creation(self) -> bool:
        self._section('2. Catalog Creation - seller_demo creates a product')
        stamp = datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')
        product_payload = {
            'title': f'Integration Test Gadget {stamp}',
            'description': (
                'Automated integration-test listing for Toufiq bidding engine.'
            ),
            'condition': 'USED_LIKE_NEW',
        }

        create_resp = self.session.post(
            self._url('/api/products/'),
            headers=self._auth_headers('seller_demo'),
            json=product_payload,
            timeout=TIMEOUT,
        )
        create_ok = self._check(
            'POST /api/products/',
            create_resp.status_code == 201,
            f'status={create_resp.status_code}',
        )
        if not create_ok:
            print(f'         body={create_resp.text[:300]}')
            return False

        product = create_resp.json()
        self.product_id = product.get('id')
        self._check(
            'Product id present',
            isinstance(self.product_id, int),
            f'id={self.product_id}',
        )
        self._check(
            'Product title matches',
            product.get('title') == product_payload['title'],
            f"title={product.get('title')!r}",
        )

        list_resp = self.session.get(self._url('/api/products/'), timeout=TIMEOUT)
        list_ok = self._check(
            'GET /api/products/ lists catalog',
            list_resp.status_code == 200,
            f'status={list_resp.status_code}',
        )
        if not list_ok:
            return False

        products = list_resp.json()
        found = any(p.get('id') == self.product_id for p in products)
        self._check(
            'New product appears in listing',
            found,
            f'product_id={self.product_id}',
        )
        return found

    def stage_create_auction(self) -> bool:
        self._section('3. Auction Creation - nested product + auction')
        now = datetime.now(timezone.utc)
        stamp = now.strftime('%Y%m%d%H%M%S')
        payload = {
            'product': {
                'title': f'Live Bid Target {stamp}',
                'description': 'Auction created by integration_test.py for bidding.',
                'condition': 'NEW',
            },
            'starting_bid': str(self.starting_bid),
            'min_increment': str(self.min_increment),
            'start_time': now.isoformat(),
            'end_time': (now + timedelta(days=7)).isoformat(),
            'is_featured': False,
        }

        response = self.session.post(
            self._url('/api/auctions/'),
            headers=self._auth_headers('seller_demo'),
            json=payload,
            timeout=TIMEOUT,
        )
        ok = self._check(
            'POST /api/auctions/',
            response.status_code == 201,
            f'status={response.status_code}',
        )
        if not ok:
            print(f'         body={response.text[:400]}')
            return False

        auction = response.json()
        self.auction_id = auction.get('id')
        self._check(
            'Auction id present',
            isinstance(self.auction_id, int),
            f'id={self.auction_id}',
        )
        self._check(
            'Initial current_highest_bid == starting_bid',
            Decimal(str(auction.get('current_highest_bid'))) == self.starting_bid,
            f"current_highest_bid={auction.get('current_highest_bid')}",
        )
        return isinstance(self.auction_id, int)

    def stage_bidding_engine(self) -> bool:
        self._section('4. Bidding Engine - open bid + outbid')
        if self.auction_id is None:
            self._check('Auction available for bidding', False, 'auction_id is None')
            return False

        place_url = self._url(f'/api/auctions/{self.auction_id}/place-bid/')

        # buyer_one opening bid
        bid1 = self.session.post(
            place_url,
            headers=self._auth_headers('buyer_one'),
            json={'amount': str(self.buyer_one_bid)},
            timeout=TIMEOUT,
        )
        bid1_ok = self._check(
            'buyer_one places opening bid',
            bid1.status_code == 201,
            f'status={bid1.status_code} amount={self.buyer_one_bid}',
        )
        if not bid1_ok:
            print(f'         body={bid1.text[:300]}')
            return False

        # buyer_two outbids
        bid2 = self.session.post(
            place_url,
            headers=self._auth_headers('buyer_two'),
            json={'amount': str(self.buyer_two_bid)},
            timeout=TIMEOUT,
        )
        bid2_ok = self._check(
            'buyer_two outbids buyer_one',
            bid2.status_code == 201,
            f'status={bid2.status_code} amount={self.buyer_two_bid}',
        )
        if not bid2_ok:
            print(f'         body={bid2.text[:300]}')
            return False

        active = self._find_active_auction(self.auction_id)
        active_ok = self._check(
            'GET /api/auctions/active/ includes auction',
            active is not None,
            f'auction_id={self.auction_id}',
        )
        if not active_ok or active is None:
            return False

        highest = Decimal(str(active.get('current_highest_bid')))
        winner = active.get('winning_bidder_username')

        self._check(
            'current_highest_bid updated',
            highest == self.buyer_two_bid,
            f'expected={self.buyer_two_bid} got={highest}',
        )
        # Final winner is assigned only at authoritative close; during ACTIVE
        # winning_bidder remains unset while current_highest_bid tracks the live high.
        self._check(
            'winning_bidder unset during ACTIVE (finalized only at close)',
            winner in (None, ''),
            f'expected empty/null got={winner!r}',
        )
        return highest == self.buyer_two_bid and winner in (None, '')

    def stage_guardrails(self) -> bool:
        self._section('5. Guardrail Checks - self-bid + low bid')
        if self.auction_id is None:
            self._check('Auction available for guardrails', False, 'auction_id is None')
            return False

        place_url = self._url(f'/api/auctions/{self.auction_id}/place-bid/')

        # Seller self-bid must be forbidden
        self_bid = self.session.post(
            place_url,
            headers=self._auth_headers('seller_demo'),
            json={'amount': str(self.buyer_two_bid + Decimal('100.00'))},
            timeout=TIMEOUT,
        )
        self._check(
            'Seller self-bid rejected',
            self_bid.status_code == 403,
            f'status={self_bid.status_code} (expected 403)',
        )

        # Low / equal bid must be rejected
        low_bid = self.session.post(
            place_url,
            headers=self._auth_headers('buyer_one'),
            json={'amount': str(self.buyer_two_bid)},  # equal to current high
            timeout=TIMEOUT,
        )
        self._check(
            'Low/equal bid rejected',
            low_bid.status_code == 400,
            f'status={low_bid.status_code} (expected 400)',
        )

        # Optional: confirm error payload shape
        try:
            error_body = low_bid.json()
        except ValueError:
            error_body = {}
        error_text = str(error_body.get('error') or error_body.get('detail') or '')
        self._check(
            'Low-bid error message present',
            'higher than the current highest bid' in error_text.lower()
            or 'must be' in error_text.lower(),
            f'body={error_body}',
        )

        return self_bid.status_code == 403 and low_bid.status_code == 400

    # -------------------------------------------------------------------- runner
    def run(self) -> int:
        print('BidKori Integration Test')
        print(f'Target: {self.base_url}')
        print(f'Started: {datetime.now().isoformat(timespec="seconds")}')

        if not self.stage_health_check():
            self._print_summary()
            return 1

        if not self.stage_auth_flow():
            print('\n[FAIL] Auth flow failed - aborting remaining stages.')
            self._print_summary()
            return 1

        self.stage_catalog_creation()
        if not self.stage_create_auction():
            print('\n[FAIL] Auction creation failed - aborting bidding stages.')
            self._print_summary()
            return 1

        self.stage_bidding_engine()
        self.stage_guardrails()
        self._print_summary()
        return 0 if self.failed == 0 else 1

    def _print_summary(self) -> None:
        total = self.passed + self.failed
        print()
        print('-' * 64)
        print(f' Results: {self.passed}/{total} checks passed, {self.failed} failed')
        if self.failed == 0 and total > 0:
            print(' [OK]   Integration test PASSED')
        else:
            print(' [FAIL] Integration test FAILED')
        print('-' * 64)


def main() -> int:
    return IntegrationTestRunner().run()


if __name__ == '__main__':
    sys.exit(main())
