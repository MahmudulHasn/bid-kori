# Project: BidKori (Real-Time Online Auction Marketplace)

## Tech Stack & Architecture
- Backend Framework: Django, Django REST Framework (DRF), Django Channels (WebSockets)
- Database & In-Memory Store: PostgreSQL, Redis
- Frontend/API: REST API endpoints + Real-time WebSockets
- AI Integrations: AI Product Description Generator (for sellers), AI Chatbot Site Assistant (for buyers)

## Code Standards & Style
- Always use standard Django app architecture (models, views, serializers, urls).
- Use Django REST Framework APIViews or ViewSets for API endpoints.
- Keep business logic inside serializers or dedicated service functions rather than views.
- Ensure all models include standard timestamp fields (`created_at`, `updated_at`).
- Ensure proper exception handling and clear JSON response structures for APIs.
- Write code with security in mind (prevent shill-bidding, validate auction start/end times, check user permissions).

## App Boundaries
- `products`: Handles product listing creation, categories, images, seller items, and AI description generation.
- `auctions`: Handles auction engine, bidding models, countdown state, live bidding history, and winner selection.