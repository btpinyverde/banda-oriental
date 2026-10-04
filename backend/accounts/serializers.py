from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

User = get_user_model()
MAX_EMAIL_LENGTH = User._meta.get_field("username").max_length  # 150: the email is the username


def normalize_email(value: str) -> str:
    return value.strip().lower()


class EmailField(serializers.EmailField):
    def to_internal_value(self, data):
        return super().to_internal_value(normalize_email(data) if isinstance(data, str) else data)


class RegisterSerializer(serializers.Serializer):
    email = EmailField(max_length=MAX_EMAIL_LENGTH)
    password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=128)

    def validate(self, attrs):
        try:
            validate_password(attrs["password"], user=User(username=attrs["email"], email=attrs["email"]))
        except DjangoValidationError as error:
            raise serializers.ValidationError({"password": list(error.messages)})
        return attrs


class TokenSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=200)


class LoginSerializer(serializers.Serializer):
    email = EmailField(max_length=MAX_EMAIL_LENGTH)
    password = serializers.CharField(trim_whitespace=False, max_length=128)


class EmailSerializer(serializers.Serializer):
    email = EmailField(max_length=MAX_EMAIL_LENGTH)


class ResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=200)
    password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=128)

    def validate(self, attrs):
        # Looked at without using the link up, so a weak password doesn't burn it. Knowing the address lets the
        # "too similar to your email" check run too.
        from .models import EmailChallenge

        link = EmailChallenge.peek(attrs["token"], EmailChallenge.RESET)
        user = User(username=link.email, email=link.email) if link else None
        try:
            validate_password(attrs["password"], user=user)
        except DjangoValidationError as error:
            raise serializers.ValidationError({"password": list(error.messages)})
        return attrs
