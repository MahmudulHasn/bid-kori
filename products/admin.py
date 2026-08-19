from django.contrib import admin

from .models import Category, Product


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('id', 'title', 'condition', 'seller', 'created_at')
    list_filter = ('category', 'seller', 'condition')
    search_fields = ('title', 'description')


admin.site.register(Category)
