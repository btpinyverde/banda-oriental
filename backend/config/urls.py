from django.contrib import admin
from django.urls import include, path

from core import views as core_views

handler404 = "core.views.not_found"

urlpatterns = [
    path("", core_views.root),
    path("robots.txt", core_views.robots),
    path("admin/", admin.site.urls),
    path("api/", include("core.urls")),
    path("api/", include("catalog.urls")),
    path("api/", include("gameplay.urls")),
    path("api/", include("accounts.urls")),
]
