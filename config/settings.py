"""
Django settings for config project.

Secrets and environment-specific values come from the process environment
(and optional root ``.env``). Never commit real secrets.
"""

import os
import sys
from pathlib import Path

import dj_database_url
from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# Load environment variables from a .env file at the project root (if present).
# Existing process env wins over .env values.
load_dotenv(BASE_DIR / '.env')


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ('true', '1', 'yes', 'on')


def _env_csv(name: str, default: str = '') -> list[str]:
    raw = os.getenv(name, default)
    return [item.strip() for item in raw.split(',') if item.strip()]


def _running_tests() -> bool:
    if os.getenv('DJANGO_TEST', '').lower() in ('1', 'true', 'yes'):
        return True
    if os.getenv('PYTEST_CURRENT_TEST'):
        return True
    return len(sys.argv) > 1 and sys.argv[1] == 'test'


RUNNING_TESTS = _running_tests()

# ---------------------------------------------------------------------------
# Core security
# ---------------------------------------------------------------------------

SECRET_KEY = os.getenv('SECRET_KEY', '').strip()
if not SECRET_KEY:
    if RUNNING_TESTS:
        # Ephemeral key for manage.py test only — never used as a production default.
        SECRET_KEY = 'test-only-insecure-secret-key'
    else:
        raise ImproperlyConfigured(
            'SECRET_KEY is required. Copy .env.example to .env and set a unique value.'
        )

# Default False: production-safe when unset. Local .env.example sets DEBUG=True.
DEBUG = _env_bool('DEBUG', default=False)

ALLOWED_HOSTS = _env_csv('ALLOWED_HOSTS')
if not ALLOWED_HOSTS:
    if DEBUG or RUNNING_TESTS:
        ALLOWED_HOSTS = ['localhost', '127.0.0.1', 'testserver']
    else:
        raise ImproperlyConfigured(
            'ALLOWED_HOSTS must be set when DEBUG is False '
            '(comma-separated hostnames, no wildcards recommended).'
        )

if '*' in ALLOWED_HOSTS and not DEBUG:
    raise ImproperlyConfigured(
        'ALLOWED_HOSTS must not contain "*" when DEBUG is False.'
    )


# ---------------------------------------------------------------------------
# Application definition
# ---------------------------------------------------------------------------

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'rest_framework.authtoken',
    'drf_spectacular',
    'products',
    'auctions',
    'users',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'


# ---------------------------------------------------------------------------
# Database — DATABASE_URL or local SQLite
# ---------------------------------------------------------------------------

# Empty DATABASE_URL in .env must not override the SQLite default.
_database_url = os.getenv('DATABASE_URL', '').strip()
DATABASES = {
    'default': dj_database_url.parse(
        _database_url or f'sqlite:///{BASE_DIR / "db.sqlite3"}',
        conn_max_age=int(os.getenv('DB_CONN_MAX_AGE', '600') or '600'),
    )
}


# ---------------------------------------------------------------------------
# Password validation
# ---------------------------------------------------------------------------

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# ---------------------------------------------------------------------------
# Internationalization
# ---------------------------------------------------------------------------

LANGUAGE_CODE = 'en-us'
TIME_ZONE = os.getenv('TIME_ZONE', 'Asia/Dhaka')
USE_I18N = True
USE_TZ = True


# ---------------------------------------------------------------------------
# Static / media
# ---------------------------------------------------------------------------

STATIC_URL = os.getenv('STATIC_URL', '/static/')
STATIC_ROOT = BASE_DIR / 'staticfiles'
MEDIA_URL = os.getenv('MEDIA_URL', '/media/')
MEDIA_ROOT = BASE_DIR / 'media'

STORAGES = {
    'default': {
        'BACKEND': 'django.core.files.storage.FileSystemStorage',
    },
    'staticfiles': {
        'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage',
    },
}


# ---------------------------------------------------------------------------
# Email
# ---------------------------------------------------------------------------

EMAIL_BACKEND = os.getenv(
    'EMAIL_BACKEND',
    'django.core.mail.backends.console.EmailBackend',
)
DEFAULT_FROM_EMAIL = os.getenv('DEFAULT_FROM_EMAIL', 'noreply@bidkori.local')
EMAIL_HOST = os.getenv('EMAIL_HOST', '')
EMAIL_PORT = int(os.getenv('EMAIL_PORT', '587') or '587')
EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD', '')
EMAIL_USE_TLS = _env_bool('EMAIL_USE_TLS', default=True)


# ---------------------------------------------------------------------------
# Django REST Framework
# ---------------------------------------------------------------------------

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.TokenAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticatedOrReadOnly',
    ],
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ],
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '100/day',
        'user': '1000/day',
        'bids': '10/minute',
    },
    'EXCEPTION_HANDLER': 'config.exceptions.custom_exception_handler',
}

# DRF authtoken rows do not expire automatically. Server-side revocation is
# available via POST /api/users/logout/. Token TTL/rotation policy is deferred
# until a broader auth architecture review (see users/auth_tokens.py).

SPECTACULAR_SETTINGS = {
    'TITLE': 'BidKori API',
    'DESCRIPTION': 'Real-time auction platform backend API documentation',
    'VERSION': '3.0.0',
}


# ---------------------------------------------------------------------------
# CORS / CSRF — explicit allow-lists; never CORS_ALLOW_ALL_ORIGINS in production
# ---------------------------------------------------------------------------

_DEFAULT_DEV_CORS = (
    'http://localhost:3000,'
    'http://127.0.0.1:3000,'
    'http://localhost:5173,'
    'http://127.0.0.1:5173'
)

CORS_ALLOWED_ORIGINS = _env_csv(
    'CORS_ALLOWED_ORIGINS',
    default=_DEFAULT_DEV_CORS if (DEBUG or RUNNING_TESTS) else '',
)
CORS_ALLOW_CREDENTIALS = _env_bool('CORS_ALLOW_CREDENTIALS', default=True)
CORS_ALLOW_ALL_ORIGINS = False

if not DEBUG and not CORS_ALLOWED_ORIGINS and not RUNNING_TESTS:
    # Fail closed for browser clients in production rather than allowing *.
    # Set CORS_ALLOWED_ORIGINS explicitly for your frontend origin(s).
    pass

CSRF_TRUSTED_ORIGINS = _env_csv('CSRF_TRUSTED_ORIGINS')


# ---------------------------------------------------------------------------
# Production HTTPS / cookie hardening (when DEBUG is False)
# ---------------------------------------------------------------------------

if not DEBUG:
    SESSION_COOKIE_SECURE = _env_bool('SESSION_COOKIE_SECURE', default=True)
    CSRF_COOKIE_SECURE = _env_bool('CSRF_COOKIE_SECURE', default=True)
    SECURE_SSL_REDIRECT = _env_bool('SECURE_SSL_REDIRECT', default=True)
    SECURE_HSTS_SECONDS = int(os.getenv('SECURE_HSTS_SECONDS', '31536000'))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = _env_bool(
        'SECURE_HSTS_INCLUDE_SUBDOMAINS',
        default=True,
    )
    SECURE_HSTS_PRELOAD = _env_bool('SECURE_HSTS_PRELOAD', default=True)
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')


# ---------------------------------------------------------------------------
# Logging — never attach SECRET_KEY / DATABASE_URL / passwords to log output
# ---------------------------------------------------------------------------

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'simple': {
            'format': '[{levelname}] {asctime} {name}: {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'simple',
        },
    },
    'root': {
        'handlers': ['console'],
        # Default INFO so request noise (and accidental secret echoes) stay down.
        'level': os.getenv('LOG_LEVEL', 'INFO'),
    },
    'loggers': {
        'django.security': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}
