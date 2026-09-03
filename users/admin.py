from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.contrib.auth.models import User

from config.admin import bidkori_admin_site

from .models import UserProfile


class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False
    fk_name = 'user'
    extra = 0


class UserAdmin(DjangoUserAdmin):
    inlines = [UserProfileInline]


# Re-register User on the BidKori admin site with the profile inline.
try:
    bidkori_admin_site.unregister(User)
except admin.sites.NotRegistered:
    pass
bidkori_admin_site.register(User, UserAdmin)


@admin.register(UserProfile, site=bidkori_admin_site)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'role', 'created_at', 'updated_at')
    list_filter = ('role',)
    search_fields = ('user__username', 'user__email')
    readonly_fields = ('created_at', 'updated_at')
