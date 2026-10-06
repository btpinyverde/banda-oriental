from django.urls import path

from .views import AccessView, AnswerView, CreateView, DetailView, JoinView, MineView, PoolView, ReviewView, StartView, TeamView, YoutubeView

app_name = "battles"

urlpatterns = [
    path("battles/", CreateView.as_view(), name="create"),
    path("battles/access/", AccessView.as_view(), name="access"),
    path("battles/pool/", PoolView.as_view(), name="pool"),
    path("battles/youtube/", YoutubeView.as_view(), name="youtube"),
    path("battles/mine/", MineView.as_view(), name="mine"),  # before <code>/, or "mine" would be read as a code
    path("battles/<str:code>/join/", JoinView.as_view(), name="join"),
    path("battles/<str:code>/start/", StartView.as_view(), name="start"),
    path("battles/<str:code>/review/", ReviewView.as_view(), name="review"),
    path("battles/<str:code>/team/", TeamView.as_view(), name="team"),
    path("battles/<str:code>/answer/", AnswerView.as_view(), name="answer"),
    path("battles/<str:code>/", DetailView.as_view(), name="detail"),
]
