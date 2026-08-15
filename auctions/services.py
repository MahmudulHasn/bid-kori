from django.core.exceptions import ValidationError

from .models import Auction


class AuctionStateMachine:
    """Enforces valid status transitions for an :class:`~auctions.models.Auction`.

    The auction lifecycle is a directed graph; only the transitions declared in
    :attr:`ALLOWED_TRANSITIONS` are permitted. Any attempt to move an auction to
    a status that is not reachable from its current status is rejected.
    """

    ALLOWED_TRANSITIONS = {
        Auction.Status.ACTIVE: [
            Auction.Status.CLOSED,
            Auction.Status.CANCELLED,
        ],
        Auction.Status.CLOSED: [],
        Auction.Status.CANCELLED: [],
    }

    @classmethod
    def transition(cls, auction, new_status):
        """Move ``auction`` to ``new_status`` if the transition is allowed.

        Args:
            auction: The :class:`~auctions.models.Auction` instance to update.
            new_status: The target status (a value from
                :class:`~auctions.models.Auction.Status`).

        Returns:
            The updated auction instance.

        Raises:
            ValidationError: If ``new_status`` is not a valid transition from
                the auction's current status.
        """
        current_status = auction.status
        allowed = cls.ALLOWED_TRANSITIONS.get(current_status, [])

        if new_status not in allowed:
            raise ValidationError(
                f"Invalid status transition: '{current_status}' -> '{new_status}'."
            )

        auction.status = new_status
        auction.save(update_fields=['status'])
        return auction
