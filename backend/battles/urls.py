from django.urls import path

from .views import AnswerView, CreateView, DetailView, JoinView, MineView, StartView

app_name = "battles"

urlpatterns = [
    path("battles/", CreateView.as_view(), name="create"),
    path("battles/mine/", MineView.as_view(), name="mine"),  # before <code>/, or "mine" would be read as a code
    path("battles/<str:code>/join/", JoinView.as_view(), name="join"),
    path("battles/<str:code>/start/", StartView.as_view(), name="start"),
    path("battles/<str:code>/answer/", AnswerView.as_view(), name="answer"),
    path("battles/<str:code>/", DetailView.as_view(), name="detail"),
]
