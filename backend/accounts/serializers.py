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


class StrictBoolean(serializers.Field):
    """A real true or false: "yes", 1 or "true" are not accepted, so a consent is never inferred from a loose value."""

    default_error_messages = {"invalid": "Tiene que ser verdadero o falso."}

    def to_internal_value(self, data):
        if isinstance(data, bool):
            return data
        self.fail("invalid")

    def to_representation(self, value):
        return bool(value)


TERMS_REQUIRED = "Para crear la cuenta tenés que aceptar los Términos y la Política de Privacidad."


class RegisterSerializer(serializers.Serializer):
    email = EmailField(max_length=MAX_EMAIL_LENGTH)
    password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=128)
    # Required: the account is only created by someone who accepted the Terms and the Privacy policy.
    accepts_terms = StrictBoolean(error_messages={"required": TERMS_REQUIRED, "null": TERMS_REQUIRED, "invalid": TERMS_REQUIRED})
    # Optional and off by default: whether they also want news by email.
    accepts_news = StrictBoolean(required=False, default=False)

    def validate_accepts_terms(self, value):
        if value is not True:
            raise serializers.ValidationError(TERMS_REQUIRED)
        return value

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


class MagicRequestSerializer(EmailSerializer):
    """The link can create the account, so it carries the (optional, off by default) news choice."""

    accepts_news = StrictBoolean(required=False, default=False)


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
