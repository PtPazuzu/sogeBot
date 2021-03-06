/*
 * Changelog is saving informations about varaible
 * change to update it on memory on cluster
 */

import uuid from 'uuid/v4';

import { getRepository, LessThan, MoreThan, Not } from 'typeorm';
import { Settings } from './database/entity/settings';
import { Changelog } from './database/entity/changelog';
import { isDbConnected } from './helpers/database';

let lastTimestamp = Date.now();
const threadId = uuid();

export const change = ((namespace) => {
  if (!isDbConnected) {
    setTimeout(() => change(namespace), 1000);
  } else {
    getRepository(Changelog).save({ namespace, timestamp: Date.now(), threadId });
  }
});

export const changelog = async () => {
  if (!isDbConnected) {
    return setTimeout(() => changelog(), 1000);
  }

  const changes = await getRepository(Changelog).find({
    where: {
      timestamp: MoreThan(lastTimestamp),
      threadId: Not(threadId),
    },
  });
  for (const change of changes.sort((a, b) => a.timestamp - b.timestamp )) {
    let self: null | any = null;

    const [type, name, variable] = change.namespace.split('.');

    if (type === 'core') {
      self = (require('./' + name.toLowerCase())).default;
    } else {
      self = (require('./' + type + '/' + name.toLowerCase())).default;
    }

    const variableFromDb
     = await getRepository(Settings).createQueryBuilder('settings').select('settings')
       .where('namespace = :namespace', { namespace: self.nsp })
       .andWhere('name = :name', { name: variable })
       .getOne();
    if (variableFromDb) {
      const value = JSON.stringify(variableFromDb.value);
      let self;
      if (change.namespace.startsWith('core')) {
        self = (require(`./${change.namespace.split('.')[1]}`)).default;
      } else {
        self = (require(`./${change.namespace.split('.')[0]}/${change.namespace.split('.')[1]}`)).default;
      }
      self[change.namespace.split('.')[2]] = value;
    }
    lastTimestamp = change.timestamp;
  }
  setTimeout(() => changelog(), 1000);
};

setInterval(() => {
  getRepository(Changelog).delete({
    timestamp: LessThan(Date.now() - 60000),
  });
}, 60000);
