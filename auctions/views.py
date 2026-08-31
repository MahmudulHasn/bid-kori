from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError
from django.db.models import Avg, Count, F, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.generic import TemplateView
from rest_framework import generics, status, viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Auction, AuctionImage, Bid
from .permissions import IsNotSeller
from .serializers import (
    AuctionDetailSerializer,
    AuctionImageSerializer,
    AuctionSerializer,
    BidSerializer,
)
from .services import AuctionStateMachine, BidService


class AuctionViewSet(viewsets.ModelViewSet):
    """List, create, retrieve, update, and delete auctions.

    Accepts JSON and multipart/form-data so listing images can be uploaded
    alongside auction creation (field name: ``images``).
    """

    serializer_class = AuctionSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    def get_queryset(self):
        return (
            Auction.objects.select_related('product', 'winning_bidder')
            .prefetch_related('images')
            .all()
        )

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        for auction in queryset:
            auction.update_status_by_time()
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.update_status_by_time()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def perform_create(self, serializer):
        serializer.save(seller=self.request.user)


# Backwards-compatible aliases used by existing URL imports / docs.
AuctionListCreateView = AuctionViewSet.as_view({'get': 'list', 'post': 'create'})
AuctionDetailView = AuctionViewSet.as_view({
    'get': 'retrieve',
    'put': 'update',
    'patch': 'partial_update',
    'delete': 'destroy',
})


class AuctionImageUploadView(APIView):
    """Upload one or more images to an existing auction (multipart/form-data)."""

    permission_classes = [IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request, auction_id):
        auction = get_object_or_404(
            Auction.objects.select_related('product__seller'),
            pk=auction_id,
        )

        if request.user != auction.product.seller:
            return Response(
                {'error': 'Only the seller can upload images for this auction.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        files = request.FILES.getlist('images') or request.FILES.getlist('image')
        if not files:
            return Response(
                {'error': 'No images provided. Use multipart field "images".'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        created = [
            AuctionImage.objects.create(auction=auction, image=image_file)
            for image_file in files
        ]
        serializer = AuctionImageSerializer(
            created,
            many=True,
            context={'request': request},
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)


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
            .prefetch_related('bids__bidder', 'images')
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
    Sellers cannot bid on their own auctions. Bid writes run atomically under
    ``select_for_update`` to prevent concurrent race conditions.
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
        # Pre-check seller ownership outside the lock (cheap fail-fast).
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

        try:
            bid = BidService.place_bid(
                auction_id=auction_id,
                bidder=request.user,
                amount=bid_amount,
            )
        except ValidationError as exc:
            message = exc.messages[0] if getattr(exc, 'messages', None) else str(exc)
            if 'higher than the current highest bid' in message:
                return Response(
                    {
                        'error': (
                            'Bid amount must be higher than the current highest bid.'
                        ),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response(
                {'error': message},
                status=status.HTTP_400_BAD_REQUEST,
            )

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


class AnalyticsSummaryView(APIView):
    """Aggregate auction and bidding metrics for dashboards and reporting."""

    def get(self, request):
        now = timezone.now()

        total_active_auctions = Auction.objects.filter(
            status=Auction.Status.ACTIVE,
            end_time__gt=now,
        ).count()

        total_bids_placed = Bid.objects.count()

        volume_aggregate = Auction.objects.aggregate(
            total_bidding_volume=Sum('current_highest_bid'),
        )
        total_bidding_volume = volume_aggregate['total_bidding_volume'] or Decimal('0.00')

        category_breakdown = [
            {
                'category': row['product__category__name'] or 'Uncategorized',
                'avg_starting_price': row['avg_starting_price'],
                'avg_highest_bid': row['avg_highest_bid'],
                'avg_price_growth': row['avg_price_growth'],
                'auction_count': row['auction_count'],
            }
            for row in Auction.objects.select_related('product__category')
            .values('product__category__name')
            .annotate(
                avg_starting_price=Avg('starting_bid'),
                avg_highest_bid=Avg('current_highest_bid'),
                avg_price_growth=Avg(F('current_highest_bid') - F('starting_bid')),
                auction_count=Count('id'),
            )
            .order_by('product__category__name')
        ]

        bid_escalation_history = [
            {
                'bid_id': bid['id'],
                'auction_id': bid['auction_id'],
                'amount': bid['amount'],
                'timestamp': bid['timestamp'].isoformat(),
                'bidder_username': bid['bidder__username'],
            }
            for bid in Bid.objects.select_related('bidder')
            .order_by('timestamp')
            .values('id', 'auction_id', 'amount', 'timestamp', 'bidder__username')[:100]
        ]

        top_active_bidders = [
            {
                'username': row['bidder__username'],
                'bid_count': row['bid_count'],
                'total_bid_amount': row['total_bid_amount'],
            }
            for row in Bid.objects.values('bidder__username')
            .annotate(
                bid_count=Count('id'),
                total_bid_amount=Sum('amount'),
            )
            .order_by('-bid_count', '-total_bid_amount')[:5]
        ]

        return Response(
            {
                'total_active_auctions': total_active_auctions,
                'total_bids_placed': total_bids_placed,
                'total_bidding_volume': total_bidding_volume,
                'category_breakdown': category_breakdown,
                'bid_escalation_history': bid_escalation_history,
                'top_active_bidders': top_active_bidders,
            },
            status=status.HTTP_200_OK,
        )


class AnalyticsDashboardView(TemplateView):
    """Serve the interactive Chart.js analytics dashboard."""

    template_name = 'analytics.html'
