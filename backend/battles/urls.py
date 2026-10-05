from django.urls import path

from .views import CreateView, JoinView, StartView

app_name = "battles"

urlpatterns = [
    path("battles/", CreateView.as_view(), name="create"),
    path("battles/<str:code>/join/", JoinView.as_view(), name="join"),
    path("battles/<str:code>/start/", StartView.as_view(), name="start"),
]
