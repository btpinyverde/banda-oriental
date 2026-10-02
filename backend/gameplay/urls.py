from django.urls import path

from .views import DailyView

app_name = "gameplay"

urlpatterns = [
    path("daily/", DailyView.as_view(), name="daily"),
]
