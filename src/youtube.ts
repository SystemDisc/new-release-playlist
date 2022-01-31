import { promises as fs } from 'fs';
import readline from 'readline';
import { google } from 'googleapis';
import * as C from './constants';

const OAuth2 = google.auth.OAuth2;

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 *
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
export async function authorize() {
  const credentials = JSON.parse((await fs.readFile(C.CREDENTIALS_PATH)).toString('utf-8'));
  var clientSecret = credentials.web.client_secret;
  var clientId = credentials.web.client_id;
  var redirectUrl = credentials.web.redirect_uris[0];
  var oauth2Client = new OAuth2(clientId, clientSecret, redirectUrl);

  // Check if we have previously stored a token.
  try {
    const token = (await fs.readFile(C.TOKEN_PATH)).toString('utf-8');
    oauth2Client.credentials = JSON.parse(token);
  } catch (err) {
    await getNewToken(oauth2Client);
  }
  return oauth2Client;
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *     client.
 */
async function getNewToken(oauth2Client: any) {
  var authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: C.SCOPES
  });
  console.log('Authorize this app by visiting this url: ', authUrl);
  var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  await new Promise(r => {
    rl.question('Enter the code from that page here: ', function(code) {
      rl.close();
      oauth2Client.getToken(code, async (err: any, token: any) => {
        if (err) {
          console.log('Error while trying to retrieve access token', err);
          r(Promise.reject(err));
          return;
        }
        oauth2Client.credentials = token;
        await storeToken(token);
        r(oauth2Client);
      });
    });
  });
}

/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
async function storeToken(token: any) {
  await fs.writeFile(C.TOKEN_PATH, JSON.stringify(token));
  console.log('Token stored to ' + C.TOKEN_PATH);
}
