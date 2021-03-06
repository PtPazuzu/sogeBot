<template lang="pug">
  b-container(fluid ref="window")
    b-row
      b-col
        span.title.text-default.mb-2
          | {{ translate('menu.registry') }}
          small.px-2
            fa(icon="angle-right")
          | {{ translate('menu.randomizer') }}

    panel
      template(v-slot:left)
        button-with-icon(icon="plus" href="#/registry/randomizer/edit").btn-primary.btn-reverse {{ translate('registry.randomizer.addRandomizer') }}
      template(v-slot:right)
        button-with-icon(
          text="/overlays/randomizer"
          href="/overlays/randomizer"
          class="btn-dark mr-2 ml-0"
          icon="link"
          target="_blank"
        )

    loading(v-if="state.loading !== $state.success")
    b-table(v-else :fields="fields" :items="filteredItems" hover striped small @row-clicked="linkTo($event)")
      template(v-slot:cell(permissionId)="data")
        span(v-if="getPermissionName(data.item.permissionId)") {{ getPermissionName(data.item.permissionId) }}
        span(v-else class="text-danger")
          fa(icon="exclamation-triangle") Permission not found
      template(v-slot:cell(options)="data")
        | {{ Array.from(new Set(data.item.items.map(o => o.name))).join(', ') }}
      template(v-slot:cell(buttons)="data")
        div(style="width: max-content !important;").float-right
          button-with-icon(
            @click="toggleVisibility(data.item)"
            :class="{ 'btn-success': data.item.isShown, 'btn-danger': !data.item.isShown }"
            :icon="!data.item.isShown ? 'eye-slash' : 'eye'"
          ).btn-only-icon
          button-with-icon(
            @click="startSpin"
            class="btn-secondary ml-0 mr-0"
            icon="circle-notch" :spin="spin" :disabled="spin"
          ).btn-only-icon
          button-with-icon(icon="edit" v-bind:href="'#/registry/randomizer/edit/' + data.item.id").btn-only-icon.btn-primary.btn-reverse
            | {{ translate('dialog.buttons.edit') }}
          hold-button(@trigger="remove(data.item)" icon="trash").btn-danger.btn-reverse.btn-only-icon
            template(slot="title") {{translate('dialog.buttons.delete')}}
            template(slot="onHoldTitle") {{translate('dialog.buttons.hold-to-delete')}}
  </div>
</template>

<script lang="ts">
import { Vue, Component } from 'vue-property-decorator';
import { getSocket } from 'src/panel/helpers/socket';

import type { RandomizerInterface } from 'src/bot/database/entity/randomizer';

import { library } from '@fortawesome/fontawesome-svg-core'
import { faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
library.add(faExclamationTriangle)

@Component({
  components: {
    'loading': () => import('../../../components/loading.vue'),
  },
})
export default class randomizerList extends Vue {
  psocket: SocketIOClient.Socket = getSocket('/core/permissions');
  socket: SocketIOClient.Socket =  getSocket('/registries/randomizer');

  fields = [
    { key: 'name', label: this.translate('registry.randomizer.form.name'), sortable: true },
    { key: 'command', label: this.translate('registry.randomizer.form.command'), sortable: true },
    { key: 'permissionId', label: this.translate('registry.randomizer.form.permission') },
    // virtual attributes
    { key: 'options', label: this.translate('registry.randomizer.form.options') },
    { key: 'buttons', label: '' },
  ];

  items: Required<RandomizerInterface>[] = [];
  permissions: {id: string; name: string;}[] = [];
  search: string = '';
  spin = false;

  state: {
    loading: number;
  } = {
    loading: this.$state.idle,
  };

  get filteredItems() {
    return this.items;
  }

  toggleVisibility(item) {
    item.isShown = !item.isShown;
    if(item.isShown) {
      this.socket.emit('randomizer::showById', item.id, () => {
        this.refresh();
      });
    } else {
      this.socket.emit('randomizer::hideAll', () => {
        this.refresh();
      });
    }
  }

  mounted() {
    this.state.loading = this.$state.progress;
    this.refresh();
  }

  async refresh() {
    await Promise.all([
      new Promise(async(done) => {
        this.psocket.emit('permissions', (data) => {
          this.permissions = data
          done();
        });
      }),
      new Promise(async(done) => {
        this.socket.emit('randomizer::getAll', (data) => {
          console.groupCollapsed('randomizer::getAll')
          console.debug(data);
          console.groupEnd;
          this.items = data;
          done();
        })
      })
    ])

    this.state.loading = this.$state.success;
  }

  startSpin() {
    this.spin = true;
    this.socket.emit('randomizer::startSpin', () => {});
    setTimeout(() => {
      this.spin = false;
    }, 5000);
  }

  remove(item) {
    this.socket.emit('randomizer::remove', item, (err) => {
      if (err) {
        console.error(err);
      } else {
        this.refresh();
      }
    })
  }

  linkTo(item) {
    console.debug('Clicked', item.id);
    this.$router.push({ name: 'RandomizerRegistryEdit', params: { id: item.id } });
  }

  getPermissionName(id) {
    if (!id) return null
    const permission = this.permissions.find((o) => {
      return o.id === id
    })
    if (typeof permission !== 'undefined') {
      if (permission.name.trim() === '') {
        return permission.id
      } else {
        return permission.name
      }
    } else {
      return null
    }
  }
}
</script>