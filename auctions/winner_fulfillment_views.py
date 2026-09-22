from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .services import (
    WinnerDetailsForbidden,
    WinnerDetailsValidationError,
    WinnerFulfillmentService,
)
from .winner_fulfillment_serializers import (
    WinnerFulfillmentDetailsSerializer,
    WinnerFulfillmentDraftSerializer,
)


class WinnerFulfillmentDetailsView(APIView):
    """Retrieve and update buyer winner fulfillment details and incremental draft state.

    Only accessible by the verified winning bidder of a CLOSED auction.
    GET returns NOT_STARTED default template if no draft exists yet (lazy creation).
    PATCH persists step draft updates into PostgreSQL.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=['Winner Fulfillment'],
        summary='Retrieve winner fulfillment details for won auction',
        description='Fetches the saved draft or completed fulfillment details. Accessible only to the winning buyer.',
        responses={
            200: WinnerFulfillmentDetailsSerializer,
            400: {'type': 'object', 'properties': {'error': {'type': 'string'}}},
            401: {'type': 'object', 'properties': {'detail': {'type': 'string'}}},
            403: {'type': 'object', 'properties': {'error': {'type': 'string'}}},
            404: {'type': 'object', 'properties': {'detail': {'type': 'string'}}},
        },
    )
    def get(self, request, auction_id=None, pk=None):
        target_id = auction_id if auction_id is not None else pk
        try:
            auction, details = WinnerFulfillmentService.get_details_for_winner(
                target_id,
                request.user,
            )
        except WinnerDetailsForbidden as exc:
            return Response({'error': exc.message}, status=status.HTTP_403_FORBIDDEN)
        except WinnerDetailsValidationError as exc:
            return Response({'error': exc.message}, status=status.HTTP_400_BAD_REQUEST)

        if details is None:
            prefilled_name = request.user.get_full_name() or request.user.username
            prefilled_email = request.user.email or ''
            return Response(
                {
                    'status': 'NOT_STARTED',
                    'completed_step': 0,
                    'auction_id': auction.pk,
                    'buyer_id': request.user.pk,
                    'buyer_username': request.user.username,
                    'full_name': prefilled_name,
                    'phone': '',
                    'email': prefilled_email,
                    'address_line': '',
                    'area': '',
                    'district': '',
                    'division': '',
                    'postal_code': '',
                    'preferred_contact_method': 'PHONE',
                    'delivery_note': '',
                    'submitted_at': None,
                    'created_at': None,
                    'updated_at': None,
                },
                status=status.HTTP_200_OK,
            )

        serializer = WinnerFulfillmentDetailsSerializer(details)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=['Winner Fulfillment'],
        summary='Save winner fulfillment draft progress',
        description='Persists draft data across wizard steps into PostgreSQL.',
        request=WinnerFulfillmentDraftSerializer,
        responses={
            200: WinnerFulfillmentDetailsSerializer,
            400: {'type': 'object', 'properties': {'error': {'type': 'string'}}},
            401: {'type': 'object', 'properties': {'detail': {'type': 'string'}}},
            403: {'type': 'object', 'properties': {'error': {'type': 'string'}}},
            404: {'type': 'object', 'properties': {'detail': {'type': 'string'}}},
        },
    )
    def patch(self, request, auction_id=None, pk=None):
        target_id = auction_id if auction_id is not None else pk
        serializer = WinnerFulfillmentDraftSerializer(data=request.data, partial=True)
        if not serializer.is_valid():
            first_key = next(iter(serializer.errors.keys()))
            first_err = serializer.errors[first_key][0]
            return Response(
                {'error': f'{first_key}: {first_err}', 'errors': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            details = WinnerFulfillmentService.save_draft(
                target_id,
                request.user,
                serializer.validated_data,
                completed_step=serializer.validated_data.get('completed_step'),
            )
        except WinnerDetailsForbidden as exc:
            return Response({'error': exc.message}, status=status.HTTP_403_FORBIDDEN)
        except WinnerDetailsValidationError as exc:
            return Response({'error': exc.message}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            WinnerFulfillmentDetailsSerializer(details).data,
            status=status.HTTP_200_OK,
        )


class WinnerFulfillmentSubmitView(APIView):
    """Final submission endpoint validating completeness and transitioning status to COMPLETED."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=['Winner Fulfillment'],
        summary='Submit winner fulfillment details',
        description='Validates all required fields and marks status as COMPLETED.',
        request=WinnerFulfillmentDraftSerializer,
        responses={
            200: WinnerFulfillmentDetailsSerializer,
            400: {'type': 'object', 'properties': {'error': {'type': 'string'}}},
            401: {'type': 'object', 'properties': {'detail': {'type': 'string'}}},
            403: {'type': 'object', 'properties': {'error': {'type': 'string'}}},
            404: {'type': 'object', 'properties': {'detail': {'type': 'string'}}},
        },
    )
    def post(self, request, auction_id=None, pk=None):
        target_id = auction_id if auction_id is not None else pk
        incoming_data = request.data if isinstance(request.data, dict) else {}

        if incoming_data:
            serializer = WinnerFulfillmentDraftSerializer(data=incoming_data, partial=True)
            if not serializer.is_valid():
                first_key = next(iter(serializer.errors.keys()))
                first_err = serializer.errors[first_key][0]
                return Response(
                    {'error': f'{first_key}: {first_err}', 'errors': serializer.errors},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            incoming_data = serializer.validated_data

        try:
            details = WinnerFulfillmentService.submit_details(
                target_id,
                request.user,
                data=incoming_data or None,
            )
        except WinnerDetailsForbidden as exc:
            return Response({'error': exc.message}, status=status.HTTP_403_FORBIDDEN)
        except WinnerDetailsValidationError as exc:
            return Response({'error': exc.message}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            WinnerFulfillmentDetailsSerializer(details).data,
            status=status.HTTP_200_OK,
        )
