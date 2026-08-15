from django.conf import settings
from django.db import models


class Category(models.Model):
    """A grouping for products (e.g. Electronics, Vehicles, Art)."""

    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(unique=True)

    class Meta:
        verbose_name_plural = 'Categories'
        ordering = ['name']

    def __str__(self):
        return self.name


class Product(models.Model):
    """An item listed by a seller that can be put up for auction."""

    class Condition(models.TextChoices):
        NEW = 'NEW', 'Brand New'
        USED_LIKE_NEW = 'USED_LIKE_NEW', 'Used - Like New'
        USED_GOOD = 'USED_GOOD', 'Used - Good'
        FAIR = 'FAIR', 'Fair Condition'

    seller = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name='products',
        on_delete=models.CASCADE,
    )
    category = models.ForeignKey(
        Category,
        related_name='products',
        null=True,
        on_delete=models.SET_NULL,
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    condition = models.CharField(
        max_length=20,
        choices=Condition.choices,
        default=Condition.USED_GOOD,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title
