from django.contrib import admin

from config.admin import bidkori_admin_site

from .models import Category, Product


@admin.register(Product, site=bidkori_admin_site)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('id', 'title', 'condition', 'seller', 'created_at')
    list_filter = ('category', 'seller', 'condition')
    search_fields = ('title', 'description')


bidkori_admin_site.register(Category)
