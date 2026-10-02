import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

User = get_user_model()


class Command(BaseCommand):
    """Creates a superuser from DJANGO_SUPERUSER_EMAIL/PASSWORD if one with
    that email doesn't exist yet. Safe to run on every deploy. Unlike the
    hard-fail settings checks, a missing admin login isn't worth breaking
    the build over — it just means nobody can log in yet."""

    help = "Ensure a superuser exists, from env vars, without crashing if they're unset."

    def handle(self, *args, **options):
        email = os.environ.get("DJANGO_SUPERUSER_EMAIL")
        password = os.environ.get("DJANGO_SUPERUSER_PASSWORD")
        if not email or not password:
            self.stdout.write("DJANGO_SUPERUSER_EMAIL/PASSWORD not set, skipping.")
            return
        if User.objects.filter(email=email).exists():
            self.stdout.write(f"Superuser {email} already exists, skipping.")
            return
        User.objects.create_superuser(username=email, email=email, password=password)
        self.stdout.write(f"Created superuser {email}.")
