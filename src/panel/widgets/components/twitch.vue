<template lang="pug">
  div.widget
    b-card(no-body).border-0.h-100
      b-tabs(pills card style="overflow:hidden").h-100
        template(v-slot:tabs-start)
          template(v-if="!popout")
            li(v-if="typeof nodrag === 'undefined'").nav-item.px-2.grip.text-secondary.align-self-center
              fa(icon="grip-vertical" fixed-width)
            li.nav-item
              b-dropdown(ref="dropdown" boundary="window" no-caret :text="translate('widget-title-twitch')" variant="outline-primary" toggle-class="border-0")
                b-dropdown-item(target="_blank" href="/popout/#twitch")
                  | Popout
                b-dropdown-divider
                b-dropdown-item
                  a(href="#" @click.prevent="$refs.dropdown.hide(); $nextTick(() => EventBus.$emit('remove-widget', 'twitch'))" class="text-danger")
                    | Remove <strong>{{translate('widget-title-twitch')}}</strong> widget
          template(v-else)
            b-button(variant="outline-primary" :disabled="true").border-0 {{ translate('widget-title-twitch') }}

        b-tab(active)
          template(v-slot:title)
            fa(:icon="['fab', 'twitch']")
          b-card-text.h-100
            iframe(
              v-if="show"
              style="width: 100%; height: 100%"
              :src="videoUrl"
              frameborder="0"
            )

        template(v-slot:tabs-end)
          b-nav-item(href="#" @click="refresh")
            fa(icon="sync-alt" v-if="!isRefreshing" fixed-width)
            fa(icon="sync-alt" spin v-else fixed-width)
</template>

<script>
import { getSocket } from 'src/panel/helpers/socket';
import { EventBus } from 'src/panel/helpers/event-bus';

export default {
  props: ['popout', 'nodrag'],
  data: function () {
    return {
      EventBus,
      socket: getSocket('/core/twitch'),
      room: '',
      show: true,
      isRefreshing: false
    }
  },
  created: function () {
    this.socket.emit('broadcaster', (room) => {
      this.room = room;
    })
  },
  computed: {
    videoUrl() {
      return `https://player.twitch.tv/?channel=${this.room}&autoplay=true&muted=true`
    }
  },
  methods: {
    refresh: function (event) {
      this.show = false;
      this.$nextTick(() => this.show = true);
    },
  },
  mounted: function () {
    this.$emit('mounted')
  },
}
</script>
