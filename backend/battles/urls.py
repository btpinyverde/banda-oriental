from django.urls import path

from .views import CreateView

app_name = "battles"

urlpatterns = [
    path("battles/", CreateView.as_view(), name="create"),
]
