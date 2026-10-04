from django.urls import path

from .views import (
    ArchiveDetailView,
    ArchiveListView,
    DailyView,
    GuessView,
    LeaderboardTodayView,
    ScoreView,
    StatsView,
)

app_name = "gameplay"

urlpatterns = [
    path("daily/", DailyView.as_view(), name="daily"),
    path("daily/guess/", GuessView.as_view(), name="guess"),
    path("daily/score/", ScoreView.as_view(), name="score"),
    path("stats/", StatsView.as_view(), name="stats"),
    path("leaderboard/today/", LeaderboardTodayView.as_view(), name="leaderboard-today"),
    path("archive/", ArchiveListView.as_view(), name="archive-list"),
    path("archive/<str:fecha>/", ArchiveDetailView.as_view(), name="archive-detail"),
]
