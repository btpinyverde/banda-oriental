from django.urls import path

from .views import DailyView, GuessView, ScoreView

app_name = "gameplay"

urlpatterns = [
    path("daily/", DailyView.as_view(), name="daily"),
    path("daily/guess/", GuessView.as_view(), name="guess"),
    path("daily/score/", ScoreView.as_view(), name="score"),
]
