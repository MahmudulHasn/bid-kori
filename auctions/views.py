from django.core.exceptions import ValidationError
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Auction
from .serializers import AuctionSerializer
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
        auction = generics.get_object_or_404(Auction, pk=pk)
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
