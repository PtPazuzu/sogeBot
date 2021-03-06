import axios from 'axios';
import { get } from 'lodash-es';
import { getSocket } from './socket';

export const isUserLoggedIn = async function () {
  // check if we have auth code
  const code = localStorage.getItem('code') || '';
  if (code.trim().length === 0) {
    console.log('Redirecting, user is not authenticated');
    if (window.location.href.includes('popout')) {
      window.location.replace(window.location.origin + '/login#error=popout+must+be+logged#url=' + window.location.href);
      return false;
    } else {
      window.location.replace(window.location.origin + '/login');
      return false;
    }
  } else {
    try {
      const axiosData = await axios.get(`https://api.twitch.tv/helix/users`, {
        headers: {
          'Authorization': 'Bearer ' + code,
        },
      });
      const data = get(axiosData, 'data.data[0]', null);
      if (data === null) {
        localStorage.removeItem('userId');
        throw Error('User must be logged');
      }
      localStorage.setItem('userId', data.id);

      // set new authorization if set
      const newAuthorization = localStorage.getItem('newAuthorization');
      if (newAuthorization !== null) {
        await new Promise((resolve) => {
          getSocket('/', true).emit('newAuthorization', data.id, () => resolve());
        });
      }
      localStorage.removeItem('newAuthorization');

      // save userId to db
      await new Promise((resolve, reject) => {
        const socket = getSocket('/core/users');
        socket.emit('viewers::updateId', {
          userId: Number(data.id),
          username: data.login,
        }, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
      return data;
    } catch(e) {
      console.debug(e);
      if (e === 'User doesn\'t have access to this endpoint') {
        window.location.replace(window.location.origin + '/login#error=must+be+caster');
      } else {
        console.log('Redirecting, user code expired');
        if (window.location.href.includes('popout')) {
          window.location.replace(window.location.origin + '/login#error=popout+must+be+logged');
        } else {
          window.location.replace(window.location.origin + '/login');
        }
      }
      return;
    }
  }
};
