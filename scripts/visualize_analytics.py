#!/usr/bin/env python3
"""Fetch BidKori analytics and print a summary or open the HTML dashboard."""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from decimal import Decimal

DEFAULT_API_URL = 'http://127.0.0.1:8000/api/auctions/analytics/'
DEFAULT_DASHBOARD_URL = 'http://127.0.0.1:8000/api/auctions/analytics/dashboard/'


def fetch_analytics(api_url: str) -> dict:
    request = urllib.request.Request(
        api_url,
        headers={'Accept': 'application/json'},
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.loads(response.read().decode('utf-8'))


def format_money(value) -> str:
    amount = Decimal(str(value or 0))
    return f'BDT {amount:,.2f}'


def print_ascii_summary(data: dict) -> None:
    width = 62
    border = '=' * width

    print(border)
    print(' BIDKORI ANALYTICS SUMMARY'.center(width))
    print(border)
    print(f" Active Auctions      : {data.get('total_active_auctions', 0)}")
    print(f" Total Bids Placed    : {data.get('total_bids_placed', 0)}")
    print(
        f" Total Bidding Volume : {format_money(data.get('total_bidding_volume'))}"
    )
    print('-' * width)
    print(' CATEGORY BREAKDOWN')
    print('-' * width)

    categories = data.get('category_breakdown') or []
    if not categories:
        print(' No category data available.')
    else:
        for row in categories:
            print(
                f" {row['category']:<18} "
                f"start={format_money(row['avg_starting_price']):>14} "
                f"high={format_money(row['avg_highest_bid']):>14}"
            )

    print('-' * width)
    print(' TOP ACTIVE BIDDERS')
    print('-' * width)

    bidders = data.get('top_active_bidders') or []
    if not bidders:
        print(' No bidder activity recorded yet.')
    else:
        for index, bidder in enumerate(bidders, start=1):
            print(
                f" {index}. {bidder['username']:<16} "
                f"{bidder['bid_count']} bids  "
                f"total={format_money(bidder['total_bid_amount'])}"
            )

    print('-' * width)
    print(' RECENT BID ESCALATION (last 10)')
    print('-' * width)

    history = (data.get('bid_escalation_history') or [])[-10:]
    if not history:
        print(' No bids in history yet.')
    else:
        for bid in history:
            print(
                f" auction={bid['auction_id']:<4} "
                f"amount={format_money(bid['amount']):>14} "
                f"at {bid['timestamp']}"
            )

    print(border)
    print(f" Dashboard: {DEFAULT_DASHBOARD_URL}")
    print(border)


def main() -> int:
    parser = argparse.ArgumentParser(description='BidKori analytics visualizer')
    parser.add_argument(
        '--api-url',
        default=DEFAULT_API_URL,
        help='Analytics API endpoint URL',
    )
    parser.add_argument(
        '--json',
        action='store_true',
        help='Print raw JSON instead of ASCII summary',
    )
    args = parser.parse_args()

    try:
        data = fetch_analytics(args.api_url)
    except urllib.error.URLError as exc:
        print(
            f'Error: Could not reach analytics API at {args.api_url}\n'
            f'       {exc}\n'
            '       Start the server with: python manage.py runserver',
            file=sys.stderr,
        )
        return 1

    if args.json:
        print(json.dumps(data, indent=2, default=str))
    else:
        print_ascii_summary(data)

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
