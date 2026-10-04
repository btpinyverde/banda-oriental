from django.urls import path

from .views import HealthView, HumanView

urlpatterns = [
    path("health/", HealthView.as_view(), name="health"),
    path("human/", HumanView.as_view(), name="human"),
]
