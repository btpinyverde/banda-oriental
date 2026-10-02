from django.contrib import admin

from .models import DailySong, Stem


class StemInline(admin.TabularInline):
    model = Stem
    extra = 4
    min_num = 4
    max_num = 4

    def get_formset(self, request, obj=None, **kwargs):
        # InlineModelAdmin.get_formset() never reads validate_min/
        # validate_max as class attributes — those only exist on
        # inlineformset_factory itself. Without passing them through
        # kwargs here, min_num/max_num only affect how many blank forms
        # render; they don't actually reject a submission with too few
        # or too many stems (confirmed empirically: a 3-stem submission
        # saved successfully until this fix was added).
        kwargs["validate_min"] = True
        kwargs["validate_max"] = True
        return super().get_formset(request, obj, **kwargs)


@admin.register(DailySong)
class DailySongAdmin(admin.ModelAdmin):
    list_display = ("date", "song", "state")
    list_filter = ("state",)
    date_hierarchy = "date"
    inlines = [StemInline]
