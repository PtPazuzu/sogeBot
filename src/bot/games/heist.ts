import _ from 'lodash';
import { isMainThread } from '../cluster';

import Expects from '../expects.js';
import Game from './_interface';
import { command, settings, shared, ui } from '../decorators';
import { getLocalizedName, sendMessage } from '../commons.js';
import { warning } from '../helpers/log.js';

import { getRepository } from 'typeorm';
import { User } from '../database/entity/user';
import { HeistUser } from '../database/entity/heist';
import oauth from '../oauth';
import { translate } from '../translate';
import tmi from '../tmi';
import points from '../systems/points';

class Heist extends Game {
  dependsOn = [ points ];

  @shared()
  startedAt: null | number = null;
  @shared()
  lastAnnouncedLevel = '';
  @shared()
  lastHeistTimestamp = 0;
  @shared()
  lastAnnouncedCops = 0;
  @shared()
  lastAnnouncedHeistInProgress = 0;
  @shared()
  lastAnnouncedStart = 0;

  @settings('options')
  showMaxUsers = 20;
  @settings('options')
  copsCooldownInMinutes = 10;
  @settings('options')
  entryCooldownInSeconds = 120;

  @settings('notifications')
  started: string = translate('games.heist.started');
  @settings('notifications')
  nextLevelMessage: string = translate('games.heist.levelMessage');
  @settings('notifications')
  maxLevelMessage: string = translate('games.heist.maxLevelMessage');
  @settings('notifications')
  copsOnPatrol: string = translate('games.heist.copsOnPatrol');
  @settings('notifications')
  copsCooldown: string = translate('games.heist.copsCooldownMessage');

  @settings('results')
  singleUserSuccess: string = translate('games.heist.singleUserSuccess');
  @settings('results')
  singleUserFailed: string = translate('games.heist.singleUserFailed');
  @settings('results')
  noUser: string = translate('games.heist.noUser');
  @settings('results')
  @ui({ type: 'heist-results' }, 'results')
  resultsValues: { percentage: number; message: string} [] = [
    { percentage: 0, message: translate('games.heist.result.0') },
    { percentage: 33, message: translate('games.heist.result.33') },
    { percentage: 50, message: translate('games.heist.result.50') },
    { percentage: 99, message: translate('games.heist.result.99') },
    { percentage: 100, message: translate('games.heist.result.100') },
  ];

  @settings('levels')
  @ui({ type: 'heist-levels' }, 'levels')
  levelsValues: { name: string; winPercentage: number; payoutMultiplier: number; maxUsers: number }[] = [
    {
      'name': translate('games.heist.levels.bankVan'),
      'winPercentage': 60,
      'payoutMultiplier': 1.5,
      'maxUsers': 5,
    },
    {
      'name': translate('games.heist.levels.cityBank'),
      'winPercentage': 46,
      'payoutMultiplier': 1.7,
      'maxUsers': 10,
    },
    {
      'name': translate('games.heist.levels.stateBank'),
      'winPercentage': 40,
      'payoutMultiplier': 1.9,
      'maxUsers': 20,
    },
    {
      'name': translate('games.heist.levels.nationalReserve'),
      'winPercentage': 35,
      'payoutMultiplier': 2.1,
      'maxUsers': 30,
    },
    {
      'name': translate('games.heist.levels.federalReserve'),
      'winPercentage': 31,
      'payoutMultiplier': 2.5,
      'maxUsers': 1000,
    },
  ];

  constructor () {
    super();

    if (isMainThread) {
      this.timeouts.iCheckFinished = global.setTimeout(() => this.iCheckFinished(), 10000);
    } // wait for proper config startup
  }

  async iCheckFinished () {
    clearTimeout(this.timeouts.iCheckFinished);

    const [startedAt, entryCooldown, lastHeistTimestamp, copsCooldown, started] = await Promise.all([
      this.startedAt,
      this.entryCooldownInSeconds,
      this.lastHeistTimestamp,
      this.copsCooldownInMinutes,
      this.started,
    ]);
    const levels = _.orderBy(this.levelsValues, 'maxUsers', 'asc');

    // check if heist is finished
    if (!_.isNil(startedAt) && Date.now() - startedAt > (entryCooldown * 1000) + 10000) {
      const users = await getRepository(HeistUser).find();
      const level = _.find(levels, (o) => o.maxUsers >= users.length || _.isNil(o.maxUsers)); // find appropriate level or max level

      if (!level) {
        return; // don't do anything if there is no level
      }

      if (users.length === 0) {
        sendMessage(this.noUser, {
          username: oauth.botUsername,
          displayName: oauth.botUsername,
          userId: Number(oauth.botId),
          emotes: [],
          badges: {},
          'message-type': 'chat',
        });
        // cleanup
        this.startedAt = null;
        await getRepository(HeistUser).clear();
        this.timeouts.iCheckFinished = global.setTimeout(() => this.iCheckFinished(), 10000);
        return;
      }

      sendMessage(started.replace('$bank', level.name), {
        username: oauth.botUsername,
        displayName: oauth.botUsername,
        userId: Number(oauth.botId),
        emotes: [],
        badges: {},
        'message-type': 'chat',
      });

      if (users.length === 1) {
        // only one user
        const isSurvivor = _.random(0, 100, false) <= level.winPercentage;
        const user = users[0];
        const outcome = isSurvivor ? this.singleUserSuccess : this.singleUserFailed;
        global.setTimeout(async () => {
          sendMessage(outcome.replace('$user', (tmi.showWithAt ? '@' : '') + user.username), {
            username: oauth.botUsername,
            displayName: oauth.botUsername,
            userId: Number(oauth.botId),
            emotes: [],
            badges: {},
            'message-type': 'chat',
          });
        }, 5000);

        if (isSurvivor) {
          // add points to user
          await getRepository(User).increment({ userId: user.userId }, 'points', Math.floor(user.points * level.payoutMultiplier));
        }
      } else {
        const winners: string[] = [];
        for (const user of users) {
          const isSurvivor = _.random(0, 100, false) <= level.winPercentage;

          if (isSurvivor) {
            // add points to user
            await getRepository(User).increment({ userId: user.userId }, 'points', Math.floor(user.points * level.payoutMultiplier));
            winners.push(user.username);
          }
        }
        const percentage = (100 / users.length) * winners.length;
        const ordered = _.orderBy(this.resultsValues, [(o) => o.percentage], 'asc');
        const result = _.find(ordered, (o) => o.percentage >= percentage);
        global.setTimeout(async () => {
          sendMessage(_.isNil(result) ? '' : result.message, {
            username: oauth.botUsername,
            displayName: oauth.botUsername,
            userId: Number(oauth.botId),
            emotes: [],
            badges: {},
            'message-type': 'chat',
          });
        }, 5000);
        if (winners.length > 0) {
          global.setTimeout(async () => {
            const chunk: string[][] = _.chunk(winners, this.showMaxUsers);
            const winnersList = chunk.shift() || [];
            const andXMore = _.flatten(winners).length;

            let message = await translate('games.heist.results');
            message = message.replace('$users', winnersList.map((o) => (tmi.showWithAt ? '@' : '') + o).join(', '));
            if (andXMore > 0) {
              message = message + ' ' + (await translate('games.heist.andXMore')).replace('$count', andXMore);
            }
            sendMessage(message, {
              username: oauth.botUsername,
              displayName: oauth.botUsername,
              userId: Number(oauth.botId),
              emotes: [],
              badges: {},
              'message-type': 'chat',
            });
          }, 5500);
        }
      }

      // cleanup
      this.startedAt = null;
      this.lastHeistTimestamp = Date.now();
      await getRepository(HeistUser).clear();
    }

    // check if cops done patrolling
    if (lastHeistTimestamp !== 0 && Date.now() - lastHeistTimestamp >= copsCooldown * 60000) {
      this.lastHeistTimestamp = 0;
      sendMessage((this.copsCooldown), {
        username: oauth.botUsername,
        displayName: oauth.botUsername,
        userId: Number(oauth.botId),
        emotes: [],
        badges: {},
        'message-type': 'chat',
      });
    }
    this.timeouts.iCheckFinished = global.setTimeout(() => this.iCheckFinished(), 10000);
  }

  @command('!bankheist')
  async main (opts) {
    const expects = new Expects();

    const [entryCooldown, lastHeistTimestamp, copsCooldown] = await Promise.all([
      this.entryCooldownInSeconds,
      this.lastHeistTimestamp,
      this.copsCooldownInMinutes,
    ]);
    const levels = _.orderBy(this.levelsValues, 'maxUsers', 'asc');

    // is cops patrolling?
    if (Date.now() - lastHeistTimestamp < copsCooldown * 60000) {
      const minutesLeft = Number(copsCooldown - (Date.now() - lastHeistTimestamp) / 60000).toFixed(1);
      if (Date.now() - (this.lastAnnouncedCops) >= 60000) {
        this.lastAnnouncedCops = Date.now();
        sendMessage(
          (this.copsOnPatrol)
            .replace('$cooldown', minutesLeft + ' ' + getLocalizedName(minutesLeft, 'core.minutes')), opts.sender, opts.attr);
      }
      return;
    }

    let newHeist = false;
    if (this.startedAt === null) { // new heist
      newHeist = true;
      this.startedAt = Date.now(); // set startedAt
      if (Date.now() - (this.lastAnnouncedStart) >= 60000) {
        this.lastAnnouncedStart = Date.now();
        sendMessage((await translate('games.heist.entryMessage')).replace('$command', opts.command), opts.sender);
      }
    }

    // is heist in progress?
    if (!newHeist && Date.now() - this.startedAt > entryCooldown * 1000 && Date.now() - (this.lastAnnouncedHeistInProgress) >= 60000) {
      this.lastAnnouncedHeistInProgress = Date.now();
      sendMessage(
        (await translate('games.heist.lateEntryMessage')).replace('$command', opts.command), opts.sender, opts.attr);
      return;
    }

    let points;
    try {
      points = expects.check(opts.parameters).points().toArray()[0];
    } catch (e) {
      if (!newHeist) {
        sendMessage(
          (await translate('games.heist.entryInstruction')).replace('$command', opts.command), opts.sender, opts.attr);
        warning(`${opts.command} ${e.message}`);
      }
      return;
    }

    points = points === 'all' && !_.isNil(await points.getPointsOf(opts.sender.userId)) ? await points.getPointsOf(opts.sender.userId) : parseInt(points, 10); // set all points
    points = points > await points.getPointsOf(opts.sender.userId) ? await points.getPointsOf(opts.sender.userId) : points; // bet only user points

    if (points === 0 || _.isNil(points) || _.isNaN(points)) {
      sendMessage(
        (await translate('games.heist.entryInstruction')).replace('$command', opts.command), opts.sender, opts.attr);
      return;
    } // send entryInstruction if command is not ok

    await Promise.all([
      points.decrement({ userId: opts.sender.userId }, parseInt(points, 10)),
      getRepository(HeistUser).save({ userId: opts.sender.userId, username: opts.sender.username, points: parseInt(points, 10)}), // add user to heist list
    ]);

    // check how many users are in heist
    const users = await getRepository(HeistUser).find();
    const level = _.find(levels, (o) => o.maxUsers >= users.length || _.isNil(o.maxUsers));
    if (level) {
      const nextLevel = _.find(levels, (o) => {
        if (level) {
          return o.maxUsers > level.maxUsers;
        } else {
          return true;
        }
      });

      if (this.lastAnnouncedLevel !== level.name) {
        this.lastAnnouncedLevel = level.name;
        if (nextLevel) {
          sendMessage(this.nextLevelMessage
            .replace('$bank', level.name)
            .replace('$nextBank', nextLevel.name), opts.sender, opts.attr);
        } else {
          sendMessage(this.maxLevelMessage
            .replace('$bank', level.name), opts.sender, opts.attr);
        }
      }
    }
  }
}

export default new Heist();