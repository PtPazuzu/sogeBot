'use strict';
import Core from './_interface';

import axios from 'axios';
import https from 'https';
import chalk from 'chalk';
import getSymbolFromCurrency from 'currency-symbol-map';
import _ from 'lodash';
import { isMainThread } from './cluster';

import * as constants from './constants';
import { settings, shared, ui } from './decorators';
import { error, info, warning } from './helpers/log';
import { getRepository } from 'typeorm';
import { UserTip } from './database/entity/user';
import { onLoad } from './decorators/on';

class Currency extends Core {
  mainCurrencyLoaded = false;

  @settings('currency')
  @ui({
    type: 'selector',
    values: ['USD', 'AUD', 'BGN', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP', 'HKD', 'HRK', 'HUF', 'IDR', 'ILS', 'INR', 'ISK', 'JPY', 'KRW', 'MXN', 'MYR', 'NOK', 'NZD', 'PHP', 'PLN', 'RON', 'RUB', 'SEK', 'SGD', 'THB', 'TRY', 'ZAR'],
  })
  public mainCurrency: 'USD' | 'AUD' | 'BGN' | 'BRL' | 'CAD' | 'CHF' | 'CNY' | 'CZK' | 'DKK' | 'EUR' | 'GBP' | 'HKD' | 'HRK' | 'HUF' | 'IDR' | 'ILS' | 'INR' | 'ISK' | 'JPY' | 'KRW' | 'MXN' | 'MYR' | 'NOK' | 'NZD' | 'PHP' | 'PLN' | 'RON' | 'RUB' | 'SEK' | 'SGD' | 'THB' | 'TRY' | 'ZAR' = 'EUR';

  @shared()
  public rates: { [x: string]: number } = {};

  public timeouts: any = {};
  public base = 'CZK';

  constructor() {
    super();
    if (isMainThread) {
      setTimeout(() => this.updateRates(), 5 * constants.SECOND);
    }
  }

  public isCodeSupported(code: string) {
    return code === this.base || !_.isNil(this.rates[code]);
  }

  public symbol(code: string) {
    return getSymbolFromCurrency(code);
  }

  public exchange(value: number, from: string, to: string): number {
    try {
      this.rates[this.base] = 1; // base is always 1:1

      if (from.toLowerCase().trim() === to.toLowerCase().trim()) {
        return Number(value); // nothing to do
      }
      if (_.isNil(this.rates[from])) {
        throw Error(`${from} code was not found`);
      }
      if (_.isNil(this.rates[to]) && to.toLowerCase().trim() !== this.base.toLowerCase().trim()) {
        throw Error(`${to} code was not found`);
      }

      if (to.toLowerCase().trim() !== this.base.toLowerCase().trim()) {
        return (value * this.rates[from]) / this.rates[to];
      } else {
        return value * this.rates[from];
      }
    } catch (e) {
      warning(`Currency exchange error - ${e.message}`);
      warning(`Available currencies: ${Object.keys(this.rates).join(', ')}`);
      return Number(value); // don't change rate if code not found
    }
  }

  @onLoad('mainCurrency')
  setMainCurrencyLoaded() {
    this.mainCurrencyLoaded = true;
  }

  public async updateRates() {
    clearTimeout(this.timeouts.updateRates);

    let refresh = constants.DAY;
    try {
      info(chalk.yellow('CURRENCY:') + ' fetching rates');
      // base is always CZK
      // using IP because dns may fail occasionally, 193.85.3.250 => cnb.cz
      const result = await axios.get('http://193.85.3.250/cs/financni_trhy/devizovy_trh/kurzy_devizoveho_trhu/denni_kurz.txt', {
        httpsAgent: new https.Agent({
          rejectUnauthorized: false,
        }),
      });

      let linenum = 0;
      for (const line of result.data.toString().split('\n')) {
        if (linenum < 2 || line.trim().length === 0) {
          linenum++;
          continue;
        }
        const [,, count, code, rate] = line.split('|');
        this.rates[code] = Number((Number(rate.replace(',', '.')) / Number(count)).toFixed(3));
      }
      info(chalk.yellow('CURRENCY:') + ' fetched rates');

      await new Promise((resolve) => {
        const wait = () => {
          if (this.mainCurrencyLoaded) {
            resolve();
          } else {
            setTimeout(() => wait(), 10);
          }
        };
        wait();
      });
      for (const tip of await getRepository(UserTip).find({ where: { currency: this.mainCurrency }})) {
        getRepository(UserTip).update({ id: tip.id }, { sortAmount: this.exchange(Number(tip.amount), tip.currency, 'EUR') });
      }
    } catch (e) {
      error(e.stack);
      refresh = constants.SECOND;
    }

    this.timeouts.updateRates = setTimeout(() => this.updateRates(), refresh);
  }
}

export default new Currency();
