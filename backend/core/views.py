from django.db import OperationalError, connection
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthView(APIView):
    def get(self, request):
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
        except OperationalError:
            return Response({"status": "error", "db": "unreachable"}, status=503)
        return Response({"status": "ok", "db": "ok"})
