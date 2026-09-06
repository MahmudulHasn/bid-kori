FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y libpq-dev gcc && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# collectstatic needs Django settings; use disposable build-time placeholders only.
# Runtime SECRET_KEY / DEBUG / DATABASE_URL come from Compose/env at container start.
ENV DEBUG=False
ENV SECRET_KEY=build-time-only-not-for-runtime
ENV ALLOWED_HOSTS=localhost
ENV CORS_ALLOWED_ORIGINS=
RUN python manage.py collectstatic --noinput

EXPOSE 8000

# Daphne serves HTTP + WebSockets via config.asgi (Channels).
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "config.asgi:application"]
