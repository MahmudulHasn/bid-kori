from decimal import Decimal, InvalidOperation
import uuid

from django.contrib.auth.mixins import UserPassesTestMixin
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Avg, Count, F, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.generic import TemplateView
from drf_spectacular.utils import OpenApiParameter, OpenApiTypes, extend_schema
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAdminUser, IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Auction, AuctionImage, Bid, Payment
from .permissions import IsAuctionSellerOrReadOnly, IsNotSeller
from .serializers import (
    AuctionDetailSerializer,
    AuctionImageSerializer,
    AuctionImageUploadSerializer,
    AuctionSerializer,
    BidSerializer,
    ErrorMessageSerializer,
    PaymentSerializer,
    PlaceBidRequestSerializer,
    TransitionStatusSerializer,
)
from .services import AuctionLifecycleService, BidService
from .throttling import BidBurstThrottle

AUCTION_LIST_PARAMETERS = [
    OpenApiParameter(
        name='status',
        type=OpenApiTypes.STR,
        location=OpenApiParameter.QUERY,
        required=False,
        description='Filter by auction status (ACTIVE, CLOSED, CANCELLED).',
        enum=['ACTIVE', 'CLOSED', 'CANCELLED'],
    ),
    OpenApiParameter(
        name='category',
        type=OpenApiTypes.STR,
        location=OpenApiParameter.QUERY,
        required=False,
        description='Filter by product category name or slug.',
    ),
    OpenApiParameter(
        name='search',
        type=OpenApiTypes.STR,
        location=OpenApiParameter.QUERY,
        required=False,
        description='Search product title and description (case-insensitive).',
    ),
]


class AuctionViewSet(viewsets.ModelViewSet):
    """List, create, retrieve, update, and delete auctions.

    Accepts JSON and multipart/form-data so listing images can be uploaded
    alongside auction creation (field name: ``images``).
    """

    serializer_class = AuctionSerializer
    permission_classes = [IsAuthenticatedOrReadOnly, IsAuctionSellerOrReadOnly]
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    def get_queryset(self):
        queryset = (
            Auction.objects.select_related('product', 'product__category', 'winning_bidder')
            .prefetch_related('images')
            .all()
        )

        # List filters must not affect retrieve/update/destroy/place_bid/checkout;
        # otherwise e.g. GET /auctions/1/?status=CLOSED 404s an ACTIVE auction.
        if getattr(self, 'action', None) != 'list':
            return queryset

        status_param = self.request.query_params.get('status')
        category = self.request.query_params.get('category')
        search = self.request.query_params.get('search')

        if status_param:
            queryset = queryset.filter(status__iexact=status_param)
        if category:
            queryset = queryset.filter(
                Q(product__category__slug__iexact=category)
                | Q(product__category__name__iexact=category)
            )
        if search:
            queryset = queryset.filter(
                Q(product__title__icontains=search)
                | Q(product__description__icontains=search)
            )

        return queryset

    @extend_schema(
        tags=['Auctions'],
        summary='List auctions',
        parameters=AUCTION_LIST_PARAMETERS,
        responses={200: AuctionSerializer(many=True)},
    )
    def list(self, request, *args, **kwargs):
        # Close expired ACTIVE rows before filtering so ?status=ACTIVE cannot
        # return auctions that become CLOSED during serialization.
        now = timezone.now()
        expired_ids = list(
            Auction.objects.filter(
                status=Auction.Status.ACTIVE,
                end_time__lte=now,
            ).values_list('pk', flat=True)
        )
        for auction_id in expired_ids:
            AuctionLifecycleService.close_if_expired(auction_id)

        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @extend_schema(
        tags=['Auctions'],
        summary='Create an auction (JSON or multipart with images)',
        request={
            'application/json': AuctionSerializer,
            'multipart/form-data': {
                'type': 'object',
                'properties': {
                    'product': {'type': 'object'},
                    'starting_bid': {'type': 'string', 'format': 'decimal'},
                    'min_increment': {'type': 'string', 'format': 'decimal'},
                    'reserve_price': {'type': 'string', 'format': 'decimal'},
                    'start_time': {'type': 'string', 'format': 'date-time'},
                    'end_time': {'type': 'string', 'format': 'date-time'},
                    'is_featured': {'type': 'boolean'},
                    'images': {
                        'type': 'array',
                        'items': {'type': 'string', 'format': 'binary'},
                        'description': 'Optional auction images (multipart).',
                    },
                },
                'required': ['product', 'starting_bid', 'start_time', 'end_time'],
            },
        },
        responses={201: AuctionSerializer},
    )
    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    @extend_schema(tags=['Auctions'], summary='Retrieve an auction')
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.update_status_by_time()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    @extend_schema(tags=['Auctions'], summary='Update an auction')
    def update(self, request, *args, **kwargs):
        return super().update(request, *args, **kwargs)

    @extend_schema(tags=['Auctions'], summary='Partially update an auction')
    def partial_update(self, request, *args, **kwargs):
        return super().partial_update(request, *args, **kwargs)

    @extend_schema(tags=['Auctions'], summary='Delete an auction')
    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.save(seller=self.request.user)

    def get_throttles(self):
        if getattr(self, 'action', None) == 'place_bid':
            return [BidBurstThrottle()]
        return super().get_throttles()

    def permission_denied(self, request, message=None, code=None):
        from rest_framework.exceptions import PermissionDenied

        if getattr(self, 'action', None) == 'place_bid':
            raise PermissionDenied(
                detail={
                    'error': message
                    or 'Action forbidden: Sellers cannot bid on their own listings.',
                }
            )
        if getattr(self, 'action', None) in {
            'update',
            'partial_update',
            'destroy',
        }:
            raise PermissionDenied(
                detail={
                    'error': message or IsAuctionSellerOrReadOnly.message,
                }
            )
        return super().permission_denied(request, message=message, code=code)

    @extend_schema(
        tags=['Bidding'],
        summary='Place a bid on an auction',
        request=PlaceBidRequestSerializer,
        responses={
            201: BidSerializer,
            400: ErrorMessageSerializer,
            403: ErrorMessageSerializer,
            429: {'description': 'Bid rate limit exceeded (10/minute).'},
        },
    )
    @action(
        detail=True,
        methods=['post'],
        url_path='place-bid',
        permission_classes=[IsAuthenticated, IsNotSeller],
        throttle_classes=[BidBurstThrottle],
    )
    def place_bid(self, request, pk=None, auction_id=None):
        """Place a bid with atomic locking and bid-scoped rate limiting."""
        target_id = auction_id or pk
        auction = get_object_or_404(
            Auction.objects.select_related('product__seller'),
            pk=target_id,
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
                auction_id=target_id,
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

    @extend_schema(
        tags=['Payments'],
        summary='Checkout and pay for a won auction (mock)',
        request=None,
        responses={
            200: PaymentSerializer,
            400: ErrorMessageSerializer,
            403: ErrorMessageSerializer,
        },
    )
    @action(
        detail=True,
        methods=['post'],
        url_path='checkout',
        permission_classes=[IsAuthenticated],
    )
    def checkout(self, request, pk=None, auction_id=None):
        """Mock payment checkout for the auction winning bidder."""
        target_id = auction_id or pk
        auction = get_object_or_404(
            Auction.objects.select_related('winning_bidder', 'product'),
            pk=target_id,
        )

        if auction.status != Auction.Status.CLOSED:
            return Response(
                {'error': 'Checkout is only allowed for CLOSED auctions.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if auction.winning_bidder_id is None:
            return Response(
                {'error': 'This auction has no winning bidder to charge.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if request.user != auction.winning_bidder:
            return Response(
                {'error': 'Only the winning bidder can complete checkout.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        existing = Payment.objects.filter(auction=auction).first()
        if existing is not None and (
            existing.status == Payment.Status.COMPLETED or auction.is_paid
        ):
            return Response(
                {
                    'error': 'Payment already completed for this auction.',
                    'payment': PaymentSerializer(
                        existing, context={'request': request}
                    ).data,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        amount = auction.current_highest_bid
        transaction_id = f'TXN-{uuid.uuid4().hex[:16].upper()}'

        with transaction.atomic():
            if existing is not None:
                payment = existing
                payment.user = request.user
                payment.amount = amount
                payment.status = Payment.Status.COMPLETED
                payment.transaction_id = transaction_id
                payment.save(
                    update_fields=[
                        'user',
                        'amount',
                        'status',
                        'transaction_id',
                        'updated_at',
                    ]
                )
            else:
                payment = Payment.objects.create(
                    auction=auction,
                    user=request.user,
                    amount=amount,
                    status=Payment.Status.COMPLETED,
                    transaction_id=transaction_id,
                )

            auction.is_paid = True
            auction.save(update_fields=['is_paid'])

        serializer = PaymentSerializer(payment, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


# Backwards-compatible aliases used by existing URL imports / docs.
AuctionListCreateView = AuctionViewSet.as_view({'get': 'list', 'post': 'create'})
AuctionDetailView = AuctionViewSet.as_view({
    'get': 'retrieve',
    'put': 'update',
    'patch': 'partial_update',
    'delete': 'destroy',
})
PlaceBidView = AuctionViewSet.as_view({'post': 'place_bid'})
CheckoutView = AuctionViewSet.as_view({'post': 'checkout'})

class AuctionImageUploadView(APIView):
    """Upload one or more images to an existing auction (multipart/form-data)."""

    permission_classes = [IsAuthenticated, IsAuctionSellerOrReadOnly]
    parser_classes = (MultiPartParser, FormParser)

    @extend_schema(
        tags=['Auctions'],
        summary='Upload auction images',
        description='Upload one or more binary image files via multipart/form-data.',
        request={
            'multipart/form-data': {
                'type': 'object',
                'properties': {
                    'images': {
                        'type': 'array',
                        'items': {'type': 'string', 'format': 'binary'},
                        'description': 'Image files to attach to the auction.',
                    },
                },
                'required': ['images'],
            }
        },
        responses={
            201: AuctionImageSerializer(many=True),
            400: ErrorMessageSerializer,
            403: ErrorMessageSerializer,
        },
    )
    def post(self, request, auction_id):
        auction = get_object_or_404(
            Auction.objects.select_related('product__seller'),
            pk=auction_id,
        )
        self.check_object_permissions(request, auction)

        files = request.FILES.getlist('images') or request.FILES.getlist('image')
        if not files:
            return Response(
                {'error': 'No images provided. Use multipart field "images".'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate via schema serializer (keeps Swagger + runtime aligned).
        upload_serializer = AuctionImageUploadSerializer(
            data={'images': files},
            context={'request': request},
        )
        upload_serializer.is_valid(raise_exception=True)

        created = [
            AuctionImage.objects.create(auction=auction, image=image_file)
            for image_file in upload_serializer.validated_data['images']
        ]
        serializer = AuctionImageSerializer(
            created,
            many=True,
            context={'request': request},
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class TransitionAuctionStateView(APIView):
    """Transition an auction to a new status via the lifecycle service."""

    permission_classes = [IsAuthenticated, IsAuctionSellerOrReadOnly]

    @extend_schema(
        tags=['Auctions'],
        summary='Transition auction status',
        request=TransitionStatusSerializer,
        responses={
            200: AuctionSerializer,
            400: ErrorMessageSerializer,
            403: ErrorMessageSerializer,
        },
    )
    def post(self, request, pk):
        auction = get_object_or_404(
            Auction.objects.select_related('product__seller'),
            pk=pk,
        )
        self.check_object_permissions(request, auction)
        new_status = request.data.get('status')

        if not new_status:
            return Response(
                {'error': "Field 'status' is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            auction = AuctionLifecycleService.transition(pk, new_status)
        except ValidationError as exc:
            return Response(
                {'error': exc.messages[0] if exc.messages else str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = AuctionSerializer(auction, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class ActiveAuctionListView(APIView):
    """Return auctions that are ACTIVE and have not yet reached end_time."""

    @extend_schema(
        tags=['Auctions'],
        summary='List active auctions',
        parameters=[
            OpenApiParameter(
                name='category',
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                required=False,
                description='Filter by product category name or slug.',
            ),
            OpenApiParameter(
                name='search',
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                required=False,
                description='Search product title and description.',
            ),
        ],
        responses={200: AuctionDetailSerializer(many=True)},
    )
    def get(self, request):
        now = timezone.now()
        # Match Auction.is_biddable(): ACTIVE and within [start_time, end_time).
        auctions = (
            Auction.objects.filter(
                status=Auction.Status.ACTIVE,
                start_time__lte=now,
                end_time__gt=now,
            )
            .select_related('product', 'product__category', 'winning_bidder')
            .prefetch_related('bids__bidder', 'images')
        )

        category = request.query_params.get('category')
        search = request.query_params.get('search')
        if category:
            auctions = auctions.filter(
                Q(product__category__slug__iexact=category)
                | Q(product__category__name__iexact=category)
            )
        if search:
            auctions = auctions.filter(
                Q(product__title__icontains=search)
                | Q(product__description__icontains=search)
            )

        serializer = AuctionDetailSerializer(
            auctions,
            many=True,
            context={'request': request},
        )
        return Response(serializer.data, status=status.HTTP_200_OK)


class AuctionBidHistoryView(APIView):
    """Return all bids for an auction, ordered by highest amount first."""

    @extend_schema(
        tags=['Bidding'],
        summary='List bid history for an auction',
        responses={200: BidSerializer(many=True)},
    )
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

    @extend_schema(
        tags=['Bidding'],
        summary='List bids placed by the authenticated user',
        responses={200: BidSerializer(many=True)},
    )
    def get(self, request, *args, **kwargs):
        return self.list(request, *args, **kwargs)

    def get_queryset(self):
        return Bid.objects.select_related(
            'auction',
            'auction__product',
            'bidder',
        ).filter(bidder=self.request.user)


class AnalyticsSummaryView(APIView):
    """Aggregate auction and bidding metrics for dashboards and reporting.

    Staff-only: includes bidder-level fields intended for internal operations.
    """

    permission_classes = [IsAdminUser]

    @extend_schema(
        tags=['Analytics'],
        summary='Auction analytics summary (staff only)',
        responses={
            200: OpenApiTypes.OBJECT,
            403: {'description': 'Admin privileges required.'},
        },
    )
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


class AnalyticsDashboardView(UserPassesTestMixin, TemplateView):
    """Serve the interactive Chart.js analytics dashboard (staff only)."""

    template_name = 'analytics.html'
    raise_exception = True

    def test_func(self):
        return self.request.user.is_authenticated and self.request.user.is_staff
