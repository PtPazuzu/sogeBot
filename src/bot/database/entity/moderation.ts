import { EntitySchema } from 'typeorm';
import { ColumnNumericTransformer } from './_transformer';

export interface ModerationWarningInterface {
  id?: number;
  username: string;
  timestamp?: number;
};

export interface ModerationPermitInterface {
  id?: number;
  username: string;
};

export interface ModerationMessageCooldownInterface {
  id?: number;
  name: string;
  timestamp: number;
};

export const ModerationWarning = new EntitySchema<Readonly<Required<ModerationWarningInterface>>>({
  name: 'moderation_warning',
  columns: {
    id: { type: Number, primary: true, generated: 'rowid' },
    username: { type: String },
    timestamp: { type: 'bigint', transformer: new ColumnNumericTransformer(), default: 0 },
  },
  indices: [
    { name: 'IDX_f941603aef2741795a9108d0d2', columns: ['username'] },
  ],
});

export const ModerationPermit = new EntitySchema<Readonly<Required<ModerationPermitInterface>>>({
  name: 'moderation_permit',
  columns: {
    id: { type: Number, primary: true, generated: 'rowid' },
    username: { type: String },
  },
  indices: [
    { name: 'IDX_69499e78c9ee1602baee77b97d', columns: ['username'] },
  ],
});

export const ModerationMessageCooldown = new EntitySchema<Readonly<Required<ModerationMessageCooldownInterface>>>({
  name: 'moderation_message_cooldown',
  columns: {
    id: { type: Number, primary: true, generated: 'rowid' },
    name: { type: String },
    timestamp: { type: 'bigint', transformer: new ColumnNumericTransformer(), default: 0 },
  },
  indices: [
    { name: 'IDX_45ad701f0c2955bc09b5661898', columns: ['name'], unique: true },
  ],
});