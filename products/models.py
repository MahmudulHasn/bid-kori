from django.contrib.auth.models import User
from django.db import models

from .image_validation import validate_product_image


class Category(models.Model):
    """A grouping for products (e.g. Electronics, Vehicles, Art)."""

    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(unique=True)

    class Meta:
        verbose_name_plural = 'Categories'
        ordering = ['name', 'id']

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
        User,
        on_delete=models.CASCADE,
        related_name='products',
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


class ProductImage(models.Model):
    """An uploaded image attached to a Product catalog item.

    Default / cover image for display and future AI is the first row by
    ``uploaded_at``, then ``id`` (no separate primary flag in MVP).
    """

    product = models.ForeignKey(
        Product,
        related_name='images',
        on_delete=models.CASCADE,
    )
    image = models.ImageField(
        upload_to='product_images/',
        validators=[validate_product_image],
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['uploaded_at', 'id']

    def __str__(self):
        return f'ProductImage {self.pk} for {self.product_id}'

    def delete(self, using=None, keep_parents=False):
        """Remove the DB row and the underlying storage object."""
        name = self.image.name if self.image else ''
        storage = self.image.storage if self.image else None
        super().delete(using=using, keep_parents=keep_parents)
        if name and storage is not None:
            try:
                storage.delete(name)
            except Exception:
                # Storage cleanup must not undo a successful DB delete.
                pass
