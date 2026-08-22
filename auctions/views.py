from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Auction, Bid
from .permissions import IsNotSeller
from .serializers import AuctionDetailSerializer, AuctionSerializer, BidSerializer
from .services import AuctionStateMachine


class AuctionListCreateView(generics.ListCreateAPIView):
    """List all auctions or create a new one.

    GET returns every auction (refreshing each one's time-based status first),
    while POST creates a new auction (and its product) for the current user.
    """

    serializer_class = AuctionSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        queryset = Auction.objects.select_related('product').all()
        for auction in queryset:
            auction.update_status_by_time()
        return queryset

    def perform_create(self, serializer):
        serializer.save(seller=self.request.user)


class AuctionDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Retrieve, update, or delete a single auction by its primary key."""

    queryset = Auction.objects.select_related('product').all()
    serializer_class = AuctionSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]


class TransitionAuctionStateView(APIView):
    """Transition an auction to a new status via the state machine."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        auction = get_object_or_404(Auction, pk=pk)
        new_status = request.data.get('status')

        if not new_status:
            return Response(
                {'detail': "Field 'status' is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            AuctionStateMachine.transition(auction, new_status)
        except ValidationError as exc:
            return Response(
                {'detail': exc.messages[0] if exc.messages else str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = AuctionSerializer(auction, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class ActiveAuctionListView(APIView):
    """Return auctions that are ACTIVE and have not yet reached end_time."""

    def get(self, request):
        auctions = (
            Auction.objects.filter(
                status=Auction.Status.ACTIVE,
                end_time__gt=timezone.now(),
            )
            .select_related('product', 'winning_bidder')
            .prefetch_related('bids__bidder')
        )
        serializer = AuctionDetailSerializer(
            auctions,
            many=True,
            context={'request': request},
        )
        return Response(serializer.data, status=status.HTTP_200_OK)


class PlaceBidView(APIView):
    """Place a bid on an active auction.

    Validates active status and that the bid beats the current highest bid.
    Sellers cannot bid on their own auctions.
    """

    permission_classes = [IsAuthenticated, IsNotSeller]

    def permission_denied(self, request, message=None, code=None):
        from rest_framework.exceptions import PermissionDenied

        raise PermissionDenied(
            detail={
                'error': message
                or 'Action forbidden: Sellers cannot bid on their own listings.',
            }
        )

    def post(self, request, auction_id):
        auction = get_object_or_404(
            Auction.objects.select_related('product__seller'),
            pk=auction_id,
        )

        if request.user == auction.product.seller:
            return Response(
                {
                    'error': (
                        'Action forbidden: Sellers cannot bid on their own listings.'
                    ),
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if not auction.is_active():
            return Response(
                {'detail': 'Auction is not active.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw_amount = request.data.get('amount', request.data.get('bid_amount'))
        if raw_amount is None or raw_amount == '':
            return Response(
                {'error': 'Bid amount must be a valid number.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            bid_amount = Decimal(str(raw_amount))
        except (InvalidOperation, TypeError, ValueError):
            return Response(
                {'error': 'Bid amount must be a valid number.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if bid_amount <= 0:
            return Response(
                {'error': 'Bid amount must be greater than zero.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if bid_amount <= auction.current_highest_bid:
            return Response(
                {
                    'detail': (
                        'Bid amount must be greater than the current highest bid.'
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        minimum_required = auction.current_highest_bid + auction.min_increment
        if bid_amount < minimum_required:
            return Response(
                {
                    'detail': (
                        f'Bid amount must be at least {minimum_required} '
                        f'(current highest bid plus minimum increment).'
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            bid = Bid.objects.create(
                auction=auction,
                bidder=request.user,
                amount=bid_amount,
            )
            auction.current_highest_bid = bid_amount
            auction.winning_bidder = request.user
            auction.save(update_fields=['current_highest_bid', 'winning_bidder'])

        serializer = BidSerializer(bid, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class AuctionBidHistoryView(APIView):
    """Return all bids for an auction, ordered by highest amount first."""

    def get(self, request, auction_id):
        auction = get_object_or_404(Auction, pk=auction_id)
        bids = (
            Bid.objects.filter(auction=auction)
            .select_related('bidder', 'auction')
            .order_by('-amount')
        )
        serializer = BidSerializer(bids, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class UserBidsView(generics.ListAPIView):
    """Return all bids placed by the authenticated user, with auction details."""

    serializer_class = BidSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Bid.objects.select_related(
            'auction',
            'auction__product',
            'bidder',
        ).filter(bidder=self.request.user)
